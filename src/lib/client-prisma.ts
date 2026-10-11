import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Le client Prisma de l'application, du worker, des graines et des
 * commandes de l'image — Prisma 7, S.169.
 *
 * Prisma 7 n'ouvre plus de connexion lui-même : il passe par un adaptateur,
 * ici `pg`. Deux conséquences, réglées à un seul endroit :
 *
 * - l'URL vient de `DATABASE_URL` (ou de l'appelant), plus du schéma ;
 * - le pool est celui de `pg`. Il ignore `connection_limit` et
 *   `pool_timeout` dans l'URL, et attendrait une connexion libre sans fin.
 *   On rétablit le délai de Prisma 6 : dix secondes, puis une erreur.
 */
export const DELAI_D_ATTENTE_D_UNE_CONNEXION_MS = 10_000;

export function creerClientPrisma(
  options: { url?: string; log?: Prisma.LogLevel[] } = {},
): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: options.url ?? process.env.DATABASE_URL,
      connectionTimeoutMillis: DELAI_D_ATTENTE_D_UNE_CONNEXION_MS,
    }),
    ...(options.log ? { log: options.log } : {}),
  });
}
