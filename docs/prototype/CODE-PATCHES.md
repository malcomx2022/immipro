# Reports vers le code — fichiers prêts à déposer

Neuf modifications attendues du dépôt `malcomx2022/immipro` après clôture du prototype (13/09/2026).
Chaque fichier ci-dessous remplace ou crée son homonyme au même chemin. Justifications : `ImmiPro Reports vers le code.dc.html` et `ImmiPro Arbitrages clos.dc.html`.

| Fichier | Points | Nature |
|---|---|---|
| `tailwind.config.ts` | 1, 2 | remplace — `ink.500` → `#6B6B6B`, `fontSize` fermé à neuf tailles avec interlignes, `mono` ajouté |
| `src/domain/payments/pricing.ts` | 3, 4, 5, 6 | remplace — `misEnAvant` sur Dossier, `RECHARGE_ANALYSES` et `CONSULTATION` hors grille, `SEUIL_MARGE_IA`, `versClient()` qui retire `tokensIA` |
| `src/domain/completeness/score.ts` | 7 | remplace — `palier`, `compteurs`, `missing` ordonné bloquants puis facultatifs ; `score` et `breakdown` déplacés dans `interne`, `versClient()` les retire |
| `tests/completeness.test.ts` | 7 | remplace — tests adaptés au palier, plus un test « aucun score au client » |
| `src/domain/consultants/access.ts` | 8, 9 | crée — `peutLire()` = habilitation ∩ accord, `evenementLecture()` pour le journal |
| `tests/consultants.test.ts` | 8, 9 | crée |
| `tests/copy-forbidden.test.ts` | interdit 1 | crée — aucune chaîne candidat ne contient score, %, chances, sur 100 |

## Deux écarts constatés en lisant le code

- Le barème réel de `score.ts` est 50 / 25 / 15 / 10 (documents, conditions, cohérence, rédaction), pas 60 / 20 / 20 comme le prototype le supposait. Sans effet : il n'a plus de surface d'affichage.
- `tokensIA` était déjà dans `Pack` ; ce qui manquait est la barrière de sérialisation (`versClient`), pas la donnée.

## Points de vigilance

- `fontSize` remplace la clé Tailwind au lieu de l'étendre : `text-lg`, `text-xl`… disparaissent, c'est voulu. Compter une passe de renommage `text-base` → `text-16`, etc.
- `CompletenessResult.score` n'existe plus à la racine ; tout appelant qui le lisait doit passer par `interne.score` (back-office) ou par `palier` + `compteurs` (candidat).
- Le prix EUR de la recharge (7 €) et de la consultation (35 €) sont des valeurs par défaut posées ici, comme les 20 000 F.
- `tests/copy-forbidden.test.ts` suppose que le back-office vit sous un segment `(admin)` ; adapter le filtre au découpage réel de `src/app`.

Avant PR : `npm run lint && npm run typecheck && npm run test && npm run check:copy`.
