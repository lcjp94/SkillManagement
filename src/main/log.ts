// Journal minimal : jamais de contenu d'état, de clé ni de chemin de la personne, seulement des événements.
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export const journalMuet: Logger = { info: () => {}, warn: () => {}, error: () => {} }
