// Retirer ce que l'application a écrit : désinstaller, annuler, reprendre une écriture interrompue.
// Règle commune : on ne touche qu'à ce dont le contenu actuel correspond à l'empreinte écrite par l'application.
// Un fichier modifié par la personne est conservé et signalé, jamais supprimé ni écrasé.
import { lstat, mkdir, readdir, realpath, rm, rmdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Manifeste, FichierManifeste } from '@shared/schemas/manifeste'
import { BlocIncompletError, extraireBloc, neContientQueEntete, remplacerBloc, retirerBlocs } from '../core/blocks'
import { ecrireAtomique } from './atomic'
import { cheminSauvegarde, horodatage, type ContexteDisque } from './contexte'
import { existe, lireTexte, sha256 } from './lecture'
import { dossierSauvegardes, ecrireManifeste, lireManifestes } from './manifestes'
import { PerimetreError, memeChemin, plie, resoudreDansRacine, verifierRacine } from './perimetre'
import { exclusif } from './verrou'

export class RetraitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetraitError'
  }
}

export interface RapportRetrait {
  /** Fichiers supprimés ou blocs retirés. */
  retires: string[]
  /** Fichiers remis dans l'état d'avant l'installation, depuis la sauvegarde. */
  restaures: string[]
  conserves: { chemin: string; raison: string }[]
  dossiersRetires: string[]
}

const rapportVide = (): RapportRetrait => ({ retires: [], restaures: [], conserves: [], dossiersRetires: [] })

const MODIFIE = 'Modifié depuis l’installation : conservé.'

async function ecrire(ctx: ContexteDisque, chemin: string, texte: string): Promise<void> {
  await mkdir(dirname(chemin), { recursive: true })
  await ecrireAtomique(chemin, texte, ctx.ecrire ? { ecrire: ctx.ecrire } : {})
}

async function lireSauvegarde(ctx: ContexteDisque, id: string, rel: string): Promise<string | null> {
  return lireTexte(cheminSauvegarde(ctx, id, rel))
}

interface Cible {
  rel: string
  abs: string
  texte: string | null
}

async function ouvrir(racine: string, rel: string, ctx: ContexteDisque): Promise<Cible> {
  const abs = await resoudreDansRacine(racine, rel, ctx.env, 'fichier')
  return { rel, abs, texte: await lireTexte(abs) }
}

async function racineDe(m: Manifeste, ctx: ContexteDisque): Promise<string> {
  try {
    return await verifierRacine(m.racine, ctx.env, m.portee)
  } catch (erreur) {
    if (erreur instanceof PerimetreError) throw new RetraitError(`Le dossier de cette installation n’est plus utilisable : ${erreur.message}`)
    throw erreur
  }
}

const nom = (rel: string, slug?: string): string => (slug ? `${rel} (bloc ${slug})` : rel)

// ---------------------------------------------------------------------------------------------
// Retour à l'état d'avant UN déploiement (annulation, reprise après coupure)
// ---------------------------------------------------------------------------------------------

