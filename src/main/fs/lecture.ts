import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'

export const sha256 = (donnees: string | Buffer): string => createHash('sha256').update(donnees).digest('hex')

export class FichierIllisibleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FichierIllisibleError'
  }
}

/** Un fichier d'assistant fait quelques Ko ; au-delà, on ne le réécrit pas. */
const TAILLE_MAX_LECTURE = 5_000_000
// ignoreBOM : un BOM éventuel reste dans le texte, pour que le fichier réécrit soit identique octet pour octet
const decodeur = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/**
 * Contenu d'un fichier texte existant, ou null s'il est absent. Un fichier qui n'est pas de l'UTF-8 valide
 * est refusé : le réécrire (blocs ajoutés) l'abîmerait.
 */
export async function lireTexte(chemin: string): Promise<string | null> {
  let infos
  try {
    infos = await lstat(chemin)
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw erreur
  }
  if (!infos.isFile()) throw new FichierIllisibleError('Un élément attendu comme fichier est autre chose (dossier ou lien) : rien n’a été écrit.')
  if (infos.size > TAILLE_MAX_LECTURE) throw new FichierIllisibleError('Un fichier existant est trop volumineux pour être modifié sans risque.')
  const octets = await readFile(chemin)
  try {
    return decodeur.decode(octets)
  } catch {
    throw new FichierIllisibleError('Un fichier existant n’est pas du texte UTF-8 : l’application ne le modifie pas pour ne pas l’abîmer.')
  }
}

/** Vrai si quelque chose (fichier, dossier ou lien, même cassé) occupe ce chemin. */
export async function existe(chemin: string): Promise<boolean> {
  try {
    await lstat(chemin)
    return true
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw erreur
  }
}
