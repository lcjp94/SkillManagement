import type { BibliothequeSkill } from '@shared/contrat'
import { selectionnes } from '../core/projets'
import { lireManifestes } from '../fs/manifestes'
import { listerInstalles } from '../fs/retrait'
import { tousLesSkills, vueSkill, type Services } from './contexte'

/** Tous les skills, avec où ils sont sélectionnés et s'ils sont réellement installés quelque part. */
export async function bibliotheque(s: Services): Promise<BibliothequeSkill[]> {
  const etat = s.etat.get()
  const selection = new Map<string, { id: string; nom: string }[]>()
  for (const projet of etat.projects.filter((p) => !p.archiveLe)) {
    for (const slug of selectionnes(projet)) selection.set(slug, [...(selection.get(slug) ?? []), { id: projet.id, nom: projet.nom }])
  }
  // « Installé » est relu sur le disque, dans chaque dossier où l'application a déjà écrit
  const { manifestes } = await lireManifestes(s.ctx.dossierDonnees)
  const dossiers = new Map(manifestes.filter((m) => m.etat === 'termine' && m.cible !== 'arborescence').map((m) => [m.racine, m.portee]))
  const installes = new Set<string>()
  for (const [racine, portee] of dossiers) {
    for (const i of await listerInstalles(s.ctx, { racine, portee })) installes.add(i.slug)
  }
  return tousLesSkills(s, etat).map((skill) => ({
    ...vueSkill(s, skill),
    selectionneDans: selection.get(skill.slug) ?? [],
    installe: installes.has(skill.slug)
  }))
}
