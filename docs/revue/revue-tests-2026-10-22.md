# S.183 — Revue des tests unitaires, d'intégration et fonctionnels, état des modules — 22/10/2026

Demande du responsable (22/10) : revue complète des tests unitaires,
d'intégration et fonctionnels, point du restant, mise à jour des fichiers
Claude et liste des modules avec leur statut. Base relue : `main`
`a857390` (#297, S.182 fusionnée). PR ouvertes à la relecture : #298, #299
et #300, Dependabot seulement, non reprises par ce lot.

Ce lot est une **revue**. Il ne change aucune règle métier, aucun schéma,
aucun drapeau commercial ni aucun service. Deux retouches d'hygiène de la
suite, sans effet sur le produit (§ 4). Il ne lève aucun préalable : L5,
L6 (humain), L7 (cible), L8, Q.A et M.C restent ouverts.

Trois preuves restent distinctes (CLAUDE.md) : code implémenté, parcours
éprouvé, préalable levé. Une suite verte n'en certifie qu'une.

## 1. Les trois niveaux de tests

| Niveau | Où | Ce qu'il tient | Ce qu'il ne tient pas |
|---|---|---|---|
| **Unitaire** | `tests/*.test.ts`, `tests/ui/*.test.tsx` — Vitest, jsdom | Domaine pur, composeur de routes et services avec Prisma simulé, écrans React, garde-fous d'architecture (domaine pur, jetons Tailwind, liens, vocabulaire) | Une contrainte SQL, une course réelle, un fichier réellement envoyé |
| **Intégration** | `scripts/fumee-*.mts`, `smoke:migrations`, `smoke:worker`, diagnostics `scripts/recette/diagnostic-*.mts` | Vrais services sur PostgreSQL jetable : migrations et garde-fous SQL, worker pg-boss 12, paiement (tunnel, FedaPay, réconciliation, remboursement, montée), antivirus, extraction et rédaction contre le vrai SDK et un service d'essai, SMTP local, facturation, purge, concurrence | Un fournisseur réel (IA, paiement, certification fiscale), nginx/TLS, le VPS |
| **Fonctionnel** | `tests/parcours/candidat.spec.ts` (16 scénarios), `tests/photographies/parcours.spec.ts` (14) — Playwright × 6 profils | Vraie application `standalone`, vrai worker, base jetable, IA et checkout **scriptés** ; contenu métier **et** effet en base de chaque geste | Lecteur d'écran humain, appareil réel, encaissement, modèle réel |

### Répartition relevée

- **Unitaire : 199 fichiers, 3 940 tests.** Environ 53 fichiers sur le
  domaine pur, 92 sur les routes et services serveur (Prisma simulé),
  33 d'interface (`tests/ui/`), 21 contrats statiques d'architecture.
- **Intégration : 30 fumées** de la porte (`validation.yml`, migrations,
  worker et banc compris), 2 diagnostics IA contractuels et le bac à
  sable des fournisseurs, qui s'abstient sans clé et le dit. Toutes
  les fumées déclarées dans `package.json` sont appelées par la porte :
  aucune fumée orpheline.
- **Fonctionnel : 180 exécutions** à chaque porte — 96 parcours
  (16 × 6 profils) et 84 scénarios photographiques (14 × 6).

## 2. Résultats exécutés le 22/10/2026

Conteneur éphémère, Node 24.22.1, PostgreSQL 16.15 local, `npm ci`.

| Contrôle | Résultat |
|---|---|
| `npm run lint` | 0 erreur ; l'avertissement « préexistant » reporté depuis S.180 est **supprimé** (§ 4) |
| `npm run typecheck` | Vert |
| `npm run test` | **199 fichiers, 3 940 tests verts**, 99 s ; **201 / 4 009** après l'ajout des tests de route et du test du banc (C-6) |
| `npm run check:copy` | « Aucune formulation interdite » |
| `npm run check:audit` | Aucune élevée ou critique sans motif ; `deepmerge-ts` acceptée ; 4 modérées (`stream-json`, `decode-uri-component`), toutes amenées par `minio` 8.0.7 |
| `npm run build`, `prisma validate` | Verts (app `standalone` et `dist/worker.js`) |
| Migrations, worker, banc | `smoke:migrations`, `smoke:worker -- --base`, `smoke:recette` verts |
| 27 fumées métier | Toutes vertes : files, graine, tunnel, FedaPay, réconciliation, consultation, conservation, remboursement, courrier, balayage, extraction, usages IA, rédaction, avis IA, relecture exclusive, rappels, transitions, publication, juridique, relecture, facturation, rôle, éditoriale, diagnostic, purge, montée, dépôt |
| Diagnostics IA | `diagnostic-ia` : 0 échec (DIA-01 à DIA-06) ; `diagnostic-relecture` : vert |
| Bac à sable des fournisseurs | **Non éprouvé** : aucune clé, il s'abstient et le dit |
| Total intégration | 2 317 contrôles ✓ relevés dans les journaux, aucun échec |
| `test:parcours`, Chromium 390 et 1 440 px | **32/32 verts** en 4,7 min |
| `test:photos`, Chromium 390 et 1 440 px | **28/28 verts** en 50 s |
| Firefox et WebKit | Non rejoués ici (navigateurs non installables dans ce conteneur) ; couverts par la porte CI de chaque PR |

## 3. Couverture : constats

**C-1 — Routes API sans test direct.** 41 des 73 routes sont importées par
un test unitaire ou une fumée. Sur les 32 autres, la logique vit dans
`src/server/` et y est testée, et une partie est parcourue par la recette
navigateur (clôture, signalement, revue B-05, B-07, B-04, complétude,
rédaction). Restent **sans aucune preuve exécutée** au niveau HTTP :
remboursement manuel et par tranche (B-04), suppression et vérification
d'un utilisateur (admin), partages de compte et leur retrait, migration de
version d'un dossier (WF-11), correction de la date de dépôt, échéancier,
rappels de compte, journal et veille (admin), notification lue, statut
de paiement, packs, destinations, partenaires d'un dossier, rendez-vous
consultant. Ce sont précisément les lignes « non vérifié » de la matrice
(R-O03, R-O04, R-O05, R-C08 échéancier). Proposition : un test de route
par écriture (droits, motif obligatoire, idempotence) avant la signature.

**Traité le 22/10, à la demande du responsable** :
`tests/routes-ecritures.test.ts`, 66 tests sur les quatorze écritures de
la liste — remboursement manuel et par tranche (B-04), suppression,
vérification, suspension et rétablissement d'un compte (B-03), retrait
d'un partage, arbitrage de divergence (WF-11), correction de la date de
dépôt, replanification de l'échéancier (WF-09), préférences de rappel,
relevé de veille (WF-14), notification lue, suite partenaire (WF-13),
rendez-vous consultant (WF-12). Chaque route est vérifiée sur cinq
points : rôle déclaré et limite sensible ; corps refusé avant tout
effet ; motif au journal avant l'écriture, et jamais pour une décision
refusée ; propriété lue avant d'écrire ; rejeu sans seconde ligne au
journal. Le composeur est remplacé par une capture de la définition
(idiome de `simulation-procedures`) : ces tests tiennent le contrat de la
route, pas une contrainte SQL. Contrôle de mutation : huit défauts
injectés dans les routes (journal d'un rejeu, suppression non demandée,
dossier d'autrui, notification sans propriétaire, dossier figé, sessions
non fermées, horaire hors offre, rappels d'un autre compte), chacun fait
échouer un test ; sources restaurées. Les routes de lecture de la liste
restent sans test direct, et la preuve navigateur de R-O03/R-O04/R-O05
reste à faire.

**O-4 — motif de suspension plus court que les autres actions B-03.**
La suspension (`PUT /api/admin/utilisateurs`) accepte un motif de trois
caractères, alors que la relance de suppression et le renvoi de code
exigent `MOTIF_MINIMUM_COMPTE` (dix). RG-15.1 est tenue (motif
obligatoire), mais un motif comme « abc » ne se relit pas au journal.
**Tranché et corrigé le 22/10** : le responsable a demandé l'alignement.
La route lit désormais `MOTIF_MINIMUM_COMPTE`, la constante qu'utilisait
déjà l'écran B-03 (`obstacleALActionCompte`) ; un appel direct à l'API ne
contourne plus le seuil de l'écran. Le test a d'abord échoué sur le code
d'origine (« abus » accepté), puis passé après correction.

**C-6 — Faux code de vérification relevé par le banc (corrigé).** La
première porte CI de la PR #301 a échoué sur Firefox 1 440 px : quatre
codes saisis, quatre refus (422), alors que chaque renvoi avait bien
produit un courrier. Le banc relevait le code dans le courrier brut après
avoir retiré les coupures quoted-printable (`=\r\n`) partout ; l'objet
encodé se terminant par `?=`, ce retrait recollait aussi les en-têtes, et
« code » se retrouvait à quelques caractères du `Message-ID`. Quand son UUID
aléatoire commençait par six chiffres, le journal portait un faux code.
Défaut probabiliste, latent sur `main`, sans effet sur l'application ni sur
un vrai courrier. Reproduit avec le courrier réel de `nodemailer`
(`872051` relevé au lieu de `964475`) ; `codeDuCourrier`
(`scripts/recette/courrier.ts`) ne lit plus que le corps, et
`tests/banc-courrier.test.ts` fixe le cas.

**C-2 — Modules faiblement couverts.** `domain/echecs`,
`domain/stockage`, `domain/navigation` : un seul fichier de test chacun,
mais ce sont des tables ou des fonctions courtes, couvertes aussi par les
tests de routes. `server/editorial` n'a pas de fumée propre : sa lecture
est éprouvée par `smoke:editoriale` (graine) et la recette photographique.
Aucun module métier n'est sans test.

**C-3 — Gestes fonctionnels encore absents** (matrice V1) : échéancier
en navigateur, changement de fuseau, pièce périmée, purge effective et
portabilité, publication → divergence → arbitrage (R-O03), remboursement
→ avoir (R-O04, dépend de M.C), suppression de compte (R-O05), lecteur
d'écran et TalkBack (R-I02), formulaires back-office hors B-05 (R-I04).

**C-4 — Fixtures d'interface incomplètes.** Le test P-03 (`p0-public`)
fournissait des destinations écartées sans `slug`, champ requis par le
type `Ecartee` : React avertissait d'une clé absente. Ce n'était pas un
défaut du produit (le serveur fournit le `slug`), mais l'avertissement
masquait un éventuel vrai doublon de clé. Corrigé (§ 4). L'observation
O-1 (« Pays-Bas » deux fois, une par dispositif, sans nommer le
dispositif) était restée ouverte : corrigée en S.187 (§ 12).

**C-5 — Bruit de console attendu.** Les autres sorties `stderr` de la
suite sont voulues (variables dépréciées `*_SECRET_KEY` jusqu'au
31/12/2026, antivirus en erreur simulée, transport de courrier non
branché) ; deux avertissements `act(...)` sur `Attente` sont sans effet sur
les assertions.

## 4. Retouches de ce lot

- `tests/ui/p0-public.test.tsx` : `slug` ajouté aux trois destinations
  écartées des fixtures (C-4). 23 tests verts, plus aucun avertissement.
- `src/domain/exploitation/purge-stockage.ts` : suppression d'une
  directive `eslint-disable-next-line no-control-regex` devenue inutile
  (l'expression utilise des échappements `\u`). Comportement inchangé ;
  `npm run lint` passe à 0 avertissement.

## 5. Modules et statuts

Légende : **Éprouvé** — tests unitaires, intégration PostgreSQL et
parcours navigateur de la porte ; **Partiel** — implémenté et testé, des
gestes ou cas restent non vérifiés ; **Bloqué** — code prêt, la preuve
dépend d'un préalable externe ; **V2** — reporté par DOC-11 § 0.

### 5.1 Modules fonctionnels (DOC-11)

| Module | Statut | Preuves | Reste |
|---|---|---|---|
| WF-01 Simulateur | Éprouvé | Domaine `simulateur/` ; parcours clavier six réponses ; photographies ; procédure nommée partout où un pays en publie plusieurs (O-1, § 12) | — |
| WF-02 Inscription, profil, consentements | Éprouvé | `comptes/`, `acces/comptes` ; parcours inscription + téléphone (S.178), retrait du consentement, suppression demandée et reprise (R-O05, § 8) | Portabilité en navigateur ; OAuth Google V2 |
| WF-03 Recommandations | Partiel | Domaine, résultats sourcés, comparateur ; trois profils contrastés en navigateur (§ 13) | Comparateur en navigateur |
| WF-04 Ouverture de dossier | Éprouvé | Règle figée (INV-3), parcours ouverture | — |
| WF-05 Achat de pack | Bloqué (M.C) | Tunnel, FedaPay, réconciliation, remboursement, montée sur PostgreSQL ; achat scripté en navigateur | Bac à sable réel FedaPay/Stripe, certification fiscale, essai réel |
| WF-06 Pièces et analyse | Bloqué (L5) | Balayage, extraction, destination L1, mesure L2 ; dépôt, coupure, réponse tardive, revue B-05 en navigateur | Qualification réelle Vertex `eu` |
| WF-07 Complétude | Partiel | Domaine `completeness/`, relecture humaine, transitions ; péremption en navigateur, C-16/C-17 corrigés (§ 13) | Relecture de complétude en navigateur |
| WF-08 Rédaction assistée | Bloqué (L5) | Avis L3, relecture exclusive L4, rédaction ; parcours rédaction, DOCX, deux onglets, saisie tardive (S.182) | Modèle réel qualifié |
| WF-09 Échéancier et rappels | Partiel | `smoke:rappels`, `smoke:depot` ; échéancier et fuseau en navigateur, C-15 corrigé (§ 13) | Réception courriel réelle |
| WF-10 Clôture, issue, purge | Éprouvé | Transitions, conservation, purge (INV-5) ; parcours dépôt déclaré, clôture, purge effective et portabilité (§ 13) | — |
| WF-11 Divergence de version | Partiel | `smoke:publication`, `smoke:transitions` ; R-O03 en navigateur sur la règle NL à fin prévue (§ 8, § 9) | C-13 : versions 2027 des règles NL à publier avant le 31/12/2026 |
| WF-12 Consultants | Phase 3 | `smoke:consultation` (concurrence sur créneau) | Restrictions de lancement maintenues |
| WF-13 Partenaires | Partiel | Domaine `partenaires/`, accès | Route d'un dossier sans test direct, conditions d'affiliation |
| WF-14 Veille et publication | Partiel | Second lecteur éprouvé en navigateur depuis B-02 (§ 8), seuils des conditions lus et saisis dans B-02 (C-12, § 11), textes juridiques | Routine de veille réelle |
| WF-15 Administration | Partiel | B-05, B-03 (relance de suppression), B-04 (rapprochement, grand livre) et B-08 en navigateur, rôles, journal, facturation (§ 13) | B-04 remboursements (M.C), autres formulaires (R-I04) |
| WF-16 Coûts IA | Partiel | Mesures L2, B-07 mobile/bureau, export | Rapprochement avec la facture réelle (L5) |

### 5.2 Modules techniques

`src/domain/` — logique pure (27 modules) :

| Module | Lignes | Fichiers de test | Statut |
|---|---|---|---|
| backoffice | 3 367 | 25 | Éprouvé |
| banc-ia | 1 673 | 4 | Éprouvé (banc), qualification L5 ouverte |
| completeness | 587 | 12 | Éprouvé |
| comptes | 1 085 | 13 | Éprouvé |
| consultants | 1 200 | 11 | Éprouvé, ouverture phase 3 |
| copy | 254 | 60 | Éprouvé (quatre points d'application) |
| courrier | 250 | 2 | Éprouvé (SMTP local) |
| destinations | 143 | 2 | Éprouvé |
| dossiers | 5 056 | 37 | Éprouvé |
| echecs | 463 | 1 | Éprouvé (aussi par les routes) |
| editorial | 365 | 3 | Éprouvé |
| etats | 138 | 2 | Éprouvé |
| exploitation | 1 993 | 24 | Code éprouvé ; exécution sur cible ouverte (L7) |
| facturation | 554 | 3 | Bloqué (M.C) |
| format | 651 | 11 | Éprouvé |
| ia | 724 | 10 | Éprouvé (banc), L5 ouvert |
| juridique | 1 127 | 4 | Code éprouvé ; textes à valider (Q.A) |
| navigation | 60 | 1 | Éprouvé |
| notifications | 797 | 7 | Éprouvé |
| paiement | 2 359 | 22 | Bloqué (M.C) |
| partenaires | 322 | 5 | Partiel |
| payments | 1 487 | 27 | Bloqué (M.C) |
| redaction | 1 725 | 15 | Éprouvé (banc), L5 ouvert |
| rules | 813 | 9 | Éprouvé |
| securite | 568 | 6 | Éprouvé |
| simulateur | 707 | 3 | Éprouvé |
| stockage | 105 | 1 | Éprouvé |

`src/server/` — accès aux données et services (20 modules) :

| Module | Lignes | Tests | Fumées | Statut |
|---|---|---|---|---|
| acces | 5 684 | 35 | 16 | Éprouvé |
| comptes | 195 | 1 | 1 | Éprouvé |
| consultations | 191 | 1 | 1 | Phase 3 |
| courrier | 281 | 4 | 5 | Éprouvé |
| dossiers | 2 009 | 9 | 9 | Éprouvé |
| editorial | 62 | 1 | 0 (graine et photographies) | Éprouvé |
| exploitation | 1 172 | 10 | 9 | Code éprouvé, cible L7 ouverte |
| facturation | 607 | 2 | 1 | Bloqué (certification fiscale) |
| http | 863 | 11 | 1 | Éprouvé |
| ia | 767 | 9 | 5 | Éprouvé (banc), L5 ouvert |
| jobs | 4 839 | 32 | 14 | Éprouvé |
| juridique | 405 | 2 | 1 | Code éprouvé, Q.A ouvert |
| lecture | 4 679 | 32 | 12 | Éprouvé |
| paiement | 2 989 | 16 | 8 | Bloqué (M.C) |
| redaction | 800 | 10 | 5 | Éprouvé (banc), L5 ouvert |
| regles | 535 | 4 | 1 | Éprouvé |
| revue | 201 | 4 | 1 | Éprouvé |
| securite | 969 | 11 | 6 | Éprouvé |
| veille | 215 | 2 | 1 | Partiel (routine réelle) |
| vue | 370 | 7 | 2 | Éprouvé |

`src/app/` — 62 écrans (11 back-office, 28 candidat et paiement,
8 compte et authentification, 15 publics) et 73 routes API. Les quatre pages juridiques
restent volontairement introuvables tant que Q.A n'est pas levé.

## 6. Le restant

| Lot | État au 22/10 | Qui |
|---|---|---|
| L0–L4 | Fusionnés et déployés (S.170–S.175) | — |
| L5 Qualification IA | Région `eu`, raisonnement `low`, campagne bornée ; aucun appel payant, clé à fournir en secret d'environnement | Responsable |
| L6 Recette front | 96 parcours + 84 scénarios verts ; lecteur d'écran humain, gestes C-3, signature de la matrice | Responsable + tests à compléter |
| L7 Exploitation | B-04/B-07 corrigés ; diagnostics, inventaire, sauvegarde/restauration sur clone, services cibles | Responsable (VPS) |
| L8 Paiement et lancement | Textes juridiques, coordonnées, TVA, certification fiscale, essais réels | Responsable, juriste, comptable |
| L9 Maintenance | #298–#300 Dependabot ouvertes ; exception `deepmerge-ts`, avis modérés `minio` | Code |
| Q.A / M.C | Ouverts | Responsable |

Travail de code encore possible sans préalable externe, par priorité :

1. ~~Tests de route pour les écritures listées en C-1~~ : fait le 22/10
   (66 tests, § 3). O-4 tranchée et corrigée le même jour.
2. ~~Parcours navigateur pour R-O03 et R-O05~~ : faits le 22/10 (§ 8).
   L'échéancier et la péremption sont faits en S.188 (§ 13). C-7 est corrigé en S.184 (§ 9).
3. ~~Libellé du dispositif (O-1)~~ : fait en S.187 (§ 12). O-2 et O-3
   (textes d'aide B-05) étaient déjà corrigés en S.167 (RC-04, RC-05).
4. Relecture des trois PR Dependabot avec la porte complète.

## 7. Reproduction

```sh
npm ci && npx prisma generate
npm run check            # lint, types, 4 009 tests, vocabulaire
npm run check:audit && npm run build
# PostgreSQL local jetable, DATABASE_URL sur la boucle locale :
npm run smoke:migrations && npm run smoke:worker -- --base
npm run smoke:<nom>      # chaque fumée de validation.yml
npx playwright install --with-deps chromium firefox webkit
npm run test:photos && npm run test:parcours
```

## 8. Parcours R-O03 et R-O05 — 22/10/2026

Demande du responsable : ajouter les parcours navigateur de R-O03 et R-O05.
Deux scénarios en fin de `tests/parcours/candidat.spec.ts` ; chaque profil
passe donc de 16 à **18 parcours** (108 sur six profils). Ils ont relevé
six défauts : quatre corrigés ici, avec reproduction préalable, et deux
consignés.

**R-O03 — second lecteur, divergence, arbitrage.**

1. Le candidat ouvre un second dossier, sur la règle CH, et l'active par
   l'achat scripté.
2. L'administrateur abaisse de deux unités le seuil bloquant
   `preuve_fonds_annuelle`, par `PUT /api/admin/regles/[id]` depuis sa
   session : c'est la seule voie, B-02 n'éditant pas les valeurs (C-12).
3. B-02 refuse sa publication et nomme la condition en cause.
4. Le veilleur corrige à une unité. Son bouton « Publier » est désactivé,
   avec sa raison (RG-14.2).
5. L'administrateur publie depuis B-02 : la v1 est archivée, et le journal
   donne le veilleur pour rédacteur.
6. Le worker propage une divergence MAJEURE, sans mettre le dossier en
   pause.
7. Le candidat migre depuis ses alertes (T-02) ; son dossier porte la
   nouvelle version.

Chaque profil abaisse le seuil d'une unité, sans incidence sur les autres
gestes.

**R-O05 — suppression demandée, puis reprise.**

- Le faux stockage du banc reçoit un mode « suppressions refusées »
  (`refuserLesSuppressions`). Il est désactivé par défaut, et seul le banc
  `--parcours` l'expose, par `POST /stockage` sur son serveur de contrôle.
- Déroulé :
  1. Demande de suppression du candidat pendant la panne ; sessions
     fermées.
  2. Même mot de passe refusé (401).
  3. Relance B-03 « non achevée ».
  4. Stockage rétabli ; relance achevée.
  5. Compte anonymisé, dossiers purgés, deux relances au journal.

| Constat | Défaut | Traitement |
|---|---|---|
| **C-7** | La graine livre les règles NL avec `effectiveTo = 2026-12-31`, une fin de validité prévue. La publication, la graine et le relevé du veilleur ne reconnaissent pour « en vigueur » qu'une version dont `effectiveTo` est nul. Publier la version 2027 n'archiverait pas la 2026 et ne préviendrait aucun dossier : deux versions PUBLISHED, aucune migration. C'est le cas que RG-14.3 annonce, « les montants IND changent au 1er janvier ». | **Corrigé en S.184** (lot dédié, § 9). |
| **C-8** | La purge efface le texte d'une version (`body`) mais garde sa date de relecture (`critiquedAt`). La garde `document_version_relecture_sur_un_texte` refusait la mise à jour : aucun dossier contenant une lettre relue ne se purgeait, pièces d'identité comprises (INV-5, clôture + 30 jours, suppression de compte en 500). | **Corrigé**, choix du responsable : la migration `20261022180000_relecture_purgee` admet une relecture datée sur une version purgée, et la refuse toujours ailleurs. Reproduit puis vérifié par `smoke:purge`. |
| **C-9** | `connecter` refusait un compte suspendu, mais pas un compte en suppression demandée. Purge inachevée, le mot de passe rouvrait une session sur des dossiers en cours de purge. | **Corrigé** : même refus, et même message, qu'un compte suspendu ; `tests/connexion-suppression-demandee.test.ts`. |
| **C-10** | Dans B-02, « Publier » enregistre d'abord les textes, et cet enregistrement réécrivait `verifiedBy` même sans changement. L'administrateur qui relisait la version d'un veilleur en devenait le rédacteur, et WF-14 §4 lui refusait la publication : une modification de condition bloquante ne pouvait jamais être publiée depuis l'écran. | **Corrigé** : un enregistrement sans changement de contenu ni de métadonnées n'écrit rien (`enregistrerLesTextes`). Reproduit puis vérifié par `smoke:publication`. Un texte réellement modifié fait toujours du publieur le rédacteur. |
| **C-11** | L'écran de suppression affichait « Tes pièces ont été supprimées » et « tu peux ouvrir un nouveau compte avec la même adresse » même quand le serveur rendait `supprime: false`. | **Corrigé** : état « Ta demande de suppression est enregistrée », qui dit ce qui est fait, ce qui reste et qu'il n'y a rien à refaire ; test d'interface. |
| **C-12** | B-02 ne montre pas les valeurs des conditions : le panneau des différences annonçait « 0 champ modifié » sur un seuil bloquant changé. Le second lecteur ne voit donc pas ce qu'il relit, et aucune valeur ne s'édite depuis l'écran. | **Corrigé en S.186** (lot dédié, affichage et modification, § 11). |

Résultats locaux, Chromium 390/1440 : **36 parcours sur 36** ;
`npm run check`, `smoke:publication`, `smoke:purge` et `smoke:migrations`
verts. Firefox et WebKit sont laissés à la porte CI.

La migration est un assouplissement. Elle s'applique avant l'application
et le worker, comme toute migration. Aucune ligne existante ne la viole.

**Sécurité, 22/10 au soir.** Pendant la porte locale, l'audit a relevé deux
avis publiés le jour même sur `next` ≥ 16.0.0 et ≤ 16.4.0 :
GHSA-2464-fhr4-w9xw, une exécution de code à distance non authentifiée par
l'API d'optimisation d'images avec des SVG (critique), et
GHSA-p3m5-59mp-jv5r, un déni de service par les Server Actions (élevé).
Ils rendaient la porte rouge pour toute proposition, `main` comprise. Le
correctif existe dans la PR Dependabot #300 : il est reporté ici a minima,
`next` et `eslint-config-next` en 16.4.2, sans les onze autres montées du
groupe. Le verrou ne change que la famille `next`. L'audit repasse sans
vulnérabilité élevée ou critique non motivée. Quand #300 sera fusionnée,
ce report n'aura plus d'effet. La version en service sur le VPS reste
exposée tant que `main` n'est pas redéployée avec ce correctif.

## 9. S.184 — C-7 corrigé, lot dédié — 22/10/2026

Demande du responsable : corriger C-7 dans un lot dédié. Base : `78cdbeb`
(#302 fusionnée).

**Cause.** Le domaine définit déjà une version en vigueur : mise en
vigueur un jour, et non archivée (`estEnVigueur`, `domain/backoffice/regle.ts`).
B-02 applique cette définition. Trois requêtes serveur l'avaient remplacée
par « `effectiveTo` nul », alors que `effectiveTo` porte aussi la fin de
validité prévue par l'autorité, que T-02 affiche au candidat (« applicable
jusqu'au »).

**Correction.** Les trois sites sont alignés sur la définition du domaine :

| Site | Avant | Après |
|---|---|---|
| `publierLaRegle` | prédécesseur à `effectiveTo` nul ; archivage qui écrase la fin prévue par la date du jour | prédécesseur publié une fois et non archivé ; l'archivage garde la fin prévue, ou pose la date du jour s'il n'y en a pas |
| `consignerLeReleve` | une version à fin prévue, dépubliée par l'échéance, restait dépubliée après un relevé « à jour » | republiée : une version remplacée est archivée, et donc déjà refusée en amont |
| graine `visa-rules.ts` | même critère que la publication | même définition ; la fin prévue est gardée |

Le filtre candidat (`filtrePourCandidat`) et T-02 continuent de lire
`effectiveTo` comme fin prévue. Aucun schéma ni aucune donnée ne change.

**Preuves.**

- `smoke:publication`, quinze vérifications nouvelles, rouges avant le
  correctif et vertes après :
  - fin prévue à venir, puis fin déjà passée (les montants de l'année
    suivante publiés en janvier) : la version est archivée et garde sa fin
    prévue ;
  - une seule version reste publiée, et le dossier est prévenu avec un
    arbitrage proposé ;
  - une version dépubliée qui porte une fin prévue est republiée au relevé.
- `tests/veille-relecture.test.ts` : la condition de remise en ligne ne lit
  plus `effectiveTo` ; un brouillon jamais publié et une version archivée
  restent refusés.
- Parcours R-O03 ramené sur la règle NL `kennismigrant` : la v1 de la
  graine est archivée avec sa fin au 31/12/2026, une seule version reste
  publiée, et T-02 annonce « avant le 31 décembre 2026 ». 36/36 sur
  Chromium 390/1440.
- `npm run check`, construction, fumées graine, transitions, éditoriale et
  migrations : vertes.

**C-13 — échéance de données, pas de code.** Les deux règles NL de la
graine portent une fin prévue au 31/12/2026. Dès le 01/01/2027, le filtre
candidat les écarte. C'est voulu (INV-8), mais aucune destination
néerlandaise ne s'afficherait alors, et les parcours qui ouvrent un dossier
« pays-bas » échoueraient. Les versions 2027 sont à relever et à publier
par la veille avant cette date. Depuis S.184, cette publication archive
bien la version 2026 et prévient les dossiers.


## 10. S.185 — C-14 corrigé, lot dédié — 23/10/2026

Demande du responsable : corriger C-14 dans un lot dédié. Base : `f8f0419`
(#305 fusionnée).

**Constat.** La porte de #305 a échoué une fois sur R-O03, en webkit-1440
seulement : après l'arbitrage, « Voir ma checklist » n'apparaissait pas
(`tests/parcours/candidat.spec.ts`). La relance est passée. Le parcours
ne se trompait pas : il voyait un défaut d'écran selon la vitesse du
rafraîchissement.

**Cause.** T-02 garde sa confirmation ouverte jusqu'à ce que le candidat
la ferme, puis lance `router.refresh()` pour que la liste perde l'alerte
tranchée. La page ne passe une divergence que tant qu'elle n'est pas
arbitrée : le rafraîchissement rendait T-01 sans divergence, et la
feuille, rendue sur cette prop, disparaissait avec la confirmation. Si
une autre divergence attendait, la feuille la recevait en gardant l'état
« arbitré » de la précédente : le candidat ne pouvait plus la trancher
depuis cette page.

**Correction.** `Alertes` fige la divergence à l'ouverture de la feuille
et la garde jusqu'à sa fermeture ; la feuille porte la clé de sa
migration, et repart vierge quand une autre divergence prend la place.
Aucun appel, aucun schéma, aucune donnée ne change.

**Preuves.**

- `tests/ui/p1.test.tsx`, deux tests nouveaux, rouges avant le correctif
  et verts après : la confirmation survit au rafraîchissement qui retire la
  divergence, et se ferme au geste du candidat ; une divergence suivante
  s'ouvre avec ses options, sans la confirmation de la précédente.
- `npm run check` (202 fichiers, 4 018 tests), construction, et parcours
  36/36 sur Chromium 390/1440. Firefox et WebKit sont laissés à la porte
  CI, où le défaut s'était montré.

## 11. S.186 — C-12 corrigé, lot dédié — 23/10/2026

Demande du responsable : corriger C-12 dans un lot dédié, affichage et
modification. Base : `3d05ccf` (#306 fusionnée).

**Constat.** B-02 ne montrait aucune condition. Son panneau des
différences comparait le montant, la date, le délai et le libellé, et
annonçait « 0 champ modifié » sur un seuil bloquant changé : le second
opérateur que WF-14 §4 exige relisait sans voir ce qu'il relisait. Aucune
valeur ne se modifiait depuis l'écran ; R-O03 écrivait le seuil par un
`fetch` de la branche `payload`, que l'écran n'emploie pas.

**Correction.**

| Couche | Ce qui change |
|---|---|
| Domaine (`domain/backoffice/regle.ts`) | `Regle.conditions` ; `conditionsAffichees`, `valeurLisible`, `lireSeuil` (saisie française), `avecLesSeuils` (recollage sur le payload en base, refus nommé d'un code absent ou d'une référence), `seuilsModifies` ; une ligne par condition dans `comparer` |
| Serveur | La branche `textes` du `PUT` porte `seuils`, par code. `enregistrerLesTextes` recolle textes puis seuils sur la ligne qu'il écrit, jamais sur la copie du client ; INV-3, C-10 et le vocabulaire inchangés |
| Écran B-02 | Section « Conditions » : seuil chiffré en saisie, référence (`exists`) en lecture, qualités, valeur en vigueur et message au candidat ; refus d'un seuil illisible à l'endroit du champ, enregistrement et publication désactivés tant qu'il l'est ; notes « Modifié / Inchangé » calculées au lieu d'être écrites en dur |

Seul un seuil chiffré se modifie : les autres valeurs du référentiel sont
des références de pièce, que le schéma rattache. La relecture et la
divergence restent décidées par `comparerLesVersions`, qui voyait déjà les
seuils ; le lot lui donne enfin une entrée depuis l'écran.

**Preuves.**

- `tests/conditions-b02.test.ts` (22 tests) : lecture, saisie française,
  recollage, refus nommés, relecture exigée sur un seuil bloquant.
- `tests/ui/p2-backoffice.test.tsx`, cinq tests C-12 rouges avant le
  correctif : conditions montrées, panneau à « 4 champs modifiés sur 6 »,
  seul le seuil modifié part, seuil illisible signalé et rien n'est envoyé.
- `smoke:publication`, onze vérifications rouges avant le correctif (la
  vue de B-02 ne portait pas de conditions) : seuil saisi → version
  ouverte, autres conditions intactes, version en vigueur non touchée,
  code absent refusé, rédacteur refusé, second opérateur publie, dossier
  figé prévenu (`CRITIQUE`).
- Parcours R-O03 : le seuil est saisi dans B-02 par l'administrateur puis
  par le veilleur, et le panneau des différences montre la condition.

## 12. S.187 — O-1 corrigé, lot dédié — 23/10/2026

Demande du responsable : corriger O-1 dans un lot dédié. Base : `d0ed9a1`
(#307 fusionnée).

**Ce qui restait.** S.167 (RC-01) avait fait nommer la procédure aux
résultats du simulateur, et l'accueil, les destinations, le comparateur,
le tableau de bord, la fiche détaillée et la portabilité montraient déjà
l'intitulé sous le pays. Le doublon observé le 22/10 (C-4) venait des
fixtures du test P-03, sans `procedure` ; la route en fournit toujours une.
Un écran restait : l'ouverture d'un dossier (C-05), qui disait
« Ouvre ton dossier Pays-Bas » pour la procédure études comme pour la
procédure emploi, au moment même où le dossier fige la règle (INV-3).

**Correction.** L'intitulé de la procédure s'affiche sous le titre, et le
formulaire est nommé par les deux (`aria-labelledby`). Aucun appel ni
aucune donnée ne change.

**Preuves.** `tests/ui/p0-dossier1.test.tsx` : la procédure ouverte est
nommée, et le nom du formulaire diffère entre études et emploi — rouge
avant le correctif. Parcours R-O03 : l'ouverture de `pays-bas-emploi`
nomme « kennismigrant ».

**Reste mineur, consigné.** Les titres d'onglet des pages d'un dossier
(« Checklist — Pays-Bas ») ne nomment que le pays ; l'en-tête de la page,
lui, porte la procédure.

## 13. S.188 — parcours navigateur manquants, lot dédié — 23/10/2026

Demande du responsable : ajouter les parcours navigateur manquants dans un
lot dédié. Base : `ddd22cf` (#308 fusionnée). Gestes visés : ceux de C-3
et des lignes « non vérifié » de la matrice, hors R-O04 (rail réel, M.C)
et lecteur d'écran humain (R-I02).

**Huit parcours ajoutés** à `tests/parcours/candidat.spec.ts`, chacun
contrôlé par son effet en base :

| Parcours | Matrice | Ce qui est vérifié |
|---|---|---|
| WF-03 profils contrastés | WF-03 | Trois jeux de réponses dans un contexte vierge : trois classements distincts, écartées motivées, écart chiffré pour le profil sans budget ni langue, source datée (INV-8), aucun mot interdit à l'écran candidat |
| Échéancier | R-C08 | Date fixée depuis l'écran, échéances posées depuis la règle figée, date trop proche signalée intenable, date proposée reprise au retour sur l'écran |
| Fuseau | R-K06 | Toronto et quatorze jours enregistrés, phrase des rappels recalculée ; un navigateur à UTC+14 lit le même échéancier, sans erreur d'hydratation ; l'« aujourd'hui » du dépôt est celui de Toronto |
| Pièce périmée | R-K06 | Justificatif déposé et lu, puis échu (précondition) : déclassé à l'affichage, « prêt » retiré, dépôt refusé en nommant la pièce, version neuve qui repose la péremption |
| Purge effective | R-C09 | Échéance annoncée atteinte (précondition), purge de rétention lancée à la main sous le nom de l'opérateur, versions vidées, journal, archive sans fichier, autre dossier intact |
| Portabilité | R-C09 | Export « Mes données » téléchargé : deux dossiers dont le purgé, une seule adresse (celle du titulaire), aucune clé de stockage, export journalisé |
| B-04 | R-I04 | Rapprochement lancé à la main, grand livre exporté avec la transaction du candidat |
| B-08 | R-I04 | Article neuf : brouillon qui promet enregistré, publication refusée par l'écran et par la route, négation publiée avec sa source, page publique, retrait (404) |

Trois préconditions nouvelles, bornées au candidat synthétique
(`tests/parcours/fixtures.ts`) : `perimerLaPiece` (le temps passe sur une
pièce périssable conforme), `echoirLaPurge` (l'échéance annoncée est
atteinte), et `purgerALaMain`, qui lance la commande d'exploitation
`scripts/purge-retention.mts` sur la base et le stockage du banc.

**Trois défauts relevés par ces parcours, corrigés dans le lot.**

- **C-15 — l'échéancier sans date ne la fixait pas.** Un dossier ouvert
  sur « Je ne sais pas encore » arrivait sur « L'échéancier attend ta date
  de départ », dont le bouton menait à la checklist, où rien ne la fixe.
  La route acceptait pourtant une première date. Le champ est désormais
  sur l'écran (`DateDeDepart`, partagé avec la replanification), libellé
  « Date de départ visée », bouton « Fixer la date ». Test d'écran rouge
  avant ; parcours rouge sur l'ancienne compilation.
- **C-16 — « prêt » sur une pièce obligatoire échue.** Entre l'échéance
  d'une pièce et la passe de nuit, la base garde le dossier `PRET` : la
  checklist annonçait « Ton dossier est prêt » sous « Remplacer ton
  justificatif », et la déclaration de dépôt passait. La vue et
  `declarerLeDepot` lisent la même péremption
  (`premiereObligatoireEchue`) ; le refus nomme la pièce, sa date et le
  geste. Quatre tests unitaires et trois vérifications de `smoke:depot`
  rouges avant.
- **C-17 — l'écran de la pièce disait « conforme » à une pièce échue.**
  La checklist la déclassait, C-08 relisait la lecture d'origine, sans
  bouton pour la remplacer. Le constat de péremption prime sur une
  lecture conforme, avec « Téléverser une autre version » ; la lecture
  d'origine reste connue pour le prix de la version suivante. Vérification
  de `smoke:extraction` rouge avant.

La passe de nuit (`declasserLesPiecesEchues`) reste nécessaire : c'est
elle qui écrit l'état stocké et prévient le candidat. Ces corrections
alignent seulement l'écran et la déclaration sur ce qu'elle écrira.

**Preuves.** Parcours 52/52 sur Chromium 390 et 1 440, sur le même banc
(26 par profil) ; Firefox et WebKit laissés à la porte CI.
Porte unitaire : 203 fichiers, 4 051 tests ; lint, types, vocabulaire,
`smoke:depot` et `smoke:extraction` verts.

**Ce qui reste non vérifié.** R-O04 (remboursement et avoir, M.C), le
lecteur d'écran humain (R-I02), la réception d'un rappel par courriel à
l'heure du fuseau (la passe horaire est éprouvée par `smoke:rappels`, pas
en navigateur), B-04 remboursement et tranche (dépendent d'un rail réel),
les autres formulaires d'administration (B-03 hors relance, B-06,
textes juridiques, veille).
