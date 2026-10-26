# SkillManagement — dossier de reprise pour Claude Code (développement from scratch)

Version du dossier : 26 octobre 2026. Auteur : session Claude Code précédente, à la demande du porteur du projet.

> **Comment utiliser ce fichier.** Créez un dossier vide pour le nouveau dépôt, copiez-y ce fichier sous le nom `CLAUDE.md`, puis lancez Claude Code dedans. Ce fichier est **autonome** : il contient tout ce qu'il faut savoir sans avoir vu les conversations précédentes. Le dépôt historique (§ 3) sert de **référence en lecture seule**, jamais de base de code à copier en bloc.
>
> **Premier message à envoyer** : « Lis CLAUDE.md en entier. Pose-moi en un seul message les questions du § 19 dont la réponse change ce que tu fais, avec ta recommandation pour chacune, puis commence le jalon M0. »

---

## 1. Mission

Construire **SkillManagement** : une application de bureau **autonome, mono-utilisateur, universelle (Windows, macOS, Linux)** qui sert à **gérer des skills** d'assistants IA, organisés **par projet**.

Une personne (développeuse ou non : juriste, enseignant, RH, marketeur…) :
1. répond à quelques questions (son assistant IA, son métier, son aisance) ;
2. crée un **projet** nommé qui décrit un besoin (« je suis juriste, mais je veux faire du SEO et publier sur les réseaux sociaux ») ;
3. reçoit des **conseils de skills** adaptés, avec les raisons ;
4. **applique** le projet : l'application écrit les skills et l'arborescence dans le dossier choisi, au bon format pour l'assistant visé ;
5. **retrouve, modifie, duplique et réapplique** ce projet plus tard, ailleurs ou pour un autre assistant ;
6. peut **retirer** tout ou partie de ce qui a été installé, sans jamais perdre un fichier qui ne vient pas de l'application.

**Hors périmètre** : mesure d'usage des skills (impossible : l'application ne voit pas ce que fait l'assistant), comptes et connexion, synchronisation en ligne, version web, Docker, discussion avec une IA, application mobile, magasins d'applications.

Le public n'est pas technique : **aucun JSON à éditer, aucun terminal, aucun fichier de configuration à ouvrir.** Toute l'interface est **en français**.

---

## 2. Règles de travail (obligatoires)

Elles viennent du porteur du projet et de ce qui a mal tourné dans la première version.

1. **Chercher avant d'écrire.** Avant toute fonctionnalité, vérifier qu'une bibliothèque mature ne la fournit pas déjà (lecture du frontmatter, écriture atomique, verrous, validation, mise à jour automatique, etc.). Pour chaque dépendance retenue : vérifier licence compatible MIT, maintenance récente et version exacte (`npm view`), et ne pas ajouter de dépendance native (voir § 14) sans justification.
2. **Dire la vérité sur l'état.** Ne jamais afficher « installé », « à jour » ou « utilisé » sans l'avoir recalculé depuis le disque. Ne jamais déclarer « terminé » sans avoir exécuté les vérifications du § 17 et lu leur sortie. Si un test échoue ou n'a pas été lancé, le dire.
3. **Ne rien affirmer de non vérifié sur les plateformes.** Le poste de développement est **Windows 11** (PowerShell et Git Bash). macOS et Linux ne sont **pas** testables localement : leur support se prouve par la CI (§ 14), jamais par supposition.
4. **Confirmer avant ce qui est difficile à annuler** (suppression, écrasement, publication, envoi). Ne jamais utiliser `git push --force`, `reset --hard` ni suppression récursive sans accord explicite.
5. **Ne jamais tuer « tous les processus node ».** Pour libérer un port, arrêter uniquement le processus qui y écoute. Ne pas toucher à une instance de l'application que la personne a ouverte pour ses tests sans son accord.
6. **L'élévation administrateur ne peut venir que de la personne** (invite UAC). Ne pas la contourner.
7. **Aucun secret en clair** : ni dans le code, ni dans les journaux, ni dans les fichiers exportés, ni dans les messages d'erreur. Les exemples utilisent des valeurs `<A_GENERER>`.
8. **Écrire du code qui ressemble au code voisin** : mêmes noms, même densité de commentaires, même idiome. Commentaires en français, qui expliquent le *pourquoi*.
9. **Scripts de modification de fichiers** : utiliser les outils d'édition, pas des heredocs ou `sed` contenant des apostrophes (la première version a produit plusieurs chaînes TypeScript cassées ainsi). Dans les messages d'erreur contenant des apostrophes, utiliser des guillemets doubles ou des gabarits.
10. **Pronoms** : sans indication, utiliser *they/them* (« la personne », « iel » à éviter) ; ne jamais déduire un genre d'un prénom. Dans l'interface, tutoiement interdit, vouvoiement neutre, formulations épicènes (« la personne », « votre assistant »).
11. **Git** : commits conventionnels (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `skill:`), un commit par jalon vérifié, message terminé par `Co-Authored-By: Claude <noreply@anthropic.com>`. Si l'identité git n'est pas configurée, la passer avec `-c user.name=… -c user.email=…` sans modifier la configuration globale. Ne pas pousser sans demande.
12. **Faire court dans les réponses à la personne** : dire ce qui est fait, vérifié, et ce qui reste incertain.

---

## 3. Dépôt historique à consulter (lecture seule)

Chemin : `C:\Users\jp\OneDrive\Documents\Dev\Claude\SkillForge\skillforge-oss` (Next.js + Prisma + Electron ; ne **pas** le modifier).

**À reprendre** (copier dans le nouveau dépôt, sous `src/shared/data/` ou équivalent) :

| Fichier | Contenu | Remarque |
|---|---|---|
| `data/skills.json` | 102 skills intégrés (`name, slug, category, description, environments, tokenEstimate, tags, personas, levels, content`) | 16 catégories dont juridique, enseignement, rh, finance. À valider avec zod au chargement |
| `data/profiles.json` | Métiers (`natures`), niveaux, poids, objectifs → catégories | Source de vérité du moteur de recommandation |
| `data/scan-rules.json` | 12 règles de pré-analyse, normalisation NFKC | Motifs **sans** lookahead, lookbehind ni référence arrière (conserver cette contrainte) |

