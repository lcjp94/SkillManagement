import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Lance l'application compilée avec un dossier de données jetable,
// pour ne jamais toucher à une instance ouverte par la personne.
test('l\'application démarre, l\'IPC répond et l\'interface est isolée', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'skillmanagement-e2e-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SkillManagement')
    await expect(page.getByRole('status')).toHaveText(/Version \d+\.\d+\.\d+/)

    // L'interface n'a aucun accès Node
    const acces = await page.evaluate(() => ({
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process,
      api: typeof window.skillmanagement.app.info
    }))
    expect(acces).toEqual({ require: 'undefined', process: 'undefined', api: 'function' })

    // La CSP stricte est bien présente dans la version compilée
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("default-src 'self'")
  } finally {
    await app.close()
  }
})
