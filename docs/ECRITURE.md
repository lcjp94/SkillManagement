# Écriture sur le disque — état M4 (Windows)

Modules : `src/main/fs/perimetre.ts` (où écrire), `deploiement.ts` (aperçu et installation), `retrait.ts` (désinstaller, annuler, reprendre, lister, purger), `manifestes.ts` + `src/shared/schemas/manifeste.ts` (ce qui a été écrit), `lecture.ts` (lecture texte sûre, empreintes) ; logique pure : `src/main/core/deploiement.ts` (actions, choix des skills à écrire), `tree.ts` (arborescence).
Tests : `tests/perimetre.test.ts`, `installation.test.ts`, `install-crash.test.ts`, `deploiement-core.test.ts`.

## Un seul chemin d'écriture

`appliquer()` est le seul code qui écrit des skills. Il analyse **chaque** skill (nom, description, corps) **au moment d'écrire** ; le scanner est une dépendance obligatoire du contexte, il n'existe pas de variante sans analyse. *Danger* : refusé, sans possibilité de forcer. *Avertissement* : écrit seulement si la personne a confirmé ce skill. Les skills intégrés passent par la même analyse.

## Périmètre sûr

- **Dossier choisi** : résolu par `realpath` (une jonction est suivie, sa destination est jugée). Refusés : chemin vide, relatif, avec octet nul, de type périphérique (`\\?\`, `\\.\`), inexistant, fichier, racine d'un disque, dossiers système (`SystemRoot`, `windir`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramW6432`, `ProgramData` et leur contenu), dossier de données de l'application, ce qui le contient ou en fait partie, dossier personnel entier (portée projet).
- **Chaque chemin du plan** : relatif, sans `..`, sans segment vide, sans `\`, `:` (flux NTFS), `< > " | ? *`, caractère de contrôle ; sans nom réservé (`CON`, `NUL`, `COM1`…, même avec extension), sans point ou espace final, sans nom court `~1`, segments ≤ 255 caractères, chemin complet ≤ 240.
- **Sur le disque**, composant par composant : un lien symbolique ou une jonction est refusé, un lien cassé aussi ; un dossier existant dont la casse diffère (`Skills`/`skills`) est refusé ; un fichier à la place d'un dossier (ou l'inverse) est refusé. Le trajet est **revérifié juste avant chaque écriture**.
- **Plan** : deux chemins qui ne diffèrent que par la casse, ou répétés, sont refusés. Le nom de skill doit être un identifiant valide avant même d'être transformé en chemin.
- **Fichier existant** : lu en UTF-8 strict (BOM conservé) et limité à 5 Mo ; un fichier qui n'est pas du texte UTF-8 n'est jamais réécrit. Un bloc balisé incomplet bloque l'opération.

## Aperçu et installation

