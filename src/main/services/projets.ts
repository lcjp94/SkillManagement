// Services des projets : lecture (avec l'état recalculé depuis le disque) et modifications de la recette.
import type {
  BrouillonProjet,
  ChangementsVue,
  ConseilVueSchema,
  CouvertureVue,
  DeploiementVue,
  Entree,
  EtatProjet,
  FicheProjet,
  ProjetCarte,
  Sortie
} from '@shared/contrat'
import type { z } from 'zod'
import { getDisposition } from '../core/layouts'
import { couverture, lienAvecBesoin, trouverBesoin } from '../core/besoins'
import { choisirSkills } from '../core/deploiement'
import { chevauchements } from '../core/layouts'
import { besoinsDepuisObjectifs } from '../core/onboarding'
import {
  ProjetError,
  appliquerChangements,
  archiverProjet,
  creerProjet,
  dupliquerProjet,
  ajouterProjet,
  ecarterSkill,
  nomUnique,
  proposerChangements,
  remplacerProjet,
  restaurerProjet,
  retenirSkill,
  selectionnes,
  supprimerProjet,
  trouverProjet
} from '../core/projets'
import { conseiller, type ResultatConseil } from '../core/recommend'
import { gabaritPourMetier, planArborescence } from '../core/tree'
import { lireManifestes } from '../fs/manifestes'
import { listerInstalles } from '../fs/retrait'
import type { AssistantId } from '@shared/schemas/catalog'
import type { Manifeste } from '@shared/schemas/manifeste'
import type { Project, State } from '@shared/schemas/state'
import { ErreurUtilisateur, libelleAssistant, tousLesSkills, vueSkill, type Services } from './contexte'

type ConseilVue = z.output<typeof ConseilVueSchema>

export const profilDe = (etat: State): { metier: string; aisance: 'debutant' | 'intermediaire' | 'expert' } | null =>
  etat.profile ? { metier: etat.profile.metier, aisance: etat.profile.aisance } : null

function conseilVue(s: Services, resultat: ResultatConseil, etat: State): ConseilVue {
  const parSlug = new Map(tousLesSkills(s, etat).map((k) => [k.slug, k]))
  return {
    items: resultat.items.flatMap((i) => {
      const skill = parSlug.get(i.slug)
      return skill ? [{ skill: vueSkill(s, skill), score: i.score, raisons: i.reasons, besoins: i.besoins ?? [] }] : []
    }),
    totalTokens: resultat.totalTokens,
    tokenBudget: resultat.tokenBudget,
    maxSkills: resultat.maxSkills
  }
}

// --- Démarrage -----------------------------------------------------------------------------------

export function conseilInitial(s: Services, e: Entree<'onboarding.conseil'>): ConseilVue {
  const etat = s.etat.get()
  const resultat = conseiller(
    { nature: e.metier, level: e.aisance, objectives: e.objectifs, environments: e.assistants, customObjective: e.objectifLibre },
    tousLesSkills(s, etat),
    s.catalogue.profiles
  )
  return conseilVue(s, resultat, etat)
}

export async function terminerOnboarding(s: Services, e: Entree<'onboarding.terminer'>): Promise<Sortie<'onboarding.terminer'>> {
  const { profiles } = s.catalogue
  if (!profiles.natures.some((n) => n.id === e.profil.metier)) throw new ErreurUtilisateur('Choisissez un métier dans la liste.')
  if (e.profil.assistants.length === 0) throw new ErreurUtilisateur('Choisissez au moins un assistant.')
  const id = s.nouvelId()
  await s.etat.update((etat) => {
    const connus = new Set(tousLesSkills(s, etat).map((k) => k.slug))
    const besoins = besoinsDepuisObjectifs(e.profil.objectifs, profiles)
    let projet = creerProjet(
      {
        nom: nomUnique('Mon premier projet', etat.projects.map((p) => p.nom)),
        besoins,
        assistants: e.profil.assistants,
        metier: e.profil.metier,
        aisance: e.profil.aisance,
        arborescence: { gabarit: gabaritPourMetier(e.profil.metier), extras: [] }
      },
      { id, maintenant: s.maintenant() },
      profiles
    )
    for (const slug of e.slugs) {
      if (!connus.has(slug)) continue
      projet = retenirSkill(projet, slug, 'recommande')
    }
    projet = marquerPour(s, projet)
    return ajouterProjet({ ...etat, profile: e.profil }, projet)
  })
  return { projetId: id }
}