async function defaireEntree(ctx: ContexteDisque, m: Manifeste, racine: string, e: FichierManifeste, rapport: RapportRetrait): Promise<void> {
  const { abs, texte } = await ouvrir(racine, e.chemin, ctx)
  if (texte === null) return // déjà absent : rien à défaire (et on ne ressuscite pas un fichier supprimé par la personne)

  if (e.mode !== 'blocs') {
    if (sha256(texte) === e.sha256Apres) {
      if (e.action === 'create') {
        await unlink(abs)
        rapport.retires.push(e.chemin)
      } else {
        const avant = await lireSauvegarde(ctx, m.id, e.chemin)
        if (avant === null) rapport.conserves.push({ chemin: e.chemin, raison: 'La sauvegarde de ce fichier est introuvable : il est conservé tel quel.' })
        else {
          await ecrire(ctx, abs, avant)
          rapport.restaures.push(e.chemin)
        }
      }
      return
    }
    if (e.action === 'modify') {
      const avant = await lireSauvegarde(ctx, m.id, e.chemin)
      if (avant !== null && sha256(avant) === sha256(texte)) return // déjà revenu à l'état d'avant
    }
    rapport.conserves.push({ chemin: e.chemin, raison: MODIFIE })
    return
  }

  // Fichier à blocs : rien n'a bougé depuis l'écriture, on revient en arrière en un seul geste
  if (sha256(texte) === e.sha256Apres) {
    if (e.action === 'create') {
      await unlink(abs)
      rapport.retires.push(e.chemin)
    } else {
      const avant = await lireSauvegarde(ctx, m.id, e.chemin)
      if (avant === null) rapport.conserves.push({ chemin: e.chemin, raison: 'La sauvegarde de ce fichier est introuvable : il est conservé tel quel.' })
      else {
        await ecrire(ctx, abs, avant)
        rapport.restaures.push(e.chemin)
      }
    }
    return
  }
  // La personne a modifié le fichier depuis : on ne défait que les blocs que l'application a écrits et qui n'ont pas changé
  const avantTexte = e.action === 'modify' ? await lireSauvegarde(ctx, m.id, e.chemin) : null
  let courant = texte
  for (const s of e.skills) {
    let bloc: string | null
    try {
      bloc = extraireBloc(courant, s.slug)
    } catch (erreur) {
      if (erreur instanceof BlocIncompletError) {
        rapport.conserves.push({ chemin: nom(e.chemin, s.slug), raison: 'Bloc incomplet dans le fichier : conservé.' })
        continue
      }
      throw erreur
    }
    if (bloc === null) continue
    if (sha256(bloc) !== s.sha256) {
      rapport.conserves.push({ chemin: nom(e.chemin, s.slug), raison: MODIFIE })
      continue
    }
    const ancien = s.avant && avantTexte ? extraireBloc(avantTexte, s.slug) : null
    courant = ancien ? remplacerBloc(courant, s.slug, ancien) : retirerBlocs(courant, [s.slug])
    rapport.retires.push(nom(e.chemin, s.slug))
  }
  if (courant === texte) return
  if (e.creeParApp && e.entete !== undefined && neContientQueEntete(courant, e.entete, [])) {
    await unlink(abs)
    rapport.retires.push(e.chemin)
  } else await ecrire(ctx, abs, courant)
}

/** Supprime, du plus profond au plus haut, les dossiers créés par l'application qui sont vides. */
async function retirerDossiers(ctx: ContexteDisque, racine: string, manifestes: Manifeste[], rapport: RapportRetrait): Promise<void> {
  const candidats: { m: Manifeste; rel: string }[] = []
  for (const m of manifestes) {
    for (const rel of m.dossiersCrees) if (!m.dossiersRetires.includes(rel)) candidats.push({ m, rel })
  }
  candidats.sort((a, b) => b.rel.split('/').length - a.rel.split('/').length)
  for (const { m, rel } of candidats) {
    let abs: string
    try {
      abs = await resoudreDansRacine(racine, rel, ctx.env, 'dossier')
    } catch {
      continue // lien ou nom devenu douteux : on n'y touche pas
    }
    if (!(await existe(abs))) {
      m.dossiersRetires.push(rel)
      continue
    }
    const infos = await lstat(abs)
    if (!infos.isDirectory() || infos.isSymbolicLink()) continue
    if ((await readdir(abs)).length > 0) continue
    await rmdir(abs)
    m.dossiersRetires.push(rel)
    rapport.dossiersRetires.push(rel)
  }
}

function marquerRetire(m: Manifeste, le: string): void {
  for (const e of m.fichiers) {
    if (e.action === 'unchanged') continue
    e.retire ??= { le, resultat: 'deja-absent' }
    for (const s of e.skills) s.retire ??= { le, resultat: 'deja-absent' }
  }
}

const echapper = (texte: string): string => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Une coupure en pleine écriture atomique laisse un fichier temporaire à côté de la cible (« SKILL.md.12345678 »).
 * On ne cherche que les voisins des fichiers que cette installation s'apprêtait à écrire.
 */
async function nettoyerTemporaires(ctx: ContexteDisque, racine: string, m: Manifeste): Promise<void> {
  for (const e of m.fichiers) {
    if (e.action === 'unchanged') continue
    let dossier: string
    try {
      dossier = dirname(await resoudreDansRacine(racine, e.chemin, ctx.env, 'fichier'))
    } catch {
      continue
    }
    const motif = new RegExp(`^${echapper(e.chemin.split('/').at(-1)!)}\\.\\d{1,10}$`)
    let noms: string[]
    try {
      noms = await readdir(dossier)
    } catch {
      continue // le dossier n'a jamais été créé
    }
    for (const nomFichier of noms.filter((n) => motif.test(n))) {
      const chemin = join(dossier, nomFichier)
      if ((await lstat(chemin)).isFile()) await unlink(chemin)
    }
  }
}

