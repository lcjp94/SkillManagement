// Écriture d'un déploiement sur le disque : aperçu, puis installation atomique avec retour en arrière.
// C'est le seul chemin d'écriture des skills : l'analyse de sécurité y est faite au moment d'écrire (CLAUDE.md § 9).
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { SLUG_RE, type AssistantId } from '@shared/schemas/catalog'
import { MANIFESTE_VERSION, type Manifeste } from '@shared/schemas/manifeste'
import { BlocIncompletError } from '../core/blocks'
import { calculerFichiers, dessinerArbre, octetsAEcrire, type FichierCalcule } from '../core/deploiement'
import { getDisposition, type FichierPlanifie, type SkillAEcrire } from '../core/layouts'
import type { ProblemeScan } from '../core/scan'
import type { PlanArborescence } from '../core/tree'
import { ecrireAtomique } from './atomic'
import { cheminSauvegarde, horodatage, nouvelIdentifiant, type ContexteDisque } from './contexte'
import { FichierIllisibleError, existe, lireTexte, sha256 } from './lecture'
import { ecrireManifeste, lireManifestes } from './manifestes'
import { PerimetreError, memeChemin, plie, resoudreDansRacine, verifierCollisions, verifierRacine } from './perimetre'
import { defaireEtMarquer } from './retrait'
import { exclusif } from './verrou'

export class DeploiementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeploiementError'
  }
}

export interface DemandeAssistant {
  cible: AssistantId
  /** Dossier choisi. Ignoré en portée « global » : le dossier personnel est utilisé. */
  racine: string
  portee: 'projet' | 'global'
  projetId?: string
  skills: SkillAEcrire[]
  /** Skills avec avertissement que la personne a confirmés un par un. */
  avertissementsConfirmes?: string[]
  /** Fichiers d'une autre origine (ou blocs modifiés) que la personne accepte de remplacer, tels qu'ils figurent dans l'aperçu. */
  ecrasementsConfirmes?: string[]
}

export interface DemandeArborescence {
  cible: 'arborescence'
  racine: string
  projetId?: string
  arborescence: PlanArborescence
  ecrasementsConfirmes?: string[]
}

export type DemandeDeploiement = DemandeAssistant | DemandeArborescence

export interface LigneApercu {
  chemin: string
  action: 'create' | 'modify' | 'unchanged'
  skills: string[]
  /** Le fichier (ou le bloc) existe et n'a pas été écrit par l'application : le remplacer demande confirmation. */
  ecrase: boolean
  avertissement?: string
}

export interface SkillRefuse {
  slug: string
  raison: string
  problemes?: ProblemeScan[]
}

export interface Apercu {
  racine: string
  lignes: LigneApercu[]
  dossiersACreer: string[]
  /** Skills non écrits : analyse dangereuse, ou impossible pour cet assistant. */
  refus: SkillRefuse[]
  /** Skills avec avertissement, non écrits tant que la personne ne les a pas confirmés. */
  aConfirmer: { slug: string; problemes: ProblemeScan[] }[]
  /** Clés à confirmer pour remplacer ce qui n'a pas été écrit par l'application. */
  ecrasements: string[]
  avertissements: string[]
  octets: number
  nombreSkills: number
  arbre: string
}

export type ResultatApplication =
  | { statut: 'applique'; id: string; apercu: Apercu }
  | { statut: 'confirmation-requise'; apercu: Apercu }
  | { statut: 'rien-a-faire'; apercu: Apercu }

interface Calcul {
  racine: string
  calcules: FichierCalcule[]
  dossiersACreer: string[]
  apercu: Apercu
}

const prefixes = (rel: string, inclureDernier: boolean): string[] => {
  const segments = rel.split('/')
  const fin = inclureDernier ? segments.length : segments.length - 1
  return Array.from({ length: fin }, (_, i) => segments.slice(0, i + 1).join('/'))
}

/** Empreintes que l'application a écrites dans ce dossier : ce qu'on y trouve d'autre vient de la personne. */
async function empreintesConnues(ctx: ContexteDisque, racine: string): Promise<Map<string, Set<string>>> {
  const connues = new Map<string, Set<string>>()
  const ajouter = (cle: string, sha: string) => connues.set(cle, (connues.get(cle) ?? new Set()).add(sha))
  const { manifestes } = await lireManifestes(ctx.dossierDonnees)
  for (const m of manifestes) {
    if (m.etat === 'annule' || !memeChemin(m.racine, racine)) continue
    for (const e of m.fichiers) {
      if (e.action === 'unchanged') continue
      ajouter(plie(e.chemin), e.sha256Apres)
      for (const s of e.skills) ajouter(`${plie(e.chemin)}#${s.slug}`, s.sha256)
    }
  }
  return connues
}

