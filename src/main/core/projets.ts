// Projets : une recette (besoins, skills retenus ou écartés), sans accès disque ni écriture de fichiers.
// Toutes les fonctions rendent un nouvel état et laissent l'ancien intact ; le magasin les enchaîne sous verrou.
import type { Profiles } from '@shared/schemas/catalog'
import { ProjectSchema, StateSchema, cleNomProjet, type Profile, type Project, type State } from '@shared/schemas/state'
import { trouverBesoin } from './besoins'
import { conseiller, type ElementConseil, type SkillConseil } from './recommend'

export class ProjetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjetError'
  }
}

export interface EntreeProjet {
  nom: string
  description?: string
  besoins: string[]
  autreBesoin?: string
  assistants: Project['assistants']
  metier?: string
  aisance?: Project['aisance']
  arborescence?: Project['arborescence']
}

export interface Contexte {
  id: string
  maintenant: Date
}

const iso = (date: Date): string => date.toISOString()

/** Nom libre parmi les existants : « X », puis « X (2) » ; pour une copie « X (copie) », « X (copie 2) »… (80 caractères au plus). */
export function nomUnique(souhaite: string, existants: string[], copie = false): string {
  const pris = new Set(existants.map(cleNomProjet))
  const avecFin = (fin: string) => souhaite.slice(0, 80 - fin.length).trimEnd() + fin
  let candidat = avecFin(copie ? ' (copie)' : '')
  for (let n = 2; pris.has(cleNomProjet(candidat)); n++) candidat = avecFin(copie ? ` (copie ${n})` : ` (${n})`)
  return candidat
}

function verifierBesoins(besoins: string[], profiles: Profiles): void {
  for (const id of besoins) {
    if (!trouverBesoin(profiles, id)) throw new ProjetError(`Besoin inconnu : ${id}`)
  }
}

function valider(projet: unknown): Project {
  const r = ProjectSchema.safeParse(projet)
  if (!r.success) {
    const champ = r.error.issues[0]?.path[0]
    throw new ProjetError(champ === 'nom' ? 'Ce nom ne peut pas servir : vérifiez les caractères et la longueur.' : 'Les informations du projet sont incomplètes ou invalides.')
  }
  return r.data
}

function verifierEtat(etat: State): State {
  const r = StateSchema.safeParse(etat)
  if (!r.success) {
    const doublon = r.error.issues.some((i) => i.path[2] === 'nom')
    throw new ProjetError(doublon ? 'Un projet porte déjà ce nom.' : 'Ce changement rendrait les données invalides.')
  }
  return r.data
}

export function creerProjet(entree: EntreeProjet, contexte: Contexte, profiles: Profiles): Project {
  verifierBesoins(entree.besoins, profiles)
  const maintenant = iso(contexte.maintenant)
  return valider({
    id: contexte.id,
    nom: entree.nom,
    description: entree.description,
    besoins: Array.from(new Set(entree.besoins)),
    autreBesoin: entree.autreBesoin,
    metier: entree.metier,
    aisance: entree.aisance,
    assistants: Array.from(new Set(entree.assistants)),
    skills: [],
    arborescence: entree.arborescence ?? { gabarit: 'aucun', extras: [] },
    dossiers: {},
    creeLe: maintenant,
    modifieLe: maintenant
  })
}

export function trouverProjet(etat: State, id: string): Project {
  const projet = etat.projects.find((p) => p.id === id)
  if (!projet) throw new ProjetError('Ce projet n’existe plus.')
  return projet
}

export function ajouterProjet(etat: State, projet: Project): State {
  if (etat.projects.some((p) => p.id === projet.id)) throw new ProjetError('Ce projet existe déjà.')
  return verifierEtat({ ...etat, projects: [...etat.projects, projet] })
}

export function remplacerProjet(etat: State, projet: Project, maintenant: Date): State {
  trouverProjet(etat, projet.id)
  const mis = valider({ ...projet, modifieLe: iso(maintenant) })
  return verifierEtat({ ...etat, projects: etat.projects.map((p) => (p.id === mis.id ? mis : p)) })
}

/** Supprime la recette seulement : les fichiers déjà écrits sur le disque ne sont pas touchés (M4 propose de les retirer). */
export function supprimerProjet(etat: State, id: string): State {
  trouverProjet(etat, id)
  return { ...etat, projects: etat.projects.filter((p) => p.id !== id) }
}

export function archiverProjet(etat: State, id: string, maintenant: Date): State {
  const projet = trouverProjet(etat, id)
  return remplacerProjet(etat, { ...projet, archiveLe: iso(maintenant) }, maintenant)
}

export function restaurerProjet(etat: State, id: string, maintenant: Date): State {
  const reste: Project = { ...trouverProjet(etat, id) }
  delete reste.archiveLe
  return remplacerProjet(etat, reste, maintenant)
}

