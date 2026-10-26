import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { ecrireAtomique } from '../src/main/fs/atomic'
import { JsonStore, VersionFutureError, type OptionsStore } from '../src/main/store/json-store'

const SchemaV1 = z.object({ version: z.literal(1), n: z.number().int() })
type EtatV1 = z.infer<typeof SchemaV1>

let dossier: string
let fichier: string

beforeEach(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'skillmanagement-store-'))
  fichier = join(dossier, 'state.json')
})
afterEach(async () => {
  await rm(dossier, { recursive: true, force: true })
})

const creerStore = (options: Partial<OptionsStore<EtatV1>> = {}) =>
  new JsonStore<EtatV1>({
    fichier,
    versionCourante: 1,
    schema: SchemaV1,
    creer: () => ({ version: 1, n: 0 }),
    ...options
  })

const noms = async () => (await readdir(dossier)).sort()
const lireJson = async (chemin: string) => JSON.parse(await readFile(chemin, 'utf8')) as unknown

describe('création et mise à jour', () => {
  it('crée le fichier au premier chargement', async () => {
    const store = creerStore()
    expect(await store.load()).toEqual({ avis: 'neuf' })
    expect(await lireJson(fichier)).toEqual({ version: 1, n: 0 })
  })

  it('écrit des fins de ligne \\n et garde la version précédente en copie', async () => {
    const store = creerStore()
    await store.load()
    await store.update((s) => void (s.n = 1))
    await store.update((s) => void (s.n = 2))
    expect(await readFile(fichier, 'utf8')).toBe('{\n  "version": 1,\n  "n": 2\n}\n')
    expect(await lireJson(`${fichier}.bak`)).toEqual({ version: 1, n: 1 })

    const rouvert = creerStore()
    expect(await rouvert.load()).toEqual({})
    expect(rouvert.get().n).toBe(2)
  })

  it('sérialise les mises à jour simultanées sans en perdre', async () => {
    const store = creerStore()
    await store.load()
    await Promise.all(Array.from({ length: 50 }, () => store.update((s) => void (s.n += 1))))
    expect(store.get().n).toBe(50)
    expect((await lireJson(fichier) as EtatV1).n).toBe(50)
  })

  it('renvoie des copies : modifier le résultat ne change pas l\'état', async () => {
    const store = creerStore()
    await store.load()
    store.get().n = 99
    expect(store.get().n).toBe(0)
  })

  it('refuse un état invalide sans rien écrire ni changer', async () => {
    const store = creerStore()
    await store.load()
    const avant = await readFile(fichier, 'utf8')
    await expect(store.update((s) => void ((s as { n: unknown }).n = 'texte'))).rejects.toThrow('Enregistrement refusé')
    expect(store.get().n).toBe(0)
    expect(await readFile(fichier, 'utf8')).toBe(avant)
  })

  it('garde l\'ancien état si l\'écriture échoue', async () => {
    let echec = false
    const store = creerStore({
      ecrire: async (chemin, donnees) => {
        if (echec) throw Object.assign(new Error('disque plein'), { code: 'ENOSPC' })
        await writeFile(chemin, donnees)
      }
    })
    await store.load()
    await store.update((s) => void (s.n = 1))
    echec = true
    await expect(store.update((s) => void (s.n = 2))).rejects.toThrow('disque plein')
    expect(store.get().n).toBe(1)
    expect(await lireJson(fichier)).toEqual({ version: 1, n: 1 })
  })

  it('exige un chargement préalable', async () => {
    const store = creerStore()
    expect(() => store.get()).toThrow('pas encore chargées')
    await expect(store.update(() => {})).rejects.toThrow('pas encore chargées')
  })
})

