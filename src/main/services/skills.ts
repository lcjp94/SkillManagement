// Skills de la personne (rédigés avec une IA ou importés) : création analysée, suppression protégée.
import type { AnalyseSkillVue, Entree, Sortie } from '@shared/contrat'
import { SkillSchema, type Skill } from '@shared/schemas/catalog'
import { slugLibre, slugifier } from '../core/skillmd'
import { analyserSkill, markdownDuSkill, verifierInstallable } from './analyse'
import { ErreurUtilisateur, tousLesSkills, type Services } from './contexte'

export function analyserNouveau(s: Services, e: Entree<'skills.analyser'>): Promise<AnalyseSkillVue> {
  const slug = e.slug ?? slugifier(e.name)
  return analyserSkill(s, { name: e.name, description: e.description, content: e.content, markdown: markdownDuSkill(slug, e.description, e.content) })
}

/** Ajoute un skill aux données. Aucune route n'écrit un skill sans analyse : celle-ci est refaite ici, côté principal. */
export async function ajouterSkillPerso(s: Services, skill: Omit<Skill, 'scan'>, analyse: AnalyseSkillVue, confirme: boolean | undefined): Promise<string> {
  verifierInstallable(analyse, confirme)
  let slug = ''
  await s.etat.update((etat) => {
    slug = slugLibre(skill.slug, tousLesSkills(s, etat).map((k) => k.slug))
    const nouveau = SkillSchema.parse({ ...skill, slug, scan: analyse.analyse })
    return { ...etat, userSkills: [...etat.userSkills, nouveau] }
  })
  return slug
}

export async function creerSkill(s: Services, e: Entree<'skills.creer'>): Promise<Sortie<'skills.creer'>> {
  const base = e.slug ?? slugifier(e.name)
  const analyse = await analyserNouveau(s, { ...e, slug: base })
  const slug = await ajouterSkillPerso(
    s,
    {
      name: e.name,
      slug: base,
      category: 'rédigé avec une IA',
      description: e.description.replace(/\s+/g, ' ').trim(),
      environments: [],
      tokenEstimate: Math.ceil(e.content.length / 4),
      tags: ['ia'],
      personas: [],
      levels: [],
      content: e.content,
      source: 'genere'
    },
    analyse,
    e.confirme
  )
  return { slug }
}

export async function supprimerSkill(s: Services, slug: string): Promise<void> {
  const etat = s.etat.get()
  if (!etat.userSkills.some((k) => k.slug === slug)) throw new ErreurUtilisateur('Seuls vos propres skills peuvent être supprimés.')
  const utilisant = etat.projects.filter((p) => p.skills.some((k) => k.slug === slug))
  if (utilisant.length > 0) {
    throw new ErreurUtilisateur(`Ce skill est sélectionné dans « ${utilisant[0]!.nom} »${utilisant.length > 1 ? ' et d’autres projets' : ''} : retirez-le d’abord du projet.`)
  }
  await s.etat.update((e) => ({ ...e, userSkills: e.userSkills.filter((k) => k.slug !== slug) }))
}
