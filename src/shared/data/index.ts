import skillsBrut from './skills.json'
import profilesBrut from './profiles.json'
import scanRulesBrut from './scan-rules.json'
import {
  BuiltinSkillSchema,
  ProfilesSchema,
  type Profiles,
  type ScanRules,
  ScanRulesSchema,
  type Skill
} from '../schemas/catalog'
import { z } from 'zod'

export interface Catalogue {
  skills: Skill[]
  profiles: Profiles
  scanRules: ScanRules
}

// Les données embarquées passent par zod comme toute entrée : une erreur de saisie
// dans un JSON doit faire échouer le démarrage, pas se découvrir à l'usage.
export function chargerCatalogue(brut: { skills: unknown; profiles: unknown; scanRules: unknown }): Catalogue {
  const skills = z.array(BuiltinSkillSchema).parse(brut.skills)
  const slugs = new Set<string>()
  for (const skill of skills) {
    if (slugs.has(skill.slug)) throw new Error(`Skill intégré en double : ${skill.slug}`)
    slugs.add(skill.slug)
  }
  return {
    skills: skills.map((skill) => ({ ...skill, source: 'integre' as const })),
    profiles: ProfilesSchema.parse(brut.profiles),
    scanRules: ScanRulesSchema.parse(brut.scanRules)
  }
}

let memo: Catalogue | undefined

export function getCatalogue(): Catalogue {
  memo ??= chargerCatalogue({ skills: skillsBrut, profiles: profilesBrut, scanRules: scanRulesBrut })
  return memo
}
