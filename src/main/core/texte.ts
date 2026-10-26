// Comparaison de textes français sans accents ni casse, partagée par le conseil et les besoins.

export const sansAccents = (texte: string): string => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Texte réduit à ses mots, séparés par un espace et bornés par des espaces : prêt pour `contientExpression`. */
export function motsDuTexte(texte: string): string {
  return ` ${sansAccents(texte).split(/[^a-z0-9]+/).filter(Boolean).join(' ')} `
}

/**
 * Vrai si l'expression apparaît en mots entiers (ou au pluriel) dans le texte préparé par `motsDuTexte`.
 * « seo » ne doit pas se trouver dans « diseo », et « mots-clés » doit trouver « mots-clés ».
 */
export function contientExpression(textePrepare: string, expression: string): boolean {
  const e = motsDuTexte(expression).trim()
  if (e === '') return false
  return textePrepare.includes(` ${e} `) || textePrepare.includes(` ${e}s `)
}
