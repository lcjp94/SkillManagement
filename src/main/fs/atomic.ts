import writeFileAtomic from 'write-file-atomic'

export type Ecriture = (chemin: string, donnees: string | Buffer, mode?: number) => Promise<void>

// Écriture dans un fichier temporaire du même dossier, vidage sur disque, puis renommage.
const ecritureParDefaut: Ecriture = (chemin, donnees, mode) =>
  writeFileAtomic(chemin, donnees, { fsync: true, ...(mode === undefined ? {} : { mode }) })

// Codes renvoyés par Windows quand un antivirus, l'indexeur ou un client de synchronisation
// (OneDrive, Dropbox, iCloud) tient brièvement le fichier.
const CODES_TRANSITOIRES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'])

export interface OptionsEcriture {
  essais?: number
  delaiMs?: number
  mode?: number
  ecrire?: Ecriture
}

export async function ecrireAtomique(chemin: string, donnees: string | Buffer, options: OptionsEcriture = {}): Promise<void> {
  const { essais = 5, delaiMs = 50, mode, ecrire = ecritureParDefaut } = options
  for (let tentative = 1; ; tentative++) {
    try {
      await ecrire(chemin, donnees, mode)
      return
    } catch (erreur) {
      const code = (erreur as NodeJS.ErrnoException).code
      if (tentative >= essais || !code || !CODES_TRANSITOIRES.has(code)) throw erreur
      await new Promise((resolve) => setTimeout(resolve, delaiMs * 2 ** (tentative - 1)))
    }
  }
}
