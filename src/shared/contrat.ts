// Contrat IPC entre l'interface et le processus principal : pour chaque canal, le schéma de l'entrée et de la sortie.
// L'interface n'envoie jamais de chemin à ouvrir ni de contenu à écrire : elle désigne des projets, des assistants
// et des skills par leur identifiant, et le processus principal retrouve le reste.
import { z } from 'zod'
import { AssistantIdSchema, LevelIdSchema, SlugSchema } from './schemas/catalog'
import { ProfileSchema, ProjectSchema } from './schemas/state'

export const AppInfoSchema = z.object({
  nom: z.string(),
  version: z.string(),
  plateforme: z.string(),
  /** Installations coupées par un arrêt brutal, remises en ordre au démarrage. */
  reprises: z.number().int().nonnegative(),
  /** Analyse approfondie facultative (outil externe), présente seulement s'il est installé sur l'ordinateur. */
  analyseApprofondie: z.object({ disponible: z.boolean(), version: z.string().optional() })
})
export type AppInfo = z.infer<typeof AppInfoSchema>

const Vide = z.undefined()
const Rien = z.void()
const Id = z.string().min(1).max(80)
const Slugs = z.array(SlugSchema).max(500)
const Analyse = z.enum(['clean', 'warning', 'danger'])

// --- Référentiels et catalogue -----------------------------------------------------------------

export const SkillVueSchema = z.object({
  slug: SlugSchema,
  name: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  tokenEstimate: z.number(),
  source: z.enum(['integre', 'genere', 'importe']),
  analyse: Analyse,
  environments: z.array(AssistantIdSchema),
  levels: z.array(LevelIdSchema)
})
export type SkillVue = z.infer<typeof SkillVueSchema>

export const ReferentielsSchema = z.object({
  assistants: z.array(z.object({ id: AssistantIdSchema, libelle: z.string(), description: z.string(), verifie: z.boolean() })),
  natures: z.array(z.object({ id: z.string(), name: z.string(), icon: z.string(), description: z.string() })),
  niveaux: z.array(z.object({ id: LevelIdSchema, libelle: z.string(), description: z.string() })),
  objectifs: z.array(z.object({ id: z.string(), libelle: z.string() })),
  besoins: z.array(z.object({ id: z.string(), libelle: z.string(), description: z.string() })),
  categories: z.array(z.string()),
  gabarits: z.array(z.object({ id: z.string(), libelle: z.string(), dossiers: z.array(z.string()) }))
})
export type Referentiels = z.infer<typeof ReferentielsSchema>

export const ElementConseilVueSchema = z.object({
  skill: SkillVueSchema,
  score: z.number(),
  raisons: z.array(z.string()),
  besoins: z.array(z.string())
})
export type ElementConseilVue = z.infer<typeof ElementConseilVueSchema>

export const ConseilVueSchema = z.object({
  items: z.array(ElementConseilVueSchema),
  totalTokens: z.number(),
  tokenBudget: z.number(),
  maxSkills: z.number()
})

export const CouvertureVueSchema = z.object({
  besoin: z.string(),
  libelle: z.string(),
  retenus: z.array(SlugSchema),
  disponibles: z.array(SlugSchema),
  lacune: z.boolean(),
  manque: z.number()
})
export type CouvertureVue = z.infer<typeof CouvertureVueSchema>

export const BibliothequeSkillSchema = SkillVueSchema.extend({
  selectionneDans: z.array(z.object({ id: Id, nom: z.string() })),
  installe: z.boolean()
})
export type BibliothequeSkill = z.infer<typeof BibliothequeSkillSchema>

// --- Projets -------------------------------------------------------------------------------------

export const EtatProjetSchema = z.object({ type: z.enum(['jamais', 'a-jour', 'a-installer']), nombre: z.number().int().nonnegative() })
export type EtatProjet = z.infer<typeof EtatProjetSchema>