**À relire pour s'en inspirer** (puis réécrire proprement, avec tests) :

| Fichier | Intérêt |
|---|---|
| `lib/skill-scan.ts`, `tests/skill-scan.test.ts`, `tests/scan-evasion.test.ts` | Moteur de pré-analyse et cas d'évasion testés (caractères invisibles, casse…) |
| `lib/recommend.ts`, `tests/recommend.test.ts`, `tests/parity/golden.json` | Algorithme de recommandation et résultats de référence |
| `lib/apply-layout.ts`, `lib/apply.ts`, `lib/apply-skills.ts`, `tests/apply.test.ts` | Dispositions par assistant, écriture sécurisée, manifestes, annulation, désinstallation (47 tests) |
| `lib/skill-sources.ts` | Sources GitHub par défaut (`DEFAULT_SOURCES`), parsing de `SKILL.md`, hash sha256. Vérifier la licence de chaque dépôt avant de redistribuer |
| `lib/llm.ts`, `lib/llm-presets.ts`, `app/api/settings/ai/test/route.ts` | Appel d'un fournisseur compatible OpenAI, garde contre les adresses dangereuses, test de connexion |
| `lib/tree.ts`, `lib/constants.ts` (`DIRECTORY_TEMPLATES`) | Gabarits d'arborescence et estimation d'espace |
| `docs/PLAN-BUREAU-SIMPLE.md`, `docs/skillmanagement.md`, `docs/REPRISE.md` | Réflexions antérieures. En cas de divergence, **ce fichier prévaut** |

**À ne pas reprendre** : Next.js, Prisma, PostgreSQL, PGlite, Auth.js, connexion/inscription, Docker, CLI Python, routes `/api`, rendu côté serveur.

---

## 4. Vocabulaire et modèle mental

| Terme | Sens exact |
|---|---|
| **Skill** | Une consigne réutilisable pour un assistant IA : nom, description, corps en Markdown. Format source : `SKILL.md` avec frontmatter (`name`, `description`). Le mot « skill » est **conservé** dans l'interface |
| **Assistant** (cible) | Claude Code, Cursor, Windsurf, GitHub Copilot, Aider, Continue, Cline, OpenCode. Détermine **où et sous quelle forme** les skills sont écrits. Il ne dépend **d'aucune clé d'API** |
| **Profil** | Métier, aisance (débutant, intermédiaire, expert), assistants utilisés. Un seul par installation |
| **Projet** | Une **recette** nommée : besoins, skills retenus et écartés, arborescence, assistants, dossier mémorisé. N'écrit rien sur le disque par lui-même |
| **Déploiement** | L'application concrète d'un projet pour **un assistant dans un dossier** : fichiers réellement écrits, décrits par un manifeste |
| **Sélectionné** | Présent dans un projet (état de la recette) |
| **Installé** | Écrit sur le disque (état recalculé en lisant le disque, jamais mémorisé) |

**Règle d'or de l'interface** : « sélectionné » et « installé » ne sont jamais confondus. Une première version affichait « 12 skills installés » alors que rien n'était écrit ; c'était le premier retour de test.

---

## 5. Pile technique (décision par défaut, à confirmer au jalon M0)

Puisque web, Docker et multi-utilisateur disparaissent, le serveur Next, Prisma et PostgreSQL n'ont plus de raison d'être.

| Couche | Choix par défaut | Pourquoi |
|---|---|---|
| Coque | **Electron** (dernière version stable ; la première version a fonctionné avec Electron 45 et electron-builder 26 sous Windows) | Mature, un seul code pour trois systèmes, accès fichiers en Node, nombreuses bibliothèques. Poids d'installeur d'environ 140 Mo, accepté |
| Langage | **TypeScript** partout, `strict` | Un seul langage entre processus principal et interface |
| Interface | **React + Vite**, Tailwind, composants accessibles (shadcn/ui ou Radix), thème clair par défaut et sombre selon le système, un seul bleu d'accentuation, polices système | Style sobre « Apple » demandé ; WCAG 2.1 AA |
| Validation | **zod** pour tout ce qui franchit une frontière (IPC, fichiers lus, réponses réseau) | Entrées toujours hostiles |
| Stockage | **Fichiers JSON versionnés** dans le dossier de données de l'application, écriture atomique, copie de sauvegarde, migration par numéro de version | Quelques dizaines de Ko ; aucune dépendance native, donc identique sur les trois systèmes |
| Secrets | **`safeStorage`** d'Electron (DPAPI, trousseau macOS, libsecret) | Voir § 12 |
| Tests | **Vitest** (logique), **Playwright** pour Electron (parcours de bout en bout) | |
| Distribution | `electron-builder` + `electron-updater` | |

**Alternative écartée pour l'instant** : Tauri 2 avec un cœur Rust (installeur beaucoup plus léger). Elle suppose d'écrire la logique en Rust et d'avoir WebView2 / WebKitGTK ; l'écosystème est moins familier pour le public de contributeurs visé. À reconsidérer seulement si le poids de l'installeur devient bloquant.

**Si une bibliothèque de stockage embarquée s'impose** (par exemple si les données grossissent), préférer SQLite via le module intégré à Node s'il est disponible dans la version de Node d'Electron, **à vérifier avant de s'y engager** ; éviter les modules natifs compilés par plateforme.

---

## 6. Architecture