describe('fichier abîmé', () => {
  it('restaure depuis la copie et conserve le fichier abîmé à côté', async () => {
    const store = creerStore()
    await store.load()
    await store.update((s) => void (s.n = 1))
    await store.update((s) => void (s.n = 2))
    await writeFile(fichier, '{"version":1,"n":') // coupure en pleine écriture

    const rouvert = creerStore()
    expect(await rouvert.load()).toEqual({ avis: 'restaure-depuis-copie' })
    expect(rouvert.get().n).toBe(1)
    const corrompus = (await noms()).filter((nom) => nom.includes('.corrompu-'))
    expect(corrompus).toHaveLength(1)
    expect(await readFile(join(dossier, corrompus[0]!), 'utf8')).toBe('{"version":1,"n":')
  })

  it('repart à neuf sans rien perdre quand la copie manque aussi', async () => {
    await writeFile(fichier, 'pas du json')
    const store = creerStore()
    expect(await store.load()).toEqual({ avis: 'reinitialise-apres-corruption' })
    expect(store.get().n).toBe(0)
    const corrompus = (await noms()).filter((nom) => nom.includes('.corrompu-'))
    expect(corrompus).toHaveLength(1)
    expect(await readFile(join(dossier, corrompus[0]!), 'utf8')).toBe('pas du json')
  })

  it('met de côté le fichier et la copie quand tous deux sont illisibles', async () => {
    await writeFile(fichier, '{')
    await writeFile(`${fichier}.bak`, '[]')
    const store = creerStore()
    expect(await store.load()).toEqual({ avis: 'reinitialise-apres-corruption' })
    expect((await noms()).filter((nom) => nom.includes('.corrompu-'))).toHaveLength(2)
  })

  it('traite un fichier valide en JSON mais hors schéma comme illisible', async () => {
    await writeFile(fichier, JSON.stringify({ version: 1, n: 'x' }))
    const store = creerStore()
    expect((await store.load()).avis).toBe('reinitialise-apres-corruption')
  })

  it('restaure depuis la copie quand le fichier principal a disparu', async () => {
    const store = creerStore()
    await store.load()
    await store.update((s) => void (s.n = 1))
    await store.update((s) => void (s.n = 2))
    await rm(fichier)
    const rouvert = creerStore()
    expect(await rouvert.load()).toEqual({ avis: 'restaure-depuis-copie' })
    expect(rouvert.get().n).toBe(1)
  })

  it('n\'écrase jamais une bonne copie avec un fichier abîmé', async () => {
    const store = creerStore()
    await store.load()
    await store.update((s) => void (s.n = 1))
    await store.update((s) => void (s.n = 2)) // copie = 1
    await writeFile(fichier, 'abîmé par un tiers')
    await store.update((s) => void (s.n = 3))
    expect(await lireJson(`${fichier}.bak`)).toEqual({ version: 1, n: 1 })
  })

  it('supprime les fichiers temporaires laissés par un arrêt brutal, et eux seuls', async () => {
    const store = creerStore()
    await store.load()
    await store.update((s) => void (s.n = 1))
    await writeFile(`${fichier}.3257654872`, 'reste')
    await writeFile(join(dossier, 'autre.json.3257654872'), 'autre fichier')
    await creerStore().load()
    const presents = await noms()
    expect(presents).not.toContain('state.json.3257654872')
    expect(presents).toContain('autre.json.3257654872')
    expect(presents).toContain('state.json.bak')
  })
})

describe('versions et migrations', () => {
  it('refuse une version plus récente sans rien modifier', async () => {
    const contenu = JSON.stringify({ version: 7, n: 3, nouveau: true })
    await writeFile(fichier, contenu)
    const erreur = await creerStore().load().catch((e: unknown) => e)
    expect(erreur).toBeInstanceOf(VersionFutureError)
    expect((erreur as Error).message).toContain('Mettez l\'application à jour')
    expect(await readFile(fichier, 'utf8')).toBe(contenu)
    expect(await noms()).toEqual(['state.json'])
  })

  const SchemaV2 = z.object({ version: z.literal(2), total: z.number().int() })
  const optionsV2: Partial<OptionsStore<z.infer<typeof SchemaV2>>> = {
    versionCourante: 2,
    schema: SchemaV2,
    creer: () => ({ version: 2, total: 0 }),
    migrations: { 1: (ancien) => ({ version: 2, total: (ancien as EtatV1).n * 10 }) }
  }
  const storeV2 = () => new JsonStore({ fichier, ...optionsV2 } as OptionsStore<z.infer<typeof SchemaV2>>)

  it('migre, garde le fichier d\'origine et ne migre qu\'une fois', async () => {
    const origine = JSON.stringify({ version: 1, n: 4 })
    await writeFile(fichier, origine)
    const store = storeV2()
    expect(await store.load()).toEqual({ avis: 'migre' })
    expect(store.get()).toEqual({ version: 2, total: 40 })
    expect(await readFile(`${fichier}.v1.bak`, 'utf8')).toBe(origine)
    expect(await lireJson(fichier)).toEqual({ version: 2, total: 40 })
    expect(await storeV2().load()).toEqual({})
  })

  it('traite une migration manquante comme un fichier illisible, sans perte', async () => {
    const origine = JSON.stringify({ version: 1, n: 4 })
    await writeFile(fichier, origine)
    const store = new JsonStore({ fichier, ...optionsV2, migrations: {} } as OptionsStore<z.infer<typeof SchemaV2>>)
    expect((await store.load()).avis).toBe('reinitialise-apres-corruption')
    const corrompus = (await noms()).filter((nom) => nom.includes('.corrompu-'))
    expect(await readFile(join(dossier, corrompus[0]!), 'utf8')).toBe(origine)
  })
})

describe('écriture atomique avec nouvel essai', () => {
  const transitoire = (code: string) => Object.assign(new Error(code), { code })

  it('retente après un blocage transitoire (antivirus, synchronisation)', async () => {
    let appels = 0
    await ecrireAtomique(fichier, 'x', {
      delaiMs: 1,
      ecrire: async () => {
        if (++appels < 3) throw transitoire('EBUSY')
      }
    })
    expect(appels).toBe(3)
  })

  it('abandonne après le nombre d\'essais prévu', async () => {
    let appels = 0
    await expect(
      ecrireAtomique(fichier, 'x', {
        essais: 4,
        delaiMs: 1,
        ecrire: async () => {
          appels++
          throw transitoire('EPERM')
        }
      })
    ).rejects.toThrow('EPERM')
    expect(appels).toBe(4)
  })

  it('ne retente pas une erreur qui ne passera pas (disque plein)', async () => {
    let appels = 0
    await expect(
      ecrireAtomique(fichier, 'x', {
        delaiMs: 1,
        ecrire: async () => {
          appels++
          throw transitoire('ENOSPC')
        }
      })
    ).rejects.toThrow('ENOSPC')
    expect(appels).toBe(1)
  })
})
