import { z } from 'zod'

// Règle la plus stricte parmi les assistants vérifiés (OpenCode, 64 caractères, pas de « -- ») :
// un skill valide ici l'est partout. Voir docs/ASSISTANTS.md.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SlugSchema = z.string().max(64).regex(SLUG_RE)

export const ASSISTANT_IDS = ['claude-code', 'cursor', 'copilot', 'continue', 'opencode', 'aider', 'windsurf', 'cline'] as const
export const AssistantIdSchema = z.enum(ASSISTANT_IDS)
export type AssistantId = z.infer<typeof AssistantIdSchema>

export const LEVEL_IDS = ['debutant', 'intermediaire', 'expert'] as const
export const LevelIdSchema = z.enum(LEVEL_IDS)
export type LevelId = z.infer<typeof LevelIdSchema>

// Skill tel qu'il est stocké dans data/skills.json
export const BuiltinSkillSchema = z.object({
  name: z.string().min(1),
  slug: SlugSchema,
  category: z.string().min(1),
  description: z.string().min(1).max(1024),
  environments: z.array(AssistantIdSchema),
  tokenEstimate: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  personas: z.array(z.string()),
  levels: z.array(LevelIdSchema),
  content: z.string().min(1)
})
export type BuiltinSkill = z.infer<typeof BuiltinSkillSchema>

// Skill complet : intégré (lecture seule), généré ou importé
export const SkillSchema = BuiltinSkillSchema.extend({
  source: z.enum(['integre', 'genere', 'importe']),
  sourceRepo: z.string().optional(),
  sourcePath: z.string().optional(),
  sourceHash: z.string().optional(),
  scan: z.enum(['clean', 'warning', 'danger']).optional()
})
export type Skill = z.infer<typeof SkillSchema>

const LevelLimitsSchema = z.object({
  maxSkills: z.number().int().positive(),
  tokenBudget: z.number().int().positive(),
  maxPerCategory: z.number().int().positive(),
  minScore: z.number()
})

// Un besoin se reconnaît à ses catégories et, quand il en a, à ses mots-clés (voir core/besoins.ts)
export const BesoinSchema = z.object({
  id: SlugSchema,
  libelle: z.string().min(1),
  description: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  motsCles: z.array(z.string().min(1))
})
export type Besoin = z.infer<typeof BesoinSchema>

export const ProfilesSchema = z.object({
  natures: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      icon: z.string(),
      description: z.string(),
      categories: z.array(z.string()),
      objectives: z.array(z.string())
    })
  ),
  objectiveCategories: z.record(z.string(), z.string()),
  besoins: z.array(BesoinSchema),
  levels: z.record(LevelIdSchema, LevelLimitsSchema),
  weights: z.object({
    objectiveCategory: z.number(),
    natureCategoryFirst: z.number(),
    natureCategory: z.number(),
    persona: z.number(),
    level: z.number(),
    environment: z.number(),
    customKeyword: z.number(),
    customKeywordMax: z.number(),
    personaMismatch: z.number(),
    besoin: z.number(),
    besoinMotSeul: z.number()
  })
})
export type Profiles = z.infer<typeof ProfilesSchema>

// Ni lookahead, ni lookbehind, ni référence arrière : les motifs restent exécutables par un moteur à
// temps linéaire. Le moteur de JavaScript, lui, rétro-pointe : certains motifs sont quadratiques sur
// des entrées hostiles, d'où la limite de taille imposée par core/scan.ts.
const MOTIF_INTERDIT = /\(\?(?:=|!|<=|<!)|\\[1-9]|\\k</
function motifValide(motif: string): boolean {
  if (MOTIF_INTERDIT.test(motif)) return false
  try {
    new RegExp(motif, 'i')
    return true
  } catch {
    return false
  }
}
const MotifSchema = z.string().refine(motifValide, 'Motif invalide ou non linéaire')

export const ScanRulesSchema = z.object({
  normalize: z.literal('NFKC'),
  stripPattern: MotifSchema,
  rules: z
    .array(
      z.object({
        id: z.string().min(1),
        severity: z.enum(['high', 'medium', 'low']),
        category: z.string().min(1),
        message: z.string().min(1),
        pattern: MotifSchema,
        unless: MotifSchema.optional()
      })
    )
    .min(1)
})
export type ScanRules = z.infer<typeof ScanRulesSchema>
