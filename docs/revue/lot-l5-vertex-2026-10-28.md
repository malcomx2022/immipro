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

## Rapprochement de L06, puis troisième passage arrêté sur L06

**Rapprochement.** Le responsable a relevé dans la console `projetanatt`
que la requête L06 du second passage n'avait pas été facturée. Pour le
consigner sans éditer le journal à la main, le banc a reçu une commande
dédiée, `npm run banc:ia:rapprocher` (`BudgetVertex.rapprocher`). Elle
n'appelle pas le réseau et prend le verrou de campagne. Elle ne lève que
`MESURE_A_RAPPROCHER` : une mesure facturée au-delà d'une borne passe en
`BORNE_FACTUREE_DEPASSEE`, et tout refus laisse le journal intact. Le
journal garde l'appel (`L06/extraction`), le constat `NON_FACTUREE`, la
source et la date. La réserve prudente n'est pas rendue. Huit tests, rouges
avant le changement.

**Troisième passage** (commit `c1a0ed1`, arbre propre), sur 52
invocations : L06 à L30, R01, R02, R04 à R10.

| Cas | Format | Entrée / sortie | ms | Constat |
|---|---|---|---|---|
| L06 | PDF | inconnue | 180 174 | `delai_depasse` avec le délai de 180 s, mesure `INCONNUE` |

- Avec 180 s, L06 dépasse encore, alors que L03 et L05 (PDF de 60 Ko et
  50 Ko) répondent en 11 et 21 s ; L06 pèse 48 Ko. Ce n'est donc pas une
  lenteur générale de Vertex mais un comportement propre à cette pièce
  (« attestation de bourse annuelle sous le seuil »). Allonger encore le
  délai n'est pas une réponse : la marge du jeton Google plafonne à 300 s.
- La campagne s'est de nouveau arrêtée d'elle-même en
  `MESURE_A_RAPPROCHER`. Réserve prudente : 10 invocations, 439,97 XOF ;
  restant 4 560,03 XOF.
- **Second rapprochement, consigné.** D'après les métriques de la Vertex
  AI API relevées par le responsable (28/10, 17 h 48 à 17 h 55 UTC), une
  seule requête figure dans la fenêtre : `ChatCompletions`, code **499**
  (requête annulée par le client), horodatée 17:54:44Z, et aucune réponse
  200. Elle est donc non facturée. L'horodatage tombe environ deux minutes
  après l'abandon client (vers 17:52:42) : la métrique date la fin du
  traitement côté Google, ce qui laisse penser que Vertex a calculé plus de
  cinq minutes sur L06. Inscrit par `banc:ia:rapprocher` ; le blocage est
  levé et la réserve inchangée (439,97 XOF pour 10 invocations).
- Reste à décider : poursuivre sans L06, en le comptant comme échec
  technique du fournisseur, ou diagnostiquer la pièce d'abord.

## Quatrième passage, sans L06 : arrêté sur L14

Le responsable a choisi de poursuivre sans L06, compté comme échec
technique du fournisseur. Passage du commit `522ff41`, arbre propre, sur
51 invocations : L07 à L30, R01, R02, R04 à R10.

| Cas | Format | Entrée / sortie | ms | Constat |
|---|---|---|---|---|
| L07 | PDF | 1 136 / 29 | 52 381 | `HORS_SUJET`, comme attendu |
| L08 | JPEG | 1 696 / 35 | 4 431 | `A_CORRIGER`, comme attendu |
| L09 | PDF | 990 / 35 | 3 786 | `CONFORME`, comme attendu |
| L10 | PDF | 1 108 / 29 | 5 181 | `HORS_SUJET`, comme attendu |
| L11 | JPEG | 1 551 / 19 | 2 916 | `CONFORME`, comme attendu |
| L12 | PDF | 993 / 18 | 2 673 | `CONFORME`, comme attendu |
| L13 | PDF | 1 120 / 33 | 4 442 | `CONFORME`, comme attendu |
| L14 | JPEG | inconnue | 120 003 | `delai_depasse`, mesure `INCONNUE` |

- Sept verdicts justes sur sept. Coût mesuré des appels connus :
  8 594 / 198 jetons, 0,0079 USD.
- L14 est une **image** : le format n'explique pas le blocage. L06 et L14
  ont en commun d'être des **attestations de fonds** (bourse, garant)
  portant un **montant annuel sous le seuil**, alors que L05 et L13,
  relevés au-dessus du seuil, répondent en 4 à 21 s. Ce point commun est
  une hypothèse, pas une preuve : rien n'a été appelé pour la vérifier.
