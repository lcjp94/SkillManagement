import { join } from 'node:path'
import { STATE_VERSION, StateSchema, etatInitial, type State } from '@shared/schemas/state'
import type { Logger } from '../log'
import { JsonStore } from './json-store'

// Migrations de l'état : migrations[n] passe de la version n à n + 1.
// Vide tant que la version 1 est la seule publiée ; une entrée s'ajoute avec chaque changement de schéma.
export const migrationsEtat: Record<number, (ancien: unknown) => unknown> = {}

export function creerStoreEtat(dossierDonnees: string, journal?: Logger): JsonStore<State> {
  return new JsonStore<State>({
    fichier: join(dossierDonnees, 'state.json'),
    versionCourante: STATE_VERSION,
    schema: StateSchema,
    migrations: migrationsEtat,
    creer: etatInitial,
    journal,
    // Lisible par la personne seule sur macOS et Linux (sans effet sous Windows)
    mode: 0o600
  })
}
