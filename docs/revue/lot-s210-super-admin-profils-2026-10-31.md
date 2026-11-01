# S.210 — rôle SUPER_ADMIN et profils utilisateur — 31/10/2026

Lot demandé par le responsable. Base `46c8b76` (#333 fusionnée). Proposition
sur `claude/upbeat-babbage-i68zmf` : rien n'est fusionné ni déployé par ce
lot, et aucun préalable (Q.A, M.C, L5) n'est levé.

Rattachement : WF-02 (comptes, sessions en base), WF-15 et B-03
(utilisateurs, suspension), RG-15.1 (motif au journal), RG-15.3 (RBAC,
moindre privilège), RG-10.4 (suppression, la ligne `User` survit).

## A — Rôle SUPER_ADMIN

**Hiérarchie.** `SUPER_ADMIN ⊃ ADMIN ⊃ VEILLEUR`, le candidat à part, décrite
une fois dans `src/domain/comptes/hierarchie.ts` (pur). Le composeur des
routes (`ROLES_ADMIS`), la garde des pages (`exigerVeilleur`, `exigerAdmin`,
`exigerSuperAdmin`), le lecteur d'exploitation et B-02 (`peutPublier`) la
lisent : un super-administrateur passe partout où passe un administrateur.
Avant, trois listes écrites à la main auraient refusé le nouveau rôle du
back-office qu'il devait administrer.

**Ce que seul le sommet fait** : changer un rôle, créer un compte interne,
suspendre ou rétablir un compte interne. Un ADMIN ne change plus aucun rôle
(il n'en changeait déjà aucun depuis l'écran : seule la console le faisait,
S.115). Un ADMIN suspend toujours un candidat (WF-15 inchangé).

**Règles pures** (`domain/comptes/role.ts`, `gestion-interne.ts`) :

| Règle | Refus |
|---|---|
| Acteur du back-office non super-administrateur | « Seul un super-administrateur change un rôle » |
| Auto-promotion | « Un compte ne s'élève pas lui-même » |
| Retirer le rôle à un super-administrateur actif quand ils sont moins de 2 actifs (lui compris) | message distinct pour soi et pour autrui |
| Suspendre le dernier super-administrateur actif | idem |
| Dernier administrateur (ADMIN ou SUPER_ADMIN) rétrogradé sous ADMIN | règle S.115, élargie au sommet |
| Rôle élevé sur adresse non vérifiée, compte suspendu ou supprimé | inchangé |
| SUPER_ADMIN à la création | il se donne ensuite, par changement de rôle, à une adresse vérifiée |

« Actif » : ni suspendu, ni supprimé. Un super-administrateur suspendu ne
compte pas dans le seuil, et le retirer ne le fait pas baisser.

**Sessions.** Tout changement de rôle (console ou écran) ferme les sessions
du compte dans la même transaction que la ligne `compte.role`, dont les
détails portent désormais `sessionsFermees` et `origine`.

**Cloisonnement.** Accès `super_admin` dans le composeur. Un VEILLEUR, un
CANDIDAT ou un ADMIN reçoit 403 ; l'essai part au journal (`acces.refuse`,
rangé en « Comptes »), sous débit : au-delà de la limite sensible, le refus
reste un refus sans nouvelle ligne. Contrôle d'origine (CSRF) et limite
sensible inchangés pour toutes ces écritures.

**Routes** : `POST /api/admin/comptes` (création), `POST
/api/admin/comptes/role` (changement, double confirmation : l'adresse du
compte ressaisie, revérifiée par la route). La suspension garde son contrat
(`PUT /api/admin/utilisateurs`) : candidat, chemin d'origine ; compte
interne, `suspendreOuRetablir` en transaction sérialisable.

**B-03** : rôle affiché, « Créer un compte interne » et « Rôle du compte »
pour le seul super-administrateur ; la suspension d'un compte interne
disparaît pour un administrateur, avec la raison.

**Bootstrap du premier super-administrateur** — la personne s'est inscrite et
a vérifié son adresse :

```bash
docker compose -f docker-compose.prod.yml run --rm app node dist/changer-role.mjs --email awa@exemple.com --role SUPER_ADMIN --par "Awa Koffi" --motif "Premier super-administrateur désigné par la direction"
```

