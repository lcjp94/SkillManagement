// Manifestes de déploiement : applications/<id>.json dans le dossier de données de l'application.
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ManifesteSchema, type Manifeste } from '@shared/schemas/manifeste'
import { ecrireAtomique, type Ecriture } from './atomic'

export const dossierManifestes = (dossierDonnees: string): string => join(dossierDonnees, 'applications')
export const dossierSauvegardes = (dossierDonnees: string, id: string): string => join(dossierDonnees, 'backups', id)

const NOM_MANIFESTE = /^([a-z0-9-]{8,64})\.json$/

export async function ecrireManifeste(dossierDonnees: string, manifeste: Manifeste, ecrire?: Ecriture): Promise<void> {
  const valide = ManifesteSchema.parse(manifeste)
  await mkdir(dossierManifestes(dossierDonnees), { recursive: true })
  await ecrireAtomique(join(dossierManifestes(dossierDonnees), `${valide.id}.json`), JSON.stringify(valide, null, 2) + '\n', {
    mode: 0o600,
    ...(ecrire ? { ecrire } : {})
  })
}

export interface LectureManifestes {
  manifestes: Manifeste[]
  /** Fichiers qui ne sont pas des manifestes lisibles : ignorés, jamais supprimés. */
  illisibles: string[]
}

/** Tous les manifestes, du plus ancien au plus récent. Un fichier abîmé est signalé, pas fatal. */
export async function lireManifestes(dossierDonnees: string): Promise<LectureManifestes> {
  const dossier = dossierManifestes(dossierDonnees)
  let noms: string[]
  try {
    noms = await readdir(dossier)
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') return { manifestes: [], illisibles: [] }
    throw erreur
  }
  const manifestes: Manifeste[] = []
  const illisibles: string[] = []
  for (const nom of noms) {
    const correspond = NOM_MANIFESTE.exec(nom)
    if (!correspond) continue // fichier temporaire d'une écriture atomique ou étranger
    try {
      const valide = ManifesteSchema.safeParse(JSON.parse(await readFile(join(dossier, nom), 'utf8')))
      if (valide.success && valide.data.id === correspond[1]) manifestes.push(valide.data)
      else illisibles.push(nom)
    } catch {
      illisibles.push(nom)
    }
  }
  manifestes.sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id))
  return { manifestes, illisibles }
}