```
src/
  main/            Processus principal (Node) : fenêtres, IPC, tout accès disque et réseau
    ipc/           Un fichier par domaine : profile, projects, catalog, recommend, deploy, tree, ai, sources
    core/          Logique pure, SANS Electron ni accès disque direct (testable seule)
      scan.ts        pré-analyse de sécurité
      recommend.ts   moteur de conseil
      layouts.ts     dispositions par assistant
      blocks.ts      blocs balisés dans les fichiers partagés
      tree.ts        gabarits d'arborescence et estimation d'espace
    fs/            Accès disque : écriture atomique, périmètre sûr, manifestes, sauvegardes, annulation
    store/         État JSON versionné, migrations, verrou
    ai/            Fournisseurs compatibles OpenAI, garde d'adresses, test de connexion, génération
    sources/       Recherche GitHub, import
  preload/         Pont typé exposé à l'interface (contextBridge) : la SEULE surface entre les deux mondes
  renderer/        React : écrans, composants, aucun accès Node
  shared/          Types, schémas zod, données (skills/profiles/scan-rules)
tests/
```

**Règles d'isolation (sécurité, non négociables)**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` ; le `renderer` n'a aucun accès Node.
- **Aucun serveur HTTP local.** Toute communication passe par l'IPC d'Electron (`ipcMain.handle`). (La première version utilisait un serveur local et il a fallu envisager un jeton pour empêcher une page web de l'appeler : ce risque disparaît.)
- Chaque handler IPC **valide son entrée avec zod**, vérifie l'origine de l'appelant, et ne renvoie jamais de secret.
- Politique CSP stricte dans le HTML ; aucun contenu distant chargé dans la fenêtre ; `will-navigate` et `setWindowOpenHandler` refusent toute navigation hors de l'application ; les liens externes passent par `shell.openExternal` limité à `https:`.
- Instance unique (`app.requestSingleInstanceLock`) ; et un verrou en mémoire (mutex) autour de toute écriture d'état ou de manifeste. (La première version n'en avait pas : point resté ouvert à sa revue de code.)

**Commandes IPC (liste de départ)** : `profile.get/set` · `projects.list/get/create/update/duplicate/archive/delete/export/import` · `catalog.list/search` · `recommend.forProject` · `scan.content` · `deploy.preview/apply/undo/uninstall/listInstalled` · `tree.preview/apply` · `ai.getSettings/saveSettings/test/generate` · `sources.search/preview/import` · `updates.check` · `dialog.pickFolder` · `shell.openFolder`.

---

## 7. Modèle de données (schémas zod à écrire)

Dossier de données : `app.getPath('userData')`.

```
state.json               { version, profile, projects[], userSkills[] }   + state.json.bak (copie précédente)
settings.json            réglages non secrets (fournisseur, adresse, modèle, thème, dernier dossier)
secrets.bin              clés d'API chiffrées par safeStorage
applications/<id>.json   un manifeste par déploiement (voir § 10)
backups/<id>/...         fichiers remplacés, sauvegardés avant écriture
```

```ts
Profile  = { prenom?: string; metier: string /* id de natures */; aisance: 'debutant'|'intermediaire'|'expert';
             assistants: string[] /* ids de layouts */; objectifs: string[] }

Project  = { id; nom: string /* unique, 1-80 car., sans noms réservés Windows */; description?: string;
             besoins: string[]; metier?: string; aisance?: ...;           // surcharges du profil
             assistants: string[];
             skills: { slug: string; origine: 'recommande'|'manuel'|'ia'|'importe'; ecarte: boolean }[];
             arborescence: { gabarit: string; extras: string[] };
             dossiers: Record<assistantId, string>;                      // dossier mémorisé par assistant
             archiveLe?: string; creeLe: string; modifieLe: string }

Skill    = { slug; name; category; description; environments[]; tokenEstimate; tags[]; personas[]; levels[]; content;
             source: 'integre'|'genere'|'importe'; sourceRepo?; sourcePath?; sourceHash?; scan?: 'clean'|'warning'|'danger' }
```