export const ProjetCarteSchema = z.object({
  projet: ProjectSchema,
  etat: EtatProjetSchema,
  selectionnes: z.number().int(),
  installes: z.number().int(),
  besoinsLibelles: z.array(z.string())
})
export type ProjetCarte = z.infer<typeof ProjetCarteSchema>

export const SkillProjetVueSchema = SkillVueSchema.extend({
  origine: z.enum(['recommande', 'manuel', 'ia', 'importe']),
  ecarte: z.boolean(),
  pour: z.array(z.string()),
  introuvable: z.boolean()
})
export type SkillProjetVue = z.infer<typeof SkillProjetVueSchema>

export const DeploiementVueSchema = z.object({
  assistant: AssistantIdSchema,
  libelle: z.string(),
  description: z.string(),
  dossier: z.string().nullable(),
  installes: z.array(z.object({ slug: SlugSchema, etat: z.enum(['installe', 'modifie']) })),
  aInstaller: z.array(SlugSchema),
  /** Texte du bouton d'installation : « Installer 3 nouveaux skills », « Tout est déjà installé »… */
  libelleInstaller: z.string(),
  /** Dernière installation de cet assistant dans ce dossier ; annulable seulement si aucune plus récente n'existe dans le dossier. */
  derniere: z.object({ id: z.string(), creeLe: z.string(), annulable: z.boolean() }).nullable()
})
export type DeploiementVue = z.infer<typeof DeploiementVueSchema>

export const FicheProjetSchema = z.object({
  projet: ProjectSchema,
  etat: EtatProjetSchema,
  skills: z.array(SkillProjetVueSchema),
  couvertures: z.array(CouvertureVueSchema),
  deploiements: z.array(DeploiementVueSchema),
  chevauchements: z.array(z.string()),
  arborescence: z.object({ dossiers: z.array(z.string()), octets: z.number(), installee: z.object({ id: z.string(), creeLe: z.string() }).nullable() })
})
export type FicheProjet = z.infer<typeof FicheProjetSchema>

export const ChangementsVueSchema = z.object({
  ajouts: z.array(ElementConseilVueSchema),
  retraits: z.array(z.object({ slug: SlugSchema, name: z.string(), raison: z.string() }))
})
export type ChangementsVue = z.infer<typeof ChangementsVueSchema>

export const BrouillonProjetSchema = z.object({
  besoins: z.array(z.string()).max(32),
  autreBesoin: z.string().max(300).optional(),
  assistants: z.array(AssistantIdSchema),
  metier: z.string().optional(),
  aisance: LevelIdSchema.optional()
})
export type BrouillonProjet = z.infer<typeof BrouillonProjetSchema>

export const PropositionProjetSchema = z.object({
  conseil: ConseilVueSchema,
  couvertures: z.array(CouvertureVueSchema),
  arborescence: z.object({ gabarit: z.string(), dossiers: z.array(z.string()), octets: z.number() })
})

// --- Écriture sur le disque ----------------------------------------------------------------------

const ProblemeSchema = z.object({ severity: z.enum(['high', 'medium', 'low']), category: z.string(), message: z.string(), excerpt: z.string().optional() })

export const ApercuSchema = z.object({
  racine: z.string(),
  lignes: z.array(z.object({ chemin: z.string(), action: z.enum(['create', 'modify', 'unchanged']), skills: z.array(z.string()), ecrase: z.boolean(), avertissement: z.string().optional() })),
  dossiersACreer: z.array(z.string()),
  refus: z.array(z.object({ slug: z.string(), raison: z.string(), problemes: z.array(ProblemeSchema).optional() })),
  aConfirmer: z.array(z.object({ slug: z.string(), problemes: z.array(ProblemeSchema) })),
  ecrasements: z.array(z.string()),
  avertissements: z.array(z.string()),
  octets: z.number(),
  nombreSkills: z.number(),
  arbre: z.string()
})
export type ApercuVue = z.infer<typeof ApercuSchema>

