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
import { purgerCeQuiEstEchu, purgerLesPiecesEchues } from "./purge";
import { acheverLesSuppressionsEnAttente } from "@/server/acces/suppression";
import { depublierLesFichesEchues } from "./veille";
import { reconcilierLesPaiements } from "./reconciliation";
import { analyserUnePiece } from "./analyse";
import { balayerUnePiece } from "./balayage";
import { propagerLaPublication } from "./divergence";

async function main() {
  const boss = await getQueue();

  // I.D — le balayage précède l'analyse, et c'est le worker qui les
  // enchaîne. La promotion vers le stockage de confiance a lieu dans
  // `balayerUnePiece` ; l'analyse n'est mise en file que si elle a eu lieu,
  // ce qui rend impossible d'analyser un fichier resté en quarantaine.
  await boss.work<{ applicationId: string; documentId: string; versionId: string }>(
    JOBS.BALAYAGE_PIECE,
    async ([job]) => {
      if (!job) return;
      const suite = await balayerUnePiece(job.data);
      if (suite === "ANALYSE") await boss.send(JOBS.ANALYSE_DOCUMENT, job.data);
    },
  );

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
    // Même passe, mêmes horaires : les durées annoncées ailleurs qu'INV-5
    // — six mois pour les alertes, cinq ans pour le journal — et les
    // sessions échues, qui ne servent plus rien.
    console.info("[conservation]", await purgerCeQuiEstEchu());
    // Même passe : une suppression de compte restée à mi-chemin faute de
    // stockage disponible se rattrape ici. Les jours ordinaires, elle ne
    // trouve rien (RG-10.4).
    const reprises = await acheverLesSuppressionsEnAttente();
    if (reprises.reprises > 0) console.info("[suppression]", reprises);
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
