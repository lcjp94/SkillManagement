// Export et import d'un projet (.skillforge-projet.json) : la recette seule.
// Le fichier ne contient jamais de clé, de chemin de dossier, d'identifiant interne ni de date.
// À l'import, tout skill embarqué est analysé avant d'entrer dans les données ; aucun n'est écrit sur le disque ici.
import { z } from 'zod'
import { AssistantIdSchema, BuiltinSkillSchema, LevelIdSchema, type Profiles, type Skill } from '@shared/schemas/catalog'
import { ProjectNameSchema, ProjectSkillSchema, StateSchema, type Project, type State } from '@shared/schemas/state'
import { ProjetError, nomUnique, type Contexte } from './projets'
import { trouverBesoin } from './besoins'
import type { ProblemeScan, ResultatScan } from './scan'

export const FORMAT_PROJET = 'skillforge-projet'
export const EXTENSION_PROJET = '.skillforge-projet.json'
/** Un projet tient en quelques dizaines de Ko ; au-delà, ce n'est pas un projet qu'on a reçu. */
export const TAILLE_MAX_IMPORT = 2_000_000

const FichierProjetSchema = z.object({
  format: z.literal(FORMAT_PROJET),
  version: z.literal(1),
  projet: z.object({
    nom: ProjectNameSchema,
    description: z.string().max(2000).optional(),
    besoins: z.array(z.string().max(64)).max(32),
    autreBesoin: z.string().trim().max(300).optional(),
    metier: z.string().max(64).optional(),
    aisance: LevelIdSchema.optional(),
    assistants: z.array(AssistantIdSchema).max(8),
    skills: z.array(ProjectSkillSchema).max(500),
    arborescence: z.object({ gabarit: z.string().max(64), extras: z.array(z.string().max(64)).max(50) })
  }),
  // Contenu des skills qui ne sont pas dans le catalogue intégré (générés ou importés)
  skillsPerso: z.array(BuiltinSkillSchema).max(100)
})
type FichierProjet = z.infer<typeof FichierProjetSchema>

/** Écrit la recette. Les dossiers mémorisés, l'identifiant et les dates restent chez la personne. */
export function exporterProjet(projet: Project, userSkills: Skill[]): string {
  const slugs = new Set(projet.skills.map((s) => s.slug))
  const fichier: FichierProjet = {
    format: FORMAT_PROJET,
    version: 1,
    projet: {
      nom: projet.nom,
      description: projet.description,
      besoins: projet.besoins,
      autreBesoin: projet.autreBesoin,
      metier: projet.metier,
      aisance: projet.aisance,
      assistants: projet.assistants,
      skills: projet.skills.map(({ slug, origine, ecarte }) => ({ slug, origine, ecarte })),
      arborescence: projet.arborescence
    },
    skillsPerso: userSkills
      .filter((s) => slugs.has(s.slug))
      .map(({ name, slug, category, description, environments, tokenEstimate, tags, personas, levels, content }) => ({
        name, slug, category, description, environments, tokenEstimate, tags, personas, levels, content
      }))
  }
  return JSON.stringify(fichier, null, 2) + '\n'
}

export interface SkillAnalyse {
  skill: Skill
  scan: ResultatScan
}

export interface AnalyseImport {
  projet: FichierProjet['projet']
  /** Skills embarqués sans problème : prêts à entrer dans les données. */
  propres: SkillAnalyse[]
  /** Skills embarqués avec avertissement : la personne doit confirmer chacun. */
  aConfirmer: SkillAnalyse[]
  /** Skills embarqués refusés (danger, identifiant déjà pris, etc.), avec la raison. */
  refuses: { slug: string; raison: string; problemes: ProblemeScan[]; contenuIgnore?: true }[]
  /** Skills du projet que ni le catalogue ni le fichier ne permettent de retrouver. */
  inconnus: string[]
  besoinsInconnus: string[]
}

export type ResultatAnalyse = { ok: true; analyse: AnalyseImport } | { ok: false; erreur: string }

export interface DependancesImport {
  etat: State
  catalogue: { slug: string }[]
  profiles: Profiles
  scanner: (contenu: string) => ResultatScan
}

const ERREUR_FORMAT = 'Ce fichier n’est pas un projet SkillManagement lisible. Il n’a pas été importé.'

