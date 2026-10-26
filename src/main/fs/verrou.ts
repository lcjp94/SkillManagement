import { Mutex } from 'async-mutex'

// Un seul verrou pour toute écriture d'état ou de manifeste : l'instance unique de
// l'application évite les accès concurrents entre processus, ce verrou évite
// les entrelacements entre appels asynchrones du même processus.
const verrouEcriture = new Mutex()

export function exclusif<T>(tache: () => Promise<T>): Promise<T> {
  return verrouEcriture.runExclusive(tache)
}
