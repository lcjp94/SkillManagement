// Moteur de conseil de skills : déterministe, hors ligne, sans accès disque ni réseau.
// Les poids et plafonds viennent de profiles.json ; les résultats de référence sont rejoués par les tests.
import type { BuiltinSkill, LevelId, Profiles } from '@shared/schemas/catalog'

export type SkillConseil = Pick<
  BuiltinSkill,
  'slug' | 'name' | 'description' | 'category' | 'tags' | 'environments' | 'tokenEstimate' | 'personas' | 'levels'
>

export interface DemandeConseil {
  nature?: string | null
  level: string
  objectives: string[]
  environments: string[]
  customObjective?: string | null
}

export interface ElementConseil {
  slug: string
  score: number
  reasons: string[]
}

export interface ResultatConseil {
  items: ElementConseil[]
  totalTokens: number
  tokenBudget: number
  maxSkills: number
}

export function estNiveau(profiles: Profiles, niveau: string): niveau is LevelId {
  return Object.hasOwn(profiles.levels, niveau)
}

const sansAccents = (texte: string): string => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Mots significatifs (4 lettres et plus) d'un objectif libre, sans accents ni casse. */
export function motsCles(texte: string | null | undefined): string[] {
  return Array.from(new Set(sansAccents(texte ?? '').split(/[^a-z0-9]+/).filter((mot) => mot.length >= 4)))
}

export function conseiller(demande: DemandeConseil, catalogue: SkillConseil[], profiles: Profiles): ResultatConseil {
  const W = profiles.weights
  // Un niveau inconnu retombe sur « débutant » : le plus prudent
  const niveau: LevelId = estNiveau(profiles, demande.level) ? demande.level : 'debutant'
  const plafonds = profiles.levels[niveau]
  const nature = profiles.natures.find((n) => n.id === demande.nature)
  const categoriesVisees = new Set(
    [...demande.objectives, ...(nature?.objectives ?? [])]
      .map((objectif) => (Object.hasOwn(profiles.objectiveCategories, objectif) ? profiles.objectiveCategories[objectif] : undefined))
      .filter((categorie): categorie is string => Boolean(categorie))
  )
  const mots = motsCles(demande.customObjective)

  const notes: (ElementConseil & { skill: SkillConseil })[] = []
  for (const skill of catalogue) {
    if (skill.levels.length > 0 && !skill.levels.includes(niveau)) continue
    const assistantCommun = skill.environments.some((e) => demande.environments.includes(e))
    if (demande.environments.length > 0 && skill.environments.length > 0 && !assistantCommun) continue

    let score = 0
    const reasons: string[] = []
    if (categoriesVisees.has(skill.category)) {
      score += W.objectiveCategory
      reasons.push(`Correspond à vos objectifs (${skill.category})`)
    }
    const rang = nature ? nature.categories.indexOf(skill.category) : -1
    if (nature && rang >= 0) {
      score += rang === 0 ? W.natureCategoryFirst : W.natureCategory
      reasons.push(`Courant pour votre métier (${nature.name})`)
    }
    if (nature && skill.personas.includes(nature.id)) {
      score += W.persona
      reasons.push('Pensé pour votre métier')
    } else if (nature && nature.id !== 'autre' && skill.personas.length > 0) {
      // Skill explicitement destiné à d'autres métiers
      score += W.personaMismatch
    }
    if (skill.levels.includes(niveau)) {
      score += W.level
      reasons.push('Adapté à votre niveau')
    }
    if (assistantCommun) score += W.environment
    if (mots.length > 0) {
      const texte = sansAccents(`${skill.name} ${skill.description} ${skill.tags.join(' ')}`)
      const trouves = mots.filter((mot) => texte.includes(mot)).length
      if (trouves > 0) {
        score += Math.min(trouves * W.customKeyword, W.customKeywordMax)
        reasons.push('Proche de votre objectif personnalisé')
      }
    }
    notes.push({ slug: skill.slug, score, reasons, skill })
  }

  // Score décroissant, puis skill le plus léger, puis ordre alphabétique : résultat stable
  notes.sort(
    (a, b) =>
      b.score - a.score || a.skill.tokenEstimate - b.skill.tokenEstimate || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  )

  const items: ElementConseil[] = []
  const parCategorie = new Map<string, number>()
  let totalTokens = 0
  for (const note of notes) {
    if (items.length >= plafonds.maxSkills) break
    if (note.score < plafonds.minScore) break
    if ((parCategorie.get(note.skill.category) ?? 0) >= plafonds.maxPerCategory) continue
    if (totalTokens + note.skill.tokenEstimate > plafonds.tokenBudget) continue
    items.push({ slug: note.slug, score: note.score, reasons: note.reasons })
    parCategorie.set(note.skill.category, (parCategorie.get(note.skill.category) ?? 0) + 1)
    totalTokens += note.skill.tokenEstimate
  }
  return { items, totalTokens, tokenBudget: plafonds.tokenBudget, maxSkills: plafonds.maxSkills }
}
