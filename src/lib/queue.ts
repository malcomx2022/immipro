import PgBoss from "pg-boss";

/** Files de jobs stockées dans PostgreSQL — pas de Redis au démarrage. */
let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss(process.env.DATABASE_URL!);
  await boss.start();
  return boss;
}

export const JOBS = {
  /** Balayage antivirus, avant toute promotion (I.D, WF-06 étape 2). */
  BALAYAGE_PIECE: "document.balayage",
  ANALYSE_DOCUMENT: "document.analyse",
  RECONCILIATION_PAIEMENT: "paiement.reconciliation",
  PURGE_RETENTION: "retention.purge",
  VEILLE_ECHEANCE: "veille.echeance",
  DIVERGENCE_REGLEMENTAIRE: "regle.divergence",
  RAPPEL_ECHEANCIER: "echeancier.rappel",
} as const;