/**
 * Défait un déploiement en entier : c'est l'annulation de la dernière installation, ou la reprise d'une écriture coupée.
 * Utilisé aussi pour défaire un lot qui a échoué en cours de route.
 */
export async function defaireManifeste(ctx: ContexteDisque, m: Manifeste): Promise<RapportRetrait> {
  const rapport = rapportVide()
  const racine = await racineDe(m, ctx)
  if (m.etat === 'en-cours') await nettoyerTemporaires(ctx, racine, m)
  for (const e of [...m.fichiers].reverse()) {
    if (e.action === 'unchanged') continue
    await defaireEntree(ctx, m, racine, e, rapport)
  }
  await retirerDossiers(ctx, racine, [m], rapport)
  return rapport
}

// ---------------------------------------------------------------------------------------------
// Annulation de la dernière installation d'un dossier
// ---------------------------------------------------------------------------------------------

export interface DemandeAnnulation {
  /** Dossier concerné (celui de l'installation à annuler). */
  racine: string
  portee: 'projet' | 'global'
  /** Installation visée ; par défaut la dernière. Refusée si une plus récente existe dans le même dossier. */
  id?: string
}

export function annulerDerniere(ctx: ContexteDisque, demande: DemandeAnnulation): Promise<RapportRetrait & { id: string }> {
  return exclusif(async () => {
    const racine = await verifierRacine(demande.portee === 'global' ? ctx.env.dossierPersonnel : demande.racine, ctx.env, demande.portee)
    const { manifestes } = await lireManifestes(ctx.dossierDonnees)
    const ici = manifestes.filter((m) => m.etat === 'termine' && memeChemin(m.racine, racine))
    const derniere = ici.at(-1)
    if (!derniere) throw new RetraitError('Aucune installation à annuler dans ce dossier.')
    if (demande.id !== undefined && demande.id !== derniere.id) {
      throw new RetraitError('Une installation plus récente existe dans ce dossier : annulez-la d’abord, sinon les sauvegardes se contrediraient.')
    }
    return defaireEtMarquer(ctx, derniere)
  })
}

/** Défait un déploiement, le marque « annulé » et conserve le rapport. */
export async function defaireEtMarquer(ctx: ContexteDisque, m: Manifeste): Promise<RapportRetrait & { id: string }> {
  const rapport = await defaireManifeste(ctx, m)
  const le = horodatage(ctx)
  marquerRetire(m, le)
  m.etat = 'annule'
  m.annuleLe = le
  await ecrireManifeste(ctx.dossierDonnees, m, ctx.ecrire)
  ctx.journal?.info('installation annulée', { id: m.id, retires: rapport.retires.length, conserves: rapport.conserves.length })
  return { ...rapport, id: m.id }
}

/**
 * Retire une arborescence créée par l'application : seuls ses README inchangés et ses dossiers vides disparaissent.
 * Pas de contrainte d'ordre : elle ne touche à aucun fichier d'assistant.
 */
export function retirerArborescence(ctx: ContexteDisque, id: string): Promise<RapportRetrait & { id: string }> {
  return exclusif(async () => {
    const { manifestes } = await lireManifestes(ctx.dossierDonnees)
    const m = manifestes.find((x) => x.id === id && x.cible === 'arborescence' && x.etat === 'termine')
    if (!m) throw new RetraitError('Cette arborescence n’existe plus dans l’historique.')
    return defaireEtMarquer(ctx, m)
  })
}

// ---------------------------------------------------------------------------------------------
// Reprise après une coupure en pleine écriture
// ---------------------------------------------------------------------------------------------

export function interrompus(ctx: ContexteDisque): Promise<Manifeste[]> {
  return lireManifestes(ctx.dossierDonnees).then((r) => r.manifestes.filter((m) => m.etat === 'en-cours'))
}

