// Lecture d'un SKILL.md venant de l'extérieur (service d'IA, dépôt GitHub) : en-tête YAML interprété avec prudence.
import { parse } from 'yaml'
import { SLUG_RE } from '@shared/schemas/catalog'
import { separerFrontmatter } from './frontmatter'

export interface SkillLu {
  name: string | null
  description: string | null
  /** Corps du skill, sans l'en-tête. */
  corps: string
}

const ENTETE_MAX = 8_000

/**
 * L'en-tête vient d'une source non fiable : alias YAML interdits (attaque par expansion), taille bornée, et seules
 * des chaînes de caractères sont retenues. Un en-tête illisible est traité comme absent.
 */
export function lireSkillMd(texte: string): SkillLu {
  const { entete, corps } = separerFrontmatter(texte)
  if (entete === null || entete.length > ENTETE_MAX) return { name: null, description: null, corps: entete === null ? texte : corps }
  let meta: unknown
  try {
    meta = parse(entete, { maxAliasCount: 0, strict: true, uniqueKeys: true })
  } catch {
    return { name: null, description: null, corps }
  }
  const lire = (cle: string): string | null => {
    const valeur = (meta as Record<string, unknown> | null)?.[cle]
    return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.replace(/\s+/g, ' ').trim() : null
  }
  return { name: lire('name'), description: lire('description'), corps }
}

/** Identifiant utilisable comme nom de dossier : minuscules, chiffres, tirets, 64 caractères au plus. */
export function slugifier(texte: string): string {
  const base = texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return SLUG_RE.test(base) ? base : 'skill'
}

/** Rend un identifiant libre parmi ceux qui existent : « x », puis « x-2 », « x-3 »… */
export function slugLibre(souhaite: string, pris: Iterable<string>): string {
  const existants = new Set(pris)
  if (!existants.has(souhaite)) return souhaite
  for (let n = 2; ; n++) {
    const suffixe = `-${n}`
    const candidat = `${souhaite.slice(0, 64 - suffixe.length).replace(/-+$/g, '')}${suffixe}`
    if (!existants.has(candidat)) return candidat
  }
}

/** Retire l'enveloppe de code (```markdown … ```) dont les modèles entourent souvent leur réponse. */
export function sansEnveloppeCode(texte: string): string {
  const t = texte.trim()
  const m = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(t)
  return m ? m[1]!.trim() : t
}
