import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC } from '@shared/channels'
import { getCatalogue } from '@shared/data'
import { appInfoHandler } from './ipc/app'
import { isTrustedSender, wrapHandler } from './ipc/guard'
import type { Logger } from './log'
import { VersionFutureError } from './store/json-store'
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

function enregistrerIpc(): void {
  const trusted = (url: string): boolean => isTrustedSender(url, { devOrigin, rendererFile })
  const info = wrapHandler(
    appInfoHandler({ nom: app.getName(), version: app.getVersion(), plateforme: process.platform }),
    trusted
  )
  ipcMain.handle(IPC.appInfo, (event, raw) => info(event.senderFrame?.url ?? '', raw))
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
  void app.whenReady().then(async () => {
    try {
      getCatalogue() // échoue au démarrage si une donnée embarquée est invalide
      const { avis } = await creerStoreEtat(app.getPath('userData'), journal).load()
      if (avis) journal.info('Chargement des données', { avis })
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
    enregistrerIpc()
    creerFenetre()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) creerFenetre()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
