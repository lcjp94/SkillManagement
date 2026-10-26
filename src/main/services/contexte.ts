// Ce dont tous les services ont besoin, et les conversions vers ce que l'interface voit.
import { randomUUID } from 'node:crypto'
import type { AnalyseImport } from '../core/echange'
import { DISPOSITIONS } from '../core/layouts'
import { LIBELLE_OBJECTIF } from '../core/onboarding'
import type { ResultatScan, StatutScan } from '../core/scan'
import { GABARITS } from '../core/tree'
import type { ContexteDisque } from '../fs/contexte'
import type { JsonStore } from '../store/json-store'
import type { Catalogue } from '@shared/data'
import type { Referentiels, SkillVue, AppInfo } from '@shared/contrat'
import type { ReglagesStockes } from '@shared/schemas/reglages'
import type { CoffreCles } from '../ai/coffre'
import type { OptionsRequete } from '../ai/http'
import type { Redactions } from '../ai/redactions'
import type { SkillSpector } from '../securite/skillspector'
import type { Sources } from '../sources/github'
import type { AssistantId, Skill } from '@shared/schemas/catalog'
import type { State } from '@shared/schemas/state'

/** Écrans natifs : remplacés dans les tests, jamais appelés avec un chemin venant de l'interface. */
export interface Dialogues {
  choisirDossier(): Promise<string | null>
  ouvrirDossier(chemin: string): Promise<void>
  /** Texte d'un fichier de projet choisi par la personne, ou null si elle annule. */
  lireFichierProjet(): Promise<string | null>
  /** Enregistre un fichier de projet ; faux si la personne annule. */
  enregistrerFichierProjet(nomSuggere: string, contenu: string): Promise<boolean>
}

export type { ReglagesStockes }

export interface Services {
  etat: JsonStore<State>
  reglages: JsonStore<ReglagesStockes>
  ctx: ContexteDisque
  catalogue: Catalogue
  info: AppInfo
  dialogues: Dialogues
  nouvelId: () => string
  maintenant: () => Date
  /** Analyses d'import en attente de confirmation, gardées côté principal : l'interface ne voit qu'un jeton. */
  imports: Map<string, AnalyseImport>
  coffre: CoffreCles
  /** Le stockage sécurisé du système est-il disponible ? Sans lui, aucune clé n'est enregistrée. */
  coffreDisponible: boolean
  redactions: Redactions
  /** Réglages réseau des appels vers les services d'IA (remplacés dans les tests). */
  reseau: OptionsRequete
  skillspector: SkillSpector
  sources: Sources
}

export const identifiant = (): string => randomUUID()

/** Erreur dont le message est écrit pour la personne : seul ce type de message traverse l'IPC. */
export class ErreurUtilisateur extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurUtilisateur'
  }
}

export const LIBELLE_NIVEAU = {
  debutant: { libelle: 'Débutant', description: 'Je préfère être guidé, avec peu de choix à faire.' },
  intermediaire: { libelle: 'À l’aise', description: 'J’utilise déjà un assistant IA et je veux plus de choix.' },
  expert: { libelle: 'Expert', description: 'Je connais bien ces outils et je veux un large choix.' }
} as const

/** Tous les skills connus : ceux du catalogue puis ceux de la personne. */
export const tousLesSkills = (s: Services, etat: State = s.etat.get()): Skill[] => [...s.catalogue.skills, ...etat.userSkills]

// L'analyse d'un skill intégré ne change pas : elle est calculée une fois
const analysesIntegrees = new Map<string, StatutScan>()

export function analyseDe(s: Services, skill: Skill): StatutScan {
  const calcul = (): ResultatScan => s.ctx.scanner(`${skill.name}\n${skill.description}\n${skill.content}`)
  if (skill.source !== 'integre') return calcul().status
  let statut = analysesIntegrees.get(skill.slug)
  if (!statut) {
    statut = calcul().status
    analysesIntegrees.set(skill.slug, statut)
  }
  return statut
}

export function vueSkill(s: Services, skill: Skill): SkillVue {
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    tokenEstimate: skill.tokenEstimate,
    source: skill.source,
    analyse: analyseDe(s, skill),
    environments: skill.environments,
    levels: skill.levels
  }
}

export function referentiels(s: Services): Referentiels {
  const { profiles, skills } = s.catalogue
  return {
    assistants: Object.values(DISPOSITIONS).map((d) => ({ id: d.id, libelle: d.libelle, description: d.decrire('projet'), verifie: d.verifie })),
    natures: profiles.natures.map((n) => ({ id: n.id, name: n.name, icon: n.icon, description: n.description })),
    niveaux: (Object.keys(LIBELLE_NIVEAU) as (keyof typeof LIBELLE_NIVEAU)[]).map((id) => ({ id, ...LIBELLE_NIVEAU[id] })),
    objectifs: Object.keys(profiles.objectiveCategories).map((id) => ({ id, libelle: LIBELLE_OBJECTIF[id] ?? id })),
    besoins: profiles.besoins.map((b) => ({ id: b.id, libelle: b.libelle, description: b.description })),
    categories: Array.from(new Set(skills.map((k) => k.category))).sort((a, b) => a.localeCompare(b, 'fr')),
    gabarits: Object.entries(GABARITS).map(([id, g]) => ({ id, libelle: g.libelle, dossiers: g.dossiers }))
  }
}

export const libelleAssistant = (id: string): string => (Object.hasOwn(DISPOSITIONS, id) ? DISPOSITIONS[id as AssistantId].libelle : id)