/** Lit et analyse le fichier sans rien modifier. */
export function analyserImport(texte: string, deps: DependancesImport): ResultatAnalyse {
  if (texte.length > TAILLE_MAX_IMPORT) return { ok: false, erreur: 'Ce fichier est trop volumineux pour être un projet. Il n’a pas été importé.' }
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    return { ok: false, erreur: ERREUR_FORMAT }
  }
  const lu = FichierProjetSchema.safeParse(brut)
  if (!lu.success) return { ok: false, erreur: ERREUR_FORMAT }
  const { projet, skillsPerso } = lu.data

  const integres = new Set(deps.catalogue.map((s) => s.slug))
  const existants = new Map(deps.etat.userSkills.map((s) => [s.slug, s]))
  const propres: SkillAnalyse[] = []
  const aConfirmer: SkillAnalyse[] = []
  const refuses: AnalyseImport['refuses'] = []
  const dejaLa = new Set<string>()

  const reference = new Set(projet.skills.map((s) => s.slug))
  for (const brutSkill of skillsPerso) {
    const { slug } = brutSkill
    // Un skill embarqué que le projet n'utilise pas n'entre pas dans les données
    if (!reference.has(slug)) continue
    if (integres.has(slug)) {
      // Un fichier ne peut pas remplacer un skill du catalogue : le projet utilisera l'original
      refuses.push({ slug, raison: 'Cet identifiant est déjà celui d’un skill intégré : son contenu dans le fichier est ignoré.', problemes: [], contenuIgnore: true })
      continue
    }
    const present = existants.get(slug)
    if (present) {
      if (present.content === brutSkill.content && present.description === brutSkill.description) dejaLa.add(slug)
      else refuses.push({ slug, raison: 'Vous avez déjà un skill de même identifiant, mais différent.', problemes: [] })
      continue
    }
    // Le nom et la description sont écrits dans les fichiers de l'assistant : ils sont analysés comme le corps
    const scan = deps.scanner(`${brutSkill.name}\n${brutSkill.description}\n${brutSkill.content}`)
    const skill: Skill = { ...brutSkill, source: 'importe', scan: scan.status }
    if (scan.status === 'danger') refuses.push({ slug, raison: 'L’analyse a trouvé un contenu dangereux : il est refusé.', problemes: scan.issues })
    else if (scan.status === 'warning') aConfirmer.push({ skill, scan })
    else propres.push({ skill, scan })
  }

  const utilisables = new Set([...integres, ...dejaLa, ...propres.map((p) => p.skill.slug), ...aConfirmer.map((p) => p.skill.slug)])
  const inconnus = Array.from(new Set(projet.skills.map((s) => s.slug).filter((slug) => !utilisables.has(slug) && !refuses.some((r) => r.slug === slug))))
  const besoinsInconnus = projet.besoins.filter((id) => !trouverBesoin(deps.profiles, id))
  return { ok: true, analyse: { projet, propres, aConfirmer, refuses, inconnus, besoinsInconnus } }
}

export interface RapportImport {
  skillsAjoutes: string[]
  /** Skills laissés de côté : danger, avertissement non confirmé, ou introuvables. */
  laisses: { slug: string; raison: string }[]
  besoinsIgnores: string[]
}

/**
 * Crée le projet importé. Les avertissements non confirmés restent de côté ; les refus ne passent jamais.
 * Les skills du projet prennent l'origine « importé » : aucun n'est ensuite retiré automatiquement.
 */
export function integrerImport(
  etat: State,
  analyse: AnalyseImport,
  confirmes: string[],
  contexte: Contexte,
  profiles: Profiles
): { etat: State; projet: Project; rapport: RapportImport } {
  const confirme = new Set(confirmes)
  const acceptes = [...analyse.propres, ...analyse.aConfirmer.filter((a) => confirme.has(a.skill.slug))]
  const nouveauxPerso = acceptes.map((a) => a.skill)
  const laisses: RapportImport['laisses'] = [
    ...analyse.refuses.map((r) => ({ slug: r.slug, raison: r.raison })),
    ...analyse.aConfirmer.filter((a) => !confirme.has(a.skill.slug)).map((a) => ({ slug: a.skill.slug, raison: 'Avertissement non confirmé.' })),
    ...analyse.inconnus.map((slug) => ({ slug, raison: 'Skill introuvable dans le catalogue.' }))
  ]
  // Un contenu ignoré (même identifiant qu'un skill intégré) n'ôte pas au projet le skill intégré lui-même
  const gardes = new Set(analyse.refuses.filter((r) => r.contenuIgnore).map((r) => r.slug))
  const ecartes = new Set(laisses.map((l) => l.slug).filter((slug) => !gardes.has(slug)))
  const maintenant = contexte.maintenant.toISOString()
  const { projet: p } = analyse
  const projet: Project = {
    id: contexte.id,
    nom: nomUnique(p.nom, etat.projects.map((x) => x.nom)),
    description: p.description,
    besoins: p.besoins.filter((id) => trouverBesoin(profiles, id)),
    autreBesoin: p.autreBesoin,
    metier: p.metier,
    aisance: p.aisance,
    assistants: p.assistants,
    skills: p.skills.filter((s) => !ecartes.has(s.slug)).map((s) => ({ slug: s.slug, origine: 'importe', ecarte: s.ecarte })),
    arborescence: p.arborescence,
    dossiers: {},
    creeLe: maintenant,
    modifieLe: maintenant
  }
  const suivant = StateSchema.safeParse({
    ...etat,
    projects: [...etat.projects, projet],
    userSkills: [...etat.userSkills, ...nouveauxPerso]
  })
  if (!suivant.success) throw new ProjetError('Ce projet ne peut pas être importé tel quel. Rien n’a été modifié.')
  return {
    etat: suivant.data,
    projet,
    rapport: {
      skillsAjoutes: nouveauxPerso.map((s) => s.slug),
      laisses,
      besoinsIgnores: analyse.besoinsInconnus
    }
  }
}