async function calculer(ctx: ContexteDisque, demande: DemandeDeploiement): Promise<Calcul> {
  const global = demande.cible !== 'arborescence' && demande.portee === 'global'
  const portee = global ? 'global' : 'projet'
  const racine = await verifierRacine(global ? ctx.env.dossierPersonnel : demande.racine, ctx.env, portee)

  let plan: FichierPlanifie[]
  let dossiersPlan: string[] = []
  const refus: SkillRefuse[] = []
  const aConfirmer: Apercu['aConfirmer'] = []

  if (demande.cible === 'arborescence') {
    plan = demande.arborescence.readmes
    dossiersPlan = demande.arborescence.dossiers
  } else {
    const disposition = getDisposition(demande.cible)
    if (!disposition) throw new DeploiementError('Cet assistant n’est pas pris en charge.')
    if (global && !disposition.accepteGlobal) throw new PerimetreError(`${disposition.libelle} n’a pas d’emplacement commun à tous vos projets : choisissez un dossier.`)
    const confirmes = new Set(demande.avertissementsConfirmes ?? [])
    const prets: SkillAEcrire[] = []
    const vus = new Set<string>()
    for (const skill of demande.skills) {
      // Le nom sert de nom de dossier ou de fichier : il doit être un identifiant valide, pas un chemin
      if (!SLUG_RE.test(skill.slug) || skill.slug.length > 64) throw new PerimetreError(`Le nom de skill « ${skill.slug.slice(0, 40)} » n’est pas valide : lettres minuscules, chiffres et tirets seulement.`)
      if (vus.has(skill.slug)) continue
      vus.add(skill.slug)
      // L'analyse porte sur tout ce qui sera écrit : nom, description et corps
      const scan = ctx.scanner(`${skill.name}\n${skill.description}\n${skill.content}`)
      if (scan.status === 'danger') {
        refus.push({ slug: skill.slug, raison: 'L’analyse a trouvé un contenu dangereux : ce skill n’est pas installé.', problemes: scan.issues })
      } else if (scan.status === 'warning' && !confirmes.has(skill.slug)) {
        aConfirmer.push({ slug: skill.slug, problemes: scan.issues })
      } else prets.push(skill)
    }
    const planifie = disposition.planifier(prets)
    refus.push(...planifie.refus)
    plan = planifie.fichiers
  }

  // Contrôle de tous les chemins avant de lire ou d'écrire quoi que ce soit
  verifierCollisions([...plan.map((f) => f.chemin), ...dossiersPlan])
  const absolus = new Map<string, string>()
  for (const f of plan) absolus.set(f.chemin, await resoudreDansRacine(racine, f.chemin, ctx.env, 'fichier'))
  for (const d of dossiersPlan) await resoudreDansRacine(racine, d, ctx.env, 'dossier')

  const contenus = new Map<string, string | null>()
  for (const f of plan) contenus.set(f.chemin, await lireTexte(absolus.get(f.chemin)!))
  let calcules: FichierCalcule[]
  try {
    calcules = calculerFichiers(plan, (chemin) => contenus.get(chemin) ?? null, { reglagesAutonomes: demande.cible === 'arborescence' })
  } catch (erreur) {
    if (erreur instanceof BlocIncompletError) throw new DeploiementError(erreur.message)
    throw erreur
  }

  // Dossiers absents à créer : parents des fichiers à créer, et dossiers de l'arborescence
  const voulus = new Set<string>()
  for (const f of calcules) if (f.action === 'create') prefixes(f.chemin, false).forEach((p) => voulus.add(p))
  for (const d of dossiersPlan) prefixes(d, true).forEach((p) => voulus.add(p))
  const dossiersACreer: string[] = []
  const deja = new Set<string>()
  for (const rel of [...voulus].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    if (deja.has(plie(rel))) continue
    deja.add(plie(rel))
    if (!(await existe(await resoudreDansRacine(racine, rel, ctx.env, 'dossier')))) dossiersACreer.push(rel)
  }

  // Ce qui existe sans avoir été écrit par l'application ne se remplace pas sans l'avoir montré
  const connues = await empreintesConnues(ctx, racine)
  const ecrasements: string[] = []
  for (const f of calcules) {
    if (f.action !== 'modify' || f.existant === null) continue
    if (f.mode === 'fichier') {
      if (!connues.get(plie(f.chemin))?.has(sha256(f.existant))) ecrasements.push(f.chemin)
    } else if (f.mode === 'blocs') {
      for (const s of f.skills) {
        if (s.avant && !connues.get(`${plie(f.chemin)}#${s.slug}`)?.has(s.avant)) ecrasements.push(`${f.chemin}#${s.slug}`)
      }
    }
  }

  const lignes: LigneApercu[] = calcules.map((f) => ({
    chemin: f.chemin,
    action: f.action,
    skills: f.skills.map((s) => s.slug),
    ecrase: ecrasements.some((k) => k === f.chemin || k.startsWith(`${f.chemin}#`)),
    ...(f.avertissement ? { avertissement: f.avertissement } : {})
  }))
  const apercu: Apercu = {
    racine,
    lignes,
    dossiersACreer,
    refus,
    aConfirmer,
    ecrasements,
    avertissements: calcules.flatMap((f) => (f.avertissement ? [f.avertissement] : [])),
    octets: octetsAEcrire(calcules),
    nombreSkills: new Set(calcules.flatMap((f) => f.skills.map((s) => s.slug))).size,
    arbre: dessinerArbre([...dossiersACreer.map((d) => `${d}/`), ...calcules.map((f) => f.chemin)])
  }
  return { racine, calcules, dossiersACreer, apercu }
}