export const ChoixSkillsSchema = z.object({ aEcrire: z.array(z.string()), dejaInstalles: z.array(z.string()), libelle: z.string() })

export const DemandeDeploiementSchema = z.object({
  projetId: Id,
  assistant: AssistantIdSchema,
  /** Dossier choisi avec le sélecteur ; absent = dossier déjà mémorisé pour ce projet. */
  racine: z.string().max(1000).optional(),
  reinstaller: Slugs.optional(),
  tout: z.boolean().optional(),
  avertissementsConfirmes: Slugs.optional(),
  ecrasementsConfirmes: z.array(z.string().max(400)).max(1000).optional(),
  /** Lance l'analyse approfondie (si disponible) sur les skills à écrire. */
  analyseApprofondie: z.boolean().optional()
})
export type DemandeDeploiementVue = z.infer<typeof DemandeDeploiementSchema>

export const ApprofondieVueSchema = z.object({
  disponible: z.boolean(),
  executee: z.boolean(),
  /** Skills pour lesquels l'analyse n'a pas pu se terminer (elle n'est jamais bloquante). */
  erreurs: z.array(z.string())
})
export type ApprofondieVue = z.infer<typeof ApprofondieVueSchema>

export const ApercuDeploiementSchema = z.object({
  choix: ChoixSkillsSchema,
  apercu: ApercuSchema,
  chevauchements: z.array(z.string()),
  dossier: z.string(),
  approfondie: ApprofondieVueSchema
})

export const ResultatApplicationSchema = ApercuDeploiementSchema.extend({
  statut: z.enum(['applique', 'confirmation-requise', 'rien-a-faire']),
  id: z.string().optional()
})
export type ResultatApplicationVue = z.infer<typeof ResultatApplicationSchema>

export const RapportRetraitSchema = z.object({
  retires: z.array(z.string()),
  restaures: z.array(z.string()),
  conserves: z.array(z.object({ chemin: z.string(), raison: z.string() })),
  dossiersRetires: z.array(z.string())
})
export type RapportRetraitVue = z.infer<typeof RapportRetraitSchema>

export const HistoriqueSchema = z.array(
  z.object({
    id: z.string(),
    creeLe: z.string(),
    cible: z.string(),
    libelleCible: z.string(),
    dossier: z.string(),
    etat: z.enum(['termine', 'annule', 'en-cours']),
    nbFichiers: z.number(),
    nbSkills: z.number(),
    retires: z.number(),
    annuleLe: z.string().optional()
  })
)
export type HistoriqueVue = z.infer<typeof HistoriqueSchema>

export const DemandeArborescenceSchema = z.object({
  projetId: Id,
  racine: z.string().max(1000).optional(),
  gabarit: z.string().max(64),
  extras: z.array(z.string().max(64)).max(50),
  readme: z.boolean()
})

export const ApercuArborescenceSchema = z.object({ apercu: ApercuSchema, dossier: z.string() })

// --- Import et export ----------------------------------------------------------------------------

export const AnalyseImportVueSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(false), erreur: z.string() }),
  z.object({
    ok: z.literal(true),
    jeton: z.string(),
    nom: z.string(),
    nbSkills: z.number(),
    aConfirmer: z.array(z.object({ slug: z.string(), name: z.string(), problemes: z.array(ProblemeSchema) })),
    refuses: z.array(z.object({ slug: z.string(), raison: z.string() })),
    inconnus: z.array(z.string()),
    besoinsInconnus: z.array(z.string())
  })
])
export type AnalyseImportVue = z.infer<typeof AnalyseImportVueSchema>

// --- Réglages ------------------------------------------------------------------------------------

export const ReglagesSchema = z.object({ theme: z.enum(['auto', 'clair', 'sombre']) })
export type Reglages = z.infer<typeof ReglagesSchema>

// --- IA facultative ------------------------------------------------------------------------------

