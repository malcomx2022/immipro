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
import { noterLeFait } from "@/server/courrier";
import { verifierLaConnexion } from "@/server/courrier/smtp";
import { verifierLeMoteur } from "@/server/securite/antivirus";
import { purgerCeQuiEstEchu, purgerLesPiecesEchues } from "./purge";
import { acheverLesSuppressionsEnAttente } from "@/server/acces/suppression";
import { depublierLesFichesEchues } from "./veille";
import { declasserLesPiecesEchues } from "./peremption";
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

  await boss.work(JOBS.PEREMPTION_PIECES, async () => {
    console.info("[peremption]", await declasserLesPiecesEchues());
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
    La sonde du transport de courrier, une fois au démarrage.

    `verify()` ouvre la connexion, dit bonjour, s'authentifie si besoin,
    et raccroche : **aucun message n'est remis**. C'est ce qui permet de
    l'appeler ici sans écrire à personne.

    Elle est ici et non dans `/api/health`, parce que cette adresse-là
    est interrogée par un répartiteur de charge et que la décision de
    n'en rien faire partir est prise (21/09/2026). Sans ce passage, la
    messagerie resterait « configurée, non vérifiée » jusqu'au premier
    courrier réel — c'est-à-dire jusqu'au premier candidat, qui est
    exactement la personne sur qui on ne veut pas découvrir la panne.

    Son échec n'empêche pas le worker de démarrer : les jobs de paiement
    et de purge n'ont rien à voir avec le courrier, et les bloquer sur
    un serveur de messagerie muet ferait d'une panne un arrêt.
  */
  const courrier = await verifierLaConnexion().catch(() => null);
  if (courrier) {
    noterLeFait(courrier.issue === "envoye");
    console.info(`[courrier] vérification de la connexion · ${courrier.issue}`);
  }

  /*
    La sonde du moteur de balayage, une fois au démarrage, et pour la même
    raison que celle du courrier : `/api/health` est interrogée par un
    répartiteur de charge et ne déclenche rien.

    Ce qui part est le fichier d'essai **EICAR** — une chaîne normalisée,
    sans charge, que les moteurs se sont accordés à signaler précisément
    pour qu'on puisse les vérifier. Aucun fichier de candidat n'est
    transmis, aucune version n'est touchée, rien n'est promu.

    Le seul résultat qui vaut preuve est « infectée ». Un moteur qui
    répond `clean` à EICAR répond sans détecter, et c'est la panne qu'il
    faut lire ici plutôt que sur le premier fichier réellement infecté :
    elle ne se remarquerait jamais autrement, puisque tout continuerait
    de passer.

    Son échec n'empêche pas le worker de démarrer. Il n'ouvre rien non
    plus : `antivirusConfigure` commande le dépôt, et une sonde muette
    laisse la capacité non vérifiée, donc l'instance inapte au
    téléversement.
  */
  const moteur = await verifierLeMoteur().catch(() => null);
  if (moteur) console.info(`[balayage] vérification du moteur · ${moteur.issue} — ${moteur.detail}`);

  console.log("worker démarré");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