En local : `npm run compte:role -- --email … --role SUPER_ADMIN --par … --motif …`.

## B — Profils

**« Mon compte » (`/compte`)** : prénom, nom, nom affiché (2 à 80, vide =
prénom et nom), téléphone E.164 (8 à 15 chiffres, indicatif d'un pays de
`PAYS_DE_RESIDENCE`), date de naissance (13 à 110 ans), pays de résidence,
langue (fr, en), fuseau (`FUSEAUX_PROPOSES`, celui des rappels). L'adresse
est en lecture seule. Validation pure `validerIdentite`, rejouée par
`enregistrerLIdentite`. Un seul lien « Supprimer mon compte ».

Colonnes : `firstName`, `lastName`, `phone`, `countryCode`, `locale`,
`reminderTimeZone` réutilisées ; ajout additif de `displayName` (CHECK 2 à
80 en base) et `birthDate` (`DATE`). Les deux partent à l'anonymisation
(RG-10.4) et figurent dans l'export de portabilité.

**Mineur** : moins de 18 ans → les propositions de partenaires (seule
autorisation commerciale) sont retirées à l'enregistrement, dans la même
transaction, en datant la preuve et en écrivant un refus ; la route des
consentements refuse ensuite de les accorder. Retirer reste toujours permis.

**« Sécurité » (`/compte/securite`)**, partagée : changement du mot de passe
par code, sessions ouvertes, « Fermer toutes mes sessions »
(`POST /api/comptes/sessions`), double authentification annoncée comme non
disponible.

**Compte interne (`/mon-compte`)** — et non `/admin/compte` : le groupe
`(admin)` partage l'espace d'adresses de l'espace candidat, où `/compte`
existe. Carte nom, adresse, rôle, dernière connexion (ouverture de la
session la plus récente), liens vers l'identité et la sécurité. Pas de
suppression autonome : la route `/api/comptes/suppression` refuse un compte
interne et renvoie à B-03.

Les factures émises ne sont pas touchées : chacune garde l'identité figée à
son émission.

## Preuves

| Contrôle | Résultat |
|---|---|
| `npm run lint`, `typecheck`, `check:copy`, `prisma validate` | verts |
| `npm run test` | 212 fichiers, 4 224 tests verts |
| `npm run build` | vert (app et worker) |
| `prisma migrate deploy` sur PostgreSQL 16 jetable, `db:garde-fous` | verts (113 refusées, 13 posées) |
| `smoke:migrations` | vert |
| `smoke:role` étendu (sessions fermées, premier SUPER_ADMIN, seul actif refusé) | vert |
| Parcours Playwright « Mon compte », chromium 390 et 1440 | verts |
| Mutations : refus non journalisé, sessions non fermées, seuil à 1 | détectées |

Nouveaux tests : `tests/super-admin.test.ts`, `tests/profil-identite.test.ts`,
`tests/cloisonnement-super-admin.test.ts`, `tests/ui/compte-et-roles.test.tsx`.

## Limites assumées

- Double authentification affichée comme non disponible, non activable.
- Le compte interne créé n'a pas de mot de passe ; aucun courriel
  d'invitation ne part : la personne passe par « Mot de passe oublié ».
- Le changement d'adresse reste hors de l'écran (support), comme avant.
- « Dernière connexion » = ouverture de la session la plus récente encore
  valable : il n'y a pas de colonne dédiée, et les sessions fermées
  disparaissent.
- La langue « en » est gardée ; l'interface et les courriels restent en
  français.
- Le verrouillage de compte n'est pas touché : il bloque **au cinquième**
  échec (4 échecs : un essai restant ; 5e : blocage ; 6e : refusé), figé par
  un test. Décision du responsable du 31/10 : le blocage au cinquième échec
  est conservé.

## Décisions du responsable — 31/10/2026

- Verrouillage : blocage au cinquième échec conservé (`ESSAIS_AVANT_BLOCAGE`).
- `PAYS_DE_RESIDENCE` validée telle quelle : Bénin, Burkina Faso, Côte
  d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal, Togo, Cameroun, RD Congo,
  France, Belgique, Pays-Bas, Canada, avec leurs indicatifs.
- Firefox et WebKit non rejoués localement, laissés à la CI.