/** Mémorise, pour chaque skill recommandé, les besoins du projet auxquels il répond. */
function marquerPour(s: Services, projet: Project): Project {
  const parSlug = new Map(tousLesSkills(s).map((k) => [k.slug, k]))
  const besoins = projet.besoins.flatMap((id) => trouverBesoin(s.catalogue.profiles, id) ?? [])
  return {
    ...projet,
    skills: projet.skills.map((p) => {
      const skill = parSlug.get(p.slug)
      if (!skill || p.origine !== 'recommande') return p
      const pour = besoins.filter((b) => lienAvecBesoin(b, skill) !== null).map((b) => b.id)
      return pour.length > 0 ? { ...p, pour } : p
    })
  }
}

// --- Lecture -------------------------------------------------------------------------------------

async function etatDe(s: Services, projet: Project, manifestes: Manifeste[]): Promise<{ etat: EtatProjet; installes: number }> {
  const retenus = selectionnes(projet)
  let installes = 0
  let manquants = 0
  let avecDossier = 0
  for (const assistant of projet.assistants) {
    const racine = projet.dossiers[assistant]
    if (!racine) continue
    avecDossier++
    const presents = new Set((await listerInstalles(s.ctx, { racine, portee: 'projet', cible: assistant })).map((i) => i.slug))
    installes += retenus.filter((slug) => presents.has(slug)).length
    manquants += retenus.filter((slug) => !presents.has(slug)).length
  }
  const aHistorique = manifestes.some((m) => m.projetId === projet.id && m.etat === 'termine')
  if (avecDossier === 0 || (installes === 0 && !aHistorique)) return { etat: { type: 'jamais', nombre: retenus.length }, installes }
  return { etat: manquants === 0 ? { type: 'a-jour', nombre: 0 } : { type: 'a-installer', nombre: manquants }, installes }
}

export async function listerProjets(s: Services, e: Entree<'projets.liste'>): Promise<ProjetCarte[]> {
  const etat = s.etat.get()
  const { manifestes } = await lireManifestes(s.ctx.dossierDonnees)
  const cartes: ProjetCarte[] = []
  const libelles = new Map(s.catalogue.profiles.besoins.map((b) => [b.id, b.libelle]))
  for (const projet of etat.projects.filter((p) => Boolean(p.archiveLe) === Boolean(e.archives))) {
    const { etat: etatProjet, installes } = await etatDe(s, projet, manifestes)
    cartes.push({
      projet,
      etat: etatProjet,
      selectionnes: selectionnes(projet).length,
      installes,
      besoinsLibelles: projet.besoins.flatMap((id) => libelles.get(id) ?? [])
    })
  }
  return cartes.sort((a, b) => b.projet.modifieLe.localeCompare(a.projet.modifieLe))
}

function couverturesDe(s: Services, projet: Project, etat: State): CouvertureVue[] {
  return couverture(projet.besoins, projet.skills, tousLesSkills(s, etat), s.catalogue.profiles)
}

