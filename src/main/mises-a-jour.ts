// Mises à jour de l'application (electron-updater). Jamais automatiques : la personne vérifie, télécharge, puis choisit
// de redémarrer. Rien ne part sur internet tant qu'elle n'a pas cliqué sur « Vérifier ».
import { app } from 'electron'
// electron-updater est en CommonJS : ses exports nommés ne s'importent pas depuis un module ES
import electronUpdater from 'electron-updater'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MiseAJourVue } from '@shared/contrat'
import { exclusif } from './fs/verrou'
import type { Logger } from './log'
import type { MiseAJour } from './services/contexte'

const { autoUpdater } = electronUpdater

export function creerMiseAJour(journal: Logger): MiseAJour {
  // Une source est embarquée mais rien n'a encore été vérifié : la personne n'a pas demandé de vérification
  let etat: MiseAJourVue = { statut: 'a-verifier' }
  let configure = false

  // electron-updater ne fonctionne que dans l'application installée, et seulement si la construction a embarqué une source
  const sourceEmbarquee = app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))

  function preparer(): void {
    if (configure) return
    configure = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = null
    autoUpdater.on('download-progress', (p) => {
      etat = { statut: 'telechargement', version: etat.version, progression: Math.round(p.percent) }
    })
    autoUpdater.on('update-downloaded', (info) => {
      etat = { statut: 'pret', version: info.version }
    })
  }

  const etatPublic = (): MiseAJourVue => {
    if (!app.isPackaged) return { statut: 'inactive', message: 'Les mises à jour ne concernent que l’application installée.' }
    if (!sourceEmbarquee) return { statut: 'aucune-source', message: 'Cette version n’a pas de source de mises à jour configurée.' }
    return etat
  }

  return {
    etat: etatPublic,

    async verifier() {
      if (!app.isPackaged) return etatPublic()
      if (!sourceEmbarquee) return etatPublic()
      preparer()
      try {
        const r = await autoUpdater.checkForUpdates()
        const disponible = r?.updateInfo?.version && r.isUpdateAvailable
        etat = disponible ? { statut: 'disponible', version: r.updateInfo.version } : { statut: 'a-jour', version: app.getVersion() }
      } catch (e) {
        journal.warn('vérification des mises à jour impossible', { type: e instanceof Error ? e.name : 'inconnu' })
        etat = { statut: 'erreur', message: 'La vérification a échoué. Vérifiez votre connexion internet et réessayez.' }
      }
      return etat
    },

    async telecharger() {
      if (etat.statut !== 'disponible') return
      preparer()
      etat = { statut: 'telechargement', version: etat.version, progression: 0 }
      try {
        await autoUpdater.downloadUpdate()
      } catch (e) {
        journal.warn('téléchargement de la mise à jour impossible', { type: e instanceof Error ? e.name : 'inconnu' })
        etat = { statut: 'erreur', message: 'Le téléchargement a échoué. Réessayez dans un moment.' }
      }
    },

    async installer() {
      if (etat.statut !== 'pret') return
      // On attend qu'aucune écriture de skills ni d'état ne soit en cours avant de quitter
      await exclusif(async () => undefined)
      autoUpdater.quitAndInstall(true, true)
    }
  }
}
