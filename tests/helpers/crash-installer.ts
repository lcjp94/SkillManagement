// Processus enfant du test de coupure : installe puis désinstalle tout le catalogue en boucle, jusqu'à être tué de l'extérieur.
import { join } from 'node:path'
import { creerScanner } from '../../src/main/core/scan'
import { appliquer } from '../../src/main/fs/deploiement'
import { desinstaller } from '../../src/main/fs/retrait'
import { getCatalogue } from '../../src/shared/data'

const [racine, donnees, home] = process.argv.slice(2) as [string, string, string]
const { skills, scanRules } = getCatalogue()
const ctx = {
  dossierDonnees: donnees,
  env: { dossierPersonnel: home, donneesApp: donnees, systeme: [join(donnees, '..', 'systeme')] },
  scanner: creerScanner(scanRules)
}
const liste = skills.map(({ slug, name, description, content }) => ({ slug, name, description, content }))

let annonce = false
for (;;) {
  const p = appliquer(ctx, { cible: 'claude-code', racine, portee: 'projet', skills: liste })
  if (!annonce) {
    annonce = true
    console.log('pret')
  }
  await p
  await desinstaller(ctx, { racine, portee: 'projet', cible: 'claude-code', slugs: 'tous' })
}
