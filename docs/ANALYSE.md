# Analyse de sécurité des skills — écarts avec la première version

Moteur : `src/main/core/scan.ts`. Règles : `src/shared/data/scan-rules.json` (12 règles reprises de la première version).
Résultats de référence : `tests/fixtures/golden.json` (132 cas de la première version), rejoués par `tests/scan.test.ts`.

## Écarts volontaires (tous testés)

| Écart | Raison |
|---|---|
| Règle `prompt-injection` : l'ordre « verbe … consignes … précédentes » est reconnu | « Oublie les consignes précédentes » était jugé *clean* dans la référence : faille de détection. C'est le seul cas de la référence dont le résultat change (`injection-fr` : clean → danger) |
| Homoglyphes cyrilliques et grecs ramenés au latin avant analyse | « сurl » (с cyrillique) échappait à toutes les règles. Liste des cas courants, pas un référentiel exhaustif |
| Caractères cachés refusés (plage « tags » U+E0000–E007F, surcharges de sens de lecture) | Texte invisible lisible par un modèle ; aucun usage légitime dans un skill. Catégorie `caractères cachés`, gravité haute |
| Contenu de plus de 100 000 caractères refusé (`taille`, gravité haute) | Le moteur de motifs de JavaScript rétro-pointe : mesuré à 2,3 s pour 200 Ko de « curl curl … » avec la règle d'exécution distante (quadratique). Le plus long skill intégré fait 1,4 Ko |

## Limites connues

- « Temps linéaire » (CLAUDE.md § 9) décrit les motifs (ni lookahead, ni lookbehind, ni référence arrière), pas le moteur de JavaScript. La limite de taille borne le pire cas ; elle ne le supprime pas.
- Pré-analyse statique : elle ne comprend pas le sens du texte. Une consigne dangereuse reformulée librement peut passer ; d'où le scan complet SkillSpector prévu en M6.