- `apercu()` n'écrit rien (vérifié : instantané du dossier et des données identique avant/après). Il rend : lignes *créer / modifier / inchangé*, dossiers à créer, arborescence lisible, octets, nombre de skills, refus, avertissements à confirmer, fichiers d'une autre origine qui seraient remplacés, avertissement Aider.
- **Installer seulement ce qui manque** : `choisirSkills()` (12 installés + 3 nouveaux → « Installer 3 nouveaux skills », les 12 décochés). Cocher un skill installé le réinstalle (« Installer N skills »).
- **Fichier d'une autre origine** (ou bloc balisé retouché) : jamais remplacé sans confirmation explicite listée dans l'aperçu ; sans elle, `appliquer()` rend `confirmation-requise` et n'écrit rien. « D'une autre origine » = son contenu ne correspond à aucune empreinte écrite par l'application dans ce dossier.
- **Ordre d'écriture** : (1) manifeste « en cours » ; (2) sauvegardes de ce qui sera remplacé dans `backups/<id>/` ; (3) dossiers, du plus haut au plus bas ; (4) fichiers, chacun atomique (temporaire dans le même dossier, `fsync`, renommage, nouvel essai sur EPERM/EBUSY/EACCES) ; (5) manifeste « terminé ».
- **Échec au milieu** : tout est défait (sauvegardes remises, fichiers créés supprimés, dossiers créés retirés s'ils sont vides). Testé en faisant échouer **chaque** écriture possible, une par une, pour Claude Code, Copilot et Aider : le dossier est toujours identique à l'original.

## Désinstaller, annuler, reprendre

- **Règle commune** : on ne touche qu'à ce dont le contenu actuel correspond à l'empreinte écrite par l'application. Un fichier ou un bloc modifié est conservé et signalé dans `conserves`.
- **Désinstaller** (un, plusieurs ou tous les skills d'un dossier) : supprime les fichiers créés par l'application ; **restaure la sauvegarde** de ceux qu'elle avait remplacés (l'état initial, même après plusieurs réinstallations) ; retire les blocs un par un ; supprime un fichier à blocs seulement s'il a été créé par l'application et qu'il ne reste que son en-tête ; retire `.aider.conf.yml` créé par l'application avec le dernier skill (un fichier existant n'est jamais modifié ni retiré) ; retire les dossiers créés par l'application s'ils sont vides.
- **Annuler la dernière installation** d'un dossier : refusée s'il en existe une plus récente dans le même dossier.
- **Reprise après coupure** : un manifeste resté « en cours » signale une coupure ; `reprendreInterrompus()` défait ce qui a été écrit (seulement si le fichier est encore tel qu'écrit) et supprime les fichiers temporaires laissés à côté des cibles (`SKILL.md.12345678`).
- **Installé = recalculé** : `listerInstalles()` relit le disque. Un skill n'est « installé » que si l'application l'a écrit **et** que le fichier (ou le bloc) est encore là ; « modifié » si la personne l'a changé. Un fichier préexistant identique n'est pas compté.
- **Purge** : `purgerSauvegardes(jours)` ne supprime que les sauvegardes d'installations annulées ou entièrement désinstallées depuis plus de N jours. Celles d'une installation en vigueur ne sont jamais touchées.

## Arborescence (§ 11)

Gabarit (9) + dossiers par besoin (16 besoins, vérifié par test) + dossiers libres ; README d'orientation facultatifs. Créée par le même mécanisme (aperçu, périmètre, manifeste, retrait) ; au retrait, seuls les README inchangés et les dossiers vides créés par l'application disparaissent. Un dossier libre commençant par un point (dossier d'assistant) est ignoré.

## Mesuré

- Tests d'arrêt brutal (`install-crash.test.ts`) : un processus enfant installe et désinstalle les 102 skills en boucle, tué par `SIGKILL` 12 fois par exécution. Mesuré sur 2 exécutions : 8 et 11 arrêts sur 12 sont tombés pendant une installation, avec 3 et 4 fichiers temporaires laissés ; la reprise rend toujours le dossier identique à l'original. Sans le nettoyage des temporaires, le test échoue (mutant vérifié).
- Neuf variantes volontairement cassées du code (revérification avant écriture, empreinte à la désinstallation, analyse de sécurité, dossier non vide, confirmation d'écrasement, détection des jonctions, retour en arrière, ordre des annulations, nettoyage des temporaires) ont chacune fait échouer au moins un test.

## Limites connues

- **Windows seulement** : jonctions, noms réservés, casse insensible et chemins courts sont testés sur Windows 11. Rien n'est affirmé pour macOS ou Linux.
- **Non testé** : fichiers « à la demande » de OneDrive (le nouvel essai sur verrou est testé par injection, pas avec un vrai client de synchronisation), antivirus réel, chemins longs activés dans le registre (la limite de 240 caractères est volontairement prudente), disque réseau.
- **Fenêtre de course** : entre la revérification du trajet et le renommage atomique, un autre programme pourrait remplacer un dossier par un lien. La fenêtre est de quelques millisecondes et le renommage n'écrit jamais à travers un lien déjà en place ; elle n'est pas supprimée.
- Si la personne **déplace ou renomme** le dossier d'un projet, les manifestes pointent vers l'ancien emplacement : l'application n'y voit plus de skills installés et ne peut pas les désinstaller automatiquement.
- Les dispositions des 8 assistants restent `verifie: false` (jamais essayées dans les outils réels).
- Pas d'IPC `deploy.*` : à définir avec l'interface (M5). Les fonctions sont prêtes et sérialisées par le verrou global.
