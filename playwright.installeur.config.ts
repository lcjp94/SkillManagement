import { defineConfig } from '@playwright/test'

// Tests de l'application empaquetée, de son installeur et de la mise à jour. Ils demandent `npm run package` d'abord
// (et construisent eux-mêmes deux versions pour la mise à jour) : lancés à part, pas avec les parcours ordinaires.
export default defineConfig({
  testDir: 'e2e-installeur',
  timeout: 15 * 60_000,
  workers: 1
})
