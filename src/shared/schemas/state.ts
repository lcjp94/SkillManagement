import { z } from 'zod'
import { AssistantIdSchema, LevelIdSchema, SkillSchema, SlugSchema } from './catalog'

export const STATE_VERSION = 1

const RESERVES_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const CARACTERES_INTERDITS = /[<>:"/\\|?*\u0000-\u001f]/

// Le nom d'un projet peut servir de nom de dossier : il doit être valable sur les trois systèmes.
export const ProjectNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((nom) => !CARACTERES_INTERDITS.test(nom), 'Caractères interdits dans le nom')
  .refine((nom) => !RESERVES_WINDOWS.test(nom), 'Nom réservé par Windows')
  .refine((nom) => !/[. ]$/.test(nom), 'Le nom ne peut pas finir par un point ou un espace')

// Clé de comparaison : deux noms qui ne diffèrent que par la casse ou l'accent composé sont des doublons
export function cleNomProjet(nom: string): string {
  return nom.normalize('NFC').toLocaleLowerCase('fr')
}

export const ProfileSchema = z.object({
  prenom: z.string().trim().max(80).optional(),
  metier: z.string().min(1),
  aisance: LevelIdSchema,
  assistants: z.array(AssistantIdSchema),
  objectifs: z.array(z.string())
})
export type Profile = z.infer<typeof ProfileSchema>

const DateIsoSchema = z.iso.datetime()

export const ProjectSkillSchema = z.object({
  slug: SlugSchema,
  origine: z.enum(['recommande', 'manuel', 'ia', 'importe']),
  ecarte: z.boolean()
})

export const ProjectSchema = z.object({
  id: z.string().min(1),
  nom: ProjectNameSchema,
  description: z.string().max(2000).optional(),
  besoins: z.array(z.string()),
  metier: z.string().optional(),
  aisance: LevelIdSchema.optional(),
  assistants: z.array(AssistantIdSchema),
  skills: z.array(ProjectSkillSchema),
  arborescence: z.object({ gabarit: z.string(), extras: z.array(z.string()) }),
  dossiers: z.partialRecord(AssistantIdSchema, z.string()),
  archiveLe: DateIsoSchema.optional(),
  creeLe: DateIsoSchema,
  modifieLe: DateIsoSchema
})
export type Project = z.infer<typeof ProjectSchema>

export const StateSchema = z
  .object({
    version: z.literal(STATE_VERSION),
    profile: ProfileSchema.nullable(),
    projects: z.array(ProjectSchema),
    userSkills: z.array(SkillSchema.refine((skill) => skill.source !== 'integre', 'Un skill intégré ne se stocke pas'))
  })
  .superRefine((state, ctx) => {
    const vus = new Set<string>()
    state.projects.forEach((projet, index) => {
      const cle = cleNomProjet(projet.nom)
      if (vus.has(cle)) {
        ctx.addIssue({ code: 'custom', path: ['projects', index, 'nom'], message: 'Nom de projet en double' })
      }
      vus.add(cle)
    })
  })
export type State = z.infer<typeof StateSchema>

export function etatInitial(): State {
  return { version: STATE_VERSION, profile: null, projects: [], userSkills: [] }
}
