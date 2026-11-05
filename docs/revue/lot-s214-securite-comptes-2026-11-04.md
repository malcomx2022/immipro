# S.214 — sécurité des comptes : sessions, rôles, double authentification — 04/11/2026

Lot demandé par le responsable (« Points de sécurité : sessions, rôles,
2FA »), branche nommée `secu/renforcement-comptes-sessions` dans la demande.
Base `aa205d4` (#339 fusionnée). Proposition sur la branche de travail de la
session ; rien n'est fusionné ni déployé par ce lot, et aucun préalable
(Q.A, M.C, L5) n'est levé.

Rattachement : WF-02 (comptes, sessions en base), A-02 (connexion), WF-15 et
B-03 (utilisateurs, suspension, rôles), RG-02.3 (téléphone validé avant tout
paiement Mobile Money), RG-15.1 (motif au journal), RG-15.3 (RBAC strict,
moindre privilège), RG-10.4 (suppression), règle d'architecture 5 (débit),
INV-5 (purge).

## 1 — Sessions fermées au changement de rôle

Déjà vrai depuis S.210 : `appliquerLeChangementDeRole` ferme les sessions du
compte dans la transaction de sa ligne `compte.role`, et `details` porte
`sessionsFermees`. Ce lot ajoute :

- **l'auteur relu dans la transaction.** Un super-administrateur suspendu ou
  rétrogradé pendant que sa requête était en vol ne change plus de rôle : le
  refus dit de se reconnecter. Même relecture pour la suspension
  (`droits_insuffisants`).
- **la course perdue reconnue sous Prisma 7.** L'adaptateur `pg` rend une
  `DriverAdapterError` (`TransactionWriteConflict`), pas `P2034` : la fumée l'a
  vue, la réponse était un 500. `estUneCoursePerdue` (`server/http/concurrence`)
  lit les deux formes et les codes PostgreSQL 40001/40P01 ; changement de
  rôle, suspension et réinitialisation du second facteur rendent un refus
  actionnable (« recharge la page… »).
- **toute activation, désactivation ou réinitialisation du second facteur**
  ferme les sessions (les autres pour le titulaire, toutes pour une
  réinitialisation), avec sa ligne de journal, dans la transaction.

## 2 — Seuils SUPER_ADMIN atomiques

`suspendreOuRetablir` était sérialisable pour un compte interne, mais la
route suspendait un « candidat » hors transaction : rôle lu avant, puis
journal, date et sessions en trois écritures. Un compte promu au sommet
entre la lecture et l'écriture était suspendu par un ADMIN ; une panne entre
deux écritures laissait une trace sans suspension. **Tous les comptes passent
désormais par la transaction sérialisable** : rôle et auteur relus, décompte
des super-administrateurs actifs, journal, écriture conditionnée au rôle lu
(`updateMany where { id, role }`), fermeture des sessions.

Éprouvé sur PostgreSQL (`smoke:second-facteur`) : trois super-administrateurs
qui se suspendent l'un l'autre au même instant — au plus deux aboutissent, au
moins un reste actif, une ligne de journal par suspension réelle, chaque
perdant reçoit `etat_incompatible` ou `droits_insuffisants`. Et une promotion
au sommet simultanée à une suspension par un ADMIN ne laisse jamais un
super-administrateur suspendu par un administrateur.

## 3 — Double authentification TOTP

**Domaine pur** (`domain/comptes/deux-facteurs.ts`), HMAC injecté :

| Décision | Règle |
|---|---|
| Calcul | RFC 6238 SHA-1, 6 chiffres, 30 s ; vecteurs de l'annexe B rejoués |
| Fenêtre | ±1 pas autour de la dérive retenue ; dérive bornée à ±1 pas (RFC 6238 §6) : jamais plus de deux pas d'écart à l'horloge du serveur |
| Anti-rejeu | un code n'est accepté que pour un pas **strictement postérieur** au dernier accepté ; en base, l'écriture est conditionnée à `dernierPas < pas` |
| Blocage | 5 codes faux → 15 minutes, compteur propre au second facteur (une réinitialisation du mot de passe ne le remet pas à zéro) |
| Hystérésis | à la levée, le compteur redescend à 3, pas à 0 : deux essais faux rebloquent ; seul un code juste l'efface |
| Rejeu | un code juste déjà servi (TOTP ou secours) est refusé **sans** compter comme un code faux : il ne coûte rien à qui devine et arrive au titulaire (double envoi) |
| Codes de secours | 10, huit caractères de l'alphabet dictable (`ABCD-EFGH`), usage unique conditionné à `utiliseLe IS NULL` |
| Défi de connexion | mot de passe juste → aucune session ; défi de 5 minutes, 5 essais, un seul usage, cookie `immipro_defi` `httpOnly`, `SameSite=Strict`, limité à `/api/comptes/session` |

**Chiffrement au repos** (`server/securite/chiffrement.ts`) : AES-256-GCM sous
`DEUX_FACTEURS_CLE` (32 octets, base64), sous-clé HKDF, données associées =
identifiant du compte (une ligne recopiée sur un autre compte ne se déchiffre
pas). Format `v1.<iv>.<étiquette>.<données>`, imposé par la contrainte
`second_facteur_secret_chiffre` : la base refuse un secret en clair. Codes de
secours en HMAC-SHA256 sous une seconde sous-clé : une copie de la base seule
ne permet pas de les retrouver par essais (une quarantaine de bits chacun).

**Schéma** (migration additive `20261104180000_second_facteur`) :
`SecondFacteur` (secret chiffré, `activeLe`, `dernierPas`, `derive`, `echecs`,
`bloqueJusqua`), `CodeDeSecours` (empreinte, `utiliseLe`), `DefiDeConnexion`.
Les trois partent avec la suppression du compte (RG-10.4) et sont déclarés
non exportés dans la portabilité, avec leur raison. La purge de nuit retire
les défis échus ou servis.

**Routes** :

| Route | Accès, débit | Geste |
|---|---|---|
| `POST /api/comptes/session` | public, sensible | inchangée sans second facteur ; sinon `{ secondFacteur: { requis: true } }` et le défi, sans session ni détail du compte |
| `POST /api/comptes/session/second-facteur` | public, sensible | code ou code de secours ; 401 « Code refusé » avec ce qui reste, ou « Connexion à recommencer » |
| `GET /api/comptes/second-facteur` | candidat, lecture | état : disponible, actif, date, codes restants ; jamais de secret |
| `POST /api/comptes/second-facteur` | candidat, sensible | `preparer` (mot de passe), `activer` (premier code), `codes` (code TOTP), `desactiver` (mot de passe **et** code) |
| `POST /api/admin/comptes/second-facteur` | super_admin, **critique** | réinitialisation : motif, adresse ressaisie ; 403 et `acces.refuse` pour tout autre rôle |

**Écrans** : A-02 passe au second temps sans recharger (un seul champ lit six
chiffres ou un code de secours) ; « Sécurité du compte » porte l'activation
(mot de passe, code QR calculé dans le navigateur — `qrcode-generator`, sans
dépendance ni tiers —, clé lisible pour une saisie à la main, premier code,
dix codes montrés une fois) et la désactivation après un premier clic ; B-03
affiche l'état et, pour un super-administrateur, la réinitialisation avec
double confirmation. Sans clé sur le serveur, l'écran dit « pas encore
disponible », sans interrupteur.

**Journal** : `compte.second_facteur.activation`, `.desactivation`, `.codes`,
`.blocage`, `.secours` (connexion par code de secours, avec le nombre
restant), `.reinitialisation` (motif du super-administrateur). Jamais un code
ni un secret dans les détails. Catégorie « Comptes » en B-06.

## 4 — Profil candidat durci

- **Une seule règle pour `User.phone`** (`refusDuTelephone`, domaine) :
  E.164 et indicatif d'un pays couvert. « Mon compte » l'appliquait seul ;
  C-02 et l'inscription n'exigeaient que le format et écrivaient ce que
  « Mon compte » refusait. Les trois écritures la lisent, et le service de
  C-02 la rejoue quel que soit l'appelant.
- **C-02 strict** : une clé inconnue (`role`, `email`, `passwordHash`…) est
  refusée, pas ignorée ; pays dans la liste couverte ; langues en code ISO à
  deux lettres, niveau ≤ 40 caractères, 10 au plus ; textes bornés, années
  d'expérience ≤ 60, budget ≤ 10⁹.
- **Lecture de C-02** : `select` explicite des colonnes affichées. La ligne de
  profil entière (identifiants internes compris) n'est plus rendue.
- Fuseau et longueurs de « Mon compte » : déjà validés côté serveur
  (`validerIdentite`, S.210), inchangés.

## 5 — Back-office : confirmation, CSRF, débit, cloisonnement

- **Double confirmation** : la suspension demande un second clic sur
  « Confirmer la suspension », après la phrase qui dit l'effet ; la
  réinitialisation du second facteur, l'adresse ressaisie (comme le rôle).
- **CSRF** : inchangé et commun — toute écriture passe `origineAdmise` avant
  la lecture de session. Les tests le rejouent sur les nouvelles routes
  (403 sans appel au service). Cookie du défi en `SameSite=Strict`.
- **Régime `critique`** (20 appels par quart d'heure, par route et par
  compte) pour changer un rôle, créer un compte interne, suspendre ou
  rétablir, réinitialiser un second facteur. `api-invariants` l'admet comme
  régime déclaré.
- **Cloisonnement** : inchangé dans son principe (S.210, hiérarchie unique),
  resserré par la relecture de l'auteur en transaction. Les gestes du sommet
  restent refusés (403, `acces.refuse` au journal, sous débit) à CANDIDAT,
  VEILLEUR et ADMIN — réinitialisation du second facteur comprise.

## Preuves

| Niveau | Fichier | Ce qui est éprouvé |
|---|---|---|
| Unitaire, domaine | `tests/deux-facteurs.test.ts` | vecteurs RFC 6238 et RFC 4648, fenêtre et dérive bornée, rejeu, blocage et hystérésis, codes de secours, adresse `otpauth` |
| Unitaire, serveur | `tests/chiffrement-second-facteur.test.ts` | aller-retour, liaison au compte, altération, autre clé, clé absente, empreinte liée au compte |
| Routes | `tests/second-facteur-routes.test.ts` | défi sans session, second temps (ouverte, refusée, échue), CSRF, débit sensible et critique, cloisonnement du sommet, confirmation |
| Transactions simulées | `tests/cloisonnement-super-admin.test.ts` | suspension d'un candidat en transaction, promotion concurrente, course P2034, auteur suspendu ou rétrogradé en vol |
| Profil | `tests/profil-durci.test.ts` | règle unique du téléphone (trois écritures), corps strict, bornes, lecture sans colonnes internes |
| Écrans | `tests/ui/deux-facteurs.test.tsx`, `tests/ui/p2-backoffice.test.tsx` | connexion en deux temps, activation, désactivation, réinitialisation B-03, suspension en deux clics |
| Garde-fous SQL | `scripts/verifier-garde-fous.sql` | secret en clair, dérive de deux pas, compteur négatif refusés ; secret chiffré posé |
| Intégration | `npm run smoke:second-facteur` (porte) | PostgreSQL jetable : secret chiffré et contrainte, vingt envois simultanés du même code → une connexion, vingt du même code de secours → une, blocage et hystérésis, réinitialisation atomique, suspensions croisées sérialisées |
| Fonctionnel | `tests/parcours/candidat.spec.ts` | parcours « double authentification » (activation par la clé affichée, mot de passe sans session, code neuf, rejeu refusé, code de secours, désactivation) ; B-03 suspension en deux clics |

Mutations vérifiées par la fumée : sans la condition `dernierPas < pas`, onze
connexions sur vingt envois du même code ; sans `utiliseLe IS NULL`, vingt
connexions sur vingt avec un code de secours. Les deux sont rouges.

## Limites assumées

- **Clé à poser par l'exploitant** : `DEUX_FACTEURS_CLE` dans `.env.app`. Sans
  elle, rien ne change pour personne. Une fois des comptes enrôlés, la perdre
  ou la changer rend leurs secrets illisibles (connexion impossible jusqu'à
  la réinitialisation B-03) : elle se sauvegarde hors du VPS, avec la clé GPG.
  Aucune rotation n'est outillée ; le préfixe `v1` la permettra.
- **Optionnelle pour tous**, comptes internes compris. La rendre obligatoire
  pour VEILLEUR et au-dessus est une décision du responsable, pas du code.
- **Débit en mémoire du processus** : comme le reste du dépôt ; le jour où il
  y a plusieurs instances, c'est `limites.ts` qui change. Le blocage du second
  facteur, lui, est en base.
- La réinitialisation B-03 ne vérifie pas l'identité de la personne : elle
  exige un motif qui dit comment elle l'a été.
- Lecteur d'écran humain non joué sur ces écrans (même limite que L6).

## S.215 — obligatoire pour les comptes internes — 04/11/2026

Demandé par le responsable après la fusion de S.214 (#341, `f1ada94`) :
« rends la 2FA obligatoire pour les comptes internes ». Tranche la limite
« Optionnelle pour tous » ci-dessus.

| Point | Règle |
|---|---|
| Qui | `exigeSecondFacteur(role)` = compte interne (VEILLEUR, ADMIN, SUPER_ADMIN), dans `domain/comptes/hierarchie` |
| Routes | le composeur refuse `veilleur`, `admin`, `super_admin` à un compte interne sans `secondFacteurActif` : 409, « active-la depuis Sécurité du compte » ; champ absent = inactif (échec fermé) |
| Pages | `exigerVeilleur`, `exigerAdmin`, `exigerSuperAdmin` renvoient sur `/compte/securite?exige=1` ; la session reste ouverte |
| Espace candidat | inchangé : un compte interne sans second facteur garde ses routes candidat, dont l'activation |
| Désactivation | refusée à un compte interne (rôle relu en base) ; l'écran n'offre pas le bouton et dit de demander une réinitialisation |
| Secours | `dist/reinitialiser-second-facteur.mjs` (console, motif, auteur `console:<nom>`), quand plus aucun super-administrateur n'ouvre le back-office |
| Exploitation | `/api/health` (détail) : `secondFacteur.cle` `posee` ou `absente` |
| Recette | la graine enrôle les opérateurs de démonstration quand la clé est posée et écrit leur secret au journal du banc ; les parcours calculent leurs codes (pas neuf attendu, pas de rejeu) |

Lu à chaque appel en base, comme la suspension : une activation ouvre le
back-office sans reconnexion, une réinitialisation le referme au geste
suivant.

**Preuves.** `tests/second-facteur-obligatoire.test.ts` (composeur réel :
trois niveaux refusés sans second facteur, ouverts avec, routes candidat
ouvertes, champ absent refusé ; gardes de pages ; désactivation refusée),
`tests/ui/deux-facteurs.test.tsx` (bandeau « obligatoire », clé absente,
« Désactiver » retiré). Parcours « compte interne » : candidat promu
VEILLEUR par la console, `/veille` renvoyé sur Sécurité, route en 409,
activation, `/veille` ouvert, désactivation refusée en 409, rôle rendu et
second facteur réinitialisé par la console (journal `console:…`). Porte :
lint, typecheck, 221 fichiers / 4 414 tests, `check:copy`, `smoke:second-facteur`,
`smoke:role`, build ; parcours 76/76 en Chromium 390 et 1440, Firefox et
WebKit laissés à la CI.

**Limites.** Clé à poser **avant** le déploiement (procédure :
`docs/exploitation/second-facteur.md`) : sans elle, le back-office est fermé
à tous les comptes internes — échec fermé voulu.

**Recettes Python adaptées — 05/11/2026.** `scripts/recette/recette-documentaire.py`
et `revue-navigateur.py` (manuels, hors porte) passent le second temps par
`scripts/recette/second_facteur.py` : secret lu au journal du banc, code
RFC 6238 en bibliothèque standard (vecteurs de l'annexe B identiques à ceux
du domaine), pas suivant attendu une fois si le code vient de servir.
`recette-documentaire.py` accepte aussi l'arrivée sur `/veille` (S.211), qu'il
n'attendait pas. Rejoués sur un banc neuf : 2 contrôles conformes ; 45 pages,
11 actions conformes (dont deux seconds temps), aucune erreur JavaScript, seules
les quatre absences juridiques attendues ; deux connexions du même opérateur
dans les trente secondes : la seconde attend le pas suivant et passe.