/** Défait les écritures restées « en cours » (arrêt brutal pendant une installation). */
export function reprendreInterrompus(ctx: ContexteDisque): Promise<(RapportRetrait & { id: string })[]> {
  return exclusif(async () => {
    const { manifestes } = await lireManifestes(ctx.dossierDonnees)
    const rapports: (RapportRetrait & { id: string })[] = []
    for (const m of manifestes.filter((x) => x.etat === 'en-cours')) {
      try {
        rapports.push(await defaireEtMarquer(ctx, m))
      } catch (erreur) {
        // Dossier introuvable ou refusé : le manifeste reste « en cours », on le dira à la prochaine ouverture
        ctx.journal?.warn('reprise impossible', { id: m.id, erreur: erreur instanceof Error ? erreur.name : 'inconnue' })
      }
    }
    return rapports
  })
}

// ---------------------------------------------------------------------------------------------
// Ce qui est installé, recalculé depuis le disque
// ---------------------------------------------------------------------------------------------

interface Maillon {
  m: Manifeste
  e: FichierManifeste
}

/** Pour chaque fichier, les écritures de l'application encore en vigueur, de la plus ancienne à la plus récente. */
function chaines(manifestes: Manifeste[]): Map<string, Maillon[]> {
  const resultat = new Map<string, Maillon[]>()
  for (const m of manifestes) {
    for (const e of m.fichiers) {
      if (e.action === 'unchanged' || e.retire) continue
      const cle = plie(e.chemin)
      const liste = resultat.get(cle) ?? []
      liste.push({ m, e })
      resultat.set(cle, liste)
    }
  }
  return resultat
}

export interface SkillInstalle {
  cible: string
  slug: string
  chemin: string
  /** « installe » : le fichier est celui que l'application a écrit. « modifie » : il est là, mais la personne l'a changé. */
  etat: 'installe' | 'modifie'
  manifesteId: string
}

async function racineSansRestriction(dossier: string): Promise<string | null> {
  try {
    return await realpath(dossier)
  } catch {
    return null
  }
}

/**
 * Skills réellement présents sur le disque pour ce dossier, d'après les manifestes ET le contenu actuel des fichiers.
 * Un fichier préexistant identique à ce qu'on aurait écrit n'est pas compté : l'application ne l'a pas écrit.
 */
export async function listerInstalles(
  ctx: ContexteDisque,
  demande: { racine: string; portee: 'projet' | 'global'; cible?: string }
): Promise<SkillInstalle[]> {
  const racine = await racineSansRestriction(demande.portee === 'global' ? ctx.env.dossierPersonnel : demande.racine)
  if (racine === null) return []
  const { manifestes } = await lireManifestes(ctx.dossierDonnees)
  const pertinents = manifestes.filter(
    (m) => m.etat === 'termine' && memeChemin(m.racine, racine) && (demande.cible === undefined || m.cible === demande.cible) && m.cible !== 'arborescence'
  )
  const resultat: SkillInstalle[] = []
  for (const chaine of chaines(pertinents).values()) {
    const dernier = chaine.at(-1)!
    let texte: string | null
    try {
      texte = await lireTexte(await resoudreDansRacine(racine, dernier.e.chemin, ctx.env, 'fichier'))
    } catch {
      continue // fichier illisible ou chemin devenu douteux : on ne l'annonce pas comme installé
    }
    if (texte === null) continue
    if (dernier.e.mode === 'fichier') {
      const slug = dernier.e.skills[0]?.slug
      if (slug) resultat.push({ cible: dernier.m.cible, slug, chemin: dernier.e.chemin, etat: sha256(texte) === dernier.e.sha256Apres ? 'installe' : 'modifie', manifesteId: dernier.m.id })
    } else if (dernier.e.mode === 'blocs') {
      const slugs = new Set(chaine.flatMap(({ e }) => e.skills.filter((s) => !s.retire).map((s) => s.slug)))
      for (const slug of slugs) {
        const dernierPourSlug = [...chaine].reverse().find(({ e }) => e.skills.some((s) => s.slug === slug && !s.retire))!
        const attendu = dernierPourSlug.e.skills.find((s) => s.slug === slug)!.sha256
        let bloc: string | null = null
        try {
          bloc = extraireBloc(texte, slug)
        } catch {
          bloc = null
        }
        if (bloc !== null) resultat.push({ cible: dernierPourSlug.m.cible, slug, chemin: dernier.e.chemin, etat: sha256(bloc) === attendu ? 'installe' : 'modifie', manifesteId: dernierPourSlug.m.id })
      }
    }
  }
  return resultat.sort((a, b) => a.cible.localeCompare(b.cible) || a.slug.localeCompare(b.slug))
}

