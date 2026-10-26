// Moteur de conseil de skills : déterministe, hors ligne, sans accès disque ni réseau.
// Les poids et plafonds viennent de profiles.json ; les résultats de référence sont rejoués par les tests.
import type { Besoin, BuiltinSkill, LevelId, Profiles } from '@shared/schemas/catalog'
import { COUVERTURE_MIN, lienAvecBesoin, trouverBesoin } from './besoins'
import { sansAccents } from './texte'

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
  /** Besoins du projet (ids de profiles.json) : ils pèsent plus que le métier, c'est la raison d'être du projet. */
  besoins?: string[]
  /** Skills déjà retenus : ils comptent dans les plafonds et ne sont pas reproposés (mode « compléments »). */
  dejaPresents?: string[]
  /** Skills écartés par la personne : jamais reproposés. */
  ecartes?: string[]
}

export interface ElementConseil {
  slug: string
  score: number
  reasons: string[]
  /** Besoins auxquels ce skill répond, quand la demande en comporte. */
  besoins?: string[]
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
  const besoins = Array.from(new Set(demande.besoins ?? []))
    .map((id) => trouverBesoin(profiles, id))
    .filter((b): b is Besoin => b !== undefined)
  const exclus = new Set([...(demande.dejaPresents ?? []), ...(demande.ecartes ?? [])])

  const notes: (ElementConseil & { skill: SkillConseil; couverts: string[] })[] = []
  for (const skill of catalogue) {
    if (exclus.has(skill.slug)) continue
    if (skill.levels.length > 0 && !skill.levels.includes(niveau)) continue
    const assistantCommun = skill.environments.some((e) => demande.environments.includes(e))
    if (demande.environments.length > 0 && skill.environments.length > 0 && !assistantCommun) continue

    let score = 0
    const reasons: string[] = []
    const couverts: string[] = []
    for (const besoin of besoins) {
      const lien = lienAvecBesoin(besoin, skill)
      if (!lien) continue
      score += lien === 'mot' ? W.besoinMotSeul : W.besoin
      reasons.push(`Répond à votre besoin « ${besoin.libelle} »`)
      couverts.push(besoin.id)
    }
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
    } else if (nature && nature.id !== 'autre' && skill.personas.length > 0 && couverts.length === 0) {
      // Skill explicitement destiné à d'autres métiers, sauf s'il répond à un besoin que la personne a exprimé
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
    notes.push({ slug: skill.slug, score, reasons, skill, couverts })
  }

  // Score décroissant, puis skill le plus léger, puis ordre alphabétique : résultat stable
  notes.sort(
    (a, b) =>
      b.score - a.score || a.skill.tokenEstimate - b.skill.tokenEstimate || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  )

  const choisis = new Set<string>()
  const retenus: typeof notes = []
  const parCategorie = new Map<string, number>()
  const couvertureActuelle = new Map<string, number>()
  let nombre = 0
  let totalTokens = 0

  const compter = (skill: SkillConseil) => {
    nombre++
    parCategorie.set(skill.category, (parCategorie.get(skill.category) ?? 0) + 1)
    totalTokens += skill.tokenEstimate
    for (const besoin of besoins) {
      if (lienAvecBesoin(besoin, skill)) couvertureActuelle.set(besoin.id, (couvertureActuelle.get(besoin.id) ?? 0) + 1)
    }
  }
  // Les skills déjà retenus occupent leur place dans les plafonds et comptent dans la couverture
  const parSlug = new Map(catalogue.map((skill) => [skill.slug, skill]))
  for (const slug of new Set(demande.dejaPresents ?? [])) {
    const present = parSlug.get(slug)
    if (present) compter(present)
  }

  const peutAjouter = (note: (typeof notes)[number]): boolean =>
    nombre < plafonds.maxSkills &&
    (parCategorie.get(note.skill.category) ?? 0) < plafonds.maxPerCategory &&
    totalTokens + note.skill.tokenEstimate <= plafonds.tokenBudget
  const ajouter = (note: (typeof notes)[number]) => {
    choisis.add(note.slug)
    retenus.push(note)
    compter(note.skill)
  }

  // Un besoin exprimé passe avant le classement général : on réserve d'abord de quoi le couvrir
  // (COUVERTURE_MIN skills au mieux), sinon un métier très fourni écraserait ce qui motive le projet.
  for (let tour = 0; tour < COUVERTURE_MIN && besoins.length > 0; tour++) {
    for (const besoin of besoins) {
      if ((couvertureActuelle.get(besoin.id) ?? 0) >= COUVERTURE_MIN) continue
      const candidat = notes.find(
        (n) => !choisis.has(n.slug) && n.couverts.includes(besoin.id) && n.score >= plafonds.minScore && peutAjouter(n)
      )
      if (candidat) ajouter(candidat)
    }
  }
  for (const note of notes) {
    if (nombre >= plafonds.maxSkills) break
    if (note.score < plafonds.minScore) break
    if (choisis.has(note.slug) || !peutAjouter(note)) continue
    ajouter(note)
  }

  // Présentation dans l'ordre du classement, quelle que soit la phase qui a retenu le skill
  const ordre = new Map(notes.map((n, i) => [n.slug, i]))
  const items: ElementConseil[] = retenus
    .sort((a, b) => ordre.get(a.slug)! - ordre.get(b.slug)!)
    .map((n) => ({ slug: n.slug, score: n.score, reasons: n.reasons, ...(n.couverts.length > 0 ? { besoins: n.couverts } : {}) }))
  return { items, totalTokens, tokenBudget: plafonds.tokenBudget, maxSkills: plafonds.maxSkills }
}
