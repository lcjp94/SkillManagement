import { afterAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { JsonStore } from '../src/main/store/json-store'

const dossier = await mkdtemp(join(tmpdir(), 'skillmanagement-crash-'))
const fichier = join(dossier, 'state.json')
afterAll(() => rm(dossier, { recursive: true, force: true }))

const Schema = z.object({ version: z.literal(1), n: z.number().int(), bourrage: z.string() })

// Lance l'écrivain, attend sa première écriture réussie, puis le tue sans prévenir.
function lancerEtTuer(delaiMs: number): Promise<void> {
  return new Promise((fin, echec) => {
    const enfant = spawn(process.execPath, ['--import', 'tsx', resolve('tests/helpers/crash-writer.ts'), fichier], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let erreurs = ''
    enfant.stderr.on('data', (morceau: Buffer) => (erreurs += morceau.toString()))
    enfant.once('exit', (code, signal) => {
      if (signal) return fin()
      echec(new Error(`L'écrivain s'est arrêté seul (code ${code}) : ${erreurs}`))
    })
    enfant.stdout.once('data', () => {
      setTimeout(() => enfant.kill('SIGKILL'), delaiMs)
    })
  })
}

describe('coupure en pleine écriture', () => {
  it('ne corrompt jamais le fichier d\'état, sur 20 arrêts brutaux', { timeout: 180_000 }, async () => {
    let dernier = 0
    let temporairesVus = 0
    for (let tour = 1; tour <= 20; tour++) {
      await lancerEtTuer(Math.floor(Math.random() * 40))

      // Les fichiers temporaires laissés par l'arrêt prouvent que l'écriture a bien été interrompue
      temporairesVus += (await readdir(dossier)).filter((nom) => /^state\.json(\.bak)?\.\d+$/.test(nom)).length

      const store = new JsonStore({
        fichier,
        versionCourante: 1,
        schema: Schema,
        creer: () => ({ version: 1 as const, n: 0, bourrage: '' })
      })
      const { avis } = await store.load()
      expect(avis, `tour ${tour} : le fichier principal doit rester lisible sans réparation`).toBeUndefined()
      expect(store.get().n, `tour ${tour} : aucune écriture validée ne doit être perdue`).toBeGreaterThanOrEqual(dernier)
      dernier = store.get().n

      expect((await readdir(dossier)).sort(), `tour ${tour} : pas de reste après le chargement`).toEqual([
        'state.json',
        'state.json.bak'
      ])
    }
    console.info(`Coupures simulées : 20 ; fichiers temporaires interrompus constatés : ${temporairesVus} ; écritures validées : ${dernier}`)
    expect(dernier).toBeGreaterThan(20)
  })
})