export const FournisseurVueSchema = z.object({
  id: z.string(),
  libelle: z.string(),
  adresse: z.string(),
  modele: z.string(),
  cle: z.enum(['oui', 'non', 'selon']),
  lien: z.string(),
  note: z.string().optional(),
  /** Texte à accepter avant d'enregistrer ce service (il envoie la demande à des tiers qu'il choisit). */
  consentement: z.string().optional(),
  local: z.boolean()
})
export type FournisseurVue = z.infer<typeof FournisseurVueSchema>

export const IaEtatSchema = z.object({
  fournisseurs: z.array(FournisseurVueSchema),
  /** Le choix enregistré. La clé n'est jamais renvoyée : seulement le fait qu'elle existe. */
  choix: z.object({ fournisseur: z.string(), adresse: z.string(), modele: z.string(), cleEnregistree: z.boolean(), consentement: z.boolean() }).nullable(),
  /** Vrai si une rédaction est possible : un service choisi et, s'il en demande une, une clé enregistrée. */
  configure: z.boolean(),
  stockageSecurise: z.boolean()
})
export type IaEtat = z.infer<typeof IaEtatSchema>

export const IaReglageSchema = z.object({
  fournisseur: z.string().max(32),
  adresse: z.string().max(300).optional(),
  modele: z.string().max(200),
  cle: z.string().max(4096).optional(),
  /** Consentement donné pour un service qui envoie la demande à des tiers. */
  consentement: z.boolean().optional()
})

export const RedactionVueSchema = z.object({
  etat: z.enum(['en-cours', 'termine', 'erreur', 'annule']),
  texte: z.string(),
  erreur: z.string().optional(),
  skill: z.object({ slug: SlugSchema, name: z.string(), description: z.string(), corps: z.string() }).optional()
})
export type RedactionVue = z.infer<typeof RedactionVueSchema>

export const AnalyseSkillVueSchema = z.object({
  analyse: Analyse,
  problemes: z.array(ProblemeSchema),
  approfondie: z.object({
    disponible: z.boolean(),
    executee: z.boolean(),
    statut: Analyse.optional(),
    problemes: z.array(ProblemeSchema),
    erreur: z.string().optional()
  })
})
export type AnalyseSkillVue = z.infer<typeof AnalyseSkillVueSchema>

export const NouveauSkillSchema = z.object({
  slug: SlugSchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1024),
  content: z.string().min(1).max(100_000)
})

// --- Sources en ligne ----------------------------------------------------------------------------

export const ReferenceSkillSchema = z.object({ repo: z.string().max(200), path: z.string().max(300) })

export const SkillDistantVueSchema = ReferenceSkillSchema.extend({ name: z.string(), description: z.string(), url: z.string() })

export const ApercuImportVueSchema = z.object({
  name: z.string(),
  slug: SlugSchema,
  description: z.string(),
  extrait: z.string(),
  url: z.string(),
  licence: z.string().nullable(),
  analyse: AnalyseSkillVueSchema,
  dejaImporte: z.object({ slug: SlugSchema, identique: z.boolean() }).nullable()
})
export type ApercuImportVue = z.infer<typeof ApercuImportVueSchema>

// --- Mises à jour de l'application ----------------------------------------------------------------

export const MiseAJourVueSchema = z.object({
  statut: z.enum(['inactive', 'aucune-source', 'a-verifier', 'a-jour', 'disponible', 'telechargement', 'pret', 'erreur']),
  version: z.string().optional(),
  progression: z.number().min(0).max(100).optional(),
  message: z.string().optional()
})
export type MiseAJourVue = z.infer<typeof MiseAJourVueSchema>

// --- Les canaux ----------------------------------------------------------------------------------

