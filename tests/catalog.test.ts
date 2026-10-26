import { describe, expect, it } from 'vitest'
import skillsBrut from '../src/shared/data/skills.json'
import profilesBrut from '../src/shared/data/profiles.json'
import scanRulesBrut from '../src/shared/data/scan-rules.json'
import { chargerCatalogue, getCatalogue } from '../src/shared/data'
import { ASSISTANT_IDS, LEVEL_IDS, ScanRulesSchema } from '../src/shared/schemas/catalog'

describe('catalogue embarqué', () => {
  const catalogue = getCatalogue()

  it('charge les 102 skills, les 16 catégories et les 12 règles de pré-analyse', () => {
    expect(catalogue.skills).toHaveLength(102)
    expect(new Set(catalogue.skills.map((s) => s.category)).size).toBe(16)
    expect(catalogue.scanRules.rules).toHaveLength(12)
    expect(catalogue.skills.every((s) => s.source === 'integre')).toBe(true)
  })

  it('refuse un slug en double', () => {
    const copie = [skillsBrut[0], skillsBrut[0]]
    expect(() => chargerCatalogue({ skills: copie, profiles: profilesBrut, scanRules: scanRulesBrut })).toThrow('en double')
  })

  it('refuse un slug qui ne serait pas valable pour tous les assistants', () => {
    const faux = [{ ...skillsBrut[0], slug: 'deux--tirets' }]
    expect(() => chargerCatalogue({ skills: faux, profiles: profilesBrut, scanRules: scanRulesBrut })).toThrow()
    const trop = [{ ...skillsBrut[0], slug: 'a'.repeat(65) }]
    expect(() => chargerCatalogue({ skills: trop, profiles: profilesBrut, scanRules: scanRulesBrut })).toThrow()
  })

  it('les références croisées sont cohérentes (métiers, niveaux, assistants)', () => {
    const metiers = new Set(catalogue.profiles.natures.map((n) => n.id))
    for (const skill of catalogue.skills) {
      for (const persona of skill.personas) expect(metiers, `${skill.slug} : métier ${persona}`).toContain(persona)
      for (const env of skill.environments) expect(ASSISTANT_IDS).toContain(env)
      for (const niveau of skill.levels) expect(LEVEL_IDS).toContain(niveau)
    }
    const categories = new Set(catalogue.skills.map((s) => s.category))
    for (const nature of catalogue.profiles.natures) {
      for (const categorie of nature.categories) expect(categories, `${nature.id} : ${categorie}`).toContain(categorie)
    }
    expect(Object.keys(catalogue.profiles.levels).sort()).toEqual([...LEVEL_IDS].sort())
  })
})

describe('motifs de pré-analyse', () => {
  const regle = (pattern: string) => ({ ...scanRulesBrut, rules: [{ ...scanRulesBrut.rules[0], pattern }] })

  it.each(['(?=x)', '(?!x)', '(?<=x)', '(?<!x)', '(a)\\1', '(?<n>a)\\k<n>', '('])('refuse le motif %s', (motif) => {
    expect(ScanRulesSchema.safeParse(regle(motif)).success).toBe(false)
  })

  it('accepte un groupe non capturant', () => {
    expect(ScanRulesSchema.safeParse(regle('(?:a|b)+c')).success).toBe(true)
  })
})
