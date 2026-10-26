// Aides des tests d'écriture sur disque : dossiers temporaires, contexte déterministe, instantanés de dossier.
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerScanner } from '../../src/main/core/scan'
import type { SkillAEcrire } from '../../src/main/core/layouts'
import type { ContexteDisque } from '../../src/main/fs/contexte'
import type { Ecriture } from '../../src/main/fs/atomic'
import { getCatalogue } from '../../src/shared/data'

export interface Banc {
  base: string
  projet: string
  home: string
  donnees: string
  ctx: ContexteDisque
  nettoyer: () => Promise<void>
}

/** Dossiers temporaires hors du dépôt (donc hors OneDrive) : un projet, un « dossier personnel » et les données de l'application. */
export async function creerBanc(plus: Partial<ContexteDisque> = {}): Promise<Banc> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'sm-test-')))
  const projet = join(base, 'projet')
  const home = join(base, 'home')
  const donnees = join(base, 'donnees')
  const systeme = join(base, 'systeme')
  for (const d of [projet, home, donnees, systeme]) await mkdir(d, { recursive: true })
  let n = 0
  let minute = 0
  const ctx: ContexteDisque = {
    dossierDonnees: donnees,
    env: { dossierPersonnel: home, donneesApp: donnees, systeme: [systeme] },
    scanner: creerScanner(getCatalogue().scanRules),
    nouvelId: () => `dep-${String(++n).padStart(4, '0')}`,
    maintenant: () => new Date(Date.UTC(2026, 9, 26, 10, ++minute)),
    ...plus
  }
  return { base, projet, home, donnees, ctx, nettoyer: () => rm(base, { recursive: true, force: true }) }
}

export const skill = (slug: string, corps = `# ${slug}\n\nConsignes de ${slug}.`, description = `Description de ${slug}`): SkillAEcrire => ({
  slug,
  name: slug,
  description,
  content: corps
})

export const skills = (...slugs: string[]): SkillAEcrire[] => slugs.map((s) => skill(s))

/** Contenu de tout un dossier : chemin relatif → empreinte (fichier) ou « dossier ». Sert à comparer un avant et un après. */
export async function instantane(racine: string): Promise<Record<string, string>> {
  const resultat: Record<string, string> = {}
  async function parcourir(rel: string): Promise<void> {
    for (const entree of await readdir(join(racine, rel), { withFileTypes: true })) {
      const chemin = rel === '' ? entree.name : `${rel}/${entree.name}`
      if (entree.isDirectory()) {
        resultat[`${chemin}/`] = 'dossier'
        await parcourir(chemin)
      } else resultat[chemin] = createHash('sha256').update(await readFile(join(racine, chemin))).digest('hex')
    }
  }
  await parcourir('')
  return resultat
}

export const ecrireFichier = async (racine: string, rel: string, contenu: string | Buffer): Promise<void> => {
  const chemin = join(racine, ...rel.split('/'))
  await mkdir(join(chemin, '..'), { recursive: true })
  await writeFile(chemin, contenu)
}

export const lireFichier = (racine: string, rel: string): Promise<string> => readFile(join(racine, ...rel.split('/')), 'utf8')

/** Écrivain qui échoue à la n-ième écriture (et seulement elle), comme une coupure ou un fichier verrouillé. */
export function ecrivainDefaillant(n: number, erreur: () => Error = () => Object.assign(new Error('disque plein'), { code: 'ENOSPC' })): { ecrire: Ecriture; appels: () => number } {
  let appels = 0
  const ecrire: Ecriture = async (chemin, donnees) => {
    appels++
    if (appels === n) throw erreur()
    const { default: writeFileAtomic } = await import('write-file-atomic')
    await writeFileAtomic(chemin, donnees, { fsync: true })
  }
  return { ecrire, appels: () => appels }
}

/** Écrivain qui compte les écritures sans jamais échouer. */
export function ecrivainCompteur(): { ecrire: Ecriture; appels: () => number } {
  return ecrivainDefaillant(Number.POSITIVE_INFINITY)
}
