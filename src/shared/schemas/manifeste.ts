import { z } from 'zod'
import { SlugSchema } from './catalog'

export const MANIFESTE_VERSION = 1

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const DateIso = z.iso.datetime()

// Un manifeste décrit ce qu'un déploiement a réellement écrit. Les empreintes (sha256 des octets écrits)
// permettent de savoir plus tard si la personne a modifié un fichier avant de le retirer.
export const RetraitSchema = z.object({
  le: DateIso,
  resultat: z.enum(['supprime', 'restaure', 'bloc-retire', 'deja-absent'])
})
export type Retrait = z.infer<typeof RetraitSchema>

export const SkillEcritSchema = z.object({
  slug: SlugSchema,
  // Fichier entier pour « fichier » ; bloc balisé (balises comprises) pour « blocs »
  sha256: Sha256,
  // Empreinte du bloc qui occupait déjà cette place avant l'écriture (fichiers à blocs seulement)
  avant: Sha256.optional(),
  retire: RetraitSchema.optional()
})

export const FichierManifesteSchema = z.object({
  chemin: z.string().min(1),
  mode: z.enum(['fichier', 'blocs', 'creer-si-absent']),
  action: z.enum(['create', 'modify', 'unchanged']),
  /** Empreinte du fichier entier tel qu'écrit (ou tel que trouvé, pour « unchanged »). */
  sha256Apres: Sha256,
  /** Le fichier n'existait pas avant : l'application l'a créé. */
  creeParApp: z.boolean(),
  /** Chemin, sous backups/<id>/, de la copie du fichier avant écriture. */
  sauvegarde: z.string().optional(),
  /** En-tête écrit par l'application dans un fichier à blocs qu'elle a créé. */
  entete: z.string().optional(),
  skills: z.array(SkillEcritSchema),
  /** Pour un fichier créé ou un accessoire (.aider.conf.yml) : retiré en entier. */
  retire: RetraitSchema.optional()
})
export type FichierManifeste = z.infer<typeof FichierManifesteSchema>

export const ManifesteSchema = z.object({
  version: z.literal(MANIFESTE_VERSION),
  id: z.string().regex(/^[a-z0-9-]{8,64}$/),
  /** « en-cours » tant que l'écriture n'est pas terminée : un manifeste resté ainsi signale une coupure. */
  etat: z.enum(['en-cours', 'termine', 'annule']),
  creeLe: DateIso,
  projetId: z.string().optional(),
  /** Un identifiant d'assistant, ou « arborescence ». */
  cible: z.string().min(1),
  portee: z.enum(['projet', 'global']),
  /** Dossier choisi, résolu : propre à cette machine, jamais exporté. */
  racine: z.string().min(1),
  fichiers: z.array(FichierManifesteSchema),
  /** Dossiers (relatifs) que l'application a créés : seuls ceux-là sont retirés, et seulement s'ils sont vides. */
  dossiersCrees: z.array(z.string()),
  dossiersRetires: z.array(z.string()).default([]),
  annuleLe: DateIso.optional(),
  sauvegardesPurgeesLe: DateIso.optional()
})
export type Manifeste = z.infer<typeof ManifesteSchema>
