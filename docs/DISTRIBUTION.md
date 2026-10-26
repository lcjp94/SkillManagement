# Distribution — état M7 (Windows)

Seule la version **Windows x64** est produite (décision du 26 octobre 2026). Aucun installeur macOS ou Linux n'est construit.

Fichiers : `electron-builder.config.cjs` (installeur), `build/icon.png` (icône, générée par `scripts/icone.cjs`), `src/main/mises-a-jour.ts`, `src/renderer/src/screens/MiseAJour.tsx`, `e2e-installeur/installeur.spec.ts`, `playwright.installeur.config.ts`.

## Produire l'installeur

```
npm run package        # compile, puis construit release/SkillManagement-Setup-<version>.exe
npm run package:dir    # seulement le dossier release/win-unpacked (plus rapide, pour essayer)
npm run test:installeur
```

Mesuré ici : environ 40 secondes ; installeur de **119 Mio** (Electron et son navigateur intégré en représentent l'essentiel). Outils : `electron-builder` 26.17.0 et `electron-updater` 6.8.10 (versions publiées il y a plus d'un mois ; les plus récentes l'étaient du jour même et n'ont pas été retenues).

Installeur NSIS **par utilisateur** (pas d'élévation administrateur), assisté, en **français**, avec choix du dossier, raccourcis, entrée dans « Applications » de Windows. La désinstallation **conserve les données** de la personne (`%APPDATA%\SkillManagement`) : projets, profil, réglages, clés chiffrées, sauvegardes.

## Signature de code : facultative

Aucun certificat n'est utilisé : l'installeur n'est **pas signé**. Windows affiche donc l'alerte SmartScreen (« Windows a protégé votre ordinateur ») au premier lancement ; la personne choisit « Informations complémentaires » puis « Exécuter quand même ». C'est le comportement attendu par le porteur du projet.

Pour signer plus tard, sans changer le code : définir `CSC_LINK` (fichier ou contenu du certificat) et `CSC_KEY_PASSWORD` avant `npm run package` ; `electron-builder` signe alors l'application, le désinstalleur et l'installeur. Un certificat de signature de code ordinaire ne supprime pas l'alerte SmartScreen d'emblée (la réputation se construit) ; seul un certificat EV le fait tout de suite. Rien de cela n'a été essayé.

## Mises à jour

- **Jamais automatiques** : la personne clique sur « Vérifier maintenant » (Réglages), puis « Télécharger la mise à jour », puis « Redémarrer et installer ». Avant le premier clic, l'application n'envoie **aucune** requête (vérifié : le serveur de test n'en reçoit aucune). Disponible ne veut pas dire téléchargé : l'installeur n'est demandé qu'au deuxième clic (vérifié).
- L'installation attend qu'aucune écriture de skills ou d'état ne soit en cours, ferme l'application, installe en silence (même dossier), puis la rouvre. Les données sont conservées (vérifié : le prénom saisi avant la mise à jour est retrouvé).
- **Source des mises à jour**, choisie à la construction :
  - `SM_GITHUB_OWNER` + `SM_GITHUB_REPO` : « releases » d'un dépôt GitHub (il faut publier `latest.yml`, l'installeur et son `.blockmap` avec la release) ;
  - `SM_UPDATE_URL` : serveur de fichiers (utilisé par le test) ;
  - rien : aucun fichier de mise à jour n'est embarqué et l'écran dit « Cette version n'a pas de source de mises à jour configurée » (c'est le cas de la construction ordinaire, vérifié sur l'application empaquetée).
- **Authenticité** : sans signature, `electron-updater` contrôle l'empreinte du fichier téléchargé (donnée par `latest.yml`) mais ne peut pas vérifier l'éditeur. La confiance repose donc sur HTTPS et sur le compte qui publie. Signer les versions corrigerait cela.

## Ce qui est testé (`npm run test:installeur`, Windows 11)

1. **Application empaquetée** : démarre, `app.isPackaged` vrai, interface isolée, CSP présente, stockage sécurisé de Windows disponible, les crochets de test (`SKILLMANAGEMENT_TEST_*`) **sont sans effet**, la source de mises à jour absente est signalée.
2. **Installeur** : installation silencieuse dans un dossier temporaire (`/S /D=`), entrée dans le registre, exécutable et `app.asar` présents, version du fichier, lancement, données écrites, réinstallation par-dessus sans perte, désinstallation silencieuse (exécutable et entrée de registre disparus, données conservées). Ignoré si SkillManagement est déjà installé sur le poste.
3. **Mise à jour de bout en bout** : le test construit deux versions (0.1.0 et 0.1.1), sert la seconde depuis un serveur local, installe la première, vérifie, télécharge, redémarre, et contrôle que la version installée est 0.1.1 et que les données sont intactes. Le test nettoie ce qu'il crée (dossier de données par défaut créé par le relancement automatique, processus lancés depuis son dossier).

## Défaut trouvé par ces tests

`electron-updater` est un module CommonJS : l'import nommé `import { autoUpdater } from 'electron-updater'` **plantait au chargement** de l'application empaquetée (ES modules), silencieusement, avec une fenêtre jamais ouverte. Le mode développement et les parcours ordinaires ne le montraient pas. Corrigé (import par défaut). Un second défaut, trouvé par le test de mise à jour : l'état initial « inactive » masquait le bouton « Vérifier maintenant » dans l'application installée.

## Limites connues

- **Jamais exécuté sur GitHub Actions** : la CI (installeur, test d'installeur, téléversement de l'artefact) n'a jamais tourné, faute de dépôt distant. Le test de mise à jour installe réellement l'application sur le poste qui le lance (dans un dossier temporaire, nettoyé ensuite).
- **Source GitHub des mises à jour non essayée** : le test utilise un serveur local ; une vraie release GitHub n'a pas été publiée.
- **Aucune signature** : alerte SmartScreen, et pas de vérification de l'éditeur à la mise à jour.
- **Fusibles Electron non durcis** (par exemple l'inspection par ligne de commande reste active) : nécessaire pour que Playwright pilote l'application empaquetée ; un durcissement demanderait de tester une autre construction que celle qui est livrée.
- **x64 seulement** (pas d'ARM64) ; Windows 10 ou 11 supposé, seul Windows 11 est essayé.
- **Mise à jour silencieuse** : elle suppose que l'installation par utilisateur reste au même emplacement ; un dossier d'installation déplacé à la main n'est pas géré.
- Le test d'installation ne vérifie pas visuellement l'assistant de l'installeur (il est lancé en mode silencieux) : le texte français de l'assistant n'a jamais été relu par un humain.
- L'icône est un dessin simple généré par script, pas un travail de graphiste.
