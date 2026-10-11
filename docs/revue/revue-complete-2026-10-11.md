# Revue complète : fonctionnel, front, backend et IA — 11/10/2026

**Conclusion : la base technique passe ses contrôles actuels, mais la chaîne
IA comporte cinq groupes de défauts reproduits et la V1 conserve des
préalables de qualification.** Le chantier proposé est disponible
[ici](chantier-complet-2026-10-11.md), la documentation du fournisseur et de
ses interventions [ici](../IA-workflows.md). Aucun correctif applicatif,
fusion ou déploiement n'est effectué par cette revue.

## 1. Base de travail et corrections Claude Code conservées

La revue commence sur main **`bbf1500e5762e1c192c46ba9c01f1faa23af7b06`**, S.168,
puis est rattachée à **`ec32f6564c9578068a09e22746ecd435a9e7341d`**, S.169,
après fusion Prisma 7 pendant les essais. Les preuves initiales et celles
de la base finale sont distinguées au §8.
Le checkout, le code Claude, CLAUDE.md, DOC-11, les décisions du registre,
les revues précédentes et la porte CI ont été relus avant les essais.

- S.167 / [PR #268](https://github.com/malcomx2022/immipro/pull/268),
  correctifs front/backend de la revue complémentaire, est fusionné.
  Les défauts déjà corrigés ne sont pas déclarés ouverts dans ce document.
- S.166 puis S.168 ont porté pg-boss jusqu'à **12.37.1**. Les preuves de
  transfert et de montée du schéma production sont conservées ; la
  [PR #271](https://github.com/malcomx2022/immipro/pull/271) est fusionnée.
- La [PR #272](https://github.com/malcomx2022/immipro/pull/272),
  **S.169 / Prisma 7**, était en cours au moment du gel initial. Ses
  changements de client, CLI, image, seeds et tests ont été recensés.
  Après fusion, ses changements sont conservés et les contrôles rejoués ;
  aucune montée concurrente n'est proposée.
- Le périmètre V1 et les reports V2 sont inchangés. Consultants/marketplace
  V2 ne deviennent pas des fonctionnalités V1 manquantes à implémenter.

Inventaire : **16 workflows, 62 routes de page et 73 routes API**.
Cet inventaire ne signifie pas que 62 parcours complets ou 73 endpoints
ont chacun été exécutés. Les preuves sont distinguées ci-dessous.

## 2. Résultats exécutés et limites de preuve

Ce tableau conserve les résultats initiaux S.168. Le §8 donne les résultats
rejoués après la fusion S.169, dont 3 586 tests au lieu de 3 582.

Essais sur Node **24.19.0**, PostgreSQL **16** dans un conteneur privé,
bases jetables, HTTP/S3/SMTP/antivirus simulés sur la boucle locale.
Le navigateur utilise le serveur Next standalone et le worker construits
depuis la base auditée. Aucun secret réel, provider IA réel, paiement réel,
objet utilisateur ou environnement de production n'est utilisé.

| Contrôle exécuté | Résultat | Ce que cela prouve / limite |
|---|---|---|
| Installation verrouillée et génération Prisma | Réussite | Dépendances du lock et client de cette base. |
| `npm run check` | **179 fichiers, 3 582 tests passent** ; types, lint et copie passent | Suite comprenant logique pure, composants, contrats de source et certains échanges HTTP. Ces tests ne sont pas tous des tests unitaires métier. |
| `npm run check:audit` | Porte satisfaite | Une vulnérabilité élevée acceptée par l'exception existante et quatre avis modérés restent présents. |
| `npm run build` | Réussite | Application et worker pg-boss 12 construits. Aucun déploiement implicite. |
| `npx prisma validate` | Réussite | Schéma valide sur Prisma 6. |
| 26 `smoke:*` de la porte CI | Tous terminés avec code 0 | Vrai PostgreSQL, migrations et services réellement appelés avec dépendances externes simulées. 1 680 contrôles `✓` rapportés, pas 1 680 tests unitaires supplémentaires. |
| Garde-fous SQL | **105 écritures refusées, 9 permises** | Contraintes sur la base reconstruite, relayées au `psql` du conteneur local. |
| Recette Chromium | **45 navigations**, trois connexions par formulaire/Entrée, contrôle de session et refus d'accès | Mobile 390×844, back-office 1280×900 ; aucune erreur JS ni débordement observé sur ces visites. |
| Dépôt navigateur et décision opérateur | Réussite | PDF synthétique → stockage présigné → antivirus → worker → revue sans IA ; décision `CONFORME` via le formulaire réel. |
| Diagnostic IA | Deux témoins conformes, **six attentes en échec** | Quatre groupes d'anomalies reproduits ; deux serveurs locaux et configuration Vertex synthétique. |
| Diagnostic concurrence de relecture | **Attente en échec : deux appels et deux débits** | Vrai traitement de route et PostgreSQL. Composeur HTTP remplacé pour fournir l'acteur ; ce diagnostic ne valide pas l'authentification HTTP. |
| `sandbox:paiement` | **Abstention explicite** | Aucune clé Stripe/FedaPay ; un code 0 ici ne prouve aucun paiement réel. |
| Vérification nginx locale | **Non exécutée jusqu'à son terme** | L'image épinglée absente localement ; téléchargement refusé par le réseau de l'environnement (`mirror.gcr.io`, Forbidden). |
| ShellCheck local / image applicative Docker | **Non exécutés dans cette revue locale** | ShellCheck absent ; build Next/worker effectué, pas de nouvelle preuve d'image de déploiement. À contrôler avec la porte CI et le lot d'exploitation. |

Les fumées exécutées : migrations, worker `--base`, files, graine, tunnel,
fedapay, reconciliation, consultation, conservation, remboursement,
courrier, balayage, extraction, redaction, rappels, transitions, publication,
juridique, relecture, facturation, role, editoriale, diagnostic, purge,
montee et depot. Les mentions « aucun fournisseur » dans certaines fumées
désignent des scénarios négatifs testés, pas l'abstention de la fumée entière.

Avis d'audit encore présents : `deepmerge-ts` / GHSA-ggr8-5vv4-36mx
(exception élevée existante), `decode-uri-component` / GHSA-vcc3-ghjq-m6fr,
et `stream-json` / GHSA-528h-pc64-c93x, GHSA-hqr4-qq8f-hg3x,
GHSA-mjw6-4jj6-33hc. Aucun ajout d'exception pour masquer ces avis.

## 3. Couverture fonctionnelle par workflow

« Intégration » désigne les services/contraintes sur PostgreSQL ; les
simulateurs de prestataires ne deviennent pas une qualification fournisseur.
« Navigation » désigne une page ouverte, pas chaque geste possible.

| Workflow | Preuves de cette revue | Reste à terminer |
|---|---|---|
| WF-01 simulateur | Domaine dans la suite ; navigation simulateur/résultats vide | Parcours rempli et enchaînement navigateur jusqu'à l'ouverture. |
| WF-02 compte/profil | Tests compte ; tunnel ; connexion de trois rôles ; profil/consentements | Inscription/code email complet rejoué, retrait de consentement en plein traitement, appareils/accessibilité. |
| WF-03 recommandations | Tests domaine et navigation comparateur/destinations | Scénarios de profil variés et justification des recommandations en navigateur. |
| WF-04 ouverture | Tunnel, droits et règle figée ; navigation nouveau dossier | Ouverture depuis un simulateur rempli et états concurrents en navigateur. |
| WF-05 pack/paiement | Simulations de webhook, rapprochement, montées et remboursements | Sandbox réel et préalables M.C ; page de paiement sans contexte n'est pas un achat testé. |
| WF-06 pièces | Fumées fichiers/AV/extraction/worker ; dépôt réel du navigateur et revue sans provider | Contrats IA L1/L2, vrai modèle, remplacement/quota épuisé/double onglet en recette finale. |
| WF-07 complétude | Domaine, transitions et relecture humaine de complétude ; navigation | Péremption et effets visibles dans un onglet ancien, parcours complet de passage PRET. |
| WF-08 rédaction | Fumée rédaction ; diagnostics JSON et concurrence ; navigation index | L3/L4, génération/export/relecture avec modèle qualifié et deux onglets. |
| WF-09 échéancier | Dates/rappels/balayage sur PostgreSQL ; navigation | Réception réelle mail, fuseaux et changement de situation côté navigateur. |
| WF-10 conservation | Transitions, conservation, purges et dépôt sur PostgreSQL | Cycle navigateur dépôt/issue/clôture, diagnostics de données et restauration sur clone. |
| WF-11 divergences | Publications et transitions ; règle figée dans le domaine | Recette opérateur/candidat et preuves pilote ciblées ; aucun besoin de LLM ajouté. |
| WF-12 consultants | Navigation services/habilitations et tests de droits concernés | Conserver le report V2 et les restrictions de lancement. |
| WF-13 partenaires | Tests du périmètre courant et navigation services | Conditions d'affiliation et parcours réel selon décisions existantes. |
| WF-14 veille | Publications/rôles ; navigation veille admin et veilleur | Routine de veille réelle et preuves de fraîcheur des sources. |
| WF-15 administration | Consultation/audit/remboursement/rôles ; neuf écrans admin ; décision de revue via UI | Recette complète d'édition/publication/remboursement et opérateurs autorisés. |
| WF-16 coûts IA | Domaine/HTTP simulé ; navigation B-07 ; diagnostics usage | L2, comparaison coûts mesurés/facturés et supervision du provider réellement déployé. |

## 4. Défauts reproduits : cinq groupes, sept cas

Les identifiants DIA appartiennent aux scripts livrés ; ils expriment les
**attentes voulues**, et sortent avec code 1 tant que les défauts persistent.
Ils ne sont pas insérés dans la porte ordinaire avant correction. La suite
verte ne couvre pas ces nouvelles reproductions.

### REV-IA-01 — Comptabilisation incompatible avec certaines réponses

**P1 — DIA-01/02/03 — WF-06/08/16, INV-6.**

Dans [openai-compatible.ts](../../src/server/ia/openai-compatible.ts),
une extraction correcte sans `usage` est rendue `LUE` avec `0/0`. Des
compteurs `-12 / 1.5` sont acceptés par l'adaptateur. Une enveloppe avec
`choices: []` et une mesure `120/30` devient `NON_LUE` avec `0/0`.
Le suivi aval peut ainsi perdre une consommation connue ou ne distinguer
aucune mesure d'un appel gratuit. Les compteurs invalides sont transmis
au contrat de retour ; l'échec SQL potentiel en aval n'a pas été reproduit
dans ce diagnostic et ne doit pas être présenté comme un incident observé.

Attendus : compteurs entiers non négatifs, mesure connue conservée, état
d'usage inconnu explicite. Le chantier L2 traite cette représentation sans
remplacer le quota en analyses par un quota en jetons.

### REV-IA-02 — Corps documentaire transmis après une redirection

**P1 — DIA-04 — WF-06, maîtrise de la sous-traitance.**

Le `fetch` de l'adaptateur suit un HTTP **307** vers une autre origine
(même hôte local, autre port). Le deuxième serveur reçoit les octets de la
pièce synthétique. Observation : **un appel, corps documentaire présent** ;
attendu : zéro transmission à cette origine. Aucune donnée réelle ni site
externe n'est utilisé. Ce test n'établit pas de fuite de clé Bearer.

Le contrôle de l'URL initiale ne suffit donc pas à contrôler la destination
finale du document. L1 prévoit le refus ou la validation préalable explicite.

### REV-IA-03 — Avis invalide lu comme une relecture sans remarque

**P1 — DIA-05 — WF-08/RG-08.4.**

Une remarque `INCOHERENCE` avec `ecarts: null` est rejetée par
[lireLaCritique](../../src/domain/redaction/commande.ts), puis la liste
entière devient vide. L'adaptateur retourne **`RELUE`, zéro remarque**.
La route traite cet état comme un avis abouti susceptible d'être daté et
débité. L'effet de datation pour ce cas précis est établi par lecture du
traitement ; le diagnostic DIA-05 exécute le domaine et l'adaptateur, pas
une requête HTTP complète avec base.

Attendu : `SANS_AVIS` pour une liste entièrement mal formée. Le témoin
CTRL-02 vérifie qu'une vraie liste vide doit rester un résultat valide.

**Traitement proposé S.174 / L3.** Avis entier refusé au premier défaut,
y compris liste mixte ou trop longue ; deux fournisseurs et route protégés,
consommation conservée et quota rendu. DIA-05 et CTRL-02 passent sans
changer leurs attentes. Le vrai POST et PostgreSQL confirment l'absence
de date/remarque publiée ; le rendu R-04 distingue les deux vides.
Voir [résultats et limites](lot-l3-2026-10-11.md).

### REV-IA-04 — Banc de recette insuffisamment neutralisé pour Vertex

**P1 — DIA-06 — isolation des tests.**

[banc.mts](../../scripts/recette/banc.mts) retire les clés fixes mais
conserve les variables du compte de service Google. Avec une configuration
Vertex synthétique complète et les retraits exacts du banc, le registre
indique encore **extraction et rédaction branchées** ; attendu : aucune.

Cette reproduction reste une vérification de configuration, sans échange
OAuth ni appel Google. Les essais de la présente revue n'ont aucun compte
réel. Corriger l'isolation avant de lancer ce banc depuis un environnement
contenant un compte Vertex opérationnel : chantier L0.

### REV-IA-05 — Double relecture payante de la même version

**P1 — DIA-07 — WF-08, réservation et idempotence.**

La [route de relecture](../../src/app/api/dossiers/[id]/redaction/[type]/relecture/route.ts)
vérifie `critiquedAt`, puis réserve et appelle le service. Deux exécutions
simultanées lisent une version encore non relue. Sur PostgreSQL et un
prestataire HTTP synthétique retardé, le **vrai traitement** effectue
**deux appels et deux débits**, retourne deux résultats aboutis et date la
même version. Attendu : un appel, un débit.

Le verrou du grand livre empêche le solde négatif ; il ne revendique pas
l'opération de relecture pour cette version. L4 prévoit une réservation
exclusive durable et une reprise après interruption. Le diagnostic remplace
uniquement le composeur HTTP pour fournir l'acteur ; une régression HTTP
authentifiée doit compléter la preuve au moment de la correction.

## 5. Front : ce qui a réellement été éprouvé

Les 45 visites couvrent les pages publiques courantes, espaces compte,
dashboard/profil/comparateur/services, checklist/pièce/versions,
complétude/échéancier/rédaction, neuf écrans admin et deux accès veilleur.
Pas d'erreur JavaScript ni débordement horizontal dans ces visites.
Connexions candidat/admin/veilleur effectuées avec la touche Entrée.
Le navigateur authentifié obtient HTTP 200 sur `/api/dossiers` et HTTP 403
sur `/api/admin/couts-ia` et `/api/admin/utilisateurs`. L'anonyme retourne
à la connexion ; candidat et veilleur sont redirigés hors des écrans non autorisés.

Les pages `/conditions`, `/mentions-legales`, `/donnees-personnelles` et
`/contact` répondent 404 sur le banc non validé, conformément au code.
Cela n'est pas une régression de routage. Leur publication réelle reste
un préalable à lever. De même, `/paiement/pack` ouvert sans contexte de
vente affiche un état invalide ; cette visite ne prouve aucun achat.

Un PDF synthétique a été sélectionné et envoyé par le navigateur avec
« Ajouter la pièce ». La version est devenue `SAINE`; le worker a créé
une lecture `ILLISIBLE`, `creditConsumed=false`, jetons `0/0`, avec motif
technique explicite « aucun fournisseur ». La revue apparaît dans B-05.
Une décision `CONFORME`, motif et message candidat, a ensuite été saisie
et enregistrée via l'écran opérateur ; la base confirme le nouvel état.
Le fournisseur restant absent, cette preuve porte sur le parcours humain,
pas sur l'extraction automatique d'un vrai passeport.

Les anciens tests fonctionnels RF-5/S.167 restent des preuves historiques,
distinctes de cette exécution. Les gestes et plateformes non rejoués ne
sont pas marqués vérifiés dans la matrice. TalkBack, Firefox/WebKit,
paiement réel, qualification IA et recette complète pilote restent ouverts.

## 6. Autres corrections documentaires et risques à qualifier

### REV-BANC-01 — Banc déclaré prêt malgré un serveur non démarré

**P2 — contrôle de validité de la recette — scripts/recette/banc.mts.**
Au redémarrage sur un port déjà occupé par le précédent banc, le processus
web a échoué avec `EADDRINUSE`, mais le lanceur a affiché « Banc prêt » :
son contrôle de santé a interrogé le serveur déjà présent. Le code ne
conditionne pas non plus cette annonce à une réponse de santé après la
dernière attente. La nouvelle recette S.169 utilise un port distinct et
le bon processus standalone ; cette tentative conflictuelle n'est pas
comptée parmi ses visites réussies.

Reproduction : deux bancs locaux, bases jetables distinctes, même port,
environnement sans configuration fournisseur. Le second doit s'arrêter
avec une erreur actionnable, fermer ses services et ne jamais annoncer
sa disponibilité. L0 doit contrôler la vie de ses enfants, le délai de
démarrage et l'identité du serveur interrogé. Ce point s'ajoute aux cinq
groupes IA ; il ne démontre pas une panne de l'application en production.

Le benchmark IA affirmait encore un quota en jetons et l'impossibilité
d'une fausse conformité. Ces passages sont corrigés : **D1 fixe un quota
en analyses**, la mesure de jetons sert au coût/marge et un parseur ne
garantit pas la vérité des valeurs extraites.

Les modèles, prix, régions et conditions commerciales de ce benchmark
sont des références historiques à revalider avant choix réel. Aucun appel
ne confirme dans cette revue le modèle Anthropic par défaut du code.
La rédaction transmet des données personnelles même sans pièce jointe.
Le code fournisseur générique ne permet pas seul de retrouver l'identité
commerciale ou la région du prestataire : documentation et contrôle à
consolider dans L1/L5. Ces risques ne sont pas présentés comme des incidents
de production observés.

L'état des données antérieures, la restauration, la qualité du courrier
réel et les préalables Q.A/M.C restent à documenter sur l'environnement
cible. Les simulations de purge et paiement n'en apportent pas la preuve.

## 7. Reproduction des nouveaux contrôles

Pour la base auditée : Node 24, `npm ci`, génération du client Prisma,
PostgreSQL local dédié et aucun secret réel. Exécuter la porte ordinaire
avec `.github/workflows/validation.yml` et les 26 fumées ci-dessus.

```bash
npm run check
npm run check:audit
npm run build
npx tsx scripts/recette/diagnostic-ia.mts
# Ce diagnostic sort actuellement avec code 1 : six attentes non satisfaites.

# DATABASE_URL pointe vers le PostgreSQL local dédié.
npx tsx scripts/recette/diagnostic-relecture.mts
# Base propre créée puis supprimée ; code 1 sur le double appel/débit.
```

Pour le navigateur : Python et `playwright` installés, Chromium disponible,
application construite, démarrer `npm run recette:banc` sur le PostgreSQL
dédié **après L0 ou depuis un environnement sans aucune configuration IA**.
Capturer son journal local ; il contient uniquement les comptes synthétiques
du banc et ne doit pas être publié. Relever les identifiants dossier et
pièce dans les liens de l'interface de démonstration.

```bash
python scripts/recette/revue-navigateur.py \
  --url http://127.0.0.1:3100 \
  --banc-log .recette/banc.log \
  --dossier IDENTIFIANT_DU_DOSSIER \
  --piece IDENTIFIANT_DU_PASSEPORT \
  --chromium /usr/bin/chromium
```

Le script produit `.recette/revue-navigateur.json`, vérifie les connexions,
la session reconnue, les deux refus API, les erreurs JS et les débordements.
Il accepte les quatre absences juridiques explicites du banc ; elles ne
sont pas une validation de publication. Il n'automatise pas encore l'achat,
le dépôt et toute la matrice ; le dépôt et la décision décrits au §5 ont
été pilotés séparément et contrôlés dans la base locale.

**Critère de clôture de ce chantier :** diagnostics corrigés sans changer
leurs attentes, porte complète verte sur le code final de Claude, parcours
de la matrice achevés et preuves des préalables réels consignées. Le seul
nombre de tests réussis ne suffit pas à autoriser le lancement.

## 8. Validation de la base finale après fusion Prisma 7

La PR #272 a été fusionnée pendant la revue. Les livrables sont rattachés
à main **`ec32f65` / S.169**, en préservant tous ses fichiers et décisions,
y compris le nouveau client Prisma, le CLI et la conception de l'image.
Les compléments du registre et du plan ont été réunis avec ceux de Claude.

Installation verrouillée et génération du client **Prisma 7.10.0** réussies.
`npm run check` : **179 fichiers / 3 586 tests passent**, types, lint et copie
passent. Les quatre tests supplémentaires proviennent de la base Claude.
`check:audit` passe avec les mêmes avis résiduels. `npm run build` passe
pour Next et le worker. Prisma validate et les **26 fumées** passent encore,
avec **1 680 contrôles rapportés** et **105 refus / 9 permissions SQL**.
La fumée worker reconstruit elle-même son artefact dans une arborescence
isolée ; ces preuves ne reposent pas sur l'ancien worker S.168.

Les diagnostics IA et de concurrence sont rejoués sur cette base : mêmes
six attentes IA en échec et même double appel/débit en DIA-07. Aucune
correction de ces défauts n'est attribuée à la migration Prisma.

Un nouveau serveur standalone et worker S.169, nouvelle base jetable,
port distinct et aucune configuration IA, servent la recette finale :
**45 navigations et neuf contrôles conformes**, zéro erreur JavaScript,
zéro débordement. Les absences juridiques attendues restent explicitement
signalées. Le sandbox paiement reste non éprouvé et les limites locales
nginx/ShellCheck/image du §2 demeurent. Les preuves Q.A/M.C ne changent pas.

Le dépôt PDF et la décision opérateur décrits au §5 ont aussi été rejoués
sur ce nouveau banc : version saine, traitement sans IA et décision finale
`CONFORME` confirmés en base. Les sorties structurées des contrôles sont
consignées dans [preuves-2026-10-11.json](preuves-2026-10-11.json), avec
identifiants synthétiques anonymisés et limites de preuve explicites.
