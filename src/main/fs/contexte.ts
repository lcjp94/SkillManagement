import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { ResultatScan } from '../core/scan'
import type { Logger } from '../log'
import type { Ecriture } from './atomic'
import { dossierSauvegardes } from './manifestes'
import type { Environnement } from './perimetre'

/**
 * Tout ce dont l'écriture sur le disque dépend. Le scanner n'est pas facultatif : aucun chemin d'écriture
 * ne contourne l'analyse des skills (CLAUDE.md § 9).
 */
export interface ContexteDisque {
  dossierDonnees: string
  env: Environnement
  scanner: (contenu: string) => ResultatScan
  journal?: Logger
  maintenant?: () => Date
  nouvelId?: () => string
  /** Remplacé dans les tests pour simuler une panne d'écriture. */
  ecrire?: Ecriture
}

export const horodatage = (ctx: ContexteDisque): string => (ctx.maintenant ?? (() => new Date()))().toISOString()
export const nouvelIdentifiant = (ctx: ContexteDisque): string => (ctx.nouvelId ?? randomUUID)()

/** Où la copie d'un fichier est rangée avant d'être remplacé. */
export const cheminSauvegarde = (ctx: ContexteDisque, id: string, rel: string): string =>
  join(dossierSauvegardes(ctx.dossierDonnees, id), ...rel.split('/'))
