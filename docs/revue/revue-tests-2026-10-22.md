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
Le test fixe le comportement actuel ; l'alignement est une décision du
responsable, sans correction dans ce lot.

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
dispositif) reste ouverte : clés distinctes, libellé ambigu.

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
| WF-01 Simulateur | Éprouvé | Domaine `simulateur/` ; parcours clavier six réponses ; photographies | O-1 libellé du dispositif |
| WF-02 Inscription, profil, consentements | Éprouvé | `comptes/`, `acces/comptes` ; parcours inscription + téléphone (S.178), retrait du consentement | Suppression de compte (R-O05), portabilité en navigateur ; OAuth Google V2 |
| WF-03 Recommandations | Partiel | Domaine, résultats sourcés, comparateur | Profils variés en navigateur |
| WF-04 Ouverture de dossier | Éprouvé | Règle figée (INV-3), parcours ouverture | — |
| WF-05 Achat de pack | Bloqué (M.C) | Tunnel, FedaPay, réconciliation, remboursement, montée sur PostgreSQL ; achat scripté en navigateur | Bac à sable réel FedaPay/Stripe, certification fiscale, essai réel |
| WF-06 Pièces et analyse | Bloqué (L5) | Balayage, extraction, destination L1, mesure L2 ; dépôt, coupure, réponse tardive, revue B-05 en navigateur | Qualification réelle Vertex `eu` |
| WF-07 Complétude | Partiel | Domaine `completeness/`, relecture humaine, transitions | Péremption et fuseau en navigateur |
| WF-08 Rédaction assistée | Bloqué (L5) | Avis L3, relecture exclusive L4, rédaction ; parcours rédaction, DOCX, deux onglets, saisie tardive (S.182) | Modèle réel qualifié |
| WF-09 Échéancier et rappels | Partiel | `smoke:rappels`, `smoke:depot` | Échéancier en navigateur, réception courriel réelle |
| WF-10 Clôture, issue, purge | Partiel | Transitions, conservation, purge (INV-5) ; parcours dépôt déclaré et clôture | Purge effective et portabilité en navigateur |
| WF-11 Divergence de version | Partiel | `smoke:publication`, `smoke:transitions` | R-O03 ; route de migration sans test direct |
| WF-12 Consultants | Phase 3 | `smoke:consultation` (concurrence sur créneau) | Restrictions de lancement maintenues |
| WF-13 Partenaires | Partiel | Domaine `partenaires/`, accès | Route d'un dossier sans test direct, conditions d'affiliation |
| WF-14 Veille et publication | Partiel | Publication relue par un second opérateur, textes juridiques | Routine de veille réelle |
| WF-15 Administration | Partiel | B-05 en navigateur, rôles, journal, facturation | B-04 remboursements, suppression, autres formulaires (R-I04) |
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
   (66 tests, § 3). Reste à trancher O-4.
2. Parcours navigateur pour R-O03 (publication → divergence → arbitrage),
   R-O05 (suppression), l'échéancier et la péremption d'une pièce.
3. Libellé du dispositif dans les résultats du simulateur (O-1) et
   textes d'aide B-05 (O-2, O-3).
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