export async function obtenirFiche(s: Services, id: string): Promise<FicheProjet> {
  const etat = s.etat.get()
  const projet = trouverProjet(etat, id)
  const { manifestes } = await lireManifestes(s.ctx.dossierDonnees)
  const { etat: etatProjet } = await etatDe(s, projet, manifestes)
  const parSlug = new Map(tousLesSkills(s, etat).map((k) => [k.slug, k]))
  const retenus = selectionnes(projet)

  const deploiements: DeploiementVue[] = []
  for (const assistant of projet.assistants) {
    const disposition = getDisposition(assistant)
    if (!disposition) continue
    const dossier = projet.dossiers[assistant] ?? null
    const installes = dossier ? await listerInstalles(s.ctx, { racine: dossier, portee: 'projet', cible: assistant }) : []
    const presents = new Set(installes.map((i) => i.slug))
    const ici = manifestes.filter((m) => m.etat === 'termine' && dossier !== null && m.cible === assistant && m.projetId === projet.id)
    const derniere = ici.at(-1)
    const dernierDuDossier = derniere
      ? manifestes.filter((m) => m.etat === 'termine' && m.racine === derniere.racine).at(-1)
      : undefined
    deploiements.push({
      assistant,
      libelle: disposition.libelle,
      description: disposition.decrire('projet'),
      dossier,
      installes: installes.filter((i) => retenus.includes(i.slug)).map((i) => ({ slug: i.slug, etat: i.etat })),
      aInstaller: dossier ? retenus.filter((slug) => !presents.has(slug)) : retenus,
      libelleInstaller: choisirSkills(retenus, dossier ? [...presents] : []).libelle,
      derniere: derniere ? { id: derniere.id, creeLe: derniere.creeLe, annulable: dernierDuDossier?.id === derniere.id } : null
    })
  }

  const plan = planArborescence({ gabarit: projet.arborescence.gabarit, extras: projet.arborescence.extras, besoins: projet.besoins, readme: true }, s.catalogue.profiles)
  const octets = plan.readmes.reduce((n, f) => n + (f.mode === 'creer-si-absent' ? Buffer.byteLength(f.contenu) : 0), 0)
  const arbo = manifestes.filter((m) => m.cible === 'arborescence' && m.etat === 'termine' && m.projetId === projet.id).at(-1)

  return {
    projet,
    etat: etatProjet,
    skills: projet.skills.map((p) => {
      const skill = parSlug.get(p.slug)
      const vue = skill
        ? vueSkill(s, skill)
        : { slug: p.slug, name: p.slug, description: 'Ce skill n’est plus disponible.', category: '', tags: [], tokenEstimate: 0, source: 'importe' as const, analyse: 'clean' as const, environments: [], levels: [] }
      return { ...vue, origine: p.origine, ecarte: p.ecarte, pour: p.pour ?? [], introuvable: !skill }
    }),
    couvertures: couverturesDe(s, projet, etat),
    deploiements,
    chevauchements: chevauchements(projet.assistants).map((c) => c.message),
    arborescence: { dossiers: plan.dossiers, octets, installee: arbo ? { id: arbo.id, creeLe: arbo.creeLe } : null }
  }
}

export function proposition(s: Services, b: BrouillonProjet): Sortie<'projets.proposition'> {
  const etat = s.etat.get()
  const { profiles } = s.catalogue
  const metier = b.metier ?? etat.profile?.metier
  const resultat = conseiller(
    {
      nature: metier,
      level: b.aisance ?? etat.profile?.aisance ?? 'debutant',
      objectives: [],
      environments: b.assistants,
      customObjective: b.autreBesoin,
      besoins: b.besoins
    },
    tousLesSkills(s, etat),
    profiles
  )
  const gabarit = gabaritPourMetier(metier)
  const plan = planArborescence({ gabarit, extras: [], besoins: b.besoins, readme: true }, profiles)
  return {
    conseil: conseilVue(s, resultat, etat),
    couvertures: couverture(b.besoins, resultat.items.map((i) => ({ slug: i.slug, ecarte: false })), tousLesSkills(s, etat), profiles),
    arborescence: {
      gabarit,
      dossiers: plan.dossiers,
      octets: plan.readmes.reduce((n, f) => n + (f.mode === 'creer-si-absent' ? Buffer.byteLength(f.contenu) : 0), 0)
    }
  }
}

// --- Modifications de la recette -----------------------------------------------------------------

function verifierBesoinsConnus(s: Services, ids: string[]): void {
  for (const id of ids) if (!trouverBesoin(s.catalogue.profiles, id)) throw new ErreurUtilisateur('Un des besoins choisis n’existe pas.')
}

export async function creerUnProjet(s: Services, e: Entree<'projets.creer'>): Promise<Sortie<'projets.creer'>> {
  verifierBesoinsConnus(s, e.brouillon.besoins)
  const id = s.nouvelId()
  await s.etat.update((etat) => {
    const metier = e.brouillon.metier ?? etat.profile?.metier
    const connus = new Set(tousLesSkills(s, etat).map((k) => k.slug))
    let projet = creerProjet(
      {
        nom: e.nom,
        description: e.description,
        besoins: e.brouillon.besoins,
        autreBesoin: e.brouillon.autreBesoin,
        assistants: e.brouillon.assistants,
        metier: e.brouillon.metier,
        aisance: e.brouillon.aisance,
        arborescence: { gabarit: gabaritPourMetier(metier), extras: [] }
      },
      { id, maintenant: s.maintenant() },
      s.catalogue.profiles
    )
    for (const slug of e.slugs) if (connus.has(slug)) projet = retenirSkill(projet, slug, 'recommande')
    projet = marquerPour(s, projet)
    const dossiers: Project['dossiers'] = {}
    for (const [assistant, chemin] of Object.entries(e.dossiers ?? {})) {
      if (chemin && projet.assistants.includes(assistant as AssistantId)) dossiers[assistant as AssistantId] = chemin
    }
    return ajouterProjet(etat, { ...projet, dossiers })
  })
  return { id }
}

