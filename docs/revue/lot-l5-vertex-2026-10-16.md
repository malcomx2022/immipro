# S.181 — L5 : région tranchée (`eu`), raisonnement `low`, campagne bornée sans appel

**16/10/2026**, base `841be33` (#294/S.180 fusionnée), branche
`claude/keen-heisenberg-wh72tm`. Instruction du responsable : reprendre L5,
puis, sur le relevé officiel du jour, « on part sur eu multi-région, valide
le réglage low ». Le protocole S.177 ([campagne Vertex](../exploitation/qualification-vertex-l5.md)),
le banc S.176, les décisions L1 à L4 et le code Claude ont été relus avant
toute modification. Aucun appel au fournisseur, aucun budget consommé,
aucun journal `.qualification-vertex` créé.

## Relevé officiel du 16/10/2026

Pages publiques de Google Cloud rendues par Chromium headless à travers le
proxy de la session, sans compte, sans OAuth, sans appel au modèle ; toutes
datées « Last updated 2026-10-15 UTC ». Le texte rendu et, pour le tableau
régional, les attributs du DOM (`aria-label="Supported"`, classe
`compare-yes`) ont été lus. Détail et adresses dans
[`releve-officiel.json`](preuves-l5-vertex-2026-10-16/releve-officiel.json).

| Point | Constat |
|---|---|
| Points servant `gemini-3.8-flash` | `global`, `us`, `eu` seulement. Les dix régions d'Europe, Belgique (`europe-west1`) comprise, et les sept des États-Unis sont vides pour toute la famille Gemini 3 ; Gemini 2.5 Flash y figure. La lecture du 15/10 qui croyait voir `europe-west1` était fausse. |
| Point multi-région UE | hôte `https://aiplatform.eu.rep.googleapis.com`, location `eu` ; la page précise qu'un point régional simple ne garantit ni résidence ni traitement en région, et qu'un point multi-région garantit le traitement ML dans la juridiction. |
| Tarif jusqu'au 31/12/2026, colonne Standard | entrée 0,75 $ global, 0,825 $ hors global ; sortie « réponse et raisonnement » 3,75 $ global, 4,125 $ hors global, par million de jetons. À partir du 01/01/2027 : 1,50 / 1,65 $ et 7,50 / 8,25 $. Prix en USD ; « seules les réponses 200 sont facturées ». |
| Fiche du modèle | GA, fenêtre 1 048 576 jetons, sortie 65 536 au plus, retrait le 02/09/2027 au plus tôt, PDF et images acceptés. |
| Jetons des médias | PDF 560 jetons par page par défaut (1 120 en haute résolution), image 1 120 par défaut. Les trente pièces du banc font une page ou une image A4 chacune. |
| Raisonnement | niveaux `LOW`, `MEDIUM` (défaut), `HIGH` pour 3.8 Flash, `MINIMAL` refusé ; jetons de réflexion facturés en sortie. Par l'API compatible OpenAI : `reasoning_effort` low = 1 024, medium = 8 192, high = 24 576 ; `max_tokens` pris en charge. L'API Gemini précise que `max_output_tokens` inclut les jetons de réflexion ; la référence Vertex ne le dit pas : à confirmer par la mesure `usage` du premier passage. |
| Change | BCE 15/10/2026 : 1 EUR = 1,1208 USD ; parité fixe 655,957 XOF par EUR ; 585,26 XOF par USD. |

## Décision du responsable

Point multi-région `eu` plutôt que `global` : traitement garanti dans
l'Union, au prix hors global. Raisonnement `low` : avec `max_tokens` à
4 096 et le niveau MEDIUM par défaut, Gemini 3 pouvait consommer le plafond
en réflexion et rendre des textes tronqués, que l'adaptateur refuse à juste
titre. Un autre modèle en `europe-west1` n'a pas été envisagé : le protocole
interdit la substitution.

## Correction

- `src/domain/ia/fournisseurs.ts` : `AI_OPENAI_RAISONNEMENT` lue par
  `niveauDeRaisonnement` (`low|medium|high`, vide = rien n'est envoyé, autre
  valeur refusée et dite par `manqueDuFournisseur`).
- `src/server/ia/openai-compatible.ts` : `ConfigurationCompatible.raisonnement`
  facultatif, envoyé tel quel en `reasoning_effort` devant le corps de chaque
  appel ; `src/server/dossiers/extracteur.ts` le lit dans la configuration.
  Les autres fournisseurs compatibles ne changent pas tant que la variable
  est vide.
- `src/domain/banc-ia/campagne-vertex.ts` : campagne
  `projetanatt-eu-gemini-3.8-flash`, région `eu` ; destination autorisée
  = hôte `aiplatform.eu.rep.googleapis.com`, chemin `locations/eu`, modèle,
  compte `immipro-vertex-ai`, PDF `image_url` **et** raisonnement `low`.
  `global`, `us`, toute région simple et tout autre niveau sont refusés.
- `scripts/banc-ia/lancer.mts` : reconnaît l'hôte multi-région comme Vertex
  et transmet le niveau à la vérification de destination.
- `.env.example`, protocole Vertex, DOC IA, `qualification-ia.md`,
  `IA-fournisseurs.md`, CLAUDE.md et registre alignés.

## Bornes de la campagne

[`campagne.json`](preuves-l5-vertex-2026-10-16/campagne.json) et
[`manifeste.json`](preuves-l5-vertex-2026-10-16/manifeste.json), sans
secret, acceptés par `lireCampagneVertex` et `lireManifeste`.

| Élément | Valeur | Justification |
|---|---|---|
| Entrée maximale | 10 240 jetons | consignes et schéma d'une demande, plus un média : image 1 120 ou page PDF 560 ; la critique reçoit en plus le texte produit, au plus 4 000 jetons |
| Sortie facturée maximale | 5 120 jetons | `max_tokens` 4 096 de l'adaptateur + 1 024 de raisonnement `low` par l'API compatible |
| Tarifs | 825 000 et 4 125 000 micro-USD par million | hors global, période introductive jusqu'au 31/12/2026 |
| Change majoré | 620 000 000 micro-XOF par USD | 585,26 au 15/10, marge de 6 % |
| Frais majorés | 1 200 ‰ | taxes et frais inconnus du compte, à confirmer dans la console |
| Réserve par invocation | 44,00 XOF | deux échanges, arrondi supérieur, formule du projet |
| Invocations possibles | 113 pour 60 prévues | 5 000 XOF ÷ 44,00 |

Ces bornes sont des hypothèses déclarées, pas une facture. Le premier
passage doit montrer, dans `usage`, une entrée sous 10 240 et une sortie
raisonnement compris sous 5 120 ; une mesure au-delà arrête la campagne
(`BORNE_FACTUREE_DEPASSEE`) et la borne se réexamine avec ses preuves, sans
remise à zéro du journal.

## Vérification locale

`npm run check` passe le 16/10/2026 : lint 0 erreur (1 avertissement
préexistant sur `purge-stockage.ts`), types, **197 fichiers / 3 920 tests**
dont 6 nouveaux (niveau de raisonnement lu, refusé, absent ; `reasoning_effort`
présent dans le corps reçu par le serveur local quand il est déclaré et
absent sinon ; destination `eu` acceptée en v1 et v1beta1, `europe-west1`,
`us`, `global`, niveau absent ou `medium` refusés ; CLI Vertex synthétique
sur l'hôte `eu` avec `reasoning_effort: low` tracé, budget et blocages
tenus), vocabulaire sans formulation interdite. `npm run check:audit` passe
avec l'exception `deepmerge-ts` déjà acceptée ; `npm run build` produit
l'application et le worker. Aucun test SDK ne contacte Google : clés RSA
synthétiques et serveurs locaux seulement.

## Exécution à venir

1. Le responsable pose le JSON du compte `immipro-vertex-ai` en **secret
   d'environnement** `AI_OPENAI_COMPTE_DE_SERVICE` (menu de l'environnement
   cloud, puis Modifier) ; une nouvelle session le lit. Jamais dans le chat,
   le dépôt ou un manifeste ; le coffre de production n'est pas consulté.
