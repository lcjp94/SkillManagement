import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lancer } from './aide'

// Lance l'application compilée avec un dossier de données jetable,
// pour ne jamais toucher à une instance ouverte par la personne.
test('l\'application démarre, l\'IPC répond et l\'interface est isolée', async () => {
  const s = await lancer()
  try {
    const { page } = s
    // Sans profil, la porte d'entrée est le parcours de démarrage
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quels assistants IA utilisez-vous ?')

    // L'interface n'a aucun accès Node ; sa seule surface est un appel restreint aux canaux du contrat
    const acces = await page.evaluate(() => ({
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process,
      api: typeof (window as unknown as { skillmanagement: { invoke: unknown } }).skillmanagement.invoke
    }))
    expect(acces).toEqual({ require: 'undefined', process: 'undefined', api: 'function' })

    // Un canal qui n'est pas dans le contrat est refusé dès le preload
    const refus = await page.evaluate(() =>
      (window as unknown as { skillmanagement: { invoke(c: string): Promise<unknown> } }).skillmanagement.invoke('fs.readFile').then(
        () => 'accepté',
        (e: Error) => e.message
      )
    )
    expect(refus).toBe('Canal inconnu.')

    // La CSP stricte est bien présente dans la version compilée
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("default-src 'self'")

    // Le fichier d'état a été créé au démarrage, dans le dossier de données jetable
    const etat = JSON.parse(readFileSync(join(s.donnees, 'state.json'), 'utf8'))
    expect(etat).toEqual({ version: 1, profile: null, projects: [], userSkills: [] })
  } finally {
    await s.fermer()
  }
})
