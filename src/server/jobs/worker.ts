/**
 * Worker pg-boss. Démarré comme service séparé en production
 * (voir docker-compose.prod.yml, service `worker`).
 *
 * Les acteurs SYS de DOC-11 vivent ici. Chaque tâche est une fonction
 * ordinaire, testable seule, et le worker ne fait que les brancher : c'est
 * ce qui permet de rejouer une purge ou une réconciliation à la main un soir
 * d'incident, sans file de jobs.
 */
import { getQueue, JOBS } from "@/lib/queue";
import { purgerLesPiecesEchues } from "./purge";
import { depublierLesFichesEchues } from "./veille";
import { reconcilierLesPaiements } from "./reconciliation";
import { analyserUnePiece } from "./analyse";
import { propagerLaPublication } from "./divergence";

async function main() {
  const boss = await getQueue();

  await boss.work<{ applicationId: string; documentId: string; versionId: string }>(
    JOBS.ANALYSE_DOCUMENT,
    async ([job]) => {
      if (!job) return;
      await analyserUnePiece(job.data);
    },
  );

  await boss.work<{ ancienneId: string; nouvelleId: string }>(
    JOBS.DIVERGENCE_REGLEMENTAIRE,
    async ([job]) => {
      if (!job) return;
      const bilan = await propagerLaPublication(job.data.ancienneId, job.data.nouvelleId);
      console.info("[divergence]", bilan);
    },
  );

  await boss.work(JOBS.RECONCILIATION_PAIEMENT, async () => {
    const bilan = await reconcilierLesPaiements();
    console.info("[reconciliation]", bilan);
  });

  await boss.work(JOBS.PURGE_RETENTION, async () => {
    const bilan = await purgerLesPiecesEchues();
    console.info("[purge]", bilan);
  });

  await boss.work(JOBS.VEILLE_ECHEANCE, async () => {
    const depubliees = await depublierLesFichesEchues();
    console.info("[veille]", { depubliees });
  });

  // Cadences de DOC-11 : quinze minutes pour la réconciliation (RG-05.4),
  // une fois par jour pour la veille (WF-14) et la purge (INV-5).
  await boss.schedule(JOBS.RECONCILIATION_PAIEMENT, "*/15 * * * *");
  await boss.schedule(JOBS.VEILLE_ECHEANCE, "0 3 * * *");
  await boss.schedule(JOBS.PURGE_RETENTION, "30 3 * * *");

  console.log("worker démarré");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
