import { describe, expect, it } from 'vitest'
import { conseiller, motsCles, type DemandeConseil } from '../src/main/core/recommend'
import { getCatalogue } from '../src/shared/data'
import golden from './fixtures/golden.json'

const { skills, profiles } = getCatalogue()
const parSlug = new Map(skills.map((s) => [s.slug, s]))
const ASSISTANTS = ['claude-code', 'cursor', 'copilot', 'continue', 'opencode']
const NIVEAUX = Object.keys(profiles.levels)
const base = { objectives: [] as string[], environments: ASSISTANTS }
const conseil = (demande: DemandeConseil) => conseiller(demande, skills, profiles)

describe('résultats de référence de la première version', () => {
  it('rejoue les 46 demandes de référence à l\'identique (slugs, scores, raisons, tokens)', () => {
    expect(golden.recommend).toHaveLength(46)
    // Garde-fou contre un rejeu vide : la référence compte 462 skills proposés au total
    expect(golden.recommend.reduce((n, c) => n + c.expected.items.length, 0)).toBe(462)
    for (const cas of golden.recommend) {
      expect(conseil(cas.input as DemandeConseil), JSON.stringify(cas.input)).toEqual(cas.expected)
    }
  })
})

describe('couverture du catalogue', () => {
  it('chaque métier dispose d\'au moins 8 skills ciblés', () => {
    for (const nature of profiles.natures) {
      const cibles = skills.filter((s) => s.personas.includes(nature.id)).length
      expect(cibles, nature.id).toBeGreaterThanOrEqual(8)
    }
  })

  it('un débutant reçoit au moins 5 propositions, quel que soit son métier', () => {
    for (const nature of profiles.natures) {
      expect(conseil({ ...base, nature: nature.id, level: 'debutant' }).items.length, nature.id).toBeGreaterThanOrEqual(5)
    }
  })

  it('chaque métier (sauf « autre ») est couvert à chaque niveau', () => {
    for (const nature of profiles.natures.filter((n) => n.id !== 'autre')) {
      for (const level of NIVEAUX) {
        expect(conseil({ ...base, nature: nature.id, level }).items.length, `${nature.id}/${level}`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('conseiller', () => {
  it('respecte les plafonds de chaque niveau (nombre, tokens, catégorie)', () => {
    for (const nature of profiles.natures) {
      for (const level of NIVEAUX) {
        const plafonds = profiles.levels[level as keyof typeof profiles.levels]
        const r = conseil({ ...base, nature: nature.id, level })
        expect(r.items.length).toBeLessThanOrEqual(plafonds.maxSkills)
        expect(r.totalTokens).toBeLessThanOrEqual(plafonds.tokenBudget)
        const parCategorie = new Map<string, number>()
        for (const item of r.items) {
          const categorie = parSlug.get(item.slug)!.category
          parCategorie.set(categorie, (parCategorie.get(categorie) ?? 0) + 1)
        }
        for (const n of parCategorie.values()) expect(n).toBeLessThanOrEqual(plafonds.maxPerCategory)
      }
    }
  })

  it('propose des catégories propres au métier', () => {
    const categories = conseil({ ...base, nature: 'createur', level: 'intermediaire' }).items.map((i) => parSlug.get(i.slug)!.category)
    expect(categories.some((c) => ['vidéo', 'réseaux sociaux', 'rédaction'].includes(c))).toBe(true)
    expect(categories).not.toContain('devops')
  })

  it('réserve les sujets avancés aux niveaux intermédiaire et expert', () => {
    const slugs = (level: string) =>
      conseil({ ...base, nature: 'developpeur', level, objectives: ['devops'] }).items.map((i) => i.slug)
    expect(slugs('debutant')).not.toContain('kubernetes-deploiement')
    expect(slugs('expert')).toContain('kubernetes-deploiement')
  })

  it('un expert reçoit davantage de skills qu\'un débutant', () => {
    const nombre = (level: string) =>
      conseil({ ...base, nature: 'developpeur', level, objectives: ['developpement', 'devops', 'securite'] }).items.length
    expect(nombre('expert')).toBeGreaterThan(nombre('debutant'))
  })

  it('exclut les skills incompatibles avec les assistants choisis', () => {
    const r = conseil({ ...base, nature: 'developpeur', level: 'expert', environments: ['aider'] })
    const compatibles = new Set(skills.filter((s) => s.environments.includes('aider')).map((s) => s.slug))
    for (const item of r.items) expect(compatibles.has(item.slug)).toBe(true)
  })

  it('tient compte de l\'objectif libre', () => {
    const sans = conseil({ ...base, nature: 'autre', level: 'intermediaire' }).items.map((i) => i.slug)
    const avec = conseil({
      ...base,
      nature: 'autre',
      level: 'intermediaire',
      customObjective: 'préparer des vidéos YouTube et des sous-titres'
    }).items.map((i) => i.slug)
    expect(avec).toContain('sous-titres-srt')
    expect(sans).not.toContain('sous-titres-srt')
  })

  it('est déterministe et explique chaque choix', () => {
    const demande = { ...base, nature: 'data', level: 'intermediaire', objectives: ['data'] }
    const premier = conseil(demande)
    expect(conseil(demande)).toEqual(premier)
    for (const item of premier.items) expect(item.reasons.length).toBeGreaterThan(0)
  })

  it('retombe sur « débutant » pour un niveau inconnu et ignore une nature inconnue', () => {
    expect(() => conseil({ ...base, nature: 'inconnue', level: 'dieu' })).not.toThrow()
    expect(conseil({ ...base, nature: 'x', level: 'dieu' }).maxSkills).toBe(profiles.levels.debutant.maxSkills)
  })

  it('ignore les objectifs qui ressemblent à des propriétés internes', () => {
    const r = conseil({ ...base, nature: 'autre', level: 'debutant', objectives: ['constructor', '__proto__', 'toString'] })
    expect(r).toEqual(conseil({ ...base, nature: 'autre', level: 'debutant' }))
  })
})

describe('motsCles', () => {
  it('normalise les accents et ignore les mots courts', () => {
    expect(motsCles('Rédiger des vidéos et un CV')).toEqual(['rediger', 'videos'])
  })

  it('tolère l\'absence de texte', () => {
    expect(motsCles(null)).toEqual([])
    expect(motsCles(undefined)).toEqual([])
  })
})