export const CONTRAT = {
  'app.info': { entree: Vide, sortie: AppInfoSchema },
  'referentiels.get': { entree: Vide, sortie: ReferentielsSchema },
  'reglages.get': { entree: Vide, sortie: ReglagesSchema },
  'reglages.set': { entree: ReglagesSchema, sortie: ReglagesSchema },
  'profil.get': { entree: Vide, sortie: ProfileSchema.nullable() },
  'profil.set': { entree: ProfileSchema, sortie: ProfileSchema },
  'onboarding.conseil': {
    entree: z.object({ metier: z.string(), aisance: LevelIdSchema, objectifs: z.array(z.string()).max(32), assistants: z.array(AssistantIdSchema), objectifLibre: z.string().max(300).optional() }),
    sortie: ConseilVueSchema
  },
  'onboarding.terminer': { entree: z.object({ profil: ProfileSchema, slugs: Slugs }), sortie: z.object({ projetId: z.string() }) },
  'catalogue.liste': { entree: Vide, sortie: z.array(BibliothequeSkillSchema) },
  'catalogue.detail': { entree: z.object({ slug: SlugSchema }), sortie: SkillVueSchema.extend({ content: z.string() }) },
  'projets.liste': { entree: z.object({ archives: z.boolean().optional() }), sortie: z.array(ProjetCarteSchema) },
  'projets.fiche': { entree: z.object({ id: Id }), sortie: FicheProjetSchema },
  'projets.proposition': { entree: BrouillonProjetSchema, sortie: PropositionProjetSchema },
  'projets.creer': {
    entree: z.object({
      nom: z.string(),
      description: z.string().max(2000).optional(),
      brouillon: BrouillonProjetSchema,
      slugs: Slugs,
      dossiers: z.partialRecord(AssistantIdSchema, z.string().max(1000)).optional()
    }),
    sortie: z.object({ id: z.string() })
  },
  'projets.modifier': {
    entree: z.object({
      id: Id,
      nom: z.string().optional(),
      description: z.string().max(2000).optional(),
      besoins: z.array(z.string()).max(32).optional(),
      autreBesoin: z.string().max(300).optional(),
      assistants: z.array(AssistantIdSchema).optional(),
      arborescence: z.object({ gabarit: z.string().max(64), extras: z.array(z.string().max(64)).max(50) }).optional()
    }),
    sortie: z.object({ id: z.string() })
  },
  'projets.skills': { entree: z.object({ id: Id, retenir: Slugs, ecarter: Slugs }), sortie: z.object({ id: z.string() }) },
  'projets.propositionChangements': { entree: z.object({ id: Id }), sortie: ChangementsVueSchema },
  'projets.accepterChangements': { entree: z.object({ id: Id, ajouter: Slugs, retirer: Slugs }), sortie: z.object({ id: z.string() }) },
  'projets.dupliquer': { entree: z.object({ id: Id }), sortie: z.object({ id: z.string() }) },
  'projets.archiver': { entree: z.object({ id: Id, archiver: z.boolean() }), sortie: z.object({ id: z.string() }) },
  'projets.supprimer': { entree: z.object({ id: Id }), sortie: Rien },
  'projets.exporter': { entree: z.object({ id: Id }), sortie: z.object({ enregistre: z.boolean() }) },
  'projets.importer.choisir': { entree: Vide, sortie: AnalyseImportVueSchema.nullable() },
  'projets.importer.confirmer': { entree: z.object({ jeton: z.string(), confirmes: Slugs }), sortie: z.object({ id: z.string(), laisses: z.array(z.object({ slug: z.string(), raison: z.string() })) }) },
  'dossier.choisir': { entree: Vide, sortie: z.string().nullable() },
  'dossier.ouvrir': { entree: z.object({ projetId: Id, assistant: AssistantIdSchema }), sortie: Rien },
  'deploiement.apercu': { entree: DemandeDeploiementSchema, sortie: ApercuDeploiementSchema },
  'deploiement.appliquer': { entree: DemandeDeploiementSchema, sortie: ResultatApplicationSchema },
  'deploiement.desinstaller': { entree: z.object({ projetId: Id, assistant: AssistantIdSchema, slugs: z.union([Slugs, z.literal('tous')]) }), sortie: RapportRetraitSchema },
  'deploiement.annuler': { entree: z.object({ projetId: Id, assistant: AssistantIdSchema }), sortie: RapportRetraitSchema },
  'deploiement.historique': { entree: z.object({ projetId: Id }), sortie: HistoriqueSchema },
  'arborescence.apercu': { entree: DemandeArborescenceSchema, sortie: ApercuArborescenceSchema },
  'arborescence.appliquer': { entree: DemandeArborescenceSchema, sortie: z.object({ statut: z.enum(['applique', 'rien-a-faire']), apercu: ApercuSchema }) },
  'arborescence.retirer': { entree: z.object({ projetId: Id }), sortie: RapportRetraitSchema },
  'ia.etat': { entree: Vide, sortie: IaEtatSchema },
  'ia.enregistrer': { entree: IaReglageSchema.extend({ supprimerCle: z.boolean().optional() }), sortie: IaEtatSchema },
  'ia.tester': { entree: IaReglageSchema, sortie: z.object({ ok: z.boolean(), message: z.string(), modeles: z.array(z.string()) }) },
  'ia.rediger': { entree: z.object({ sujet: z.string().trim().min(3).max(500), besoin: z.string().max(200).optional() }), sortie: z.object({ id: z.string() }) },
  'ia.lire': { entree: z.object({ id: z.string().max(80) }), sortie: RedactionVueSchema },
  'ia.annuler': { entree: z.object({ id: z.string().max(80) }), sortie: Rien },
  'skills.analyser': { entree: NouveauSkillSchema, sortie: AnalyseSkillVueSchema },
  'skills.creer': { entree: NouveauSkillSchema.extend({ confirme: z.boolean().optional() }), sortie: z.object({ slug: SlugSchema }) },
  'skills.supprimer': { entree: z.object({ slug: SlugSchema }), sortie: Rien },
  'sources.liste': { entree: Vide, sortie: z.object({ defaut: z.array(z.object({ repo: z.string(), libelle: z.string() })), perso: z.array(z.string()) }) },
  'sources.ajouter': { entree: z.object({ repo: z.string().max(200) }), sortie: z.object({ perso: z.array(z.string()) }) },
  'sources.retirer': { entree: z.object({ repo: z.string().max(200) }), sortie: z.object({ perso: z.array(z.string()) }) },
  'sources.adresse': { entree: z.object({ adresse: z.string().max(600) }), sortie: ReferenceSkillSchema.nullable() },
  'sources.rechercher': {
    entree: z.object({ requete: z.string().max(200), repos: z.array(z.string().max(200)).max(12) }),
    sortie: z.object({ resultats: z.array(SkillDistantVueSchema), total: z.number(), erreurs: z.array(z.object({ repo: z.string(), message: z.string() })) })
  },
  'sources.apercu': { entree: ReferenceSkillSchema, sortie: ApercuImportVueSchema },
  'maj.etat': { entree: Vide, sortie: MiseAJourVueSchema },
  'maj.verifier': { entree: Vide, sortie: MiseAJourVueSchema },
  'maj.telecharger': { entree: Vide, sortie: Rien },
  'maj.installer': { entree: Vide, sortie: Rien },
  'sources.importer': { entree: ReferenceSkillSchema.extend({ confirme: z.boolean().optional(), remplacer: z.boolean().optional() }), sortie: z.object({ slug: SlugSchema }) }
} as const satisfies Record<string, { entree: z.ZodType; sortie: z.ZodType }>

export type Canal = keyof typeof CONTRAT
export type Entree<C extends Canal> = z.input<(typeof CONTRAT)[C]['entree']>
export type Sortie<C extends Canal> = z.output<(typeof CONTRAT)[C]['sortie']>

// Surface exposée à l'interface par le preload : un seul point d'entrée, restreint à la liste des canaux
export interface SkillManagementApi {
  invoke<C extends Canal>(canal: C, entree?: Entree<C>): Promise<Sortie<C>>
}