// ---------------------------------------------------------------------------------------------
// Désinstallation d'un, de plusieurs ou de tous les skills d'un dossier
// ---------------------------------------------------------------------------------------------

export interface DemandeDesinstallation {
  racine: string
  portee: 'projet' | 'global'
  cible: string
  /** Skills à retirer, ou « tous ». */
  slugs: string[] | 'tous'
}

/**
 * Ne retire que ce que l'application a écrit et que la personne n'a pas modifié. Remet en place la sauvegarde
 * d'un fichier qu'elle avait remplacé, retire les blocs un par un, et les dossiers qu'elle avait créés s'ils sont vides.
 */
export function desinstaller(ctx: ContexteDisque, demande: DemandeDesinstallation): Promise<RapportRetrait> {
  return exclusif(async () => {
    const racine = await verifierRacine(demande.portee === 'global' ? ctx.env.dossierPersonnel : demande.racine, ctx.env, demande.portee)
    const { manifestes } = await lireManifestes(ctx.dossierDonnees)
    const concernes = manifestes.filter((m) => m.etat === 'termine' && m.cible === demande.cible && memeChemin(m.racine, racine))
    const rapport = rapportVide()
    const le = horodatage(ctx)
    const voulus = demande.slugs === 'tous' ? null : new Set(demande.slugs)
    const veut = (slug: string): boolean => voulus === null || voulus.has(slug)
    const modifies = new Set<Manifeste>()
    const marquer = (chaine: Maillon[], slug: string | null, resultat: 'supprime' | 'restaure' | 'bloc-retire' | 'deja-absent') => {
      for (const { m, e } of chaine) {
        for (const s of e.skills) if (slug === null || s.slug === slug) s.retire = { le, resultat }
        if (slug === null) e.retire = { le, resultat }
        modifies.add(m)
      }
    }

    try {
      const toutes = chaines(concernes)
      // Fichiers d'abord (un par skill, ou à blocs), accessoires ensuite
      for (const chaine of toutes.values()) {
        const premier = chaine[0]!
        const dernier = chaine.at(-1)!
        if (dernier.e.mode === 'creer-si-absent') continue
        const { abs, texte } = await ouvrir(racine, dernier.e.chemin, ctx)

        if (dernier.e.mode === 'fichier') {
          const slug = dernier.e.skills[0]?.slug
          if (!slug || !veut(slug)) continue
          if (texte === null) {
            marquer(chaine, null, 'deja-absent')
          } else if (sha256(texte) !== dernier.e.sha256Apres) {
            rapport.conserves.push({ chemin: dernier.e.chemin, raison: MODIFIE })
          } else if (premier.e.creeParApp) {
            await unlink(abs)
            rapport.retires.push(dernier.e.chemin)
            marquer(chaine, null, 'supprime')
          } else {
            const avant = await lireSauvegarde(ctx, premier.m.id, premier.e.chemin)
            if (avant === null) {
              rapport.conserves.push({ chemin: dernier.e.chemin, raison: 'La sauvegarde de ce fichier est introuvable : il est conservé tel quel.' })
            } else {
              await ecrire(ctx, abs, avant)
              rapport.restaures.push(dernier.e.chemin)
              marquer(chaine, null, 'restaure')
            }
          }
          continue
        }

        // Fichier à blocs : un bloc après l'autre
        const slugs = new Set(chaine.flatMap(({ e }) => e.skills.filter((s) => !s.retire).map((s) => s.slug)))
        let courant = texte
        for (const slug of slugs) {
          if (!veut(slug)) continue
          if (courant === null) {
            marquer(chaine, slug, 'deja-absent')
            continue
          }
          const attendu = [...chaine].reverse().flatMap(({ e }) => e.skills).find((s) => s.slug === slug && !s.retire)!.sha256
          let bloc: string | null
          try {
            bloc = extraireBloc(courant, slug)
          } catch (erreur) {
            if (!(erreur instanceof BlocIncompletError)) throw erreur
            rapport.conserves.push({ chemin: nom(dernier.e.chemin, slug), raison: 'Bloc incomplet dans le fichier : conservé.' })
            continue
          }
          if (bloc === null) marquer(chaine, slug, 'deja-absent')
          else if (sha256(bloc) !== attendu) rapport.conserves.push({ chemin: nom(dernier.e.chemin, slug), raison: MODIFIE })
          else {
            courant = retirerBlocs(courant, [slug])
            rapport.retires.push(nom(dernier.e.chemin, slug))
            marquer(chaine, slug, 'bloc-retire')
          }
        }
        if (courant !== null && courant !== texte) {
          // Le fichier n'est supprimé que si l'application l'a créé et qu'il ne reste que son en-tête
          if (premier.e.creeParApp && premier.e.entete !== undefined && neContientQueEntete(courant, premier.e.entete, [])) {
            await unlink(abs)
            rapport.retires.push(dernier.e.chemin)
            marquer(chaine, null, 'supprime')
          } else await ecrire(ctx, abs, courant)
        }
      }

      // Accessoires (.aider.conf.yml) : retirés avec le dernier skill du dossier
      const restants = [...toutes.values()].some((chaine) => chaine.some(({ e }) => e.mode !== 'creer-si-absent' && e.skills.some((s) => !s.retire)))
      if (!restants) {
        for (const chaine of toutes.values()) {
          const dernier = chaine.at(-1)!
          if (dernier.e.mode !== 'creer-si-absent' || !chaine[0]!.e.creeParApp) continue
          const { abs, texte } = await ouvrir(racine, dernier.e.chemin, ctx)
          if (texte === null) marquer(chaine, null, 'deja-absent')
          else if (sha256(texte) !== dernier.e.sha256Apres) rapport.conserves.push({ chemin: dernier.e.chemin, raison: MODIFIE })
          else {
            await unlink(abs)
            rapport.retires.push(dernier.e.chemin)
            marquer(chaine, null, 'supprime')
          }
        }
      }
      await retirerDossiers(ctx, racine, concernes, rapport)
      for (const m of concernes) if (rapport.dossiersRetires.some((d) => m.dossiersRetires.includes(d))) modifies.add(m)
    } finally {
      // Les marques sont écrites même si une étape a échoué : ce qui est déjà retiré ne doit pas être retenté comme installé
      for (const m of modifies) await ecrireManifeste(ctx.dossierDonnees, m, ctx.ecrire)
    }
    ctx.journal?.info('désinstallation', { cible: demande.cible, retires: rapport.retires.length, conserves: rapport.conserves.length })
    return rapport
  })
}

