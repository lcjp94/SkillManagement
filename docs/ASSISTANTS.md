# Dispositions par assistant — vérification M0

Consultation : **26 octobre 2026**. Source : documentations officielles de chaque outil (liens ci-dessous).
Limite à connaître : les pages ont été lues par un résumeur automatique (WebFetch), pas relues à la main ;
la fin de la page Claude Code (au-delà de 100 000 caractères) n'a pas été lue. Chaque ligne reste à
confirmer par un essai réel dans l'outil avant de passer `verified: true` dans `layouts.ts`.

| Assistant | Verdict | Fichiers confirmés | Écart avec CLAUDE.md § 10.1 |
|---|---|---|---|
| Claude Code | Confirmé | `.claude/skills/<nom>/SKILL.md` ; global `~/.claude/skills/<nom>/SKILL.md` | Aucun |
| Cursor | Confirmé | `.cursor/rules/*.mdc` ; frontmatter `description`, `globs`, `alwaysApply` ; un `.md` simple est ignoré | Aucun |
| GitHub Copilot | Confirmé, option meilleure | `.github/copilot-instructions.md` ; **aussi** `.github/instructions/NOM.instructions.md` avec frontmatter `applyTo` | Un fichier par skill serait possible : évite les blocs balisés. À trancher en M2 |
| Windsurf | **Écart** | `.windsurf/rules/*.md` (repli) ; `.devin/rules/*.md` (préféré, page migrée vers docs.devin.ai) ; frontmatter `trigger` (`always_on`, `model_decision`, `glob`, `manual`) ; **12 000 caractères maximum par fichier** | Ajouter `trigger: model_decision` + `description` ; refuser ou signaler un skill de plus de 12 000 caractères |
| Aider | Confirmé | `read: CONVENTIONS.md` dans `.aider.conf.yml` ; `CONVENTIONS.md` n'est **pas** chargé automatiquement | Le fichier `.aider.conf.yml` est donc indispensable, pas facultatif : si la personne en a déjà un sans `read:`, proposer la modification dans l'aperçu |
| Continue | Confirmé | `.continue/rules/*.md` ; frontmatter `name`, `description`, `globs`, `alwaysApply` | Aucun |
| Cline | Confirmé | `.clinerules/*.md` (dossier) ou `.cline/rules/` ; sans frontmatter la règle est **toujours active** ; `paths` pour limiter | Toujours actif = toute la masse de skills dans le contexte : tenir compte du budget |
| OpenCode | **Écart** | `.opencode/skills/<nom>/SKILL.md` ; lit aussi `.claude/skills/` et `.agents/skills/` ; `name` : 1 à 64 caractères, `^[a-z0-9]+(-[a-z0-9]+)*$`, égal au nom du dossier ; `description` : 1 à 1024 caractères | Voir « Conséquences » |

## Conséquences à traiter (jalon M2)

1. **Règle de `slug` trop large.** CLAUDE.md § 7 autorise `^[a-z0-9][a-z0-9-]{0,119}$` (120 caractères, `--` permis),
   alors qu'OpenCode exige `^[a-z0-9]+(-[a-z0-9]+)*$` et 64 caractères au plus. Valider les 102 skills intégrés contre
   la règle stricte avant de la figer.
2. **Doublons Claude Code / OpenCode.** OpenCode lit `.claude/skills/` : installer pour les deux assistants dans le même
   dossier écrirait deux copies que OpenCode verrait deux fois. Prévenir dans l'aperçu, ou ne pas écrire la copie OpenCode
   quand Claude Code est déjà ciblé pour ce dossier.
3. **Windsurf** : prévoir la limite de 12 000 caractères dans le plan d'écriture.
4. **Pas de portée globale** pour tous : Claude Code et OpenCode ont un dossier personnel, Cline un dossier Documents,
   Windsurf un fichier global unique de 6 000 caractères. M4 ne doit proposer la portée globale que là où elle est documentée.

## Sources

- Claude Code : https://code.claude.com/docs/en/skills
- Cursor : https://cursor.com/docs/context/rules
- GitHub Copilot : https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot
- Windsurf : https://docs.devin.ai/desktop/cascade/memories (ancienne adresse docs.windsurf.com, redirigée)
- Aider : https://aider.chat/docs/usage/conventions.html
- Continue : https://docs.continue.dev/customize/deep-dives/rules
- Cline : https://docs.cline.bot/features/cline-rules
- OpenCode : https://opencode.ai/docs/skills/