/**
 * Copie la recette pour la réappliquer ailleurs. Les dossiers mémorisés ne suivent pas : la copie
 * sert justement à viser un autre dossier. La copie n'est jamais archivée.
 */
export function dupliquerProjet(etat: State, id: string, contexte: Contexte): State {
  const source = trouverProjet(etat, id)
  const recette: Project = structuredClone(source)
  delete recette.archiveLe
  const copie = valider({
    ...recette,
    id: contexte.id,
    nom: nomUnique(source.nom, etat.projects.map((p) => p.nom), true),
    dossiers: {},
    creeLe: iso(contexte.maintenant),
    modifieLe: iso(contexte.maintenant)
  })
  return ajouterProjet(etat, copie)
}

/** Skills retenus : présents dans la recette et non écartés. */
export const selectionnes = (projet: Project): string[] => projet.skills.filter((s) => !s.ecarte).map((s) => s.slug)

/** Choisit un skill, ou le réintègre s'il avait été écarté. */
export function retenirSkill(projet: Project, slug: string, origine: Project['skills'][number]['origine'] = 'manuel'): Project {
  const existant = projet.skills.find((s) => s.slug === slug)
  if (existant) return { ...projet, skills: projet.skills.map((s) => (s.slug === slug ? { ...s, ecarte: false } : s)) }
  return { ...projet, skills: [...projet.skills, { slug, origine, ecarte: false }] }
}

/** Écarte un skill sans l'oublier : il ne sera plus reproposé. Un skill absent est noté comme écarté. */
export function ecarterSkill(projet: Project, slug: string): Project {
  const existant = projet.skills.find((s) => s.slug === slug)
  if (existant) return { ...projet, skills: projet.skills.map((s) => (s.slug === slug ? { ...s, ecarte: true } : s)) }
  return { ...projet, skills: [...projet.skills, { slug, origine: 'manuel', ecarte: true }] }
}

export interface Retrait {
  slug: string
  raison: string
}

export interface Changements {
  ajouts: ElementConseil[]
  retraits: Retrait[]
}

/**
 * Ce que le projet pourrait ajouter ou retirer d'après ses besoins. Rien n'est appliqué ici : la personne
 * voit la proposition et choisit (CLAUDE.md § 13.4). Seuls des compléments sont proposés : jamais un skill
 * déjà retenu ni un skill écarté, et dans ce qui reste des plafonds du niveau.
 */
export function proposerChangements(
  projet: Project,
  catalogue: SkillConseil[],
  profiles: Profiles,
  profil: Pick<Profile, 'metier' | 'aisance'> | null
): Changements {
  // Un skill recommandé pour des besoins qui ne figurent plus au projet : retrait proposé, jamais automatique.
  // Les skills ajoutés à la main, par l'IA ou importés ne sont jamais proposés au retrait.
  const retraits: Retrait[] = projet.skills
    .filter((s) => !s.ecarte && s.origine === 'recommande' && s.pour && s.pour.length > 0)
    .filter((s) => !s.pour!.some((id) => projet.besoins.includes(id)))
    .map((s) => ({ slug: s.slug, raison: 'Ne répond plus à aucun besoin du projet' }))

  // Les retraits proposés libèrent leur place : ajouts et retraits forment une proposition cohérente
  const partants = new Set(retraits.map((r) => r.slug))
  const resultat = conseiller(
    {
      nature: projet.metier ?? profil?.metier,
      level: projet.aisance ?? profil?.aisance ?? 'debutant',
      objectives: [],
      environments: projet.assistants,
      customObjective: projet.autreBesoin,
      besoins: projet.besoins,
      dejaPresents: selectionnes(projet).filter((slug) => !partants.has(slug)),
      ecartes: [...projet.skills.filter((s) => s.ecarte).map((s) => s.slug), ...partants]
    },
    catalogue,
    profiles
  )
  return { ajouts: resultat.items, retraits }
}

/** Applique les changements que la personne a acceptés. Un skill qui n'est pas « recommandé » n'est jamais retiré ici. */
export function appliquerChangements(projet: Project, acceptes: { ajouter: ElementConseil[]; retirer: string[] }): Project {
  const retirer = new Set(acceptes.retirer)
  const gardes = projet.skills.filter((s) => !(retirer.has(s.slug) && s.origine === 'recommande'))
  const presents = new Set(gardes.map((s) => s.slug))
  const nouveaux = acceptes.ajouter
    .filter((a) => !presents.has(a.slug))
    .map((a) => ({ slug: a.slug, origine: 'recommande' as const, ecarte: false, ...(a.besoins ? { pour: a.besoins } : {}) }))
  return { ...projet, skills: [...gardes, ...nouveaux] }
}
