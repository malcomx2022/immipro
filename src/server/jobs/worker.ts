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
import { demarrerLeBattement } from "./battement";
import { purgerCeQuiEstEchu, purgerLesPiecesEchues } from "./purge";
import { acheverLesSuppressionsEnAttente } from "@/server/acces/suppression";
import { depublierLesFichesEchues } from "./veille";
import { declasserLesPiecesEchues } from "./peremption";
import { envoyerLesRappels } from "./rappels";
import { relancerLesDepots } from "./suivi-depot";
import { reconcilierSansRecouvrement } from "./reconciliation";
import { analyserUnePiece } from "./analyse";
import { balayerUnePiece } from "./balayage";
import { reprendreLesAnalysesEnAttente, reprendreLesQuarantaines } from "./quarantaine";
import { propagerLaPublication, doitRejouer } from "./divergence";
import {
  traiterLesBrouillonsInactifs,
  doitRejouer as doitRejouerLInactivite,
} from "./inactivite";
import {
  traiterLaConservation,
  doitRejouer as doitRejouerLaConservation,
} from "./conservation";
import {
  relancerLesRemboursements,
  doitRejouer as doitRejouerLesRelances,
} from "./relances";

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

  await boss.work<{ nouvelleId: string }>(
    JOBS.DIVERGENCE_REGLEMENTAIRE,
    async ([job]) => {
      if (!job) return;
      // `ancienneId` ne sert plus au ciblage : la passe vise toutes les
      // versions antérieures, et compare chaque dossier depuis la sienne.
      // Les jobs déjà en file le portent encore, et il est simplement
      // ignoré.
      const bilan = await propagerLaPublication(job.data.nouvelleId);
      console.info("[divergence]", bilan);
      /*
        Un dossier qui n'a pas pu être prévenu fait rejouer la passe —
        elle est reprenable, et ceux qui l'ont été sont sautés. C'est ici
        que la décision se prend et non dans la propagation : celle-ci
        doit pouvoir rendre son compte pour qu'on vérifie que les autres
        dossiers, eux, ont bien reçu leur alerte.
      */
      if (doitRejouer(bilan)) {
        throw new Error(
          `Divergence : ${bilan.aReprendre} dossier(s) non alerté(s) sur ${bilan.dossiers}. ${bilan.incidents.join(" · ")}`,
        );
      }
    },
  );

  await boss.work(JOBS.RECONCILIATION_PAIEMENT, async () => {
    // Le même verrou que l'action de B-04 (S.122) : une passe lancée à la
    // main et celle du quart d'heure ne se recouvrent pas.
    const bilan = await reconcilierSansRecouvrement();
    if (bilan === null) {
      console.info("[reconciliation] passe ignorée : une autre passe est en cours");
      return;
    }
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

  await boss.work(JOBS.REPRISE_QUARANTAINE, async () => {
    /*
      Les analyses perdues d'abord, et sans condition : elles ne demandent
      pas le moteur, seulement la file (revue du 07/10/2026, E6).
    */
    const analyses = await reprendreLesAnalysesEnAttente();
    if (analyses.remises > 0) console.info("[quarantaine] analyses reprises", analyses);
    const bilan = await reprendreLesQuarantaines();
    /*
      `moteurMuet` n'est pas une panne de la passe : c'est le cas où
      « dès que le service revient » n'est pas encore arrivé. Elle sort
      sans rien remettre, et repassera à l'heure suivante. Lever ferait
      d'une attente annoncée au candidat une tâche en échec.
    */
    if (bilan.remises > 0 || bilan.moteurMuet) console.info("[quarantaine]", bilan);
  });

  await boss.work(JOBS.RELANCE_REMBOURSEMENT, async () => {
    const bilan = await relancerLesRemboursements();
    /*
      Silencieuse quand il n'y a rien : une dette ouverte est rare, et un
      journal qui dit « 0 » tous les quarts d'heure noie celui qui dit
      autre chose. Un abandon, lui, se voit toujours — c'est une somme
      qu'un humain doit reprendre.
    */
    if (bilan.relancees > 0 || bilan.abandonnees > 0) console.info("[relances]", bilan);
    if (doitRejouerLesRelances(bilan)) {
      throw new Error(`Remboursements non relancés : ${bilan.incidents.join(" | ")}`);
    }
  });

  await boss.work(JOBS.BROUILLONS_INACTIFS, async () => {
    const bilan = await traiterLesBrouillonsInactifs();
    console.info("[inactivite]", bilan);
    /*
      Comme la propagation d'une divergence : la passe rend son bilan, et
      c'est ici qu'on décide de rejouer. Un dossier qui échoue n'emporte
      pas les autres, et la relance non envoyée repart à la passe
      suivante — rien n'est marqué tant que le courrier n'est pas parti.
    */
    if (doitRejouerLInactivite(bilan)) {
      throw new Error(`Brouillons inactifs non traités : ${bilan.incidents.join(" | ")}`);
    }
  });

  await boss.work(JOBS.CONSERVATION_PIECES, async () => {
    const bilan = await traiterLaConservation();
    console.info("[conservation]", bilan);
    // Même conduite que l'inactivité : rien n'est écrit tant que l'annonce
    // n'est pas partie, donc rejouer ne double aucun avis.
    if (doitRejouerLaConservation(bilan)) {
      throw new Error(`Conservation non traitée : ${bilan.incidents.join(" | ")}`);
    }
  });

  await boss.work(JOBS.SUIVI_DEPOT, async () => {
    console.info("[suivi-depot]", await relancerLesDepots());
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
    Les rappels d'échéance, toutes les heures — WF-09 étape 3, S.87.

    Une fois par jour à sept heures UTC, le rappel partait à huit heures à
    Cotonou et à deux heures du matin à Montréal. La passe tourne
    maintenant chaque heure, et n'envoie à un candidat qu'à partir de huit
    heures **dans son fuseau**. Elle rattrape aussi : une passe manquée à
    huit heures est faite à neuf, et un courrier resté en attente sur une
    coupure est repris l'heure suivante.

    Tourner vingt-quatre fois par jour ne multiplie rien : la clé
    `echeance:<dossier>:<jour local>` est unique en base, et une passe qui
    trouve le rappel du jour déjà réservé n'envoie rien.

    À la cinquième minute : après la sonde des services, qui rafraîchit le
    constat de messagerie à l'heure pile. L'écran ne promet l'email que sur
    ce constat.
  */
  await boss.schedule(JOBS.RAPPEL_ECHEANCIER, "5 * * * *");

  /*
    Les brouillons laissés de côté, une fois par jour — RG-04.2.

    À huit heures, après les rappels d'échéance : un candidat dont le
    brouillon porte aussi une échéance reçoit d'abord ce qu'il peut faire
    aujourd'hui, ensuite ce qui arrivera dans neuf mois. L'inverse ferait
    lire une clôture avant une date à tenir.

    Quotidienne et non hebdomadaire : le seuil est un jour précis, et la
    relance annonce une date de clôture calculée depuis la dernière
    activité. Une passe hebdomadaire la ferait partir jusqu'à six jours
    en retard, sur une échéance que le courrier donne au jour près.
  */
  await boss.schedule(JOBS.BROUILLONS_INACTIFS, "0 8 * * *");

  /*
    Les dossiers soumis et suspendus, une fois par jour — arbitrage S.78.

    Après l'inactivité, pour la même raison qu'elle vient après les
    rappels : ce que le candidat peut faire aujourd'hui passe avant ce qui
    arrivera à ses pièces. Quotidienne, parce que l'échéance se tient au
    jour près et que le préavis en dépend.
  */
  await boss.schedule(JOBS.CONSERVATION_PIECES, "15 8 * * *");

  /*
    Les relances après dépôt, toutes les heures — WF-10 étape 2, S.89.

    Horaire comme les rappels d'échéance : la relance part à partir de
    huit heures dans le fuseau du candidat, et une passe manquée est
    rattrapée à la suivante. La clé `suivi-depot:<dossier>:<jalon>` rend
    les vingt-quatre passes du jour sans effet après la première.
  */
  await boss.schedule(JOBS.SUIVI_DEPOT, "20 * * * *");

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

  /*
    La reprise des quarantaines, toutes les heures — I.D.

    À la vingtième minute, après la resonde : la passe ne remet en file
    que sur une sonde concluante, et la lire juste après la sonde lui
    donne un constat de l'heure plutôt que de la précédente. Vingt
    minutes laissent aussi le temps au balayage remis en file de
    conclure avant que la passe suivante le revoie.

    Horaire et non quotidienne : la phrase dit « dès que le service
    revient », et un candidat qui attend son contrôle ne l'attend pas
    jusqu'au lendemain trois heures.
  */
  await boss.schedule(JOBS.REPRISE_QUARANTAINE, "20 * * * *");

  /*
    Les relances de remboursement suivent la cadence du rapprochement, et
    pour la même raison : c'est de l'argent, et le repos de trente minutes
    de `suiteDeLaDette` décide seul du rythme réel. Une passe plus lente
    laisserait une dette attendre la nuit ; une plus rapide ne changerait
    rien, le repos la retiendrait.

    Décalée de sept minutes sur le quart d'heure du rapprochement : les
    deux passes écrivent sur `Transaction`, et les faire partir ensemble
    n'apporte rien qu'un risque de contention.
  */
  await boss.schedule(JOBS.RELANCE_REMBOURSEMENT, "7,22,37,52 * * * *");

  // Et une fois tout de suite : attendre l'heure ronde laisserait
  // l'instance sans constat pendant jusqu'à soixante minutes après un
  // déploiement, c'est-à-dire exactement quand on la regarde.
  console.info("[sondes]", await sonderLesServices());

  // La sonde du conteneur lit ce battement (M15) : un worker figé cesse de
  // battre, et `docker compose ps` le dit `unhealthy`.
  demarrerLeBattement();

  console.log("worker démarré");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
