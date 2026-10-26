// Installeur Windows (NSIS). Seule la version Windows est produite (décision du 26 octobre 2026).
//
// Signature de code : FACULTATIVE. Sans certificat, l'installeur n'est pas signé et Windows affiche une alerte
// SmartScreen que la personne gère. Pour signer plus tard : variables CSC_LINK et CSC_KEY_PASSWORD (docs/DISTRIBUTION.md).
//
// Source des mises à jour, selon l'environnement de construction. Sans source, aucun fichier de mise à jour n'est
// embarqué et la vérification dit honnêtement qu'aucune source n'est configurée :
//   SM_GITHUB_OWNER + SM_GITHUB_REPO : « releases » d'un dépôt GitHub ;
//   SM_UPDATE_URL : serveur de fichiers (utilisé par le test de mise à jour, jamais pour la diffusion).
const { env } = process

function publication() {
  if (env.SM_GITHUB_OWNER && env.SM_GITHUB_REPO) return [{ provider: 'github', owner: env.SM_GITHUB_OWNER, repo: env.SM_GITHUB_REPO }]
  if (env.SM_UPDATE_URL) return [{ provider: 'generic', url: env.SM_UPDATE_URL }]
  return null
}

module.exports = {
  appId: 'fr.skillmanagement.app',
  productName: 'SkillManagement',
  copyright: 'Copyright © 2026 SkillManagement, licence MIT',
  directories: { output: env.SM_SORTIE || 'release', buildResources: 'build' },
  files: ['out/**/*', 'package.json', 'LICENSE'],
  asar: true,
  // Aucun module natif : rien à reconstruire
  npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.png' },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    // Installeur en français (identifiant de langue Windows 1036)
    language: '1036',
    installerLanguages: ['fr_FR'],
    artifactName: 'SkillManagement-Setup-${version}.${ext}',
    shortcutName: 'SkillManagement',
    uninstallDisplayName: 'SkillManagement'
  },
  publish: publication()
}