- Campagne arrêtée en `MESURE_A_RAPPROCHER`. Réserve prudente :
  18 invocations, 791,95 XOF ; restant 4 208,05 XOF. Le restant (L15 à L30,
  rédactions, relectures et avis) en demande 43, soit 1 892 XOF.
- Rapprochement de L14 à faire : requête du 28/10, environ 18 h 11 à
  18 h 13 UTC côté client. Google a horodaté le 499 de L06 deux minutes
  après l'abandon : regarder jusqu'à 18 h 17.

## Examen local de L06 et L14, sans appel

Demandé par le responsable avant toute reprise. Aucun appel, aucune
réserve : la demande a été reconstruite comme `lancer.mts` la construit
(`champsDemandes`, `instructions`, `schemaDeLaLecture`), puis les pièces
ont été rendues en image et comparées.

- **La demande n'y est pour rien.** L05 et L06 reçoivent exactement la
  même consigne, le même schéma et la même exigence IND
  (`preuve_fonds_annuelle`, 13 569,24 €) ; de même L13 et L14 (21 000
  CHF). Seuls les octets de la pièce diffèrent.
- **Le montant sous le seuil n'y est pour rien.** L08, un relevé dont le
  solde est juste sous le seuil, a répondu en 4,4 s. L'hypothèse du
  quatrième passage est donc écartée dans sa forme générale.
- **Le format et le rendu n'y sont pour rien.** L06 est un PDF Skia A4
  d'une page, comme L05, L09, L12 et L13 (46 à 51 Ko). L14 est un JPEG de
  1191 × 1685, comme L02, L08 et L11. Les deux pièces se lisent nettement,
  avec le même gabarit et le même filigrane « spécimen » que les autres.
- **Ce qui reste propre à L06 et L14** : ce sont les deux seules
  attestations de fonds émises par un tiers (une fondation, un garant)
  plutôt qu'un relevé bancaire, avec un montant annuel énoncé et, pour
  L14, un engagement de couverture. C'est une piste, pas une cause
  établie : rien localement ne permet de la départager d'un blocage
  intermittent côté Vertex. L06 a toutefois bloqué deux fois sur deux.
- **Un indice sur la durée de réflexion.** L07 a mis 52 s pour 29 jetons
  de sortie déclarés, et Google a horodaté le 499 de L06 plus de cinq
  minutes après l'envoi. Avec `reasoning_effort: low` (1 024 jetons de
  réflexion au plus selon la documentation), de telles durées laissent
  penser que la réflexion n'est pas bornée comme prévu, ou qu'elle n'est
  pas comptée dans `completion_tokens`. Cela rejoint le point 1 ouvert
  après le premier passage : si la réflexion est facturée hors de
  `completion_tokens`, le contrôle des bornes de sortie se fait sur une
  valeur trop basse.

**Vérification proposée, sans appel** : comparer la sortie facturée du
28/10 (SKU de sortie Gemini 3.8 Flash, projet `projetanatt`) au total
mesuré des appels connus, soit 18 034 jetons d'entrée et 1 631 de sortie
sur les quatre passages. Une sortie facturée nettement supérieure prouve
que la réflexion n'est pas comptée : il faudrait alors arrêter la
campagne et faire lire à l'adaptateur le détail d'usage avant de
continuer.

## Preuves

Dans [`preuves-l5-vertex-2026-10-16/`](preuves-l5-vertex-2026-10-16/) :

- `passage-2026-10-28-L01-R03/` : `passage.json`, `appels.json`,
  `resultats.json`, `rapport.md` et la lettre R03 (pour les grilles
  humaines) ;
- `passage-2026-10-28-restant/` : `passage.json`, `appels.json` (le banc
  arrêté ne produit ni rapport ni résultats) ;
- `passage-2026-10-28-reprise-L06/` : `passage.json`, `appels.json` du
  troisième passage ;
- `passage-2026-10-28-L07-arret-L14/` : `passage.json`, `appels.json` du
  quatrième passage ;
- `journal/budget.json` : copie à l'identique du journal privé **après le
  quatrième passage** (SHA-256 `59d9c696…`), bloqué sur L14, avec les deux
  rapprochements de L06. C'est la seule copie : elle remplace les précédentes.
  Aucun secret.

**Reprise dans une nouvelle session** : copier `journal/budget.json` vers
`.qualification-vertex/projetanatt-eu-gemini-3.8-flash/budget.json` avant
tout passage, puis vérifier l'empreinte. Ne jamais relancer sans ce
journal : ce serait ouvrir un second budget et effacer le blocage.

## Rapprochement de L14 et facture du 28/10 — S.203, 29/10/2026

Relevé du responsable dans la console `projetanatt`, le 29/10, méthode
`ChatCompletions` de l'Agent Platform API, 28/10 de 18:05 à 18:20 UTC.

