import { z } from 'zod'

// Contrat unique entre le processus principal et l'interface :
// chaque canal déclare son schéma d'entrée et de sortie.
export const AppInfoSchema = z.object({
  nom: z.string(),
  version: z.string(),
  plateforme: z.string()
})
export type AppInfo = z.infer<typeof AppInfoSchema>

// Surface exposée à l'interface par le preload (aucun accès Node côté renderer).
export interface SkillManagementApi {
  app: { info(): Promise<AppInfo> }
}
