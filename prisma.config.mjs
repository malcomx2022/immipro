/**
 * Configuration de la CLI Prisma — Prisma 7, S.169.
 *
 * Prisma 7 refuse l'URL dans `schema.prisma` (P1012) : `migrate deploy`,
 * `migrate status` et `migrate diff` la lisent ici. Le client, lui, la
 * reçoit par son adaptateur (`src/lib/client-prisma.ts`).
 *
 * En JavaScript sans aucun import, et non en `prisma.config.ts` avec
 * `defineConfig` de `prisma/config` : dans l'image, la CLI vit dans
 * `/opt/prisma-cli` (M15) et ce fichier dans `/app`, dont le `node_modules`
 * (sortie `standalone` de Next) n'a pas `prisma`. Un import y échouerait au
 * moment même de migrer, pendant un déploiement.
 *
 * @type {import("prisma/config").PrismaConfig}
 */

// Prisma 6 chargeait `.env` pour la CLI ; Prisma 7 ne le fait plus. On garde
// ce comportement en développement. `loadEnvFile` ne remplace pas une
// variable déjà posée : en CI et dans l'image, il n'y a pas de `.env`, et
// c'est l'environnement qui fait foi.
try {
  process.loadEnvFile(".env");
} catch {
  // Pas de `.env` : l'environnement suffit.
}

export default {
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
};
