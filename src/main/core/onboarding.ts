// Passerelles entre ce que la personne dit au démarrage (objectifs) et les besoins d'un projet.
import type { Profiles } from '@shared/schemas/catalog'

// Un objectif du parcours de démarrage correspond à un besoin du référentiel quand il y en a un
const BESOIN_DE_OBJECTIF: Record<string, string> = {
  developpement: 'qualite-code',
  devops: 'deploiement',
  data: 'analyse-donnees',
  redaction: 'redaction-web',
  marketing: 'seo',
  recherche: 'veille',
  securite: 'securite-code',
  video: 'video',
  'reseaux-sociaux': 'reseaux-sociaux',
  juridique: 'juridique',
  enseignement: 'enseignement',
  rh: 'rh',
  finance: 'finance'
}

export const LIBELLE_OBJECTIF: Record<string, string> = {
  developpement: 'Développer du code',
  devops: 'Mettre en ligne et surveiller',
  data: 'Analyser des données',
  redaction: 'Rédiger',
  design: 'Concevoir des interfaces',
  marketing: 'Faire connaître mon activité',
  recherche: 'Rechercher et synthétiser',
  securite: 'Sécuriser et me mettre en conformité',
  video: 'Créer des vidéos',
  'reseaux-sociaux': 'Publier sur les réseaux sociaux',
  juridique: 'Travailler le droit',
  enseignement: 'Enseigner et former',
  rh: 'Gérer les ressources humaines',
  finance: 'Suivre les finances'
}

export function besoinsDepuisObjectifs(objectifs: string[], profiles: Profiles): string[] {
  const ids = new Set(profiles.besoins.map((b) => b.id))
  const trouves = objectifs
    .map((o) => (Object.hasOwn(BESOIN_DE_OBJECTIF, o) ? BESOIN_DE_OBJECTIF[o] : undefined))
    .filter((id): id is string => id !== undefined && ids.has(id))
  return Array.from(new Set(trouves))
}