**L14 : non facturée, rapprochée.** Sept réponses 200, deux à 18:11 et cinq
à 18:12 UTC : ce sont L07 à L13, les sept appels connus du quatrième
passage. Une seule 499 (requête annulée par le client), à 18:16, seule dans
sa minute : L14, abandonnée par le banc après 120 s vers 18:14, et
horodatée par Google environ deux minutes après l'abandon, comme L06.
Aucun jeton n'est relevé à 18:16. Inscrit par `banc:ia:rapprocher`
(`L14/extraction`, `NON_FACTUREE`) ; le blocage `MESURE_A_RAPPROCHER` est
levé, la réserve reste de 791,95 XOF pour 18 invocations, le journal compte
trois rapprochements. Nouvelle copie : `journal/budget.json`, SHA-256
`ff04b4ad…`, qui remplace la précédente (`59d9c696…`).

**Facture du 28/10 comparée aux mesures du banc.**

| | Mesuré par le banc (appels connus) | Facturé ou relevé | Écart |
|---|---|---|---|
| Entrée, journée | 18 034 | 21 986 (texte 10 646, image 11 340) | +3 952 |
| Sortie, journée | 1 631 | 3 201 | × 1,96 |
| Sortie, L07 à L13 (18:12–18:13) | 198 | 431 (365 + 66) | × 2,18 |
| Entrée, L07 à L13 (18:12) | 8 594 | 8 164 | −430 |

Montant filtré : 0,03 $, soit une vingtaine de XOF, très loin de la réserve
prudente (791,95 XOF) : le plafond n'a jamais été menacé, et aucun appel ne
dépasse ses bornes, même avec une sortie doublée (au plus quelques centaines
de jetons pour 5 120).

**Constat 1 — la sortie est sous-mesurée.** Sur les seules minutes de L07 à
L13, où l'attribution ne fait pas de doute, Google compte 2,18 fois la
sortie que le banc a mesurée. L'adaptateur compatible ne lit que
`usage.completion_tokens` (`src/server/ia/openai-compatible.ts`) : les
jetons de réflexion `low`, facturés en sortie, n'y figurent manifestement
pas. C'est le cas que le suivi prévoyait : le contrôle des bornes de sortie
se fait sur une valeur trop basse, et B-07 sous-estimerait aussi le coût
d'un fournisseur compatible en production (INV-6). **Ne pas reprendre la
campagne** avant que l'adaptateur lise la mesure complète.

**Constat 2 — l'entrée facturée dépasse la mesure de 3 952 jetons.** Ce
nombre est presque exactement l'entrée probable des trois requêtes annulées
(L06 deux fois, PDF comme L05 : 1 136 ; L14, JPEG comme L08 : 1 696 ; total
3 968). La page de tarifs dit pourtant que seules les réponses 200 sont
facturées, et aucun jeton n'est relevé à la minute de la 499 de L14. Ce
n'est donc qu'une coïncidence remarquable, pas une preuve : un autre trafic
du projet le même jour l'expliquerait aussi. La facture journalière ne
permet pas l'attribution par requête ; seul un export de facturation horaire
ou le support Google trancheraient. Les rapprochements de L06 et L14 restent
« non facturée » d'après les métriques par requête, et la réserve n'a rien
rendu.

**Suite proposée, sur décision du responsable.**

1. Lot de code : l'adaptateur compatible ajoute à la sortie les jetons de
   réflexion rendus par l'API (`usage.completion_tokens_details.reasoning_tokens`
   dans la forme OpenAI, si Vertex les y place), et classe la mesure
   `PARTIELLE` quand la réponse annonce une réflexion sans la chiffrer.
   Le champ exact se vérifie sur une réponse réelle : une invocation de
   diagnostic (une pièce déjà juste, par exemple L09), réservée au journal
   comme les autres, qui enregistre le bloc `usage` brut, sans secret.
2. Puis seulement, la reprise : L15 à L30, rédactions, relectures et avis
   (43 invocations, environ 1 892 XOF sur les 4 208,05 restants).
3. Constat 2 : relever, si possible, l'export de facturation horaire du
   28/10, ou poser la question au support Google ; vérifier que la
   production n'a pas appelé Vertex sur ce projet le même jour.

## Reste à faire et non prouvé

Lecture complète de la sortie par l'adaptateur (réflexion comprise),
attribution de l'entrée facturée en trop, décision sur L06 et L14,
fin du jeu (43 invocations), rapprochement avec
la facture, deux grilles humaines, DPA, résidence, conservation, incidents réels, configuration déployée.
**L5 non clôturé**, Q.A et M.C non levés.
