import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import log from 'electron-log/main'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CANAUX } from '@shared/channels'
import { getCatalogue } from '@shared/data'
import { CoffreCles } from './ai/coffre'
import { Redactions } from './ai/redactions'
import { creerScanner } from './core/scan'
import { creerDialogues } from './dialogues'
import { environnementReel } from './fs/perimetre'
import { reprendreInterrompus } from './fs/retrait'
import { isTrustedSender } from './ipc/guard'
import type { Logger } from './log'
import { ReglagesStockesSchema, type ReglagesStockes } from '@shared/schemas/reglages'
import { SkillSpector } from './securite/skillspector'
import { CONFIG_PAR_DEFAUT, Sources } from './sources/github'
import { identifiant, type Services } from './services/contexte'
import { MARQUE_MESSAGE, appeler } from './services/registre'
import { VersionFutureError, JsonStore } from './store/json-store'
import { creerStoreEtat } from './store/state-store'

log.initialize()
const journal: Logger = {
  info: (message, meta) => (meta ? log.info(message, meta) : log.info(message)),
  warn: (message, meta) => (meta ? log.warn(message, meta) : log.warn(message)),
  error: (message, meta) => (meta ? log.error(message, meta) : log.error(message))
}

const rendererFile = pathToFileURL(join(__dirname, '../renderer/index.html')).href
const devOrigin = process.env['ELECTRON_RENDERER_URL']

function creerFenetre(): void {
  const fenetre = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'SkillManagement',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  fenetre.once('ready-to-show', () => fenetre.show())

  // Aucune navigation hors de l'application ; liens externes en https uniquement
  fenetre.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedSender(url, { devOrigin, rendererFile })) event.preventDefault()
  })
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (devOrigin) void fenetre.loadURL(devOrigin)
  else void fenetre.loadFile(join(__dirname, '../renderer/index.html'))
}

function enregistrerIpc(services: Services): void {
  const trusted = (url: string): boolean => isTrustedSender(url, { devOrigin, rendererFile })
  for (const canal of CANAUX) {
    ipcMain.handle(canal, (event, raw) => {
      if (!trusted(event.senderFrame?.url ?? '')) throw new Error(`${MARQUE_MESSAGE}Appel refusé.`)
      return appeler(services, canal, raw)
    })
  }
}

// Instance unique : une seconde ouverture remet la fenêtre existante au premier plan
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [fenetre] = BrowserWindow.getAllWindows()
    if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore()
      fenetre.focus()
    }
  })
  let services: Services
  void app.whenReady().then(async () => {
    try {
      const catalogue = getCatalogue() // échoue au démarrage si une donnée embarquée est invalide
      const dossierDonnees = app.getPath('userData')
      const etat = creerStoreEtat(dossierDonnees, journal)
      const { avis } = await etat.load()
      if (avis) journal.info('Chargement des données', { avis })
      const reglages = new JsonStore<ReglagesStockes>({
        fichier: join(dossierDonnees, 'settings.json'),
        versionCourante: 1,
        schema: ReglagesStockesSchema,
        creer: () => ({ version: 1 as const, theme: 'auto' as const }),
        journal,
        mode: 0o600
      })
      await reglages.load()
      const ctx = {
        dossierDonnees,
        env: environnementReel(homedir(), dossierDonnees),
        scanner: creerScanner(catalogue.scanRules),
        journal
      }
      // Une installation coupée par un arrêt brutal est remise en ordre avant d'ouvrir la fenêtre
      const reprises = (await reprendreInterrompus(ctx)).length
      // Les clés d'API sont chiffrées par le système (DPAPI sous Windows) ; sans lui, aucune clé n'est enregistrée
      const coffre = new CoffreCles(join(dossierDonnees, 'secrets.bin'), {
        disponible: () => safeStorage.isEncryptionAvailable(),
        chiffrer: (texte) => safeStorage.encryptString(texte),
        dechiffrer: (octets) => safeStorage.decryptString(octets)
      })
      // Crochets de test, lus seulement par une application non empaquetée
      const testBase = app.isPackaged ? undefined : process.env['SKILLMANAGEMENT_TEST_GITHUB']
      const sansOutil = !app.isPackaged && process.env['SKILLMANAGEMENT_TEST_SKILLSPECTOR'] === 'aucun'
      const skillspector = new SkillSpector(sansOutil ? { executable: null } : {})
      const analyseApprofondie = await skillspector.info()
      services = {
        etat,
        reglages,
        ctx,
        catalogue,
        info: { nom: app.getName(), version: app.getVersion(), plateforme: process.platform, reprises, analyseApprofondie },
        dialogues: creerDialogues(),
        nouvelId: identifiant,
        maintenant: () => new Date(),
        imports: new Map(),
        coffre,
        coffreDisponible: safeStorage.isEncryptionAvailable(),
        redactions: new Redactions(),
        reseau: {},
        skillspector,
        sources: new Sources(testBase ? { apiBase: `${testBase}/api`, rawBase: `${testBase}/raw` } : CONFIG_PAR_DEFAUT)
      }
    } catch (erreur) {
      journal.error('Démarrage impossible', { type: erreur instanceof Error ? erreur.name : 'inconnu' })
      dialog.showErrorBox(
        'SkillManagement',
        erreur instanceof VersionFutureError
          ? erreur.message
          : "Les données de l'application n'ont pas pu être ouvertes. Fermez l'application puis relancez-la ; si le problème continue, joignez le fichier journal à votre demande d'aide."
      )
      app.quit()
      return
    }
    enregistrerIpc(services)
    creerFenetre()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) creerFenetre()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