- `slug` : `^[a-z0-9]+(-[a-z0-9]+)*$`, 64 caractères au plus (utilisé comme nom de dossier ou de fichier ; règle la plus stricte des assistants vérifiés, celle d'OpenCode, voir `docs/ASSISTANTS.md`). Les 102 skills intégrés la respectent.
- Les skills **intégrés** sont en lecture seule (chargés depuis `shared/data/skills.json`) ; les skills générés ou importés vont dans `userSkills`.
- Chaque lecture de fichier d'état passe par zod ; un fichier illisible ou d'une version future **n'est jamais écrasé** : sauvegarde, message clair, retour à `state.json.bak`.
- Écriture atomique : écrire dans un fichier temporaire du **même dossier**, vider les tampons, puis renommer ; garder `.bak`. Utiliser une bibliothèque existante si elle est saine (`write-file-atomic`, `proper-lockfile` à évaluer).

---

## 8. Conseil de skills (moteur déterministe)

**Pas d'IA pour conseiller** : le moteur est déterministe, explicable, hors ligne. Une IA, si elle est configurée, ne sert qu'à rédiger un skill manquant ou à reformuler un besoin ; elle ne choisit jamais seule ce qui est installé.

### 8.1 Algorithme de référence (reprise du moteur existant)

Entrées : métier (`nature`), aisance (`level`), objectifs, assistants (`environments`), objectif libre. Pour chaque skill du catalogue :

1. Écarter si `skill.levels` est non vide et ne contient pas le niveau.
2. Écarter si des assistants sont fournis, que le skill a des `environments`, et qu'aucun ne correspond.
3. Score cumulé (poids de `profiles.json`) :
   - catégorie du skill ∈ catégories des objectifs : **+40** ;
   - catégorie = première catégorie du métier : **+30** ; autre catégorie du métier : **+20** ;
   - `personas` contient le métier : **+25** ; sinon, si le skill vise explicitement d'autres métiers et que le métier n'est pas « autre » : **−15** ;
   - `levels` contient le niveau : **+10** ; assistant correspondant : **+10** ;
   - mots significatifs (4 lettres et plus, sans accents ni casse) de l'objectif libre présents dans nom, description ou étiquettes : **+15 par mot, plafond +30**.
4. Trier par score décroissant, puis `tokenEstimate` croissant, puis `slug`.
5. Retenir en respectant les plafonds du niveau : nombre maximal de skills (**6 / 12 / 20**), budget de contexte (**2 500 / 5 000 / 9 000** tokens), maximum par catégorie (**2 / 4 / 5**), score minimal (**40 / 35 / 30**).
6. Renvoyer pour chaque skill ses **raisons** en français (« Correspond à vos objectifs », « Pensé pour votre métier »…).

Les résultats de référence sont dans `tests/parity/golden.json` du dépôt historique : **les rejouer** comme test de non-régression.

### 8.2 Extension pour les projets (à concevoir et calibrer en M3)

- Ajouter dans `profiles.json` une table **`besoins`** : pour chaque besoin, un libellé, des catégories et des mots-clés. Proposition de départ (à calibrer par test, pas à croire) :

| Besoin | Catégories | Mots-clés |
|---|---|---|
| Référencement (SEO) | marketing, rédaction | seo, référencement, mots-clés, contenu web |
| Publication sur les réseaux sociaux | réseaux sociaux | linkedin, publication, calendrier, social |
| Rédaction de contenu web | rédaction | rédaction, article, contenu |
| Newsletter | rédaction, marketing | newsletter, emailing |
| Veille et recherche | recherche | veille, recherche, sources |
| Analyse de données | data | données, statistiques, tableau |
| Présentations | productivité, design | présentation, slides |
| Vidéo | vidéo | vidéo, montage, miniature |
| Gestion de projet | productivité | projet, planning |
| Qualité du code / Sécurité du code / Déploiement | développement, tests / sécurité / devops | |
| Juridique, Enseignement, RH, Finance | catégorie homonyme | |

- **Poids des besoins du projet supérieur à celui du métier** (le besoin est la raison d'être du projet) : proposition **+50** par catégorie de besoin, contre +20/+30 pour le métier. À régler par test.
- **Compléter, ne pas recommencer** : si le projet a déjà des skills, ne proposer que des compléments, jamais ceux déjà présents ni ceux écartés, dans le budget restant.
- **Couverture et lacunes** : pour chaque besoin, compter les skills retenus. Moins de deux → signaler la lacune et, **dans cet ordre** : (1) proposer la **recherche dans les bibliothèques existantes** (sources GitHub), puis (2) seulement si rien de satisfaisant, proposer la **génération par IA** (si un fournisseur est configuré). Tout skill obtenu est analysé avant d'être proposé.
- **Constat sur le catalogue actuel** : le SEO est couvert par `seo-technique`, `redaction-contenu-web`, `youtube-seo-miniatures` ; les réseaux sociaux par `calendrier-social-media`, `posts-linkedin-hooks`, `networking-linkedin`, `analyse-stats-sociales`. Le blog et la newsletter ne sont **pas** couverts. Un test M3 doit vérifier le scénario « juriste + SEO + réseaux sociaux » et documenter honnêtement ce qui est couvert.

---

## 9. Analyse de sécurité (obligatoire, côté `main`)

1. **Aucun skill n'est écrit sur le disque sans analyse préalable**, exécutée **au moment d'écrire** (pas seulement à l'affichage), y compris pour les skills intégrés, importés, générés, ou venant d'un projet importé. Aucun chemin d'écriture ne la contourne.
2. Résultat : `clean` (rien), `warning` (règles de gravité faible ou moyenne : **confirmation explicite** de la personne), `danger` (gravité haute : **refus**, sans possibilité de forcer).
3. Moteur : lire `scan-rules.json` (12 règles : exécution distante, destruction, injection de prompt, secrets, secret en clair, exfiltration, obfuscation, élévation de privilèges, permissions, contournement de garde-fous, réseau, dépendances). Normaliser en NFKC et retirer les caractères invisibles avant d'appliquer les motifs. **Motifs à temps linéaire** : pas de lookahead, lookbehind ni référence arrière.
4. Tester l'évasion (caractères de largeur nulle, casse, homoglyphes courants) comme dans `scan-evasion.test.ts` du dépôt historique.
5. **NVIDIA SkillSpector** (https://github.com/NVIDIA/SkillSpector) : la règle du projet est de **proposer ce scan avant toute installation**. La première version n'exécutait pas SkillSpector dans l'application (écart avec la règle, signalé) ; elle faisait une pré-analyse statique maison et affichait un lien. Dans cette version : pré-analyse intégrée toujours active ; **si `skillspector` est trouvé dans le PATH, le proposer et l'exécuter** (`child_process.execFile` avec tableau d'arguments, **jamais** de shell, délai maximal, sortie bornée), sinon afficher le lien d'installation. Ne pas inventer ses options : lire sa documentation ou `skillspector --help` avant de coder l'appel.
6. Le texte « Vérifiée / À examiner » montré à la personne vient de ce résultat ; le jargon (« SkillSpector », « pré-analyse ») reste dans le détail.

---

## 10. Écriture sur le disque : installation, désinstallation, annulation

C'est **le cœur du produit**. La première version en a fait l'objet de 47 tests ; refaire au moins autant.

### 10.1 Dispositions par assistant

Module pur `layouts.ts` : `plan(skills) → fichiers à écrire`. **Toutes ces dispositions suivent les conventions connues des outils mais n'ont PAS été confrontées à leur documentation officielle** (`verified: false`) : le jalon M0 doit les vérifier une par une (documentation officielle, date de consultation notée dans le code) et corriger au besoin.

| Assistant | Fichiers (relatifs au dossier choisi) | Mode |
|---|---|---|
| Claude Code | `.claude/skills/<slug>/SKILL.md` ; portée **globale** possible (dossier personnel) | un fichier par skill |
| Cursor | `.cursor/rules/<slug>.mdc` (frontmatter `description`, `alwaysApply: false`) | un fichier par skill |
| Windsurf | `.windsurf/rules/<slug>.md` | un fichier par skill |
| GitHub Copilot | `.github/copilot-instructions.md` | **un fichier partagé**, un bloc balisé par skill |
| Aider | `CONVENTIONS.md` (blocs) + `.aider.conf.yml` (`read: CONVENTIONS.md`) créé **seulement s'il n'existe pas** | blocs + création conditionnelle |
| Continue | `.continue/rules/<slug>.md` (frontmatter `name`, `description`) | un fichier par skill |
| Cline | `.clinerules/<slug>.md` | un fichier par skill |
| OpenCode | `.opencode/skills/<slug>/SKILL.md` | un fichier par skill |

`SKILL.md` normalisé : `---\nname: <slug>\ndescription: "<une ligne>"\n---\n\n<corps>\n` (le nom déclaré = le nom du dossier).

**Blocs balisés** pour les fichiers partagés : `<!-- skillforge:begin <slug> -->` … `<!-- skillforge:end <slug> -->`. Insérer ou remplacer chaque bloc sans toucher au reste du fichier ; retirer un bloc et le blanc qu'il laisse. Le contenu écrit par la personne dans ces fichiers n'est jamais modifié.

### 10.2 Périmètre sûr (tests de chemins hostiles obligatoires)

- Le dossier choisi est résolu par `realpath`. **Refuser** : dossier inexistant, fichier, racine d'un disque, dossiers système (Windows : `SystemRoot`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramData` ; Unix : `/bin /boot /dev /etc /lib /lib64 /proc /run /sbin /sys /usr /var /System /Library`), dossier de données de l'application ou qui y écrit, et le dossier personnel **entier** en portée « projet ».
- Chaque fichier du plan : chemin relatif sans `..`, sans segment vide, sans `\0`, non absolu ; résolu à l'intérieur du dossier choisi **après** résolution des liens ; **ne jamais suivre ni écrire à travers un lien symbolique, une jonction Windows ou un alias** (`lstat`) ; un lien cassé sur le trajet bloque l'opération.
- Refuser les noms réservés Windows (`CON`, `NUL`, `COM1`…, point ou espace final, caractères interdits), les collisions de casse (`Seo`/`seo`) et les chemins trop longs, avec un message qui dit quoi faire.
- Écriture **atomique** (fichier temporaire puis renommage) ; en cas d'échec au milieu d'un lot, **tout est défait** (restauration des sauvegardes, suppression de ce qui vient d'être créé).

### 10.3 Aperçu, installation, manifeste

- **Aperçu avant toute écriture** : liste « créer / modifier / inchangé » par fichier, arborescence lisible, nombre de skills, espace estimé. Cet aperçu mémorise le choix de dossier et d'assistant du projet.
- **Par défaut, installer seulement ce qui manque** dans ce dossier (une première version proposait « Installer 15 skills » quand 12 l'étaient déjà et 3 seulement nouveaux : bug signalé). Le bouton dit « Installer N nouveaux skills », « Tout est déjà installé », ou « Installer N skills » en mode explicite ; la personne peut cocher un skill déjà installé pour le réinstaller.
- Tout fichier existant qui sera modifié est **copié dans `backups/<id>/`** avant écriture. Un fichier d'une autre origine n'est jamais écrasé sans l'avoir montré dans l'aperçu.
- **Manifeste** `applications/<id>.json` : `id`, date, `projectId?`, `targetId`, `scope`, `root`, `files[{ path, action: create|modify|unchanged, sha256After, skills[] }]`, `removed[]`, `undoneAt?`. Les empreintes (sha256 du contenu écrit) permettent de savoir plus tard si la personne a modifié un fichier.

### 10.4 Désinstallation et annulation

- **`listInstalled`** recalcule l'état depuis le disque : un skill n'est « installé » que si SkillForge l'a écrit **et** que le fichier est encore là. (Point faible connu de la première version : un fichier préexistant *identique* était compté « installé » sans que l'application l'ait écrit ; ne pas reproduire.)
- **Désinstaller** un, plusieurs ou tous les skills d'un dossier : ne retirer que les fichiers dont le contenu actuel correspond à une empreinte écrite par l'application (donc **non modifiés** depuis). Un fichier modifié par la personne est **conservé** et signalé. Si un fichier avait été remplacé à l'installation, **restaurer la sauvegarde**. Pour les fichiers partagés (Copilot, Aider), retirer les blocs un par un et ne supprimer le fichier que s'il était créé par l'application et qu'il ne reste que son en-tête ; `.aider.conf.yml` créé par l'application est retiré avec le dernier skill. Supprimer les dossiers devenus vides **et créés par l'application**.
- **Annuler la dernière installation** d'un dossier : refusée s'il existe une installation plus récente dans le même dossier (sinon les sauvegardes se contredisent).
- Rapport structuré : `removed[]`, `restored[]`, `kept[{ path, raison }]`, affiché à la personne.
- Nettoyage : les sauvegardes d'une installation annulée ou entièrement désinstallée sont purgeables ; prévoir une purge par ancienneté (point ouvert de la première version : `backups/` ne se vidait jamais).

---

## 11. Arborescence par projet

Une arborescence est une partie de la recette et se **crée sur le disque comme les skills** : aperçu, périmètre sûr, manifeste, annulation (la première version fabriquait un script bash à télécharger, inutilisable sous Windows).

- Base : un gabarit selon la nature du projet (le dépôt historique n'en a que pour le développement : `DIRECTORY_TEMPLATES`) **plus des dossiers par besoin** (SEO : `seo/mots-cles`, `seo/audits` ; réseaux sociaux : `reseaux/calendrier`, `reseaux/brouillons`…). **À écrire** : un gabarit par besoin et par métier non technique.
- Le dossier de l'assistant (`.claude/skills`…) vient de la disposition, jamais en double.
- Afficher l'**espace disque estimé** avant création ; laisser choisir le **point de création** avec le sélecteur natif de dossier ; le mémoriser dans le projet.
- Ne créer **aucun fichier utilisateur** sans l'avoir montré ; des `README.md` d'orientation par dossier sont facultatifs et désactivables.
- Retirer à l'annulation uniquement les dossiers créés par l'application et encore vides.

---

## 12. IA facultative (génération de skills)

**L'IA n'est jamais nécessaire pour choisir, analyser ni installer des skills.** Elle ne sert qu'à *rédiger* un skill ou reformuler un besoin. La clé se demande **au moment de créer un skill** (ou dans Réglages), jamais au démarrage. (Retour de test : « il n'y a pas besoin de paramétrer une clé API, le moteur n'est que pour guider où installer ».)

**Fournisseurs** : tous exposent une API compatible OpenAI (`/chat/completions`, `/models`). La personne choisit un service par son nom, colle sa clé, clique « Vérifier ».

| Service | Adresse de base | Modèle suggéré | Clé |
|---|---|---|---|
| ChatGPT (OpenAI) | `https://api.openai.com/v1` | `gpt-4o-mini` | oui |
| Claude (Anthropic) | `https://api.anthropic.com/v1` | `claude-sonnet-5-5` | oui |
| Gemini (Google) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | oui |
| Abacus.AI (RouteLLM) | `https://routellm.abacus.ai/v1` | `route-llm` | oui |
| Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` | oui |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | oui |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | oui |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` | non |
| LM Studio (local) | `http://localhost:1234/v1` | à lire dans la liste | non |
| Autre service compatible | saisie libre | saisie libre | selon |

Chaque ligne a un lien « Où trouver ma clé ? ». **Gemini, Abacus.AI et Anthropic n'ont jamais été testés avec une vraie clé** : le dire dans la documentation et ne pas affirmer qu'ils fonctionnent avant essai. Le test de connexion lit `/models` (léger), retire le préfixe `models/` des identifiants (Gemini), et se rabat sur une complétion minimale si `/models` n'existe pas (404/405). Messages d'erreur en français, sans relayer le corps de la réponse du fournisseur.

**Un moteur local (Ollama, LM Studio) peut créer des skills pour n'importe quel assistant** : la génération produit un `SKILL.md` indépendant de l'assistant cible ; c'est l'écriture (§ 10) qui l'adapte.

**Sécurité**
- Toute requête réseau part du processus `main` ; le `renderer` ne voit **jamais** une clé, ni en lecture ni en réponse d'IPC.
- Garde d'adresse avant tout appel : n'autoriser que `https:` et, pour le local, `http://localhost`, `127.0.0.1`, `[::1]` ; refuser les adresses *link-local* (`169.254.x.x`) et les métadonnées cloud ; ne pas suivre de redirection vers une autre adresse sans revalider. Délai maximal et taille de réponse bornée.
- Clé stockée via `safeStorage`. **Sous Linux sans trousseau**, `safeStorage` retombe sur un stockage faible : le détecter (`getSelectedStorageBackend`) et **le dire à la personne** au lieu de faire semblant.
- Le contenu généré par l'IA est un skill comme les autres : **analysé avant installation**, sans exception.

---

## 13. Écrans et parcours

### 13.1 Premier lancement (assistant de démarrage)

Une question par écran. **Ordre imposé par les retours de test** : (1) *Quels assistants IA utilisez-vous ?* (c'est ce qui décide où écrire ; texte : « Aucune clé ni compte n'est nécessaire ») → (2) prénom → (3) métier (cartes) → (4) aisance → (5) objectifs → (6) proposition de skills (cochés, chacun avec sa phrase et « Vérifiée ») → fin : création automatique de **« Mon premier projet »**. Aucun écran de connexion, aucune demande de clé.

### 13.2 Créer un projet (4 étapes)

1. Nom et description libre (« Visibilité du cabinet » — « Publier chaque semaine et améliorer mon référencement »).
2. Besoins (cartes à cocher + « autre besoin… »).
3. Assistants et dossier (sélecteur natif, mémorisé).
4. Proposition : skills cochés avec la raison, couverture par besoin et lacunes, arborescence proposée, espace estimé. Boutons **Enregistrer** et **Enregistrer et appliquer**. Un projet peut exister sans dossier ni déploiement.

### 13.3 Navigation (4 entrées)

| Entrée | Contenu |
|---|---|
| **Projets** (accueil) | Cartes : nom, besoins, nombre de skills, état recalculé (« À jour », « 3 à installer », « Jamais appliqué »), dernière modification. Dupliquer, archiver, nouveau projet |
| **Fiche projet** | Onglets *Skills* (cocher, ajouter, écarter, voir pourquoi) · *Arborescence* · *Déploiements* (par assistant et dossier : installer, désinstaller, annuler, ouvrir le dossier) · *Historique* |
| **Bibliothèque** | Tous les skills, recherche dans les bibliothèques en ligne, badges *Installé* / *Sélectionné*, « Ajouter à un projet » |
| **Réglages** | Profil, IA facultative (§ 12), thème, à propos. « Créer un skill » (si IA configurée) est accessible depuis la bibliothèque |

### 13.4 Cycle de vie d'un projet

Créer · modifier (changer les besoins **propose** des ajouts/retraits, **jamais appliqués sans accord**) · appliquer (par défaut seulement les nouveaux skills) · réappliquer ailleurs (nouveau déploiement) · dupliquer · exporter/importer (`.skillforge-projet.json` : recette seule, **jamais** de clé, de chemin absolu ni de contenu utilisateur ; ré-analyse de chaque skill à l'import) · archiver · supprimer (**ne retire pas** les fichiers du disque par défaut : demander).

### 13.5 Exigences d'interface

- Aucune alerte sans donnée réelle. Alertes autorisées : skills sélectionnés mais non installés, mise à jour disponible, skill dangereux. **Interdit** : « skills inutilisés », « skills jamais utilisés », tout compteur d'usage. (Retour de test : l'alerte « 210 skills sélectionnés mais jamais utilisés » était fausse, le suivi d'usage n'existant pas.)
- Les écrans se **rechargent** à l'arrivée et au retour de focus de la fenêtre (retour de test : tableau de bord périmé après une sélection). Debouncer ces rechargements.
- Toute sélection de skill mène à un bouton d'installation explicite (retour de test : « pas de possibilité de les installer »).
- Accessibilité WCAG 2.1 AA : contrastes 4,5:1 (texte) et 3:1 (bordures de champs), un seul `h1` par écran, `<label>` sur chaque champ, focus visible, usage au clavier seul, zone `aria-live` plutôt que déplacement de focus à chaque étape, réglage « réduire les animations » respecté.
- Messages d'erreur qui disent **quoi faire**, jamais un code ni une trace.
- Pas de jargon en mode normal : *token, API, CLI, LLM, prompt, frontmatter, hook, MCP, JSON, YAML, variable d'environnement, SkillSpector* n'apparaissent que dans « Voir le détail ». Un test automatique le vérifie sur les libellés.

---

## 14. Universalité : Windows, macOS, Linux

> **Décision du 26 octobre 2026 (porteur du projet) : seule la version Windows est produite.** La CI ne tourne que sur `windows-latest` ; aucun installeur macOS ni Linux n'est construit. Le code reste écrit de façon portable (`path`, `os.homedir()`, écritures atomiques) pour ne pas fermer la porte, mais **aucun support macOS ou Linux n'est annoncé ni testé**. Les critères du § 18 « même scénario sur Windows, macOS, Linux » se lisent donc « sur Windows ». Le reste de ce paragraphe décrit ce qu'il faudrait pour les autres systèmes.

**État honnête** : la première version n'a été testée que sous Windows. Les builds macOS et Linux n'ont jamais été construits ni lancés. L'universalité est à **démontrer par la CI**, pas à supposer.

| Système | Livrable | Points durs |
|---|---|---|
| Windows 10/11 x64 | Installeur NSIS | Signature de code (sinon alerte SmartScreen dissuasive pour ce public) |
| macOS 12+ (Intel et Apple Silicon) | `.dmg` universel | **Signature Developer ID et notarisation obligatoires**, sinon Gatekeeper bloque ; ne se construit pas depuis Windows (CI) ; invites d'accès à Documents/Bureau |
| Linux x64 | AppImage et `.deb` | AppImage demande FUSE ; bac à sable Chromium variable selon la distribution ; `.deb` sans mise à jour automatique |

**Règles de code** : toujours `path` (jamais de concaténation avec `\` ou `/`) ; dossier personnel par `os.homedir()` ; écrire des `\n` et calculer les empreintes sur les octets écrits ; comparer les noms sans tenir compte de la casse pour détecter les collisions ; `0600` sur les fichiers de réglages sous macOS/Linux ; écritures atomiques avec nouvel essai dans les dossiers synchronisés (OneDrive, iCloud, Dropbox, fichiers « à la demande » et verrous) ; menu d'application macOS (barre globale) et icônes `.ico`/`.icns`/`.png`.

**Dépendances natives** : éviter. Chacune multiplie les builds par plateforme et les pannes d'installation. Tout module natif retenu doit être justifié et testé sur les trois systèmes en CI.

**CI** (GitHub Actions, à écrire dès M1) : matrice `windows-latest`, `macos-latest`, `ubuntu-latest` ; typecheck, lint, tests, build, **test de fumée de l'application empaquetée** (elle démarre, la fenêtre s'ouvre, l'état se crée) et test d'installation/désinstallation de skills dans un dossier temporaire sur chaque système. Les workflows n'ont jamais tourné dans le dépôt historique : ne pas supposer qu'ils fonctionnent.

**Mises à jour de l'application** : `electron-updater` (NSIS, macOS signé, AppImage). Les mises à jour de **skills** ne s'appliquent jamais sans accord de la personne.

---

## 15. Retours de test à transformer en tests d'acceptation

Chaque ligne est un défaut réel rencontré par un testeur de la première version. Chacune doit devenir un test automatisé ou un scénario Playwright **avant** d'être déclarée traitée.

| # | Défaut constaté | Test d'acceptation |
|---|---|---|
| 1 | Réglage de l'IA : il fallait éditer un fichier JSON | Aucun écran ne demande d'éditer un fichier ; l'IA se règle par formulaire |
| 2 | « X skills installés » alors que rien n'était écrit | Après le parcours de démarrage, l'interface dit « sélectionnés » ; « installé » n'apparaît qu'après écriture vérifiée sur disque |
| 3 | Pas de choix de dossier ni d'arborescence selon l'assistant | Le dossier est demandé ; l'aperçu change selon l'assistant |
| 4 | Clé d'IA demandée en premier alors qu'elle sert seulement à générer | Le parcours de démarrage ne contient aucun champ de clé |
| 5 | Choix du dossier non mémorisé | Après installation (ou aperçu), rouvrir l'écran de déploiement reprend assistant et dossier |
| 6 | Skills sélectionnés dans la bibliothèque impossibles à installer | Depuis la bibliothèque, un bouton mène à l'installation ; le toast de sélection propose « Installer » |
| 7 | Gemini et Abacus.AI absents | Les 10 fournisseurs du § 12 sont proposés |
| 8 | Écrans périmés après une sélection (tableau de bord, « installer ») | Sélectionner puis revenir : l'état est à jour sans action |
| 9 | « Installer 15 skills » avec 12 déjà installés | 12 installés + 3 nouveaux → « Installer 3 nouveaux skills », 12 décochés et marqués « déjà installés » |
| 10 | Alerte « 210 skills jamais utilisés » | Aucun écran ne parle d'usage |
| 11 | Une installation puis une désinstallation globale ou sélective doivent être parfaites | Installer tout/une partie, désinstaller un/tous : le dossier retrouve son état initial ; un fichier modifié à la main est conservé |
| 12 | Une application déjà ouverte empêchait de reconstruire/tester | Le smoke test choisit un port libre (si un serveur de test existe) et n'interfère pas avec une instance ouverte |

---

## 16. Jalons de construction

Chaque jalon se termine par : vérifications du § 17 passées, commit, et un compte rendu honnête (fait / vérifié / non vérifié). Efforts indicatifs, en jours de travail focalisé.

| Jalon | Contenu | Critère de sortie | Effort |
|---|---|---|---|
| **M0 · Cadrage et prototype** | Questions du § 19 ; squelette Electron+Vite+TS, IPC typé, CSP, isolation ; **vérification des 8 dispositions** dans les documentations officielles ; choix des assistants prioritaires | Fenêtre qui s'ouvre et appelle un handler IPC validé ; tableau « assistant → fichiers » sourcé | 2 à 4 |
| **M1 · Socle et CI** | Magasin d'état JSON atomique et versionné, migrations, instance unique, verrou, journal ; données copiées et validées ; **CI en matrice dès ce jalon** | Coupure simulée en pleine écriture sans corruption ; CI verte sur 3 systèmes | 4 à 6 |
| **M2 · Cœur** | `scan`, `recommend` (rejoue `golden.json`), `layouts`, `blocks` : logique pure, couverte par tests | Tests de non-régression des résultats historiques | 4 à 6 |
| **M3 · Projets et besoins** | Modèle Projet, référentiel `besoins`, conseil « compléments », couverture et lacunes, export/import | Scénario « métier X + SEO + réseaux sociaux » testé et documenté | 5 à 8 |
| **M4 · Écriture sur disque** | Périmètre sûr, aperçu, installation « nouveaux seulement », manifestes, sauvegardes, désinstallation, annulation, arborescence | Batterie de tests de chemins hostiles ; aller-retour installation/désinstallation = état initial, sur 3 systèmes en CI | 8 à 12 |
| **M5 · Interface** | Parcours de démarrage, Projets, fiche projet, bibliothèque, réglages ; accessibilité ; test du jargon | Parcours complet par Playwright ; § 15 passé | 8 à 12 |
| **M6 · IA et sources** | Réglages et test de connexion, génération en flux, recherche GitHub et import, SkillSpector si présent | Tout reste utilisable sans internet ni IA | 5 à 8 |
| **M7 · Distribution** | Signature Windows, signature + notarisation macOS, AppImage/deb, mise à jour automatique, `safeStorage` | Installeur lancé et smoke vert sur 3 systèmes | 5 à 8 |
| **M8 · Qualité et essais** | Essais avec 5 personnes non techniques, correctifs, documentation | Critères du § 18 | 3 à 5 |

Total indicatif **44 à 69 jours**, hors délais d'obtention des certificats. Recaler après M2.

---

## 17. Avant de dire « terminé »

1. `npm run typecheck`, `npm run lint` (aucune erreur), `npm test` passent ; **lire** la sortie.
2. Pour tout changement touchant l'écriture sur disque : les tests de chemins hostiles et d'aller-retour passent.
3. `npm run build` puis **lancement réel de l'application empaquetée** (ou du test de fumée) ; vérifier l'écran, pas seulement le code de sortie. Un paquet périmé a trompé la personne qui testait : reconstruire avant de demander de tester, et lui dire comment relancer.
4. Comportement visible changé → documentation et captures à jour.
5. Dire explicitement ce qui n'a **pas** été vérifié (autres systèmes, vraies clés d'IA, installeur signé…).

---

## 18. Critères de réussite

| Critère | Cible |
|---|---|
| Créer « métier X + SEO + réseaux » et l'appliquer | moins de 5 minutes, sans aide, 5 testeurs sur 5 |
| Retrouver, modifier puis réappliquer un projet | moins de 2 minutes |
| Réutiliser un projet pour un autre dossier | 3 clics |
| Indication fausse (installé, à jour, utilisé) | **0** |
| Skill installé sans analyse préalable | **0**, y compris à l'import d'un projet |
| Fichier non créé par l'application supprimé ou écrasé | **0** (tests de chemins hostiles) |
| Connexion, inscription, clé d'IA demandées au démarrage | **0** |
| Même scénario sur Windows, macOS, Linux | smoke et installation verts en CI |
| Perte de données lors d'une mise à jour de l'application | **0** (migration d'état testée) |

---

## 19. Questions à poser à la personne au démarrage (un seul message)

Pour chacune, donner une recommandation et attendre la réponse avant de coder ce qui en dépend.

| # | Question | Recommandation par défaut |
|---|---|---|
| Q1 | Electron + React/Vite + TypeScript, ou Tauri 2 + Rust ? | Electron (§ 5) |
| Q2 | Dépôt neuf et nom du produit (SkillManagement, SkillForge…) ; licence | Dépôt neuf, licence MIT |
| Q3 | Quels assistants vérifier et livrer en premier ? | Claude Code, GitHub Copilot, Cursor ; les 5 autres ensuite |
| Q4 | Signature de code : certificat Windows et compte Apple Developer disponibles ? | Les prévoir dès M0 (coût et délai) |
| Q5 | Qui teste, et quelles machines (macOS, Linux) sont disponibles ? | Sans machine macOS/Linux, la CI est la seule preuve |
| Q6 | Intégrer SkillSpector (§ 9.5) ? | Oui, optionnel, si présent dans le PATH |
| Q7 | La première version doit-elle accepter l'import de skills depuis GitHub dès M6 ? | Oui, avec analyse obligatoire |

---

## 20. Ce qui n'est PAS vérifié (à ne pas présenter comme acquis)

- Les emplacements et formats de fichiers des **8 assistants** (§ 10.1) : jamais confrontés à leur documentation officielle.
- Les fournisseurs **Gemini, Abacus.AI, Anthropic** : jamais essayés avec une vraie clé.
- Tout ce qui concerne **macOS et Linux** : aucun essai, aucun build.
- L'**installeur Windows empaqueté** et le sélecteur de dossier natif dans une vraie fenêtre : non testés de bout en bout dans la première version.
- La **couverture du catalogue** pour un besoin donné (blog, newsletter, etc.) : mesurée seulement pour le SEO et les réseaux sociaux, à la main.
- La **calibration** des poids de besoins du § 8.2 : simple proposition.
- Les **durées** du § 16 : estimation, non mesure.
