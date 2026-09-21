# ImmiPro

Plateforme d'accompagnement à la préparation de dossiers d'immigration — études et emploi — pour l'Afrique francophone et la diaspora.

ImmiPro **informe et prépare**. Elle ne délivre pas de conseil juridique et ne promet aucun résultat. Cette phrase n'est pas une formule : elle contraint le code. Voir [`CLAUDE.md`](./CLAUDE.md).

---

## Pile technique

| Couche | Choix |
|---|---|
| Application | Next.js (App Router), TypeScript, Tailwind |
| Base de données | PostgreSQL 16 natif, Prisma |
| Authentification | NextAuth, sessions en base |
| Fichiers | MinIO, buckets privés, URLs présignées 5 min |
| Jobs asynchrones | pg-boss (files dans PostgreSQL) |
| IA | Claude API, vision directe sur document |
| Paiement | FedaPay (XOF) + Stripe (EUR) |
| Proxy | Nginx + Let's Encrypt |
| CI/CD | GitHub Actions → GHCR → pull sur VPS |

Pas de microservices, pas de Kafka, pas de Kubernetes. Un monolithe modulaire sur un VPS.

---

## Démarrage

```bash
cp .env.example .env            # renseigner les secrets
docker compose up -d            # postgres + minio
npm install
npx prisma migrate dev
npm run seed:rules              # référentiel vague 1
npm run dev                     # http://localhost:3000
```

Node 20 LTS (`.nvmrc`).

### Le worker

Les acteurs SYS de DOC-11 — purge, réconciliation des paiements, veille,
balayage puis analyse des pièces, péremption — tournent dans un **service
séparé** de l'application web. Un travail de fond logé dans le processus
qui sert les requêtes partagerait sa mémoire et son cycle de vie.

```bash
npm run worker                  # en local : TypeScript, rechargé par tsx
```

En production, rien n'interprète du TypeScript et rien n'est téléchargé au
démarrage. `npm run build` produit deux artefacts — la sortie `standalone`
de Next et `dist/worker.js`, un paquet unique compilé par esbuild — et le
conteneur lance le second :

```bash
npm run build                   # .next/standalone + dist/worker.js
node --enable-source-maps dist/worker.js
```

C'est exactement la commande du service `worker` de
`docker-compose.prod.yml`, qui partage l'image de l'application. Seuls
`@prisma/client` et le client généré restent hors du paquet : ils chargent
leurs moteurs par chemin à l'exécution, et la sortie `standalone` les
embarque déjà.

Les files de jobs sont déclarées au démarrage de chaque processus
(`declarerLesFiles`, dans `src/lib/queue.ts`). pg-boss 10 ne les crée plus
au premier envoi : la table des jobs est partitionnée par file et planifier
sur une file inconnue échoue, tandis que **poster** sur une file inconnue
ne lève pas — l'envoi rend `null` et le job disparaît. D'où `poster()`,
qui refuse ce silence : un dépôt ne peut pas répondre « en cours
d'analyse » pour un fichier que personne ne balaiera.

```bash
npm run smoke:worker            # construit le paquet et l'exécute isolé
npm run smoke:worker -- --base  # + démarrage réel sur PostgreSQL
npm run smoke:worker -- --image # idem, dans l'image Docker (démon requis)
```

Le test de fumée lance la commande que le fichier de déploiement déclare,
dans une arborescence réduite aux seules dépendances que l'image copie.
Sans PostgreSQL, le worker doit échouer sur la connexion et rendre un code
non nul : un artefact absent, amputé d'un module ou réduit à une fonction
morte ne passe pas.

`--base` ajoute l'autre moitié, celle que la première masquait : le paquet
démarre deux fois sur une base **jetable** — créée et supprimée par le
script, jamais celle du poste — pour vérifier que les files et les cadences
sont bien créées, qu'un redémarrage n'y touche pas, et que chaque file
accepte réellement un job. `DATABASE_URL` doit désigner le serveur.

---

## La porte de qualité

Rien ne part en production sans être passé par
[`.github/workflows/validation.yml`](.github/workflows/validation.yml). La
CI et le déploiement appellent **le même** fichier : ce qui bloque une
proposition bloque une image, et le déploiement ne peut pas être plus
indulgent que la revue. Aucune étape n'y porte `continue-on-error`.

| Étape | Ce qu'elle refuse de laisser passer |
|---|---|
| `npm ci` | une dépendance qui dérive du verrou |
| `npm run check` | lint, types, tests, vocabulaire interdit |
| `npm run build` | un projet testé mais qui ne construit pas |
| `prisma validate` | un schéma syntaxiquement invalide |
| `npm run smoke:migrations` | une migration cassée, une dérive entre `schema.prisma` et ce que les migrations produisent, un garde-fou absent |
| `npm run smoke:worker -- --base` | un paquet worker absent, amputé, ou incapable de démarrer sur une base vierge |
| l'image, avant sa poussée | une commande de `docker-compose.prod.yml` qui ne démarre pas dans l'image |

Les trois derniers tournent aussi en local, sur n'importe quel serveur
PostgreSQL :

```bash
DATABASE_URL=postgresql://immipro:immipro@localhost:5432/immipro \
  npm run smoke:migrations
```

Chacun crée et supprime la base jetable dont il a besoin ; aucune base
existante n'est touchée. `npm run db:garde-fous`, lui, s'applique à la base
que `DATABASE_URL` désigne et échoue si une contrainte manque.

L'image est construite **une fois**, éprouvée, puis poussée telle quelle :
les commandes des conteneurs sont vérifiées contre l'empreinte qui partira,
pas contre une reconstruction.

---

## Organisation du code

```
src/
├── app/
│   ├── (public)/     accueil, simulateur, fiches pays, blog, tarifs
│   ├── (app)/        espace candidat : dossiers, checklist, paiement
│   ├── (admin)/      back-office : veille, utilisateurs, audit
│   └── api/          routes serveur, webhooks
├── components/       ui/ (design system) + layout/
├── domain/           logique métier pure, testable sans base
│   ├── rules/        schéma et chargement du référentiel visa_rules
│   ├── completeness/ calcul du score de complétude
│   └── payments/     règles de tarification et de devise
├── lib/              accès aux services : db, auth, storage, ai, queue
└── server/jobs/      workers pg-boss
```

Règle : `domain/` ne connaît ni Prisma, ni Next, ni le réseau. Tout ce qui est testable sans infrastructure y vit.

---

## Documentation

| Document | Contenu |
|---|---|
| `CLAUDE.md` | Invariants, conventions, ce qui est interdit |
| `docs/DOC-11-workflows.md` | 16 workflows fonctionnels, règles de gestion |
| `docs/DOC-12-prototype.md` | Design system, inventaire des 39 écrans |
| `docs/BRAND.md` | Usage de la marque |
| `docs/visa-rules.md` | Référentiel réglementaire et veille |

---

## Conventions Git

Branches : `main` (production), `develop` (intégration), `feat/*`, `fix/*`, `chore/*`.

Commits : [Conventional Commits](https://www.conventionalcommits.org/fr/).

```
feat(checklist): affiche le message actionnable sur pièce à corriger
fix(payments): idempotence du webhook FedaPay
docs(rules): fiche Pays-Bas v2 — montants IND 2027
```

Une issue par écran du prototype (code de l'inventaire DOC-12) ou par règle de gestion de DOC-11.

---

## Statut

Squelette. Le prototype Claude Design est en cours ; les écrans seront implémentés à partir de la bibliothèque de composants, pas en découpant les maquettes.
