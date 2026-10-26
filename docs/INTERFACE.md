# Interface — état M5 (Windows)

Code : `src/renderer/src/` (écrans dans `screens/`, composants dans `ui.tsx`, thème dans `styles.css`). Contrat avec le processus principal : `src/shared/contrat.ts` (34 canaux, schémas zod d'entrée et de sortie). Services : `src/main/services/`. Tests : `tests/services.test.ts` (38), `e2e/` (7 parcours dans l'application compilée).

## Écrans

| Écran | Contenu |
|---|---|
| Démarrage (6 étapes) | assistants → prénom → métier → aisance → objectifs → sélection proposée (cochée, avec « Vérifié ») → création de « Mon premier projet ». Aucune clé, aucun compte |
| Projets | cartes (besoins, nombre de skills **sélectionnés**, état recalculé : « Jamais appliqué », « À jour », « N à installer »), dupliquer, archiver, importer, nouveau projet |
| Nouveau projet (4 étapes) | nom → besoins (+ « autre besoin ») → assistants et dossier (sélecteur natif, mémorisé) → proposition avec couverture, lacunes, arborescence et espace ; « Enregistrer » ou « Enregistrer et appliquer » |
| Fiche projet | onglets *Skills* (cocher/écarter, couverture, ajouter, suggestions d'ajouts et de retraits sans rien appliquer), *Arborescence*, *Déploiements* (aperçu, installation, désinstallation, annulation, ouvrir le dossier), *Historique* ; modifier, dupliquer, exporter, archiver, supprimer (propose de désinstaller d'abord) |
| Bibliothèque | recherche, catégorie, badges *Installé* / *Sélectionné*, « Ajouter à un projet » puis message avec le bouton « Installer » |
| Réglages | profil, thème (automatique, clair, sombre), à propos |

Conventions d'interface : tout le texte est en français, vouvoiement neutre. Les noms de skills et de projets sont des **données** (`data-donnee`), pas des libellés. Le détail technique (taille en tokens, liste des fichiers) n'apparaît que dans « Voir le détail ». Un message, en bas, annonce chaque résultat ; une zone `aria-live` annonce chaque étape d'un parcours.

## § 15 — retours de test, état

| # | Défaut | Preuve | État |
|---|---|---|---|
| 1 | Réglage IA par fichier JSON | Aucun fichier à éditer : l'IA se règle par formulaire (service, adresse, modèle, clé, « Vérifier »), la clé est chiffrée et ne revient jamais (`ia-sources.spec.ts`, M6) | Traité |
| 2 | « X installés » sans écriture | Fin du parcours : « sélectionnés », jamais « N skills installés » ; « installés » seulement après écriture, lu sur le disque (`#2…`) | Traité |
| 3 | Pas de dossier ni d'aperçu par assistant | Dossier demandé, aperçu sans écriture (contenu du dossier vérifié vide), chemins propres à Cursor (`#3`) | Traité |
| 4 | Clé demandée en premier | Aucun champ mot de passe ni libellé « clé/API » au démarrage | Traité |
| 5 | Dossier non mémorisé | Après l'aperçu puis rechargement de la fenêtre, assistant et dossier sont repris | Traité |
| 6 | Sélection impossible à installer | Message « … est sélectionné dans … » avec bouton « Installer » menant à l'aperçu, puis écriture vérifiée (`#6`) | Traité |
| 7 | Gemini et Abacus.AI absents | Les 10 services sont proposés dans la liste du formulaire (test de bout en bout) ; **aucun n'a été essayé avec une vraie clé** (M6) | Traité (liste), non vérifié (vraies clés) |
| 8 | Écrans périmés | Un fichier supprimé sur le disque est vu au retour sur la fenêtre (« 1 skill à installer »), sans action | Traité (événement de focus simulé) |
| 9 | « Installer 15 skills » | 12 installés + 3 nouveaux → « Installer 3 nouveaux skills », les 12 décochés « Déjà installés » ; en cocher un → « Installer 4 skills » | Traité |
| 10 | « 210 skills jamais utilisés » | Aucun écran visité ne contient de terme d'usage (expression régulière sur le texte visible) | Traité |
| 11 | Installer/désinstaller doit être parfait | Parcours réel : fichier modifié à la main conservé et signalé ; aller-retour sur 8 assistants dans `tests/installation.test.ts` | Traité |
| 12 | Application ouverte qui gêne | Tests de bout en bout avec dossier de données jetable (`--user-data-dir`), sans port ni serveur | Traité |

## Accessibilité et thème

- Audit **axe-core** (règles WCAG 2.0/2.1 A et AA, contrastes compris) exécuté **en clair et en sombre** sur : démarrage (assistants, proposition), aperçu d'installation, Projets, Bibliothèque, Nouveau projet (besoins, proposition) et Réglages : zéro violation. Les onglets de la fiche projet et les dialogues de désinstallation, d'annulation, d'import et de suppression ne sont **pas** audités. Il a trouvé deux vrais défauts : un lien actif illisible (règle d'élément nu plus forte que la classe) et, à tort, un contraste faussé par une transition de couleur en cours (attente ajoutée dans le test).
- Un seul `h1` par écran, chaque champ a une étiquette, focus visible (anneau bleu), onglets au clavier (flèches, Début, Fin), fenêtres de dialogue natives (focus piégé, Échap), « réduire les animations » respecté.
- Un seul bleu d'accentuation, polices système, clair/sombre via `light-dark()`.

## Sécurité de la frontière

- Le preload n'expose qu'un appel `invoke`, restreint à la liste des canaux (refus testé dans l'application compilée). Chaque entrée et chaque sortie passent par zod.
- L'interface ne fournit **jamais** un chemin à ouvrir ni un contenu à écrire : elle désigne un projet, un assistant et des skills ; le processus principal retrouve le reste. Le seul chemin venant de l'interface est le dossier choisi avec le sélecteur natif, revérifié par le périmètre sûr (M4).
- Seuls les messages écrits pour la personne traversent l'IPC (préfixe `SM|`) ; toute autre erreur devient un message générique et n'est journalisée que par son type.

## Limites connues

- **Écrans natifs non testés** : sélecteur de dossier, ouverture et enregistrement de fichier sont remplacés dans les tests par des crochets (`SKILLMANAGEMENT_TEST_*`), lus seulement par une application **non empaquetée**. Les vrais écrans n'ont été essayés par personne.
- **L'audit automatique ne remplace pas un essai** : axe détecte une partie seulement des défauts ; aucun lecteur d'écran réel n'a été utilisé.
- **Jargon** : le test parcourt les écrans principaux et l'aperçu d'installation ; les dialogues de désinstallation, d'annulation et de suppression ne sont pas tous passés au test.
- Mise en page vérifiée sur captures à 1080 px (clair et sombre) ; la barre du haut des fenêtres étroites n'est pas vérifiée visuellement.
- **Non exposé** : la portée « tous mes projets » de Claude Code (dossier personnel) existe côté services mais n'a pas d'écran.
- M6 a ajouté la rédaction avec une IA, la recherche en ligne et l'analyse approfondie : voir `docs/IA-ET-SOURCES.md`. L'audit axe couvre maintenant aussi les quatre onglets de la fiche projet (un défaut réel trouvé : `aria-controls` d'un onglet pointait vers un panneau inexistant).
- Le rechargement au retour sur la fenêtre est testé par un événement `focus` simulé, pas par un vrai changement de fenêtre.
- La CI (Windows) lance désormais ces parcours (environ 1 minute 10 en local) ; elle n'a toujours jamais tourné.
