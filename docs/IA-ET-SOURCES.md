# IA facultative, sources en ligne, analyse approfondie — état M6 (Windows)

Code : `src/main/ai/` (services d'IA, garde d'adresse, réseau borné, clés), `src/main/sources/github.ts`, `src/main/securite/skillspector.ts`, `src/main/services/{ia,enligne,skills,analyse}.ts`, écrans `screens/{Ia,EnLigne,Analyse}.tsx`.
Tests : `tests/{garde-adresse,ia,sources,skillspector,skillmd}.test.ts` (158 tests), `e2e/ia-sources.spec.ts` (6 parcours).

**Principe** : tout reste utilisable sans internet, sans clé et sans IA. Aucune de ces fonctions n'est demandée au démarrage ni nécessaire pour choisir, analyser ou installer des skills.

## IA facultative (§ 12)

- **10 services** : ChatGPT, Claude, Gemini, Abacus.AI, Mistral, OpenRouter, Groq, Ollama, LM Studio, « autre service compatible » (adresses, modèles suggérés et liens de CLAUDE.md § 12 ; la page des clés d'Anthropic a changé : `platform.claude.com`, vérifié le 26 octobre 2026). **Aucun n'a été essayé avec une vraie clé** : les tests passent contre un faux serveur local compatible, avec de vraies requêtes HTTP. Gemini, Abacus.AI et Anthropic sont signalés comme « pas encore essayés » dans l'écran.
- **Abacus.AI** (informations fournies par la personne, issues de la documentation d'Abacus.AI) : on utilise **RouteLLM**, `https://routellm.abacus.ai/v1`, modèle `route-llm` ; l'accès demande un abonnement **ChatLLM** et la clé se crée sur la page « RouteLLM API » du compte ; une organisation avec espace dédié utilise `https://<espace>.abacus.ai/v1` (l'adresse est donc modifiable pour ce service, en restant soumise à la garde). Vérifié contre le vrai service, **sans clé** : `GET /v1/models` répond et notre client lit bien ses **174 modèles**. L'authentification et la rédaction en flux n'ont **pas** été essayées (il faut une clé). Les autres routes de RouteLLM (`/responses`, `/messages`, `/decisions`) ne sont pas utilisées.
- **Réglage par formulaire** (Réglages) : service, adresse (seulement pour les services locaux et « autre »), modèle, clé, « Vérifier », « Enregistrer », « Supprimer la clé ». La clé n'est jamais demandée au démarrage.
- **Test de connexion** : lit `/models` (préfixe `models/` retiré pour Gemini), se rabat sur une complétion d'un jeton si le service répond 404 ou 405. Messages en français selon le code de réponse ; **le corps de la réponse du service n'est jamais relayé** (vérifié par test).
- **Rédaction en flux** : une seule à la fois, annulable ; le texte arrive par morceaux (relu toutes les 300 ms), borné à 60 000 caractères. Le texte obtenu est extrait (nom, description, corps), relu et modifiable par la personne, **analysé**, puis enregistré comme skill « rédigé avec une IA ». Il n'est jamais installé tout seul.
- **Un moteur local** (Ollama, LM Studio) peut rédiger pour n'importe quel assistant : le skill est indépendant de l'assistant, c'est l'écriture (M4) qui l'adapte.

### Garde d'adresse et réseau

- Seules `https://` et `http://` vers `localhost`, `127.0.0.1`, `[::1]` sont acceptées. Refusés : identifiant dans l'adresse, adresses *link-local* (`169.254.x.x`, `fe80::`), `0.0.0.0`, métadonnées cloud (AWS/Azure `169.254.169.254`, Google `metadata.google.internal`, Alibaba `100.100.100.200`), et leurs formes IPv4 déguisées en IPv6 (`::ffff:a9fe:a9fe` : **faille trouvée par un test**, corrigée).
- Le nom d'hôte est **résolu** : un nom qui mène vers une adresse interdite (rebond DNS) est refusé ; « localhost » doit rester sur la boucle locale.
- Aucune redirection n'est suivie sans nouveau contrôle ; **la clé ne suit jamais une redirection vers un autre site**.
- Délai maximal (15 s pour la liste, 30 s pour un test, 180 s pour une rédaction) ; réponse bornée (2 Mo) ; le délai est imposé même si l'implémentation de `fetch` l'ignore.
- Toute requête part du processus principal. L'interface ne voit jamais une clé, ni en lecture ni dans une réponse (vérifié sur `ia.etat`, `reglages.get`, `referentiels.get`, `app.info`, le DOM, `settings.json` et `secrets.bin`).

### Clés

Stockées par `safeStorage` (DPAPI sous Windows) dans `secrets.bin`, une entrée chiffrée par service, écriture atomique. Si le stockage sécurisé n'est pas disponible, **aucune clé n'est enregistrée** et l'écran le dit (pas de repli en clair). Une clé vide ne change rien ; une clé avec retour à la ligne ou de plus de 4 096 caractères est refusée. *Linux sans trousseau* (stockage faible) ne concerne pas cette version Windows.

## Sources en ligne et import (§ 3)

- **Dépôts par défaut** (reprise de la première version) : `anthropics/skills`, `ComposioHQ/awesome-claude-skills`, `github/awesome-copilot`. **Licences déclarées** (API GitHub, 26 octobre 2026) : `github/awesome-copilot` MIT ; `anthropics/skills` et `ComposioHQ/awesome-claude-skills` n'en déclarent aucune. Rien n'est redistribué avec l'application : les skills ne sont téléchargés que sur demande, et **la licence (ou son absence) est montrée avant l'import**.
- Seuls `api.github.com` et `raw.githubusercontent.com` sont contactés (redirection vers un autre site refusée). Le dépôt est validé (`propriétaire/nom`), le chemin aussi (pas de `..`, extension `.md`, 300 caractères) ; une adresse GitHub collée est convertie en dépôt et chemin validés. Fichier limité à 200 Ko. Liste gardée une heure en mémoire. Limite de requêtes sans compte (60 par heure) expliquée. Hors connexion : « Pas de connexion », l'application reste utilisable.
- **Recherche** par mots dans les chemins, puis description des meilleurs résultats ; dépôts ajoutés par la personne (10 au plus, vérifiés avant ajout).
- **Import** : le contenu est **relu et réanalysé côté principal** à l'enregistrement (ce que l'interface a vu à l'aperçu ne compte pas) ; *danger* refusé sans possibilité de forcer, *avertissement* après confirmation ; un skill du dépôt ne remplace jamais un skill intégré (identifiant numéroté) ; un second import est refusé sauf « Mettre à jour » explicite, qui garde l'identifiant (les projets suivent) et passe la même analyse.
- Vérifié à la main contre le vrai GitHub : 20 skills listés dans `anthropics/skills`, recherche « pdf » dans deux dépôts, licences, lecture d'un `SKILL.md`.

## Analyse approfondie (§ 9.5)

- **NVIDIA SkillSpector** est détecté dans le PATH (`skillspector.exe` seulement : sans shell, un `.cmd` n'est pas lancé). Options **relues dans `skillspector scan --help` (v2.12.0)** : `--format json --no-llm --output <fichier>`. **`--no-llm` est toujours passé** : sans lui, l'outil enverrait le contenu du skill à un service d'IA distant (fournisseur par défaut : NVIDIA). Lancement par `execFile` avec tableau d'arguments, jamais de shell, délai de 90 s, sortie bornée, dossier temporaire supprimé ensuite, environnement purgé de tout ce qui ressemble à une clé et des variables propres à l'outil.
- Verdict : `SAFE` → rien, `CAUTION` → à confirmer, `DO_NOT_INSTALL` → refusé, valeur inconnue → à confirmer. Elle **ne peut que durcir** le verdict de la pré-analyse intégrée, jamais l'assouplir. Une panne de l'outil n'est pas bloquante : elle est signalée.
- **Où elle intervient** : avant une installation (case « Lancer l'analyse approfondie », cochée d'office s'il y a des skills rédigés ou importés), à l'aperçu d'un import GitHub, et à l'analyse d'un skill rédigé. Absente de la machine : l'écran Réglages le dit et la pré-analyse reste seule.
- **Essai réel** (outil installé ici) : un skill sain → `clean`, 0 problème ; un skill piégé (téléchargement exécuté + injection) → `danger`. Constat : **une seule ligne `curl … | bash`** n'est jugée que « prudence » par l'outil en mode statique, alors que la pré-analyse intégrée la **refuse** : les deux se complètent.

## Mesuré

Quatorze variantes volontairement cassées ont chacune fait échouer au moins un test : garde (métadonnées, rebond DNS), clé suivant une redirection, redirection non recontrôlée, réponse non bornée, clé écrite en clair, corps du service relayé, danger accepté « si confirmé », import non réanalysé, `--no-llm` retiré, environnement non filtré, dépôt hors liste accepté, alias YAML autorisés, refus de l'outil ignoré. Deux ont d'abord *survécu* (alias YAML, refus de l'outil) : leurs tests ne les distinguaient pas, ils ont été renforcés.

## Limites connues

- **Aucun service d'IA réel n'a été essayé** : formats de réponse, authentification (Anthropic et Gemini via leur couche compatible), noms de modèles et limites sont ceux de la documentation, non vérifiés avec une clé. L'envoi réel d'une clé n'a eu lieu que vers un faux serveur local.
- **Le contenu d'une réponse d'IA reste du texte non fiable** : l'analyse statique ne comprend pas le sens ; une consigne dangereuse reformulée librement peut passer (limite connue de la pré-analyse, voir `docs/ANALYSE.md`).
- **Pas de recherche de nouveaux dépôts** (la première version avait `searchGithubRepos`) : l'API de recherche demande un compte ; la personne ajoute un dépôt par son nom ou son adresse.
- **Pas de contrôle automatique des mises à jour** des skills importés : la mise à jour se fait à la main (« Mettre à jour » à l'import), jamais sans accord.
- **Catégorie des skills importés** : « importé » (pas d'inférence de catégorie) ; ils n'ont ni métier ni niveau, donc le conseil ne les propose pas spontanément.
- **Poids de la rédaction** : le nombre de jetons d'un skill rédigé est estimé (longueur ÷ 4).
- **Écrans natifs** et **CI** : comme en M5 (crochets de test ; la CI n'a jamais tourné).
