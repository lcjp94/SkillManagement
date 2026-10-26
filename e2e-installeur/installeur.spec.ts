// Application empaquetée, installeur et mise à jour, sur Windows. Lancer `npm run package` avant (le test de mise à jour
// construit lui-même deux versions). Aucune de ces vérifications ne touche à une installation existante de la personne :
// si SkillManagement est déjà installé sur ce poste, les tests d'installation sont ignorés.
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const lancerCommande = promisify(execFile)
const racineProjet = resolve('.')
const installeur = (version: string, dossier = join(racineProjet, 'release')) => join(dossier, `SkillManagement-Setup-${version}.exe`)
const CLE_DESINSTALLATION = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

test.skip(process.platform !== 'win32', 'Version Windows seulement')

async function entreesDeDesinstallation(): Promise<string[]> {
  const lignes: string[] = []
  for (const cle of [CLE_DESINSTALLATION, 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall']) {
    try {
      const { stdout } = await lancerCommande('reg.exe', ['query', cle, '/s', '/f', 'SkillManagement', '/d'])
      lignes.push(...stdout.split(/\r?\n/).filter((l) => /DisplayName/i.test(l)))
    } catch {
      // aucune entrée : reg.exe sort avec un code d'erreur
    }
  }
  return lignes
}

async function versionDuFichier(exe: string): Promise<string> {
  const { stdout } = await lancerCommande('powershell.exe', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exe}').VersionInfo.ProductVersion`])
  // Windows complète la version sur quatre nombres (0.1.0 devient 0.1.0.0)
  return stdout.trim().replace(/^(\d+\.\d+\.\d+)\.0$/, '$1')
}

async function lancerExe(exe: string, donnees: string): Promise<ElectronApplication> {
  return electron.launch({ executablePath: exe, args: [`--user-data-dir=${donnees}`] })
}

async function installer(setup: string, dossier: string): Promise<void> {
  // « /D= » doit être le dernier argument, sans guillemets ; « /S » : installation silencieuse
  await lancerCommande(setup, ['/S', `/D=${dossier}`], { timeout: 180_000 })
}

/** Arrête les processus lancés depuis ce dossier d'installation (et seulement eux : jamais une autre instance de la personne). */
async function arreterProcessus(dossier: string): Promise<void> {
  const script = `Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith('${dossier.replaceAll("'", "''")}', [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force`
  await lancerCommande('powershell.exe', ['-NoProfile', '-Command', script]).catch(() => undefined)
}

async function processusLances(dossier: string): Promise<number> {
  const script = `(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith('${dossier.replaceAll("'", "''")}', [StringComparison]::OrdinalIgnoreCase) }).Count`
  const { stdout } = await lancerCommande('powershell.exe', ['-NoProfile', '-Command', script])
  return Number(stdout.trim() || '0')
}

async function desinstaller(dossier: string): Promise<void> {
  await arreterProcessus(dossier)
  const exe = join(dossier, 'Uninstall SkillManagement.exe')
  if (!existsSync(exe)) return
  // « _?= » : le désinstalleur travaille sur place et on attend sa fin ; il ne s'efface pas lui-même
  await lancerCommande(exe, ['/S', `_?=${dossier}`], { timeout: 120_000 })
  rmSync(dossier, { recursive: true, force: true })
}

test.describe.configure({ mode: 'serial' })

test('application empaquetée : démarre, est vraiment empaquetée, et ignore les crochets de test', async () => {
  const exe = join(racineProjet, 'release', 'win-unpacked', 'SkillManagement.exe')
  test.skip(!existsSync(exe), 'lancer « npm run package » d’abord')
  expect(existsSync(join(racineProjet, 'release', 'win-unpacked', 'resources', 'app.asar'))).toBe(true)

  const donnees = mkdtempSync(join(tmpdir(), 'sm-pack-donnees-'))
  const app = await electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${donnees}`],
    // Ces crochets ne sont lus que par une application non empaquetée : ici, ils doivent être sans effet
    env: { ...process.env, SKILLMANAGEMENT_TEST_SKILLSPECTOR: 'aucun', SKILLMANAGEMENT_TEST_GITHUB: 'http://localhost:1', SKILLMANAGEMENT_TEST_DOSSIERS: tmpdir() }
  })
  try {
    expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true)
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quels assistants IA utilisez-vous ?')
    expect(await page.title()).toBe('SkillManagement')

    const acces = await page.evaluate(() => ({
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process
    }))
    expect(acces).toEqual({ require: 'undefined', process: 'undefined' })
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("default-src 'self'")

    const lire = <T>(canal: string) =>
      page.evaluate((c) => (window as unknown as { skillmanagement: { invoke(c: string): Promise<unknown> } }).skillmanagement.invoke(c), canal) as Promise<T>
    const info = await lire<{ version: string; plateforme: string; analyseApprofondie: { disponible: boolean } }>('app.info')
    expect(info).toMatchObject({ version: '0.1.0', plateforme: 'win32' })
    // Le crochet « sans analyse approfondie » est ignoré : la détection réelle fait foi (l'outil est dans le PATH ou non)
    const dansLePath = (process.env['PATH'] ?? '').split(';').some((d) => d && existsSync(join(d, 'skillspector.exe')))
    expect(info.analyseApprofondie.disponible).toBe(dansLePath)
    // Le stockage sécurisé de Windows est disponible dans l'application empaquetée
    expect((await lire<{ stockageSecurise: boolean }>('ia.etat')).stockageSecurise).toBe(true)
    // Cette construction n'a pas de source de mises à jour : elle le dit au lieu de faire semblant
    expect((await lire<{ statut: string }>('maj.etat')).statut).toBe('aucune-source')

    const etat = JSON.parse(readFileSync(join(donnees, 'state.json'), 'utf8'))
    expect(etat).toEqual({ version: 1, profile: null, projects: [], userSkills: [] })
    await page.getByRole('link', { name: 'Réglages' }).count() // l'écran de démarrage n'a pas de navigation : pas d'erreur attendue
  } finally {
    await app.close()
    rmSync(donnees, { recursive: true, force: true })
  }
})

test('installeur : installation silencieuse, lancement, désinstallation, données conservées', async () => {
  const setup = installeur('0.1.0')
  test.skip(!existsSync(setup), 'lancer « npm run package » d’abord')
  test.skip((await entreesDeDesinstallation()).length > 0, 'SkillManagement est déjà installé sur ce poste : le test ne le touche pas')

  const dossier = mkdtempSync(join(tmpdir(), 'sm-install-'))
  const donnees = mkdtempSync(join(tmpdir(), 'sm-install-donnees-'))
  try {
    await installer(setup, dossier)
    const exe = join(dossier, 'SkillManagement.exe')
    expect(existsSync(exe)).toBe(true)
    expect(existsSync(join(dossier, 'resources', 'app.asar'))).toBe(true)
    expect(existsSync(join(dossier, 'Uninstall SkillManagement.exe'))).toBe(true)
    expect(await versionDuFichier(exe)).toBe('0.1.0')
    // L'installeur déclare l'application à Windows (Paramètres > Applications)
    expect((await entreesDeDesinstallation()).length).toBeGreaterThan(0)

    // L'application installée démarre ; la personne crée son profil, qui reste sur son disque
    const app = await lancerExe(exe, donnees)
    try {
      const page = await app.firstWindow()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quels assistants IA utilisez-vous ?')
      await page.evaluate(() =>
        (window as unknown as { skillmanagement: { invoke(c: string, e: unknown): Promise<unknown> } }).skillmanagement.invoke('onboarding.terminer', {
          profil: { metier: 'juriste', aisance: 'debutant', assistants: ['claude-code'], objectifs: [] },
          slugs: []
        })
      )
    } finally {
      await app.close()
    }
    expect(JSON.parse(readFileSync(join(donnees, 'state.json'), 'utf8')).profile.metier).toBe('juriste')

    // Réinstaller par-dessus ne perd rien (même chemin que la mise à jour)
    await installer(setup, dossier)
    expect(JSON.parse(readFileSync(join(donnees, 'state.json'), 'utf8')).profile.metier).toBe('juriste')

    await desinstaller(dossier)
    expect(existsSync(exe)).toBe(false)
    expect(await entreesDeDesinstallation()).toEqual([])
    // Les données de la personne ne sont pas supprimées par la désinstallation
    expect(existsSync(join(donnees, 'state.json'))).toBe(true)
  } finally {
    await desinstaller(dossier).catch(() => undefined)
    rmSync(dossier, { recursive: true, force: true })
    rmSync(donnees, { recursive: true, force: true })
  }
})

async function executer(commande: string, env: Record<string, string> = {}): Promise<void> {
  const cmd = process.env['ComSpec'] ?? 'cmd.exe'
  await new Promise<void>((fin, echec) => {
    const enfant = spawn(
      cmd,
      ['/d', '/s', '/c', commande],
      { cwd: racineProjet, env: { ...process.env, ...env }, stdio: 'ignore' }
    )
    enfant.once('exit', (code) => (code === 0 ? fin() : echec(new Error(`« ${commande} » a échoué (code ${code})`))))
  })
}

const compiler = (): Promise<void> => executer('npm run build')
const construire = (version: string, sortie: string, urlMaj: string): Promise<void> =>
  executer(`npx electron-builder --config electron-builder.config.cjs --win nsis --config.extraMetadata.version=${version}`, { SM_UPDATE_URL: urlMaj, SM_SORTIE: sortie })

function servirDossier(dossier: string): Promise<{ serveur: Server; port: number; requetes: string[] }> {
  const requetes: string[] = []
  const serveur = createServer((req, res) => {
    const nom = decodeURIComponent((req.url ?? '/').split('?')[0]!.replace(/^\//, ''))
    requetes.push(nom)
    const fichier = join(dossier, nom)
    if (!nom || nom.includes('..') || !existsSync(fichier) || !statSync(fichier).isFile()) return void res.writeHead(404).end()
    res.writeHead(200, { 'Content-Length': statSync(fichier).size })
    import('node:fs').then(({ createReadStream }) => createReadStream(fichier).pipe(res))
  })
  return new Promise((resolvePort) => serveur.listen(0, '127.0.0.1', () => resolvePort({ serveur, port: (serveur.address() as AddressInfo).port, requetes })))
}

test('mise à jour : vérifiée, téléchargée et installée seulement sur demande, données conservées', async () => {
  test.setTimeout(20 * 60_000)
  test.skip((await entreesDeDesinstallation()).length > 0, 'SkillManagement est déjà installé sur ce poste : le test ne le touche pas')

  // L'application relancée par la mise à jour n'a pas nos arguments : elle crée le dossier de données par défaut.
  // On le supprime ensuite seulement s'il n'existait pas avant le test.
  const donneesParDefaut = join(process.env['APPDATA'] ?? '', 'SkillManagement')
  const existaitAvant = existsSync(donneesParDefaut)
  const travail = mkdtempSync(join(tmpdir(), 'sm-maj-'))
  const sortieAncienne = join(travail, 'v1')
  const sortieNouvelle = join(travail, 'v2')
  mkdirSync(sortieAncienne)
  mkdirSync(sortieNouvelle)
  const dossier = join(travail, 'installe')
  const donnees = join(travail, 'donnees')
  mkdirSync(donnees)

  // Le serveur de mises à jour sert les fichiers de la version 0.1.1 ; son adresse est inscrite dans les deux constructions
  const { serveur, port, requetes } = await servirDossier(sortieNouvelle)
  const url = `http://localhost:${port}`
  try {
    // Le code compilé est celui d'aujourd'hui : on ne se fie pas à un « out/ » ancien
    await compiler()
    await construire('0.1.1', sortieNouvelle, url)
    await construire('0.1.0', sortieAncienne, url)
    expect(existsSync(join(sortieNouvelle, 'latest.yml'))).toBe(true)
    expect(readFileSync(join(sortieNouvelle, 'latest.yml'), 'utf8')).toContain('version: 0.1.1')
    expect(existsSync(installeur('0.1.1', sortieNouvelle))).toBe(true)

    await installer(installeur('0.1.0', sortieAncienne), dossier)
    const exe = join(dossier, 'SkillManagement.exe')
    expect(await versionDuFichier(exe)).toBe('0.1.0')
    expect(readFileSync(join(dossier, 'resources', 'app-update.yml'), 'utf8')).toContain(url)

    const app = await lancerExe(exe, donnees)
    try {
      const page = await app.firstWindow()
      const invoquer = (canal: string, entree?: unknown) =>
        page.evaluate(([c, e]) => (window as unknown as { skillmanagement: { invoke(c: string, e?: unknown): Promise<unknown> } }).skillmanagement.invoke(c as string, e), [canal, entree] as const)
      // La personne a déjà un profil : la mise à jour ne doit pas le toucher
      await invoquer('onboarding.terminer', { profil: { prenom: 'Camille', metier: 'juriste', aisance: 'debutant', assistants: ['claude-code'], objectifs: [] }, slugs: [] })
      await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projets')

      // Rien ne part tant que la personne n'a pas demandé : aucune requête vers le serveur de mises à jour
      expect(requetes).toEqual([])
      await page.getByRole('link', { name: 'Réglages' }).click()
      await expect(page.getByRole('heading', { name: 'Mises à jour' })).toBeVisible()
      expect(requetes).toEqual([])

      await page.getByRole('button', { name: 'Vérifier maintenant' }).click()
      await expect(page.getByText('La version 0.1.1 est disponible.')).toBeVisible({ timeout: 30_000 })
      expect(requetes).toContain('latest.yml')
      // Disponible ne veut pas dire téléchargé : l'installeur n'a pas été demandé
      expect(requetes.some((r) => r.endsWith('.exe'))).toBe(false)

      await page.getByRole('button', { name: 'Télécharger la mise à jour' }).click()
      await expect(page.getByText(/est téléchargée\. L’application va se fermer/)).toBeVisible({ timeout: 180_000 })
      expect(await versionDuFichier(exe)).toBe('0.1.0') // téléchargée, pas encore installée
      await page.getByRole('button', { name: 'Redémarrer et installer' }).click()
    } finally {
      await app.close().catch(() => undefined)
    }

    // L'installation silencieuse remplace l'application puis la relance ; on attend la nouvelle version sur le disque
    await expect.poll(() => versionDuFichier(exe), { timeout: 180_000, intervals: [2000] }).toBe('0.1.1')
    await new Promise((r) => setTimeout(r, 4000))
    // Le relancement automatique est vérifié, puis on arrête ce processus pour libérer le fichier de verrou d'instance
    expect(await processusLances(dossier)).toBeGreaterThan(0)
    await arreterProcessus(dossier)

    // La nouvelle version démarre et retrouve les données de la personne
    const app2 = await lancerExe(exe, donnees)
    try {
      const page = await app2.firstWindow()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projets')
      await page.getByRole('link', { name: 'Réglages' }).click()
      await expect(page.getByText(/SkillManagement version 0\.1\.1/)).toBeVisible()
      await expect(page.getByLabel('Prénom')).toHaveValue('Camille')
    } finally {
      await app2.close()
    }
  } finally {
    serveur.closeAllConnections()
    serveur.close()
    await desinstaller(dossier).catch(() => undefined)
    if (!existaitAvant) rmSync(donneesParDefaut, { recursive: true, force: true })
    rmSync(travail, { recursive: true, force: true })
  }
})
