/**
 * Une transaction sérialisable perdue — S.214.
 *
 * Prisma la signale sous deux formes : l'erreur connue `P2034` (moteur
 * historique), ou, avec l'adaptateur `@prisma/adapter-pg` de Prisma 7,
 * une `DriverAdapterError` dont la cause est `TransactionWriteConflict`
 * (et, plus bas, le code PostgreSQL 40001 ou 40P01). Ne lire que `P2034`
 * laissait passer la seconde en erreur 500 : la fumée du second facteur
 * l'a vue sur trois suspensions croisées simultanées.
 */
export function estUneCoursePerdue(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== "object") return false;
  const e = erreur as { code?: unknown; name?: unknown; cause?: unknown; meta?: unknown };
  if (e.code === "P2034" || e.code === "40001" || e.code === "40P01") return true;
  if (e.name === "DriverAdapterError" && e.cause && typeof e.cause === "object") {
    const cause = e.cause as { kind?: unknown; originalCode?: unknown };
    if (cause.kind === "TransactionWriteConflict") return true;
    if (cause.originalCode === "40001" || cause.originalCode === "40P01") return true;
  }
  return e.cause !== undefined && e.cause !== erreur ? estUneCoursePerdue(e.cause) : false;
}
