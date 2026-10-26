// Analyse d'un skill qui vient de l'extérieur (rédigé par une IA, importé de GitHub) : pré-analyse intégrée,
// toujours active, puis analyse approfondie si l'outil est installé. L'une comme l'autre ne peut que durcir le verdict.
import type { AnalyseSkillVue } from '@shared/contrat'
import { ErreurUtilisateur, type Services } from './contexte'

const uneLigne = (texte: string): string => texte.replace(/\s+/g, ' ').trim()

/** SKILL.md tel que les dispositions le réécriront : c'est ce que l'analyse approfondie doit lire. */
export function markdownDuSkill(slug: string, description: string, corps: string): string {
  return `---\nname: ${slug}\ndescription: ${JSON.stringify(uneLigne(description))}\n---\n\n${corps.trim()}\n`
}

export interface SkillAAnalyser {
  name: string
  description: string
  /** Contenu à analyser avec la pré-analyse (corps, ou fichier entier pour un skill importé). */
  content: string
  /** Texte complet transmis à l'analyse approfondie. */
  markdown: string
}

const ordre = { clean: 0, warning: 1, danger: 2 } as const
export const pire = (a: 'clean' | 'warning' | 'danger', b: 'clean' | 'warning' | 'danger'): 'clean' | 'warning' | 'danger' => (ordre[a] >= ordre[b] ? a : b)

export async function analyserSkill(s: Services, skill: SkillAAnalyser): Promise<AnalyseSkillVue> {
  const base = s.ctx.scanner(`${skill.name}\n${skill.description}\n${skill.content}`)
  const disponible = s.info.analyseApprofondie.disponible
  if (!disponible) {
    return { analyse: base.status, problemes: base.issues, approfondie: { disponible: false, executee: false, problemes: [] } }
  }
  const lot = (await s.skillspector.analyser([{ slug: 'a-analyser', markdown: skill.markdown }])).get('a-analyser')
  if (!lot || !lot.ok) {
    return {
      analyse: base.status,
      problemes: base.issues,
      approfondie: { disponible: true, executee: false, problemes: [], erreur: lot && !lot.ok ? lot.erreur : 'L’analyse approfondie n’a pas pu se terminer.' }
    }
  }
  return {
    analyse: pire(base.status, lot.resultat.statut),
    problemes: base.issues,
    approfondie: { disponible: true, executee: true, statut: lot.resultat.statut, problemes: lot.resultat.problemes }
  }
}

/** Refuse un skill dangereux ; un skill « à examiner » demande l'accord explicite de la personne. */
export function verifierInstallable(analyse: AnalyseSkillVue, confirme: boolean | undefined): void {
  if (analyse.analyse === 'danger') {
    throw new ErreurUtilisateur('L’analyse de sécurité a trouvé un contenu dangereux : ce skill est refusé et ne peut pas être enregistré.')
  }
  if (analyse.analyse === 'warning' && !confirme) {
    throw new ErreurUtilisateur('Ce skill demande votre accord : lisez les points signalés, puis confirmez pour l’enregistrer.')
  }
}
