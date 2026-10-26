// Besoins d'un projet : quels skills y répondent, ce qui est couvert et ce qui manque.
// Logique pure : le référentiel vient de profiles.json, la recherche en ligne et l'IA sont proposées, jamais lancées ici.
import type { Besoin, BuiltinSkill, Profiles } from '@shared/schemas/catalog'
import { contientExpression, motsDuTexte } from './texte'

export type SkillBesoin = Pick<BuiltinSkill, 'slug' | 'name' | 'description' | 'category' | 'tags'>

/** En dessous de ce nombre de skills, un besoin est signalé comme lacune. */
export const COUVERTURE_MIN = 2

export type Lien = 'categorie-et-mot' | 'mot' | 'categorie'

export function trouverBesoin(profiles: Profiles, id: string): Besoin | undefined {
  return profiles.besoins.find((b) => b.id === id)
}

/**
 * Ce qui relie un skill à un besoin, ou null.
 * - besoin sans mots-clés (Juridique, Vidéo…) : la catégorie suffit ;
 * - besoin avec mots-clés (SEO…) : la catégorie seule ne suffit pas, sinon tout le marketing répondrait au SEO.
 *   Un mot-clé dans la catégorie du besoin est un lien fort ; hors catégorie, un lien plus faible
 *   (« youtube-seo-miniatures » répond au SEO sans être du marketing).
 */
export function lienAvecBesoin(besoin: Besoin, skill: SkillBesoin): Lien | null {
  const categorie = besoin.categories.includes(skill.category)
  if (besoin.motsCles.length === 0) return categorie ? 'categorie' : null
  const texte = motsDuTexte(`${skill.name} ${skill.description} ${skill.tags.join(' ')}`)
  const mot = besoin.motsCles.some((m) => contientExpression(texte, m))
  if (!mot) return null
  return categorie ? 'categorie-et-mot' : 'mot'
}

export interface CouvertureBesoin {
  besoin: string
  libelle: string
  /** Skills retenus du projet qui répondent à ce besoin. */
  retenus: string[]
  /** Skills du catalogue qui y répondent mais que la personne a écartés ou pas encore retenus. */
  disponibles: string[]
  lacune: boolean
  /** Ce qu'il manque pour atteindre le minimum. */
  manque: number
}

export interface SkillProjet {
  slug: string
  ecarte: boolean
}

/** Pour chaque besoin du projet : combien de skills retenus y répondent. Un besoin inconnu est ignoré. */
export function couverture(
  besoinsProjet: string[],
  skillsProjet: SkillProjet[],
  catalogue: SkillBesoin[],
  profiles: Profiles
): CouvertureBesoin[] {
  const parSlug = new Map(catalogue.map((s) => [s.slug, s]))
  const retenus = new Set(skillsProjet.filter((s) => !s.ecarte).map((s) => s.slug))
  const resultat: CouvertureBesoin[] = []
  for (const id of new Set(besoinsProjet)) {
    const besoin = trouverBesoin(profiles, id)
    if (!besoin) continue
    const reponses = catalogue.filter((s) => lienAvecBesoin(besoin, s) !== null).map((s) => s.slug)
    const mesRetenus = reponses.filter((slug) => retenus.has(slug) && parSlug.has(slug))
    const manque = Math.max(0, COUVERTURE_MIN - mesRetenus.length)
    resultat.push({
      besoin: besoin.id,
      libelle: besoin.libelle,
      retenus: mesRetenus,
      disponibles: reponses.filter((slug) => !retenus.has(slug)),
      lacune: manque > 0,
      manque
    })
  }
  return resultat
}

export type PisteLacune =
  | { type: 'bibliotheques'; requete: string }
  | { type: 'ia'; sujet: string }

/**
 * Que proposer pour une lacune, dans cet ordre : d'abord chercher dans les bibliothèques existantes,
 * ensuite seulement, si un fournisseur est configuré, faire rédiger le skill. Tout skill obtenu est analysé
 * avant d'être proposé (M6) ; cette fonction ne lance rien.
 */
export function pistesPourLacune(besoin: Besoin, options: { iaConfiguree: boolean }): PisteLacune[] {
  const requete = [besoin.libelle, ...besoin.motsCles].join(' ')
  const pistes: PisteLacune[] = [{ type: 'bibliotheques', requete }]
  if (options.iaConfiguree) pistes.push({ type: 'ia', sujet: besoin.libelle })
  return pistes
}
