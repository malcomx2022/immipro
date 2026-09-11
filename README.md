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
