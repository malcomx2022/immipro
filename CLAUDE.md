# Instructions projet — ImmiPro

À lire avant toute contribution, humaine ou assistée.

## Invariants — non négociables

| # | Règle |
|---|---|
| INV-1 | La plateforme informe et prépare. Elle ne conseille pas juridiquement et ne se prononce jamais sur les chances d'obtention d'un visa. |
| INV-2 | Aucune promesse de résultat, nulle part : interface, emails, documents générés, contenu marketing. |
| INV-3 | Un dossier fige la version de règle utilisée (`Application.visaRuleId`). Une évolution réglementaire ne casse jamais une checklist en cours. |
| INV-4 | Une règle de source `SECONDAIRE` n'est jamais visible par l'utilisateur. Le filtrage se fait dans la requête, pas dans l'affichage. |
| INV-5 | Les pièces d'identité sont purgées automatiquement selon la politique de rétention. |
| INV-6 | Tout appel IA est débité d'un quota d'analyses rattaché au pack ; les jetons consommés sont mesurés et surveillés. Jamais de dépassement silencieux. |
| INV-7 | Tout paiement est idempotent et réconcilié par webhook signé. |
| INV-8 | Toute information réglementaire affichée porte sa source et sa date de vérification. |

## Vocabulaire interdit dans le code et l'interface

La liste vit dans `src/domain/copy/vocabulaire-interdit.ts`. Elle est lue par
`npm run check:copy`, par le test de l'interface candidat, et par la
validation à l'enregistrement du back-office — B-02 pour les textes d'une
règle, B-05 pour le message envoyé après une revue manuelle, B-08 pour un
guide pays ou un article. Une seule liste, quatre points d'application : un
administrateur qui saisit une promesse dans un guide pays bute sur la même
règle qu'un développeur, et sa publication est bloquée tant que la
formulation est refusée.

L'enregistrement d'un brouillon n'est pas bloqué, la publication l'est. Un
texte en cours d'écriture doit pouvoir être sauvé ; le refuser pousserait à
rédiger ailleurs et à coller à la fin, c'est-à-dire à écrire hors du
garde-fou.

Deux portées :

- **Partout** — les promesses de résultat : « chances d'obtention », « taux
  d'acceptation », « visa garanti », « visa assuré », « réussite garantie »,
  « sans risque de refus », « on s'occupe de tout », « nous déposons votre
  dossier », « nous vous conseillons juridiquement », « notre avocat ».
- **Interface candidat seule** — le vocabulaire de la note de dossier :
  « score », « chances », un pourcentage, « sur 100 ». Ils restent légitimes
  dans `domain/completeness/`, où le barème interne vit sans jamais s'afficher.

Deux issues, et deux seulement :

1. **La négation est reconnue.** « ImmiPro ne garantit pas l'obtention du
   visa » passe : une négation ne peut pas devenir une promesse. La portée
   s'arrête à la proposition — « Pas de doute, visa garanti » reste refusé.
2. **`copy-exceptions.json`** pour le reste : chaîne exacte, chemin, motif,
   date. L'échappatoire apparaît dans la diff et se justifie. Au-delà de cinq
   entrées, ce n'est plus une exception, c'est une dérive du vocabulaire.

Le score affiché s'appelle **complétude du dossier**. Jamais autre chose.

## Messages d'erreur

Un message d'échec est toujours actionnable.

- Non : « Document non conforme. »
- Oui : « Votre passeport expire 4 mois après la date de retour prévue, il en faut 6. »

## Règles d'architecture

1. `src/domain/` ne connaît ni Prisma, ni Next, ni le réseau. Logique pure, testée sans infrastructure.
2. Tout ce qui est vérifiable sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la cohérence narrative.
3. Aucune valeur de couleur, d'espacement ou de rayon en dur : uniquement les tokens Tailwind.
4. Aucun accès direct à MinIO depuis le client. URLs présignées de 5 minutes, générées à la demande.
5. Les webhooks sont exclus du rate limiting mais leur signature est vérifiée systématiquement.
6. Aucun secret dans le dépôt. `.env.example` liste les clés, jamais les valeurs.

## Avant d'ouvrir une pull request

- [ ] `npm run lint && npm run typecheck && npm run test && npm run check:copy`
- [ ] La règle de gestion de DOC-11 implémentée est citée dans la description
- [ ] Les états vide, chargement et erreur sont traités
- [ ] Aucune chaîne de caractères en anglais dans l'interface

## Suivi du chantier fonctionnel — 09/10/2026

Le responsable a autorisé le **lot RF-0**, limité aux documents. Les lots
RF-1 à RF-7 restent planifiés ; les choix A-1 à A-3 ne sont pas tranchés.
Une autorisation ultérieure vaut pour le lot demandé et ses travaux nécessaires.

Ordre de lecture : ce fichier, [DOC-11](docs/DOC-11-workflows.md),
[DOC-12](docs/DOC-12-prototype.md), les dernières décisions du
[registre](docs/prototype/ECARTS-A-ARBITRER.md), le
[plan historique](docs/revue/plan-de-traitement-2026-10-07.md), puis la
[revue fonctionnelle](docs/revue/revue-fonctionnelle-2026-10-09.md) et le
[chantier RF](docs/revue/chantier-fonctionnel-2026-10-09.md).

Base du lot 0 : main dd2b58f, S.125 à S.144 intégrés. Claude Code a livré
S.142 (Stripe-Version et dépendances SMTP, PR #241), S.143 (ESLint plat,
PR #242) et S.144 (Next 16, PR #243). Relire main et les PR ouvertes avant
chaque lot ; conserver ces changements et leurs décisions. Les identifiants
RF ne réservent aucun numéro S.xxx : attribuer celui-ci au démarrage d'un
lot applicatif, après vérification du registre et du travail en cours.

Trois preuves distinctes : code implémenté, parcours éprouvé, préalable de
lancement levé. Une PR ouverte reste proposée ; une fusion ne démontre ni
recette ni déploiement. Un contrôle non exécuté reste « non vérifié ».

Pour chaque lot applicatif autorisé :

- une PR, une entrée de suivi, un rattachement WF/RG/écran et les écarts restants ;
- reproduction du comportement, puis test du résultat voulu ; courses et
  interruptions éprouvées sur une base jetable ;
- traiter FON-01 à FON-04, le reliquat E5 et C-05/M11 selon les dépendances
  du chantier, sans considérer les choix ouverts comme approuvés ;
- garder l'historique des anciennes pièces ; empêcher ses effets sur la
  pièce courante ; partager la règle de reprise gratuite et respecter les
  états figés lors d'un arbitrage ;
- diagnostiquer les données antérieures sans réécrire les règles figées,
  le journal ou les pièces comptables ; attribuer et tracer les traitements ;
- conserver les reports V2 de DOC-11 §0 et les huit invariants ci-dessus ;
- Q.A commande l'ouverture publique, M.C l'encaissement réel ; leur levée
  exige les validations et preuves prévues, au-delà de la présence du code.

Appliquer la porte de qualité de `.github/workflows/validation.yml` et
les critères du chantier : verrou, check, audit, build, schéma, migrations,
garde-fous et fumées concernés ; image si les artefacts ou le déploiement
changent. Documenter les résultats dans le lot. RF-0 ne modifie aucun code,
schéma, drapeau commercial ou service ; sa validation ne certifie pas la V1.
