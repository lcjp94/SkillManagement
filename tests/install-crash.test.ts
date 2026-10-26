import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { interrompus, listerInstalles, reprendreInterrompus, desinstaller } from '../src/main/fs/retrait'
import { creerBanc, ecrireFichier, instantane, type Banc } from './helpers/disque'

let banc: Banc
beforeAll(async () => {
  banc = await creerBanc()
})
afterAll(() => banc.nettoyer())

// Lance l'installeur, attend qu'il ait commencé, puis le tue sans prévenir.
function lancerEtTuer(delaiMs: number): Promise<void> {
  return new Promise((fin, echec) => {
    const enfant = spawn(process.execPath, ['--import', 'tsx', resolve('tests/helpers/crash-installer.ts'), banc.projet, banc.donnees, banc.home], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // tsx doit connaître l'alias @shared, déclaré dans tsconfig.node.json
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve('tsconfig.node.json') }
    })
    let erreurs = ''
    enfant.stderr.on('data', (morceau: Buffer) => (erreurs += morceau.toString()))
    enfant.once('exit', (code, signal) => {
      if (signal) return fin()
      echec(new Error(`L'installeur s'est arrêté seul (code ${code}) : ${erreurs}`))
    })
    enfant.stdout.once('data', () => setTimeout(() => enfant.kill('SIGKILL'), delaiMs))
  })
}

describe('arrêt brutal pendant une installation ou une désinstallation', () => {
  it('au redémarrage, tout se remet en ordre et le dossier retrouve son état initial, sur 12 arrêts', { timeout: 280_000 }, async () => {
    await ecrireFichier(banc.projet, 'notes.md', 'mes notes')
    await ecrireFichier(banc.projet, 'src/index.ts', 'export {}')
    const initial = await instantane(banc.projet)
    let interrompues = 0
    let temporaires = 0
    for (let tour = 1; tour <= 12; tour++) {
      await lancerEtTuer(Math.floor(Math.random() * 500))
      const entrouvert = await interrompus(banc.ctx)
      interrompues += entrouvert.length
      temporaires += Object.keys(await instantane(banc.projet)).filter((c) => /\.\d{1,10}$/.test(c)).length

      // Redémarrage : reprise des écritures coupées, puis la personne désinstalle ce qui reste
      await reprendreInterrompus(banc.ctx)
      expect(await interrompus(banc.ctx), `tour ${tour}`).toEqual([])
      await desinstaller(banc.ctx, { racine: banc.projet, portee: 'projet', cible: 'claude-code', slugs: 'tous' })
      expect(await listerInstalles(banc.ctx, { racine: banc.projet, portee: 'projet' }), `tour ${tour}`).toEqual([])
      expect(await instantane(banc.projet), `tour ${tour}`).toEqual(initial)
    }
    // Garde-fou : si aucun arrêt n'est tombé pendant une écriture, le test ne prouverait rien
    expect(interrompues + temporaires, 'aucune coupure n\'est tombée en pleine écriture').toBeGreaterThan(0)
    console.log(`coupures en cours d'installation : ${interrompues}, fichiers temporaires laissés : ${temporaires}`)
  })

  it('les manifestes restent lisibles après chaque arrêt', async () => {
    const { lireManifestes } = await import('../src/main/fs/manifestes')
    const r = await lireManifestes(join(banc.donnees, '..', 'donnees'))
    expect(r.illisibles).toEqual([])
  })
})