// ---------------------------------------------------------------------------------------------
// Purge des sauvegardes
// ---------------------------------------------------------------------------------------------

/** Vrai si plus rien de ce déploiement n'est en vigueur : ses sauvegardes ne serviront plus. */
function estSolde(m: Manifeste): { solde: boolean; depuis: string | null } {
  if (m.etat === 'annule') return { solde: true, depuis: m.annuleLe ?? null }
  if (m.etat !== 'termine') return { solde: false, depuis: null }
  let plusRecent: string | null = null
  for (const e of m.fichiers) {
    if (e.action === 'unchanged') continue
    const retraits = e.skills.length > 0 ? e.skills.map((s) => s.retire) : [e.retire]
    for (const r of retraits) {
      if (!r) return { solde: false, depuis: null }
      if (plusRecent === null || r.le > plusRecent) plusRecent = r.le
    }
  }
  return { solde: true, depuis: plusRecent }
}

/**
 * Supprime les sauvegardes des déploiements annulés ou entièrement désinstallés depuis plus de `jours` jours.
 * Les sauvegardes d'une installation encore en vigueur ne sont jamais touchées.
 */
export function purgerSauvegardes(ctx: ContexteDisque, jours: number): Promise<string[]> {
  return exclusif(async () => {
    const { manifestes } = await lireManifestes(ctx.dossierDonnees)
    const limite = new Date(Date.parse(horodatage(ctx)) - jours * 86_400_000).toISOString()
    const purges: string[] = []
    for (const m of manifestes) {
      if (m.sauvegardesPurgeesLe) continue
      const { solde, depuis } = estSolde(m)
      if (!solde || depuis === null || depuis > limite) continue
      // L'identifiant a passé le schéma (lettres, chiffres, tirets) : le chemin reste dans backups/
      await rm(dossierSauvegardes(ctx.dossierDonnees, m.id), { recursive: true, force: true })
      m.sauvegardesPurgeesLe = horodatage(ctx)
      await ecrireManifeste(ctx.dossierDonnees, m, ctx.ecrire)
      purges.push(m.id)
    }
    return purges
  })
}
