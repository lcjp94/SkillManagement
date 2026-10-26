# Besoins, compléments et couverture — état M3

Moteur : `src/main/core/besoins.ts` (lien skill ↔ besoin, couverture, lacunes), `src/main/core/recommend.ts` (conseil), `src/main/core/projets.ts` (recette d'un projet), `src/main/core/echange.ts` (export/import).
Référentiel : table `besoins` de `src/shared/data/profiles.json`. Tests : `tests/besoins.test.ts`, `tests/projets.test.ts`, `tests/echange.test.ts`.

## Comment un skill répond à un besoin

| Besoin | Règle |
|---|---|
| Sans mots-clés (Juridique, Vidéo, Réseaux sociaux…) | La **catégorie** du skill suffit |
| Avec mots-clés (SEO, Newsletter, Gestion de projet…) | Un **mot-clé** (mot entier, sans accents ni casse, pluriel accepté) dans le nom, la description ou les étiquettes. La catégorie seule ne suffit pas : sinon tout le marketing répondrait au SEO |

## Poids (calibrés par test, voir `tests/besoins.test.ts`)

| Élément | Points |
|---|---|
| Besoin couvert, mot-clé **dans** la catégorie du besoin (ou catégorie pour un besoin sans mots-clés) | +50 |
| Besoin couvert par un mot-clé **hors** catégorie (ex. `youtube-seo-miniatures` pour le SEO) | +30 |
| Métier (inchangé) | +30 / +20, persona +25 |
| Pénalité « skill destiné à d'autres métiers » (−15) | **supprimée** pour un skill qui répond à un besoin exprimé |

Le −15 faisait sortir `seo-technique` (visé « marketeur, développeur ») pour une juriste qui demande du SEO : c'était contraire au but du projet.

## Réservation par besoin

Avant le classement général, le moteur réserve de quoi couvrir chaque besoin (**2 skills** au mieux, `COUVERTURE_MIN`), dans les plafonds du niveau. Sans cette étape, un métier très fourni écrase le besoin : deux variantes volontairement cassées du moteur (sans réservation, sans suppression de pénalité) passaient d'abord tous les tests ; deux tests ont été ajoutés pour les distinguer.

**Conséquence à connaître** : au niveau *débutant* (6 skills), trois besoins occupent les 6 places et le métier n'a plus de skill propre (mesuré : juriste + SEO + réseaux sociaux + veille → 2 + 2 + 2, aucun skill juridique). Avec deux besoins, la juriste garde ses deux skills juridiques.

## Compléments

Un projet qui a déjà des skills ne reçoit que des **compléments** : ni un skill déjà retenu, ni un skill écarté. Les skills déjà retenus occupent leur place dans les plafonds (nombre, jetons, par catégorie) et comptent dans la couverture. Un projet complet ne reçoit plus rien.

Changer les besoins **propose** des ajouts et des retraits, sans rien appliquer. Les retraits ne concernent que les skills « recommandés » dont **tous** les besoins d'origine ont disparu du projet (champ `pour`) ; un skill ajouté à la main, par l'IA ou importé n'est jamais proposé au retrait, et `appliquerChangements` ne retire jamais un skill qui n'est pas « recommandé ». Les retraits proposés libèrent leur place pour les ajouts proposés.

## Ce que le catalogue couvre vraiment (102 skills)

Mesuré par `tests/besoins.test.ts` : le test échoue si ce tableau et le catalogue divergent.

| Besoin | Skills | Verdict |
|---|---|---|
| Référencement (SEO) | 3 : `seo-technique`, `redaction-contenu-web`, `youtube-seo-miniatures` (lien faible) | Couvert, juste |
| Réseaux sociaux | 8 | Couvert |
| **Rédaction de contenu web** | **1** : `redaction-contenu-web` | **Lacune** (blog non couvert) |
| **Newsletter** | **0** | **Lacune** |
| **Présentations** | **1** : `storytelling-donnees` (mot « présentation » dans ses étiquettes, ce n'est pas un skill de diaporama) | **Lacune** |
| Veille et recherche | 7 | Couvert |
| Analyse de données | 9 | Couvert |
| Vidéo | 7 | Couvert |
| Gestion de projet | 5 | Couvert (`rapport-avancement` par mot-clé) |
| Qualité du code | 13 | Couvert (toute la catégorie *développement* et *tests*) |
| Sécurité du code | 5 | Couvert (inclut `conformite-rgpd`, `donnees-sensibles-ia`) |
| Déploiement | 5 | Couvert |
| Juridique, Enseignement, RH, Finance | 4 chacun | Couvert, court |

Pour une lacune, `pistesPourLacune` renvoie dans l'ordre : (1) la recherche dans les bibliothèques existantes (avec une requête), (2) la rédaction par IA **seulement si un fournisseur est configuré**. Cette fonction ne lance rien ; la recherche en ligne et l'IA arrivent en M6, et tout skill obtenu sera analysé avant d'être proposé.

## Export et import (`.skillforge-projet.json`)

- **Contenu** : nom, description, besoins, « autre besoin », métier, aisance, assistants, skills (identifiant, origine, écarté), arborescence ; plus le contenu des skills personnels (générés ou importés) que le projet utilise, pour que le fichier se suffise.
- **Jamais** : dossiers mémorisés (donc aucun chemin), identifiant interne, dates, résultat d'analyse ou origine d'un skill, clé.
- **À l'import** : taille limitée à 2 Mo ; format et version contrôlés ; champs inconnus ignorés (un `id` ou des `dossiers` dans le fichier ne servent à rien) ; chaque skill embarqué est **analysé** (nom, description et corps) avant d'entrer dans les données : *danger* refusé sans possibilité de forcer, *avertissement* seulement après confirmation du skill concerné ; un skill embarqué ne remplace jamais un skill intégré ni un skill de même identifiant que vous avez déjà ; les skills introuvables et les besoins inconnus sont signalés puis laissés de côté ; un nom déjà pris est numéroté. Tous les skills du projet importé prennent l'origine « importé ».
- **Limite** : l'analyse à l'import protège les données, pas le disque. L'analyse au moment d'**écrire** (M4) reste obligatoire pour tous les skills, y compris intégrés.

## Non fait en M3 (volontairement)

- Aucun handler IPC `projects.*` : la forme de l'API se décide avec l'interface (M5). Les fonctions sont pures et prêtes à être appelées sous le verrou du magasin.
- Le champ `autreBesoin` (besoin libre de § 13.2) et `pour` (besoins à l'origine d'une recommandation) ont été ajoutés au schéma d'état ; ils sont facultatifs, donc la version d'état reste 1.
- La calibration des poids repose sur ce catalogue et sur quelques métiers testés ; elle n'a pas été confrontée à de vraies personnes.
