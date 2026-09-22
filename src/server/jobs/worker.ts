/**
 * Worker pg-boss. Démarré comme service séparé en production
 * (voir docker-compose.prod.yml, service `worker`).
 *
 * Les acteurs SYS de DOC-11 vivent ici. Chaque tâche est une fonction
 * ordinaire, testable seule, et le worker ne fait que les brancher : c'est
 * ce qui permet de rejouer une purge ou une réconciliation à la main un soir
 * d'incident, sans file de jobs.
 */
import { getQueue, JOBS, poster } from "@/lib/queue";
import { sonderLesServices } from "@/server/exploitation/sondes";
import { purgerCeQuiEstEchu, purgerLesPiecesEchues } from "./purge";
import { acheverLesSuppressionsEnAttente } from "@/server/acces/suppression";
import { depublierLesFichesEchues } from "./veille";
import { declasserLesPiecesEchues } from "./peremption";
import { envoyerLesRappels } from "./rappels";
import { reconcilierLesPaiements } from "./reconciliation";
import { analyserUnePiece } from "./analyse";
import { balayerUnePiece } from "./balayage";
import { propagerLaPublication } from "./divergence";

async function main() {
  // `getQueue` déclare les files avant de rendre la main (voir
  // `src/lib/queue.ts`). pg-boss 10 refuse de travailler ou de planifier
  // sur une file inconnue, et le worker mourait ici sans rien traiter.
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
      // `poster` lève si la mise en file échoue : le balayage n'est alors
      // pas marqué réussi, et le job est rejoué. Avec `send`, une analyse
      // perdue aurait laissé la pièce indéfiniment « en analyse ».
      if (suite === "ANALYSE") await poster(boss, JOBS.ANALYSE_DOCUMENT, job.data);
      /*
        `BLOQUEE` : le balayage n'a pas conclu et la cause ne se reprend
        pas seule. La tâche s'achève — lever ferait rejouer à l'identique
        jusqu'à épuisement des reprises, sans rien changer au fichier.
        L'incident est écrit sur la version et se lit dans `/api/health` ;
        la pièce, elle, reste en quarantaine.
      */
      if (suite === "BLOQUEE") console.warn("[balayage] pièce bloquée", job.data.versionId);
    },
  );

  await boss.work<{ applicationId: string; documentId: string; versionId: string }>(
    JOBS.ANALYSE_DOCUMENT,
    async ([job]) => {
      if (!job) return;
      const suite = await analyserUnePiece(job.data);
      /*
        `A_REPRENDRE` : le service de lecture n'a pas répondu, et la cause
        se dissipe seule. Rien n'a été écrit sur la pièce et le quota a
        été rendu ; lever est la façon dont pg-boss rejoue, avec
        l'attente croissante déclarée dans `REPRISES`. Au-delà de trois
        tentatives, `analyserUnePiece` bascule de lui-même en revue
        humaine et rend `TERMINEE` — le job ne se rejoue donc pas
        indéfiniment.
      */
      if (suite === "A_REPRENDRE") {
        throw new Error(`lecture à reprendre pour la version ${job.data.versionId}`);
      }
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

  await boss.work(JOBS.SONDE_SERVICES, async () => {
    console.info("[sondes]", await sonderLesServices());
  });

  await boss.work(JOBS.PEREMPTION_PIECES, async () => {
    console.info("[peremption]", await declasserLesPiecesEchues());
  });

  await boss.work(JOBS.RAPPEL_ECHEANCIER, async () => {
    console.info("[rappels]", await envoyerLesRappels());
  });

  // Cadences de DOC-11 : quinze minutes pour la réconciliation (RG-05.4),
  // une fois par jour pour la veille (WF-14) et la purge (INV-5).
  //
  // La péremption passe **avant** la purge : elle déclasse des pièces et
  // refait des barèmes, et la purge qui suit travaille alors sur un état
  // à jour. Une pièce expirée aujourd'hui n'est pas pour autant à
  // supprimer — les deux passes ne se recouvrent pas —, mais l'ordre
  // évite qu'un bilan de purge cite un dossier « prêt » qui ne l'est plus.
  await boss.schedule(JOBS.RECONCILIATION_PAIEMENT, "*/15 * * * *");
  await boss.schedule(JOBS.VEILLE_ECHEANCE, "0 3 * * *");
  await boss.schedule(JOBS.PEREMPTION_PIECES, "15 3 * * *");
  await boss.schedule(JOBS.PURGE_RETENTION, "30 3 * * *");

  /*
    Les rappels d'échéance, une fois par jour — WF-09 étape 3.

    À sept heures et non à trois : un courrier reçu la nuit est lu le
    matin, mêlé à ceux de la nuit. La cadence hebdomadaire de RG-09.2
    est tenue par le job, pas par le planificateur — une urgence à
    quatre jours ne peut pas attendre lundi, et c'est la passe
    quotidienne qui la voit.

    Après la péremption : elle déclasse des pièces et refait des
    barèmes, et un rappel envoyé avant elle citerait un état de la
    veille.
  */
  await boss.schedule(JOBS.RAPPEL_ECHEANCIER, "0 7 * * *");

  /*
    La resonde, toutes les heures — I.C, 22/09/2026.

    Sans repasse, le constat du démarrage se périmerait
    (`FRAICHEUR_DU_CONSTAT_MS` vaut trois heures) et l'état de service
    retomberait à « aucune nouvelle » après une matinée de
    fonctionnement normal. La cadence est le tiers de la fraîcheur : un
    retard ou un redémarrage ne fait pas clignoter l'état, une panne
    installée se voit au bout de trois heures au plus.
  */
  await boss.schedule(JOBS.SONDE_SERVICES, "0 * * * *");

  // Et une fois tout de suite : attendre l'heure ronde laisserait
  // l'instance sans constat pendant jusqu'à soixante minutes après un
  // déploiement, c'est-à-dire exactement quand on la regarde.
  console.info("[sondes]", await sonderLesServices());

  console.log("worker démarré");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