/** Ce qui serait écrit, sans rien écrire. */
export function apercu(ctx: ContexteDisque, demande: DemandeDeploiement): Promise<Apercu> {
  return exclusif(async () => (await calculer(ctx, demande)).apercu)
}

const MESSAGES_UTILISATEUR = [PerimetreError, FichierIllisibleError, DeploiementError]

export function appliquer(ctx: ContexteDisque, demande: DemandeDeploiement): Promise<ResultatApplication> {
  return exclusif(async () => {
    const calcul = await calculer(ctx, demande)
    const { racine, calcules, dossiersACreer, apercu } = calcul
    const confirmes = new Set(demande.ecrasementsConfirmes ?? [])
    if (apercu.ecrasements.some((cle) => !confirmes.has(cle))) return { statut: 'confirmation-requise', apercu }
    const aEcrire = calcules.filter((f) => f.action !== 'unchanged')
    if (aEcrire.length === 0 && dossiersACreer.length === 0) return { statut: 'rien-a-faire', apercu }

    const id = nouvelIdentifiant(ctx)
    const manifeste: Manifeste = {
      version: MANIFESTE_VERSION,
      id,
      etat: 'en-cours',
      creeLe: horodatage(ctx),
      ...(demande.projetId ? { projetId: demande.projetId } : {}),
      cible: demande.cible,
      portee: demande.cible !== 'arborescence' && demande.portee === 'global' ? 'global' : 'projet',
      racine,
      fichiers: calcules.map((f) => ({
        chemin: f.chemin,
        mode: f.mode,
        action: f.action,
        sha256Apres: f.sha256Apres,
        creeParApp: f.action === 'create',
        ...(f.action === 'modify' ? { sauvegarde: f.chemin } : {}),
        ...(f.entete !== undefined ? { entete: f.entete } : {}),
        skills: f.skills
      })),
      dossiersCrees: [...dossiersACreer],
      dossiersRetires: []
    }

    // Le manifeste « en cours » est écrit AVANT les fichiers : une coupure laisse une trace qui permet de tout défaire
    try {
      await ecrireManifeste(ctx.dossierDonnees, manifeste, ctx.ecrire)
    } catch (erreur) {
      ctx.journal?.error('manifeste illisible ou non écrit', { id, erreur: erreur instanceof Error ? erreur.name : 'inconnue' })
      throw new DeploiementError('L’installation n’a pas pu démarrer (les données de l’application ne sont pas accessibles en écriture). Rien n’a été modifié ; réessayez.')
    }
    try {
      for (const f of aEcrire) {
        if (f.action !== 'modify' || f.existant === null) continue
        const copie = cheminSauvegarde(ctx, id, f.chemin)
        await mkdir(dirname(copie), { recursive: true })
        await ecrireAtomique(copie, f.existant, ctx.ecrire ? { ecrire: ctx.ecrire } : {})
      }
      for (const rel of dossiersACreer) {
        const abs = await resoudreDansRacine(racine, rel, ctx.env, 'dossier')
        try {
          await mkdir(abs)
        } catch (erreur) {
          if ((erreur as NodeJS.ErrnoException).code !== 'EEXIST') throw erreur
          // Apparu entre l'aperçu et l'écriture : il n'est pas à nous
          manifeste.dossiersCrees = manifeste.dossiersCrees.filter((d) => d !== rel)
        }
      }
      for (const f of aEcrire) {
        // Le disque a pu changer depuis l'aperçu : le trajet est revérifié juste avant d'écrire
        const abs = await resoudreDansRacine(racine, f.chemin, ctx.env, 'fichier')
        await ecrireAtomique(abs, f.contenuApres, ctx.ecrire ? { ecrire: ctx.ecrire } : {})
      }
      manifeste.etat = 'termine'
      await ecrireManifeste(ctx.dossierDonnees, manifeste, ctx.ecrire)
    } catch (erreur) {
      ctx.journal?.error('écriture interrompue, retour en arrière', { id, erreur: erreur instanceof Error ? erreur.name : 'inconnue' })
      try {
        await defaireEtMarquer(ctx, manifeste)
      } catch {
        throw new DeploiementError(
          'L’installation a échoué et n’a pas pu être entièrement défaite. Fermez puis rouvrez SkillManagement : il finira de remettre les fichiers en ordre.'
        )
      }
      if (MESSAGES_UTILISATEUR.some((classe) => erreur instanceof classe)) throw erreur
      throw new DeploiementError(
        'L’installation a échoué (un fichier est peut-être ouvert dans un autre programme ou le disque est plein). Tout a été défait : fermez les autres programmes et réessayez.'
      )
    }
    ctx.journal?.info('installation terminée', { id, cible: demande.cible, fichiers: aEcrire.length })
    return { statut: 'applique', id, apercu }
  })
}
