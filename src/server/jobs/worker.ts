/**
 * Worker pg-boss. Démarré comme service séparé en production
 * (voir docker-compose.prod.yml, service `worker`).
 */
import { getQueue, JOBS } from "@/lib/queue";

async function main() {
  const boss = await getQueue();

  await boss.work(JOBS.ANALYSE_DOCUMENT, async () => {
    // WF-06 : OCR/vision + validations déterministes, puis recalcul du score.
  });

  await boss.work(JOBS.RECONCILIATION_PAIEMENT, async () => {
    // RG-05.4 : transactions EN_ATTENTE de plus de 10 minutes.
  });

  await boss.work(JOBS.PURGE_RETENTION, async () => {
    // INV-5 : purge des pièces selon RETENTION_DOCUMENTS_DAYS.
  });

  await boss.work(JOBS.VEILLE_ECHEANCE, async () => {
    // RG-14.1 : toute fiche dont nextReviewAt est dépassée repasse en DRAFT.
  });

  console.log("worker démarré");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
