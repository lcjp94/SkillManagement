// Écrans natifs (sélecteur de dossier, ouverture, enregistrement). Aucun chemin venant de l'interface n'est utilisé ici.
import { BrowserWindow, app, dialog, shell } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { TAILLE_MAX_IMPORT } from './core/echange'
import { ecrireAtomique } from './fs/atomic'
import type { Dialogues } from './services/contexte'

// Crochets de test : un test de bout en bout ne peut pas piloter un écran natif. Ils ne sont lus que par
// une application non empaquetée, donc jamais dans la version installée par la personne.
const crochet = (nom: string): string | undefined => (app.isPackaged ? undefined : process.env[nom])

export function creerDialogues(): Dialogues {
  const fenetre = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  // SKILLMANAGEMENT_TEST_DOSSIERS : liste de dossiers séparés par « | », consommés un par appel
  const dossiersDeTest = crochet('SKILLMANAGEMENT_TEST_DOSSIERS')?.split('|').filter(Boolean)

  return {
    async choisirDossier() {
      if (dossiersDeTest) return dossiersDeTest.shift() ?? null
      const options = { title: 'Choisir le dossier du projet', properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
      const w = fenetre()
      const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    async ouvrirDossier(chemin) {
      if (crochet('SKILLMANAGEMENT_TEST_DOSSIERS')) return
      await shell.openPath(chemin)
    },
    async lireFichierProjet() {
      let chemin = crochet('SKILLMANAGEMENT_TEST_IMPORT')
      if (!chemin) {
        const options = { title: 'Importer un projet', filters: [{ name: 'Projet SkillManagement', extensions: ['json'] }], properties: ['openFile' as const] }
        const w = fenetre()
        const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
        chemin = r.canceled ? undefined : r.filePaths[0]
      }
      if (!chemin) return null
      // Un fichier démesuré n'est jamais lu en entier
      if ((await stat(chemin)).size > TAILLE_MAX_IMPORT) return 'x'.repeat(TAILLE_MAX_IMPORT + 1)
      return readFile(chemin, 'utf8')
    },
    async enregistrerFichierProjet(nomSuggere, contenu) {
      let chemin = crochet('SKILLMANAGEMENT_TEST_EXPORT')
      if (!chemin) {
        const options = { title: 'Exporter le projet', defaultPath: join(app.getPath('documents'), nomSuggere), filters: [{ name: 'Projet SkillManagement', extensions: ['json'] }] }
        const w = fenetre()
        const r = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options)
        chemin = r.canceled ? undefined : r.filePath
      }
      if (!chemin) return false
      await ecrireAtomique(chemin, contenu)
      return true
    }
  }
}
