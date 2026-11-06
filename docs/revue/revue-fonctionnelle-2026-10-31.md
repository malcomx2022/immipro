# S.208 — Revue fonctionnelle, cartographie du restant et chemin vers la fin — 31/10/2026

Demande du responsable (31/10) : « faire une revue fonctionnelle du
projet, une cartographie du restant et comment arriver à finir le
projet ». Base relue : `main` `46c8b76` (#333, S.207, fusionnée). Aucune
PR ouverte à la relecture.

Ce lot est **documentaire**. Il ne change aucun code, schéma, drapeau
commercial ni service, et ne lève aucun préalable. Il rassemble en un
seul endroit ce qui était dispersé entre la
[revue du 22/10](revue-tests-2026-10-22.md) (§ 5, § 6, § 23 à § 27), le
[suivi L5](lot-l5-vertex-2026-10-28.md), la
[matrice de recette](../recette/matrice-v1.md), le
[dossier des préalables](../exploitation/levee-des-prealables.md) et le
registre `src/domain/exploitation/prealables.ts`, puis propose un ordre
pour finir.

Trois preuves restent distinctes (CLAUDE.md) : **code implémenté**,
**parcours éprouvé**, **préalable levé**. Ce document dit, pour chaque
reste, laquelle manque.

## 1. Ce que « fini » veut dire

DOC-11 § 7 découpe la V1 en quatre lots ; le registre des préalables en
deux jalons. Le projet est fini quand les deux jalons sont franchis, avec
leurs preuves, sur le périmètre V1 définitif (DOC-11 § 0) :

| Jalon | Ce qui doit être vrai | État au 31/10 |
|---|---|---|
| **J1 — ouverture publique** | Textes juridiques publiés (Q.A) ; IA de production qualifiée (L5) ; données sauvegardées hors du VPS et restaurables (L7) ; référentiel en vigueur sans trou (C-13) ; recette humaine signée (L6) | Q.A **levé** (29/10). L5, L7, L6 et C-13 ouverts |
| **J2 — encaissement commercial** | M.C levé (facture normalisée certifiée, TVA, émetteur) ; circuit vente + remboursement + avoir éprouvé en réel (L8, R-O04) | M.C ouvert, aucun rail réel |

Hors périmètre, et qui ne retarde pas la fin : WF-12 (consultants,
phase 3), OAuth Google, SMS, Essentiel → Dossier Pro, correction autonome
de la date de dépôt, paiement par carte Stripe (fermé pour le pilote).
Ces reports de DOC-11 § 0 restent décrits sans être promis.

## 2. Cartographie fonctionnelle au 31/10

Mise à jour de la table § 5.1 du 22/10 avec les lots S.184 à S.207.
Légende inchangée : **Éprouvé** (unitaire, PostgreSQL, navigateur) ;
**Partiel** (des gestes restent) ; **Bloqué** (code prêt, preuve
suspendue à un préalable externe) ; **Phase 3**.

| Module | Statut | Ce qui manque pour le clore | Nature du manque | Jalon |
|---|---|---|---|---|
| WF-01 Simulateur | Éprouvé | — | — | — |
| WF-02 Inscription, profil | Éprouvé | — (OAuth : V2) | — | — |
| WF-03 Recommandations | Éprouvé | — | — | — |
| WF-04 Ouverture de dossier | Éprouvé | — | — | — |
| WF-05 Achat de pack | **Bloqué (M.C)** | Série réelle ouverte, FedaPay en espace réel, achat réel relevé | Préalable externe + adaptateur de certification | J2 |
| WF-06 Pièces et analyse | **Bloqué (L5)** | Fin du jeu Vertex, décision sur la mesure de sortie, L06/L14, grilles humaines, DPA et résidence | Préalable externe (fournisseur) | J1 |
| WF-07 Complétude | Éprouvé | — | — | — |
| WF-08 Rédaction assistée | **Bloqué (L5)** | Rédactions, relectures et avis de la campagne (R01 à R10), grilles humaines | Préalable externe | J1 |
| WF-09 Échéancier, rappels | Partiel | Un rappel réellement reçu par le SMTP de production | Geste d'exploitation | J1 |
| WF-10 Clôture, purge | Éprouvé | Rétention des sauvegardes compatible avec INV-5 (voir § 4, F-2) | Exploitation | J1 |
| WF-11 Divergence de version | Partiel | Versions NL 2027 publiées avant le 31/12/2026 (C-13) | Contenu sourcé | J1 |
| WF-12 Consultants | Phase 3 | Hors V1 | — | — |
| WF-13 Partenaires | Partiel | Conditions d'affiliation et activation conformité (K.D) par destination | Décision commerciale | aucun : désactivé tant qu'absent |
| WF-14 Veille et publication | Partiel | Routine de veille réelle : qui relit, à quelle cadence, avec quelle trace | Organisation | J1 |
| WF-15 Administration | Partiel | B-04 remboursements réels (R-O04) | M.C | J2 |
| WF-16 Coûts IA | Partiel | Rapprochement facture réelle ; question de la sortie sous-mesurée (F-3) | L5 | J1 |

**Lecture.** Huit modules sur seize sont éprouvés. Aucun module n'attend
du code applicatif sans préalable : tous les restes tombent dans cinq
familles, qui structurent le § 3.

## 3. Le restant, par famille

### 3.1 Préalables externes

| Code | Reste | Preuve qui le clôt | Qui | Code à écrire ensuite |
|---|---|---|---|---|
| **L5** | Facture du 29/10 par SKU (L09 seule) ; au besoin diagnostic L07 ; décision sur la mesure de la réflexion ; décision L06/L14 ; 43 invocations (L15 à L30, rédactions, relectures, avis, ≈ 1 892 XOF sur 4 164,05 restants) ; deux grilles humaines ; DPA, résidence `eu`, conservation | Rapport de campagne complet, facture rapprochée, grilles signées, DPA Google relu | Responsable | Seulement si la réflexion est facturée hors `completion_tokens` : majoration ou paramètre propre à Google, choisi sur preuve |
| **M.C** | Immatriculation au système de facture normalisée, spécification officielle du service de certification, régime de TVA, mentions de l'émetteur (capital, RCCM, IFU), D-14, avoir partiel, territorialité | Les pièces listées au [dossier § 2](../exploitation/levee-des-prealables.md), puis une vente réelle + remboursement + avoir certifiés | Direction, expertise comptable | Adaptateur dans `src/server/facturation/certification.ts`, contre l'environnement de test officiel ; rien avant la spécification |
| **L8** | Bascule FedaPay en espace réel, essai réel, R-O04 | Numéros de transaction, facture et avoir relevés | Responsable, comptable | Aucun prévu |

### 3.2 Exploitation (L7, VPS)

| Ligne | Reste | État |
|---|---|---|
| D-26 / sauvegardes | Mise en service R2 dans l'ordre de S.207 : seau UE et jeton, remote `r2`, Cloudflare dans `sous_traitants` relu et validé nommément en B-08, cron 2 h UTC et ping Healthchecks, première restauration hors VPS, sort de `restic` | **Non commencé** ; rien n'est éprouvé contre R2 |
| Restauration sur clone | Base nommée, supprimée après, durée et comptes relevés | Accord du responsable requis |
| R-P01 | `certbot renew --dry-run`, `nginx -T` | Partiel ; certificat au 06/01/2027, renouvellement attendu vers le 07/12 |
| R-P11 | Détail de `/api/health` (administrateur ou jeton) | Non vérifié |
| R-P12 | Limites `docker stats`, battement, réconciliation récente | Partiel |
| R-P13 à R-P19 | Parcours candidat sur téléphone Android, parcours opérateur B-05 et B-04 | Non vérifié |
| R-P20 | Trois répétitions du runbook, une par déploiement | Non vérifié |
| Mémoire | Swap 1,6 Go sur 4 Go au 28/10, clamav ≈ 1 Go | À surveiller |

### 3.3 Recette humaine (L6)

R-I02 (clavier et TalkBack, protocole § 6) puis la signature de la
matrice (protocole § 8). R-O04 reste rattachée à M.C.

### 3.4 Données réglementaires

**C-13** : les deux règles NL de la graine finissent le 31/12/2026. Sans
versions 2027 publiées, plus aucune destination néerlandaise n'est
affichée le 1er janvier ; B-01 l'annonce depuis S.200. Il reste
**61 jours** au 31/10. Le contenu vient de la source officielle (INV-8)
et passe par le second lecteur (WF-14 § 4). Ne pas prolonger
`effectiveTo`.

### 3.5 Organisation et décisions

- WF-09 : un rappel reçu de bout en bout en production.
- WF-13 : conditions d'affiliation ; sans elles, les offres restent
  absentes par la requête (RG-13.4), ce qui est un état acceptable au
  lancement.
- WF-14 : désigner la routine de veille (veilleur, cadence, trace B-01).
- L9 : maintenance des dépendances au fil de Dependabot ; exception
  `deepmerge-ts`, avis modérés `minio`.

## 4. Constats de la revue

Relevés en croisant les documents ; aucun n'est une anomalie de code
reproduite, tous sont des écarts entre l'état déclaré et l'état servi.

**F-1 — Région de l'IA de production.** *Levé pour le traitement le
05/11 (§ 8) : la production appelle `eu` ; le texte publié reste à
corriger.* Le relevé du 29/10 (S.206) nomme
`europe-west1` dans la configuration de production, alors que le relevé
officiel du 16/10 (S.181) ne sert `gemini-3.8-flash` que sur `global`,
`us` et `eu`, et que la destination Vertex autorisée exige `eu`. Soit les
appels de production échouent, soit ils passent par un autre point que
celui déclaré. Les deux cas touchent WF-06/WF-08 et la page des données
personnelles (résidence). **À relever en premier**, en lecture seule :
point d'accès effectif, réponses récentes des appels de production.

**F-2 — Sauvegardes, texte publié et rétention.** La page publiée parle
de sauvegardes chiffrées GPG quotidiennes ; ce qui tourne est `restic`
sur le même disque, sans GPG, à la conservation inconnue. Tant que R2
n'est pas en service, le texte ne décrit pas la réalité, et une pièce
d'identité purgée peut survivre dans un instantané local au-delà de la
durée annoncée (INV-5). La mise en service R2 et la décision sur
`restic` ferment les deux points ensemble.

**F-3 — Coût IA possiblement sous-mesuré (INV-6).** Le 28/10, Google a
facturé 3 201 jetons de sortie pour 1 631 mesurés ; L09 seule ne montre
aucune réflexion cachée. Si l'explication « réflexion facturée hors
réponse » se confirme sur la facture du 29/10 ou sur L07, B-07
sous-estime le coût de production, pas seulement celui du banc. Le
quota en analyses (D1) n'est pas touché ; la surveillance de la marge
l'est.

**F-4 — Attribution brouillée.** Production et campagne L5 partagent la
facturation du projet `projetanatt`. Le rapprochement par journée ne
distingue pas les deux. Relever si la production a appelé Vertex les
28 et 29/10, ou séparer les projets pour la suite de L5 (décision du
responsable).

**F-5 — Deux échéances calendaires.** C-13 le 31/12/2026 et le
renouvellement du certificat (attendu vers le 07/12, échéance le
06/01/2027) tombent dans la même fenêtre. Le second est automatique mais
jamais éprouvé à blanc (R-P01).

## 5. Comment finir : ordre proposé

Chaque étape dit sa preuve de sortie. L'ordre suit le risque : d'abord
ce qui peut perdre des données ou afficher faux, puis ce qui a une
échéance, puis ce qui ouvre l'encaissement.

### Étape 1 — Sécuriser l'existant (semaine du 02/11)

1. Relever F-1 (région et point d'accès IA de production), lecture
   seule.
2. Mettre R2 en service dans l'ordre de S.207, jusqu'à la première nuit
   et son ping. Cloudflare nommé et relu en B-08 **avant** la première
   nuit.
3. Restauration de contrôle hors VPS, puis restauration sur clone, avec
   l'accord du responsable. Décider du sort de `restic` (F-2).
4. `certbot renew --dry-run`, `nginx -T`, détail de `/api/health`,
   `docker stats` : R-P01, R-P11, R-P12 passent « vérifié ».

*Sortie* : sauvegarde hors VPS restaurée et chronométrée ; R-P01, R-P11,
R-P12 vérifiés ; F-1 et F-2 clos.

### Étape 2 — Clore L5 (première quinzaine de novembre)

1. Facture du 29/10 par SKU ; au besoin, diagnostic L07 seul dans sa
   journée. Trancher F-3.
2. Si la réflexion est facturée hors réponse : **seul lot de code
   prévisible avant J1**, sur l'adaptateur compatible et B-07, avec
   tests rouges avant.
3. Décider de L06 et L14 : la revue humaine prend déjà le relais d'un
   délai dépassé (WF-06) ; il reste à dire si ce taux d'échec est
   acceptable au lancement.
4. Reprise des 43 invocations sur le journal `93175249…` remis en place.
5. Deux grilles humaines, DPA, résidence et conservation Google.

*Sortie* : rapport de campagne complet, facture rapprochée, WF-06,
WF-08 et WF-16 passent « éprouvé ».

### Étape 3 — Référentiel 2027 (au plus tard le 15/12)

Rédiger depuis la source officielle les versions NL 2027 (études et
kennismigrant), les faire relire par le second lecteur, les publier. B-01
ne doit plus rien annoncer. Garder deux semaines de marge avant le
31/12.

*Sortie* : C-13 clos, WF-11 « éprouvé ».

### Étape 4 — Recette humaine et runbook (novembre, en parallèle)

R-P13 à R-P19 sur téléphone et au bureau, R-I02 au lecteur d'écran, un
rappel reçu en production (WF-09), la routine de veille désignée
(WF-14), puis trois déploiements qui suivent le runbook (R-P20).
Signature de la matrice.

*Sortie* : **J1 franchi** — ouverture publique.

### Étape 5 — Encaissement (selon les pièces comptables)

1. Pièces M.C reçues (immatriculation, spécification, TVA, émetteur).
2. Lot de code : adaptateur de certification et ses tests contre
   l'environnement officiel.
3. FedaPay en espace réel, vente réelle, remboursement, avoir (R-O04).

*Sortie* : M.C retiré de `PREALABLES` sur preuve, **J2 franchi**.

## 6. Code encore à écrire

| Lot | Condition | Étape |
|---|---|---|
| Mesure de la sortie IA (adaptateur compatible, B-07) | Seulement si F-3 se confirme | 2 |
| Adaptateur de certification de la facture normalisée | Spécification officielle reçue (M.C) | 5 |
| Corrections issues de la recette humaine | Seulement sur défaut reproduit | 4 |
| Maintenance des dépendances (L9) | Au fil de l'eau | — |

Rien d'autre : sans préalable levé, écrire du code ne rapproche pas la
fin, et le risque est d'écrire contre ce qu'on suppose d'un service.

## 7. Ce que cette revue n'a pas fait

Aucun accès au VPS, à la console Google ni aux comptes de paiement ;
aucun appel IA ; aucun parcours navigateur rejoué. Les états cités
viennent des relevés consignés jusqu'au 29/10. Porte locale relue : lint,
types, 208 fichiers et 4 112 tests, vocabulaire : verts.

## 8. Relevé de production du 05/11 — F-1, raisonnement, tarif (S.217)

Relevé de l'exploitant sur le VPS, en lecture seule, le 05/11/2026. Base :
`main` `3b9e0ad` (#347). Lot documentaire : aucun code ni service touché
par ce lot.

| Contrôle | Constat |
|---|---|
| Fournisseur par fonction | `AI_FOURNISSEUR_EXTRACTION` et `AI_FOURNISSEUR_REDACTION` : `openai_compatible` |
| Modèle | `google/gemini-3.8-flash` |
| Point d'accès | `https://aiplatform.eu.rep.googleapis.com/v1beta1/projects/projetanatt/locations/eu/endpoints/openapi` |
| Raisonnement | `AI_OPENAI_RAISONNEMENT` **absente** : aucun `reasoning_effort` envoyé |
| Tarif (`/api/health`, détail) | un fournisseur tarifé, `EN_VIGUEUR`, 56 jours restants : échéance `2026-12-31`, déclarée après S.213 |

**F-1, levé pour le traitement.** La production appelle le point
multi-région `eu`, où le modèle est servi et le traitement reste dans
l'Union ; elle n'appelle pas `europe-west1`. Reste le **texte publié** : la
page des données personnelles annonce « Belgique (analyse IA, région
europe-west1) ». La prochaine version relue doit dire « Union européenne
(point multi-région `eu` de Google Cloud) », en même temps qu'elle ajoute
Cloudflare (S.207) et retire « messagerie, à confirmer » ; validée
nommément en B-08.

**F-6, nouveau : la production ne tourne pas dans la configuration
qualifiée.**

| | Production au 05/11 | Campagne L5 |
|---|---|---|
| Raisonnement | défaut du fournisseur (`medium` pour Gemini 3) | `low`, imposé (`campagne-vertex.ts`) |
| Version d'API | `v1beta1` | `v1` |

Le raisonnement est facturé en sortie : la production raisonne, et paie,
davantage que ce que L5 mesure, et ce trafic partage le projet
`projetanatt` avec la campagne (F-4). C'est une piste pour l'écart de
sortie du 28/10, non une preuve : rien n'attribue encore les jetons
facturés à la production plutôt qu'au banc. Le préalable L5 « choix
extraction/rédaction et configuration déployée » ne peut pas se lever
tant que la production diffère de la configuration éprouvée.

**Décision du responsable (05/11) : aligner la production** sur la
campagne : `AI_OPENAI_RAISONNEMENT=low` et `AI_OPENAI_URL` en `/v1/`.
L'origine autorisée (`AI_OPENAI_ORIGINE_AUTORISEE`) ne change pas : seul le
chemin change, l'envoi des pièces reste autorisé. Application par
l'exploitant dans `.env.app`, puis recréation de `app` et `worker`.
**Configuration vérifiée le 06/11** (relevé de l'exploitant, après
copie de sûreté `.env.app.avant-s216` et recréation de `app` et `worker`) :
`AI_OPENAI_RAISONNEMENT=low`, `AI_OPENAI_URL` en
`https://aiplatform.eu.rep.googleapis.com/v1/projects/projetanatt/locations/eu/endpoints/openapi`.
F-6 est clos pour la configuration. **Reste non vérifié** : une lecture
réelle après l'alignement, avec sa ligne `CONNUE` dans `AiUsage` ; le
préalable L5 « configuration déployée » ne se lève qu'avec elle.

**Échéance du tarif.** L'alerte de `/api/health` passera en
`EXPIRE_BIENTOT` le 01/12 : relever la grille 2027 sur la page officielle
des prix avant le 31/12, dans la même fenêtre que C-13.

**Reste de l'étape 1** (§ 5) : vérification de l'alignement ; R-P11
(détail de `/api/health`, désormais lisible avec le jeton) ; R-P01
(`certbot renew --dry-run`, `nginx -T`) ; R-P12 (limites, battement,
réconciliation) ; F-2 (contenu et rétention de `restic`) ; mise en
service R2 et restauration hors VPS.

## 9. « Rédiger » menait à une page introuvable (S.218) — 06/11/2026

Relevé par le responsable en production, le 06/11 : sur un dossier Suisse
études, la ligne « CV et plan d'études motivé » affiche « Rédiger » et mène
à « Cette page n'existe pas ou plus ». Rattachement : WF-08, écrans C-06
(checklist) et C-09 (complétude), R-02.

**Deux défauts.**

1. `lienDePiece` construisait `/dossiers/<id>/redaction/<id du document>`.
   La page de rédaction lit ce segment comme un **type** de pièce
   (`lettre-motivation`…) : toute pièce à rédiger menait à « introuvable ».
   Les parcours ouvraient la rédaction par son adresse et ne cliquaient
   jamais sur la ligne ; le prototype utilisait le type comme identifiant,
   ce qui masquait l'écart.
2. `cv_plan_etudes` (CH) est `nature: rediger` au référentiel, mais aucun
   entretien guidé n'existe pour elle (quatre seulement : lettre de
   motivation, projet d'études, intention de retour, prise en charge).

**Correction.** La pièce porte `redaction`, le type de son entretien quand
il existe (`typeDeRedaction`, une seule correspondance code → route,
partagée avec la lecture de la rédaction). `lienDePiece` mène à
`/redaction/<type>` ; sans entretien, au dépôt `/pieces/<id>`, et la ligne
se nomme « Ajouter » (décision du responsable, 06/11 : le CV et plan
d'études se dépose en PDF en attendant un entretien dédié). Le sous-titre
du dépôt ne propose l'entretien que s'il existe.

**Preuves.** `tests/lien-rediger.test.ts` (16 tests, dont trois rouges sur
le code d'avant) : lien jamais construit sur l'identifiant, repli au dépôt,
libellé, sous-titre, `versPiece`, et un inventaire du référentiel qui
n'admet que `CH:cv_plan_etudes` sans entretien. Parcours « rédaction
assistée » : la ligne de checklist est cliquée et l'adresse attendue est
`/redaction/lettre-motivation` ; 38/38 en Chromium 1440. Porte unitaire :
222 fichiers, 4 431 tests.

**Reste.** Un entretien dédié au CV et plan d'études, s'il est voulu :
contenu à écrire et relire.

## 10. Le fichier envoyé n'était pas montré (S.221) — 06/11/2026

Relevé par le responsable en production, le 06/11, sur le résultat
d'analyse d'un justificatif de logement : l'écran C-08 affiche un cadre gris
« aperçu de la pièce · page 1 sur 1 », sans le fichier. Rattachement :
WF-06, écran C-08, RG-06.4.

**Cause.** Le cadre est un texte du prototype, posé sur aucun fichier, et
le nombre de pages était écrit en dur par la lecture (`pages: 1`). La route
de la pièce signait pourtant déjà l'URL de lecture (`urlDeLecture`), et
l'archive comme B-05 s'en servaient. B-05 avait perdu le même faux aperçu
en S.157 ; l'écran candidat l'avait gardé.

**Correction.** `ApercuDeLaPiece` demande l'URL à la route de la pièce à
l'ouverture de l'écran, et la charge dans un cadre (`frame-src` du stockage,
déjà autorisé pour B-05). L'URL n'est ni stockée ni posée dans le rendu
serveur : elle vaut cinq minutes, et « Recharger l'aperçu » en redemande
une. La décision de montrer reste à `urlDeLecture` : une pièce en contrôle
antivirus dit la raison du serveur, une pièce purgée le dit, un échec de la
route est dit avec « Réessayer l'aperçu ».

**Preuves.** `tests/ui/apercu-piece.test.tsx` (7 tests, le premier rouge sur
le code d'avant) : plus de cadre inventé, URL demandée à la route et chargée,
rechargement, raison du contrôle, purge, échec puis reprise, aucune
signature côté écran. Le test L1 de S.172 n'admet plus « aucun appel » mais
« la seule lecture de la pièce, sans méthode ni corps » : aucune relance ni
débit à l'affichage. Porte unitaire : 223 fichiers, 4 444 tests.

**Non éprouvé.** L'affichage réel d'un PDF et d'une photo depuis le stockage
de production : il dépend du type de contenu conservé à la promotion hors
quarantaine, comme pour B-05.

