// Séparation de l'en-tête (frontmatter) et du corps d'un skill. Aucune interprétation YAML ici :
// l'en-tête des skills intégrés est écarté et reconstruit par chaque disposition.
const EN_TETE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n([\s\S]*))?$/

export function separerFrontmatter(markdown: string): { entete: string | null; corps: string } {
  const correspondance = markdown.replace(/^\s+/, '').match(EN_TETE)
  if (!correspondance) return { entete: null, corps: markdown }
  return { entete: correspondance[1] ?? '', corps: correspondance[2] ?? '' }
}

export const corpsDuSkill = (contenu: string): string => separerFrontmatter(contenu).corps.trim()