export async function modifierProjet(s: Services, e: Entree<'projets.modifier'>): Promise<Sortie<'projets.modifier'>> {
  if (e.besoins) verifierBesoinsConnus(s, e.besoins)
  await s.etat.update((etat) => {
    const projet = trouverProjet(etat, e.id)
    const suivant: Project = {
      ...projet,
      ...(e.nom !== undefined ? { nom: e.nom } : {}),
      ...(e.description !== undefined ? { description: e.description === '' ? undefined : e.description } : {}),
      ...(e.besoins ? { besoins: Array.from(new Set(e.besoins)) } : {}),
      ...(e.autreBesoin !== undefined ? { autreBesoin: e.autreBesoin === '' ? undefined : e.autreBesoin } : {}),
      ...(e.assistants ? { assistants: Array.from(new Set(e.assistants)) } : {}),
      ...(e.arborescence ? { arborescence: e.arborescence } : {})
    }
    return remplacerProjet(etat, suivant, s.maintenant())
  })
  return { id: e.id }
}

export async function changerSkills(s: Services, e: Entree<'projets.skills'>): Promise<Sortie<'projets.skills'>> {
  await s.etat.update((etat) => {
    const connus = new Set(tousLesSkills(s, etat).map((k) => k.slug))
    let projet = trouverProjet(etat, e.id)
    for (const slug of e.retenir) if (connus.has(slug)) projet = retenirSkill(projet, slug)
    for (const slug of e.ecarter) projet = ecarterSkill(projet, slug)
    return remplacerProjet(etat, projet, s.maintenant())
  })
  return { id: e.id }
}

export function changementsPropose(s: Services, id: string): ChangementsVue {
  const etat = s.etat.get()
  const projet = trouverProjet(etat, id)
  const { ajouts, retraits } = proposerChangements(projet, tousLesSkills(s, etat), s.catalogue.profiles, profilDe(etat))
  const parSlug = new Map(tousLesSkills(s, etat).map((k) => [k.slug, k]))
  return {
    ajouts: conseilVue(s, { items: ajouts, totalTokens: 0, tokenBudget: 0, maxSkills: 0 }, etat).items,
    retraits: retraits.map((r) => ({ ...r, name: parSlug.get(r.slug)?.name ?? r.slug }))
  }
}

export async function accepterChangements(s: Services, e: Entree<'projets.accepterChangements'>): Promise<Sortie<'projets.accepterChangements'>> {
  await s.etat.update((etat) => {
    const projet = trouverProjet(etat, e.id)
    // On recalcule la proposition : l'interface ne peut accepter que ce qui a réellement été proposé
    const { ajouts, retraits } = proposerChangements(projet, tousLesSkills(s, etat), s.catalogue.profiles, profilDe(etat))
    const voulus = new Set(e.ajouter)
    const retirer = new Set(e.retirer)
    const suivant = appliquerChangements(projet, {
      ajouter: ajouts.filter((a) => voulus.has(a.slug)),
      retirer: retraits.filter((r) => retirer.has(r.slug)).map((r) => r.slug)
    })
    return remplacerProjet(etat, suivant, s.maintenant())
  })
  return { id: e.id }
}

export async function dupliquer(s: Services, id: string): Promise<{ id: string }> {
  const nouveau = s.nouvelId()
  await s.etat.update((etat) => dupliquerProjet(etat, id, { id: nouveau, maintenant: s.maintenant() }))
  return { id: nouveau }
}

export async function archiver(s: Services, id: string, archive: boolean): Promise<{ id: string }> {
  await s.etat.update((etat) => (archive ? archiverProjet(etat, id, s.maintenant()) : restaurerProjet(etat, id, s.maintenant())))
  return { id }
}

/** Supprime la recette ; les fichiers déjà écrits sur le disque restent (l'interface propose de les désinstaller avant). */
export async function supprimer(s: Services, id: string): Promise<void> {
  await s.etat.update((etat) => supprimerProjet(etat, id))
}

export { ProjetError, libelleAssistant }
