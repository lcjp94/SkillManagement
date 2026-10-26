// Recherche et import de skills depuis GitHub. Tout skill obtenu est analysé avant d'être proposé, puis de nouveau
// au moment de l'enregistrement : l'interface ne peut pas fournir un contenu, seulement désigner un fichier.
import type { ApercuImportVue, Entree, Sortie } from '@shared/contrat'
import { SLUG_RE, type Skill } from '@shared/schemas/catalog'
import { lireSkillMd, slugifier } from '../core/skillmd'
import { estDepotValide, empreinte, lireAdresseGithub, SOURCES_PAR_DEFAUT, type ReferenceSkill } from '../sources/github'
import { analyserSkill } from './analyse'
import { ErreurUtilisateur, tousLesSkills, type Services } from './contexte'
import { ajouterSkillPerso } from './skills'

const dossierDe = (chemin: string): string => {
  const parts = chemin.split('/')
  return parts.length > 1 ? parts[parts.length - 2]! : chemin.replace(/\.md$/i, '')
}

export const listeSources = (s: Services): Sortie<'sources.liste'> => ({
  defaut: SOURCES_PAR_DEFAUT,
  perso: s.reglages.get().sources ?? []
})

export async function ajouterSource(s: Services, repo: string): Promise<Sortie<'sources.ajouter'>> {
  const propre = repo.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '')
  if (!estDepotValide(propre)) throw new ErreurUtilisateur('Écrivez le dépôt sous la forme « propriétaire/nom », par exemple « anthropics/skills ».')
  const existants = [...SOURCES_PAR_DEFAUT.map((d) => d.repo), ...(s.reglages.get().sources ?? [])]
  if (existants.some((r) => r.toLowerCase() === propre.toLowerCase())) throw new ErreurUtilisateur('Ce dépôt est déjà dans la liste.')
  if ((s.reglages.get().sources ?? []).length >= 10) throw new ErreurUtilisateur('La liste est pleine (10 dépôts ajoutés au maximum).')
  // Le dépôt doit exister et contenir des skills : on le vérifie avant de l'ajouter
  const { chemins } = await s.sources.lister(propre)
  if (chemins.length === 0) throw new ErreurUtilisateur('Ce dépôt ne contient aucun skill (aucun fichier SKILL.md).')
  const suivant = await s.reglages.update((r) => ({ ...r, sources: [...(r.sources ?? []), propre] }))
  return { perso: suivant.sources ?? [] }
}

export async function retirerSource(s: Services, repo: string): Promise<Sortie<'sources.retirer'>> {
  const suivant = await s.reglages.update((r) => ({ ...r, sources: (r.sources ?? []).filter((x) => x !== repo) }))
  return { perso: suivant.sources ?? [] }
}

export async function rechercher(s: Services, e: Entree<'sources.rechercher'>): Promise<Sortie<'sources.rechercher'>> {
  const autorises = new Set([...SOURCES_PAR_DEFAUT.map((d) => d.repo), ...(s.reglages.get().sources ?? [])])
  const repos = e.repos.filter((r) => autorises.has(r))
  if (repos.length === 0) throw new ErreurUtilisateur('Choisissez au moins une source dans la liste.')
  return s.sources.rechercher(repos, e.requete)
}

export const lireAdresse = (adresse: string): ReferenceSkill | null => lireAdresseGithub(adresse)

interface Candidat {
  name: string
  slug: string
  description: string
  /** Fichier entier, tel que le dépôt le publie. */
  texte: string
  corps: string
}

async function lireCandidat(s: Services, ref: ReferenceSkill): Promise<Candidat> {
  const texte = await s.sources.lireFichier(ref)
  const lu = lireSkillMd(texte)
  const name = (lu.name ?? dossierDe(ref.path)).slice(0, 120)
  const description = (lu.description ?? lu.corps.replace(/[#>*`]/g, '').trim()).replace(/\s+/g, ' ').slice(0, 1000)
  if (lu.corps.trim() === '') throw new ErreurUtilisateur('Ce fichier ne contient pas de consignes : il ne peut pas être importé.')
  const base = slugifier(lu.name ?? dossierDe(ref.path))
  return { name, slug: SLUG_RE.test(base) ? base : 'skill', description: description || name, texte, corps: lu.corps }
}

function dejaImporte(skills: Skill[], ref: ReferenceSkill, texte: string): ApercuImportVue['dejaImporte'] {
  const existant = skills.find((k) => k.sourceRepo === ref.repo && k.sourcePath === ref.path)
  return existant ? { slug: existant.slug, identique: existant.sourceHash === empreinte(texte) } : null
}

export async function apercu(s: Services, ref: ReferenceSkill): Promise<ApercuImportVue> {
  const c = await lireCandidat(s, ref)
  const [analyse, licence] = await Promise.all([
    analyserSkill(s, { name: c.name, description: c.description, content: c.texte, markdown: c.texte }),
    s.sources.licence(ref.repo).catch(() => null)
  ])
  return {
    name: c.name,
    slug: c.slug,
    description: c.description,
    extrait: c.corps.trim().slice(0, 6000),
    url: `https://github.com/${ref.repo}/blob/HEAD/${ref.path}`,
    licence,
    analyse,
    dejaImporte: dejaImporte(tousLesSkills(s), ref, c.texte)
  }
}

export async function importer(s: Services, e: Entree<'sources.importer'>): Promise<Sortie<'sources.importer'>> {
  const ref: ReferenceSkill = { repo: e.repo, path: e.path }
  // Le contenu est relu et réanalysé ici : ce que l'interface a vu à l'aperçu ne compte pas
  const c = await lireCandidat(s, ref)
  const analyse = await analyserSkill(s, { name: c.name, description: c.description, content: c.texte, markdown: c.texte })
  const existant = dejaImporte(s.etat.get().userSkills, ref, c.texte)
  if (existant?.identique) throw new ErreurUtilisateur('Ce skill est déjà importé et à jour.')
  if (existant && !e.remplacer) throw new ErreurUtilisateur('Ce skill est déjà importé : cochez « Mettre à jour » pour le remplacer par la version du dépôt.')
  if (existant) {
    // Mise à jour : remplace le contenu en gardant l'identifiant, donc les projets qui l'utilisent
    const { verifierInstallable } = await import('./analyse')
    verifierInstallable(analyse, e.confirme)
    await s.etat.update((etat) => ({
      ...etat,
      userSkills: etat.userSkills.map((k) =>
        k.slug === existant.slug ? { ...k, name: c.name, description: c.description, content: c.texte, tokenEstimate: Math.ceil(c.texte.length / 4), sourceHash: empreinte(c.texte), scan: analyse.analyse } : k
      )
    }))
    return { slug: existant.slug }
  }
  const owner = ref.repo.split('/')[0]!.toLowerCase()
  const slug = await ajouterSkillPerso(
    s,
    {
      name: c.name,
      slug: c.slug,
      category: 'importé',
      description: c.description,
      environments: [],
      tokenEstimate: Math.ceil(c.texte.length / 4),
      tags: ['github', owner],
      personas: [],
      levels: [],
      content: c.texte,
      source: 'importe',
      sourceRepo: ref.repo,
      sourcePath: ref.path,
      sourceHash: empreinte(c.texte)
    },
    analyse,
    e.confirme
  )
  return { slug }
}
