// Blocs balisés dans les fichiers partagés (Copilot, Aider) : chaque skill occupe un bloc,
// le reste du fichier appartient à la personne et n'est jamais modifié.
export interface Bloc {
  id: string
  texte: string
}

export class BlocIncompletError extends Error {
  constructor(readonly id: string) {
    super(`Le bloc « ${id} » est incomplet (balise de fin absente) : corrigez ou retirez-le dans le fichier avant de continuer.`)
    this.name = 'BlocIncompletError'
  }
}

// Les balises gardent le préfixe « skillforge: » de la première version : les fichiers déjà écrits restent reconnus.
export const baliseDebut = (id: string): string => `<!-- skillforge:begin ${id} -->`
export const baliseFin = (id: string): string => `<!-- skillforge:end ${id} -->`

const finDeLigne = (texte: string): string => (/\r\n/.test(texte) ? '\r\n' : '\n')
const versFinDeLigne = (texte: string, eol: string): string => texte.replace(/\r\n|\n/g, eol)

function localiser(contenu: string, id: string): { debut: number; fin: number } | null {
  const debut = contenu.indexOf(baliseDebut(id))
  if (debut < 0) return null
  const marqueFin = baliseFin(id)
  const finMarque = contenu.indexOf(marqueFin, debut)
  if (finMarque < 0) throw new BlocIncompletError(id)
  return { debut, fin: finMarque + marqueFin.length }
}

/** Identifiants des blocs complets présents dans le fichier. */
export function listerBlocs(contenu: string): string[] {
  const ids: string[] = []
  for (const m of contenu.matchAll(/<!-- skillforge:begin ([a-z0-9-]+) -->/g)) {
    const id = m[1]!
    if (contenu.includes(baliseFin(id))) ids.push(id)
  }
  return ids
}

/** Un texte qui contiendrait une balise pourrait fermer son propre bloc, ou celui d'un autre skill. */
export const contientBalise = (texte: string): boolean => /<!--\s*skillforge:(?:begin|end)\b/i.test(texte)

/**
 * Insère ou remplace les blocs d'un fichier partagé. `existant` vaut null si le fichier n'existe pas.
 * Les fins de ligne du fichier sont respectées ; le texte de la personne n'est jamais touché.
 */
export function fusionnerBlocs(existant: string | null, entete: string, blocs: Bloc[]): string {
  const eol = finDeLigne(existant ?? entete)
  let sortie = existant ?? versFinDeLigne(entete, eol)
  for (const bloc of blocs) {
    const enveloppe = `${baliseDebut(bloc.id)}${eol}${versFinDeLigne(bloc.texte.trim(), eol)}${eol}${baliseFin(bloc.id)}`
    const place = localiser(sortie, bloc.id)
    if (place) {
      sortie = sortie.slice(0, place.debut) + enveloppe + sortie.slice(place.fin)
    } else {
      // Une ligne vide sépare le nouveau bloc de ce qui précède
      const separation = sortie === '' ? '' : sortie.endsWith(eol) ? eol : eol + eol
      sortie = `${sortie}${separation}${enveloppe}${eol}`
    }
  }
  return sortie.endsWith(eol) ? sortie : sortie + eol
}

/**
 * Retire des blocs et la ligne vide qui les précédait, sans coller deux lignes de la personne.
 * Les blocs absents sont ignorés.
 */
export function retirerBlocs(contenu: string, ids: string[]): string {
  const eol = finDeLigne(contenu)
  let sortie = contenu
  for (const id of ids) {
    const place = localiser(sortie, id)
    if (!place) continue
    let avant = sortie.slice(0, place.debut)
    let apres = sortie.slice(place.fin)
    if (apres.startsWith(eol)) apres = apres.slice(eol.length)
    if (avant.endsWith(eol + eol)) avant = avant.slice(0, -eol.length)
    sortie = avant + apres
  }
  return sortie
}

/** Vrai si, blocs retirés, il ne reste que l'en-tête que l'application avait elle-même écrit. */
export function neContientQueEntete(contenu: string, entete: string, ids: string[]): boolean {
  const reste = retirerBlocs(contenu, ids)
  return reste.trim() === entete.trim() || reste.trim() === ''
}