2. Il confirme la devise de facturation et les taxes du compte `projetanatt`.
3. Premier passage, commande dans [le protocole](../exploitation/qualification-vertex-l5.md#exécution-arrêt-et-reprises) :
   `--pieces L01,R03`. Lecture de `usage` et de `appels.json` ; si accès,
   formats et mesures passent, jeu complet sur le restant : pièces restantes,
   dix rédactions et critiques, dix références, sans rejouer L01 et R03.
4. Dans une session éphémère, archiver `budget.json`, `passage.json` et
   `appels.json` (sans secret) avec les preuves avant la fin de la session,
   et les remettre dans `.qualification-vertex/projetanatt-eu-gemini-3.8-flash/`
   avant toute reprise : une session neuve ne doit pas ouvrir un second budget.

## Reste à faire et non prouvé

- Accès réel du compte, présence du modèle sur `eu`, formats et mesures :
  rien n'est prouvé avant le premier passage.
- Rapprochement des appels du banc avec les mesures et la facture du projet,
  trafic de production exclu ; devise et taxes du compte.
- Deux grilles humaines indépendantes sur les dix textes ; DPA, résidence,
  conservation, incidents réels et configuration effectivement déployée.
- **L5 non clôturé**, Q.A et M.C non levés ; aucune fusion ni déploiement
  par ce lot.
