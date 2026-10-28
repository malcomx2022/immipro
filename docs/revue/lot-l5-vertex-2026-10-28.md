# S.201 — L5 : passages Vertex du 28/10, `L01,R03` puis le restant

**28/10/2026**, base `de63b49` (#322 fusionnée), branche
`claude/dreamy-heisenberg-49uym4`. Instruction du responsable : « lance le
premier passage L5 `--pieces L01,R03` ». Le protocole
[campagne Vertex](../exploitation/qualification-vertex-l5.md) et le
[suivi S.181](lot-l5-vertex-2026-10-16.md) ont été relus avant l'appel.
Aucun schéma ni service touché ; seul code modifié : le délai des PDF
(voir plus bas). Aucune fusion ni déploiement.

## Conditions

- Secret `AI_OPENAI_COMPTE_DE_SERVICE` présent dans l'environnement de la
  session, jamais lu, affiché ni copié ; aucun journal
  `.qualification-vertex` antérieur dans le dépôt ni dans les preuves : le
  budget de 5 000 XOF s'ouvre ici, une seule fois.
- Commande exacte du protocole, campagne et manifeste du 16/10 inchangés.
- Un premier lancement s'est arrêté au chargement (client Prisma non
  généré dans la session neuve) : aucun journal créé, aucun réseau, aucune
  réserve. `prisma generate` puis relance.
- Commit `de63b49`, arbre non modifié au moment du passage.

## Résultat

Passage du `2026-10-28T17:23:31Z`, quatre appels, tous `CONNUE`, aucun
incident, aucun arrêt de campagne.

| Cas | Fonction | Entrée / sortie | ms | Constat |
|---|---|---|---|---|
| L01 | extraction | 1 668 / 36 | 4 518 | `CONFORME` attendu et obtenu, champ juste, pièce identifiée |
| R03 | rédaction | 522 / 158 | 2 604 | lettre écrite, aucun nombre ajouté, aucun mot interdit |
| R03 | relecture | 852 / 420 | 4 735 | incohérence du jeu relevée |
| R03 | avis de référence | 818 / 656 | 6 412 | incohérence relevée, avis valide L3 |

- **Accès** : OAuth du compte, point `eu`, modèle `google/gemini-3.8-flash`
  et `reasoning_effort: low` acceptés.
- **Mesures** : entrée maximale 1 668 jetons pour une borne de 10 240,
  sortie maximale 656 pour 5 120.
- **Coût mesuré** au tarif déclaré : 3 860 / 1 270 jetons, 0,0084 USD, soit
  environ 4,9 XOF au change du 15/10, hors taxes. Ce n'est pas une facture.
- **Réserve prudente** (journal) : 4 invocations, 175,99 XOF ; restant
  4 824,01 XOF, soit 109 invocations. Le jeu complet en demande 56 (29
  pièces, 9 rédactions et 9 relectures, 9 avis), soit 2 464 XOF : couvert.

## Points relevés après le premier passage

1. **Raisonnement compté ?** L'extraction L01 rend 36 jetons de sortie
   avec un raisonnement `low` demandé. L'adaptateur ne lit que
   `prompt_tokens` et `completion_tokens` ; ni `total_tokens` ni le détail
   des jetons de raisonnement ne sont conservés. Si Vertex facture la
   réflexion hors de `completion_tokens`, la borne de sortie serait
   contrôlée sur une valeur trop basse. À rapprocher dans la console du
   projet `projetanatt` (SKU de sortie du 28/10 contre 1 270 jetons) avant
   la suite ; le relevé de la réserve n'en dépend pas.
2. **PDF non éprouvé** : L01 est une image ; le chemin `image_url` des
   pièces PDF n'avait pas encore été appelé (levé au second passage).
3. Devise de facturation et taxes du compte, toujours à confirmer.

## Second passage : le restant, arrêté sur L06

Lancé le même jour à la demande du responsable, sur les 56 invocations
restantes (L02 à L30, R01, R02, R04 à R10), commande du protocole avec
`--pieces` limité au restant, même journal, arbre propre.

| Cas | Format | Entrée / sortie | ms | Constat |
|---|---|---|---|---|
| L02 | JPEG | 1 668 / 36 | 6 326 | `A_CORRIGER`, comme attendu |
| L03 | PDF | 1 108 / 56 | 11 400 | `A_CORRIGER`, comme attendu |
| L04 | PNG | 1 668 / 36 | 9 868 | `CONFORME`, comme attendu |
| L05 | PDF | 1 136 / 35 | 21 440 | `CONFORME`, comme attendu |
| L06 | PDF | inconnue | 120 002 | `delai_depasse`, mesure `INCONNUE` |

