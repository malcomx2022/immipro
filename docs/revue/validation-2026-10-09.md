# Validation de la revue et du lot RF-0 — 9 octobre 2026

Base de code : main 3f089c298e679a0f54be91e0a0a76181bda1eec0. Node 24.19.0. Dépendances installées avec npm ci et le package-lock.json de cette base ; Next 15.5.27, Prisma 6.19.3. Client Prisma généré avec ce schéma.

## Contrôles de la revue initiale (S.141)

| Contrôle | Résultat |
|---|---|
| Installation selon verrou | npm ci réussi dans un répertoire de dépendances isolé ; installation sans scripts, puis prisma generate explicite. |
| Lint | Réussi, aucune erreur ou alerte ESLint ; next lint signale sa dépréciation. |
| Types | tsc --noEmit réussi. |
| Suite existante | 162 fichiers et 3 431 tests réussis. |
| Vocabulaire | check:copy exécuté séparément : aucune formulation interdite. |
| Construction | npm run build réussi : Next 15.5.27 et artefacts du worker/commandes construits. |
| Schéma | prisma validate réussi avec une URL de validation factice ; aucune connexion à une base par ce contrôle. |
| Audit | check:audit réussi selon la politique du dépôt : une vulnérabilité élevée deepmerge-ts acceptée par D-34/audit-exceptions.json ; quatre avis modérés affichés. |
| Reproductions de revue | 5 assertions réussies qui confirment les anomalies FON-01 à FON-04 et E5 ; fonctions du code actuel, dépendances simulées. |

La première tentative utilisait les dépendances retenues dans l'environnement, dont Next 15.5.25, et des restrictions d'écoute locale. Elle a été interrompue et ne fonde pas ces résultats. L'installation selon le verrou puis les contrôles ci-dessus ont remplacé cette tentative.

La chaîne check a exécuté lint, types et tests. Le contrôle de vocabulaire a ensuite été lancé séparément, car un argument d'aide de la commande englobante empêchait la dernière sous-commande de le lancer. Le résultat de check:copy cité ici vient de son exécution réelle, pas de l'aide npm.

## Ce qui n'est pas attesté

- Migrations et garde-fous exécutés sur PostgreSQL jetable, et 25 fumées de validation.
- Démarrage du worker dans son image, Docker et six services healthy.
- Recette navigateur, Android, TalkBack, CORS, stockage réel et URL présignée.
- État de la base, des textes publiés et des services du VPS.
- Paiement ou remboursement réel, SMTP d'exploitation, fournisseur IA réel et certification fiscale.
- Validations juridiques et comptables.

Le schéma valide, les tests de composants et le build ne prouvent pas ces points. Ils restent dans les conditions de sortie RF-5 et RF-6.

## Actualisation documentaire RF-0 (S.144)

Autorisation du responsable : « lot 0 ». Base : main dd2b58f7fadf63e0917b6483199132898191bec1. S.142 à S.144 sont fusionnés ; leurs diffs ont été examinés et conservés. Leurs fichiers de logique porteurs de FON-01 à FON-04 et E5 sont identiques à ceux de la revue initiale. Les preuves ci-dessus restent datées de S.141 ; elles ne sont pas présentées comme des contrôles de Next 16.

Contrôles exécutés sur la copie isolée de cette base avec les documents RF-0 : Node 24.19.0, Next 16.4.0, Prisma 6.19.3.

| Contrôle RF-0 | Résultat |
|---|---|
| Installation exacte | npm ci selon le nouveau verrou, sans scripts ; prisma generate explicite réussi. |
| Porte exigée par CLAUDE.md | npm run check réussi : lint, types, tests, puis vocabulaire réellement exécutés. |
| Suite existante | 164 fichiers et 3 436 tests réussis ; aucune reproduction de comportement incorrect ajoutée. |
| Diff documentaire | Sept fichiers Markdown uniquement ; aucun code, schéma, migration ni dépendance modifié. |
| Invariants | Huit lignes identiques à main dans CLAUDE.md et huit lignes conservées dans DOC-11. |
| Continuité | Registre historique conservé intégralement ; contenu du plan historique conservé, avec correction de sa date d'état et ajout du §8 ; S.142 à S.144 conservés. |
| Liens et route | Quinze liens locaux ajoutés vérifiés ; route /api/paiements/statut présente. |
| Checkout fourni | Propre et conservé ; travail réalisé dans une copie isolée. |

Build, audit, migrations, fumées, image et recette navigateur ne sont pas rejoués pour ce changement exclusivement documentaire. Leurs résultats S.141 ci-dessus sont historiques ; aucun succès de build ou d'exploitation Next 16 n'est déclaré par RF-0. Les contrôles de lancement restent requis pour les lots applicatifs et la V1.

## Preuves préparatoires et périmètre

Les cinq assertions préparatoires expriment le comportement incorrect observé ; elles ont été exécutées avec dépendances simulées dans une copie isolée. Elles ne sont pas ajoutées aux tests du projet. Les scénarios et observations sont détaillés dans la revue ; les régressions définitives devront exiger le comportement correct et éprouver les courses sur PostgreSQL.

Les rapports ne contiennent aucune pièce candidat, aucun secret ni donnée de production. RF-0 modifie sept fichiers documentaires ; aucun code, schéma, migration ou drapeau commercial. Le checkout fourni est conservé. La branche et la PR documentaires restent distinctes d'une fusion ou d'un déploiement. A-1 à A-3 restent à valider.
