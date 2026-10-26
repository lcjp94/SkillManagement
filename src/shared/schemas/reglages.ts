import { z } from 'zod'

// Réglages non secrets (settings.json). Les clés d'API ne sont jamais ici : elles vont dans secrets.bin, chiffrées.
export const ReglagesStockesSchema = z.object({
  version: z.literal(1),
  theme: z.enum(['auto', 'clair', 'sombre']),
  ia: z.object({ fournisseur: z.string(), adresse: z.string().optional(), modele: z.string() }).optional(),
  /** Dépôts GitHub ajoutés par la personne, en plus des sources par défaut. */
  sources: z.array(z.string()).max(10).optional()
})
export type ReglagesStockes = z.infer<typeof ReglagesStockesSchema>