- Le chemin PDF `image_url` passe (L03, L05) : le point 2 ci-dessus est levé.
- L06 a épuisé le délai client de 120 s. La réponse n'a pas été reçue : on
  ne sait pas si Vertex a traité, ni facturé, la demande. La latence
  montait déjà (L05 à 21 s).
- La campagne s'est arrêtée d'elle-même, comme prévu : `blocage:
  MESURE_A_RAPPROCHER`, réserve gardée, aucun appel suivant. Le banc
  n'a fabriqué aucun rapport, et aucune rédaction n'a été lancée.
- Réserve prudente : 9 invocations, 395,97 XOF ; restant 4 604,03 XOF.
  Coût mesuré des quatre appels connus : 0,0053 USD ; L06 est borné par
  sa réserve de 44 XOF, jamais compté zéro.

**Reprise interdite** tant que L06 n'est pas rapproché : le banc refuse
tout nouveau réseau sur ce journal, et il ne faut ni retirer le blocage
à la main ni ouvrir un second journal. Pour lever le blocage, il faut
d'abord relever dans la console du projet `projetanatt` les requêtes du
28/10 entre 17 h 27 et 17 h 30 UTC (journal de requêtes, SKU d'entrée et de sortie).
Puis le responsable décide de la reprise et du délai : faut-il
l'allonger pour les PDF, ou la latence vient-elle de Vertex ?

## Délai client des PDF allongé

Demandé par le responsable après l'arrêt sur L06. La lecture d'un PDF
attend désormais **180 s** (`DELAI_EXTRACTION_PDF_MS`, choisi par
`delaiDeLecture`, domaine). Les images gardent leurs 120 s
(`DELAI_EXTRACTION_MS`). Le changement vaut pour les deux adaptateurs, compatible et
Anthropic, donc pour la production comme pour le banc : un PDF qui
dépasse part toujours en revue humaine, simplement plus tard. Trois
minutes est déjà le délai d'une rédaction, et le plafond reste sous la
marge de renouvellement du jeton Google (300 s) : aucun jeton n'expire
pendant l'appel. Les messages d'échec disent le délai réellement appliqué.

Preuves : `tests/delai-de-lecture.test.ts`, rouge avant la correction
(six tests) : le domaine, la borne sous la marge du jeton, le délai
transmis à `AbortSignal.timeout` par le chemin compatible pour un PDF et
pour une PNG, l'option `timeout` du SDK Anthropic pour un PDF et un JPEG,
avec le message `delai_depasse`. `npm run check` : lint, types,
207 fichiers et 4 094 tests, vocabulaire.

Ce changement **ne lève pas** le blocage `MESURE_A_RAPPROCHER` : L06
reste à rapprocher dans la console avant toute reprise. Le banc exige
un arbre propre : reprendre depuis un commit qui porte ce délai.

## Preuves

Dans [`preuves-l5-vertex-2026-10-16/`](preuves-l5-vertex-2026-10-16/) :

- `passage-2026-10-28-L01-R03/` : `passage.json`, `appels.json`,
  `resultats.json`, `rapport.md` et la lettre R03 (pour les grilles
  humaines) ;
- `passage-2026-10-28-restant/` : `passage.json`, `appels.json` (le banc
  arrêté ne produit ni rapport ni résultats) ;
- `journal/budget.json` : copie à l'identique du journal privé **après le
  second passage** (SHA-256 `9ddea761…2bf07e`), bloqué. C'est la seule
  copie : elle remplace celle du premier passage. Aucun secret.

**Reprise dans une nouvelle session** : copier `journal/budget.json` vers
`.qualification-vertex/projetanatt-eu-gemini-3.8-flash/budget.json` avant
tout passage, puis vérifier l'empreinte. Ne jamais relancer sans ce
journal : ce serait ouvrir un second budget et effacer le blocage.

## Reste à faire et non prouvé

Rapprochement de L06, fin du jeu (51 invocations), rapprochement avec
la facture, deux grilles humaines, DPA, résidence, conservation, incidents réels, configuration déployée.
**L5 non clôturé**, Q.A et M.C non levés.
