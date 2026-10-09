import type { Prisma, ReviewReason } from "@prisma/client";
import { db } from "@/lib/db";
import { noterLesJetons } from "@/server/ia/appel";
import { payload } from "@/server/acces/regles";
import { lectureAPayer } from "@/server/dossiers/reprise-gratuite";
import {
  debiterUneAnalyse,
  rendreUneAnalyse,
  rendreLaReservation,
  rendreUneTentative,
} from "@/server/acces/quota";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { commandeLaPiece, ecrireSurLaPieceCourante } from "@/server/acces/piece-courante";
import { autorisationAccordee } from "@/server/acces/consentements";
import { MENTION_NON_ANALYSEE } from "@/domain/dossiers/piece";
import { conditionsDeLaPiece, evaluerConditions } from "@/domain/dossiers/verification";
import { transmissibleALAnalyse } from "@/domain/dossiers/quarantaine";
import {
  MESSAGE_AU_CANDIDAT,
  MOTIF_DE_NON_LECTURE,
  champsDemandes,
  mesurer,
  seReprendSeule,
  type CauseDeNonLecture,
  type DemandeDeLecture,
} from "@/domain/dossiers/extraction";
import { lExtracteur, type Extracteur } from "@/server/dossiers/extracteur";
import { EchecHttp } from "@/server/http/echecs";
import { conserverFauteDeQuota } from "./balayage";

/**
 * Analyse d'une pièce — WF-06.
 *
 * RG-06.1 tient l'architecture de ce fichier : « tout ce qui est vérifiable
 * sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la
 * cohérence narrative. » L'ordre est donc : lire les champs, puis les
 * confronter aux conditions en TypeScript. Le verdict ne sort jamais du
 * modèle — il sort de la comparaison.
 *
 * Cette séparation n'est pas une élégance. Une exigence de six mois de
 * validité de passeport est une soustraction de dates : la confier à un
 * modèle, c'est accepter qu'elle soit fausse une fois sur mille, sur une
 * décision qui fait rater un départ.
 *
 * ── Ce que le branchement a changé (22/09/2026) ─────────────────────
 *
 * L'extracteur ne recevait que la clé de l'objet et le code de la pièce,
 * et devait rendre des champs nommés d'après les **conditions** du
 * référentiel. Le code de la pièce ne les nomme pas : aucun adaptateur
 * ne pouvait produire la bonne clé. L'exécution l'a montré avant qu'une
 * ligne soit écrite — un passeport valable jusqu'en 2029, correctement
 * lu, ressortait « aucune valeur lisible constaté, 6 mois exigé. Fais-le
 * renouveler puis redépose-le ». La demande porte maintenant les
 * conditions, et l'adaptateur rend des **faits bruts** que ce fichier
 * mesure.
 *
 * Trois autres choses en découlent :
 *
 * - `engineLog` disait « extracteur non branché », ce qui était vrai tant
 *   que rien n'appelait et serait devenu faux au premier appel. Il porte
 *   la cause réelle.
 * - Les jetons se comptent **aussi** quand la lecture échoue : une
 *   réponse tronquée a coûté. Ne pas les écrire ferait d'un appel raté un
 *   appel gratuit dans B-07, ce qu'INV-6 appelle un dépassement
 *   silencieux.
 * - Une cause qui se reprend seule ne verse plus la pièce en revue
 *   humaine au premier essai : DOC-11 demande trois reprises avec
 *   attente croissante avant la bascule, et la file les fait.
 */

export interface Tache {
  applicationId: string;
  documentId: string;
  versionId: string;
}

/**
 * Ce que le job dit à la file.
 *
 * `A_REPRENDRE` n'écrit aucun verdict : la pièce reste en analyse, le
 * quota débité est rendu, et la file rejouera. Écrire « illisible » sur
 * un service momentanément saturé ferait porter à la pièce une panne qui
 * n'est pas la sienne — et enverrait le candidat refaire une photo qui
 * n'a rien.
 */
export type Suite = "TERMINEE" | "A_REPRENDRE";

/**
 * Au-delà, la lecture automatique n'est plus attendue et la pièce part
 * en revue humaine (DOC-11, WF-06, cas limites). Trois, comme le
 * balayage : c'est la même question — combien de fois rejoue-t-on avant
 * d'admettre que quelqu'un doit regarder.
 */
export const TENTATIVES_AVANT_REVUE = 3;

/**
 * Le motif du rendu d'une lecture devenue sans objet — choix A-2 du
 * 09/10/2026 : remplacer un fichier pendant sa lecture ne fait pas payer
 * deux résultats.
 */
const MOTIF_OBSOLETE =
  "Lecture sans effet : la pièce a été remplacée, ou le dossier clos, pendant la lecture";

/** Le motif de mise en file de revue, déduit de la cause. */
function motifDeRevue(cause: CauseDeNonLecture): ReviewReason {
  switch (cause) {
    case "scan_illisible":
      return "NETTETE_INSUFFISANTE";
    case "langue_non_geree":
      return "DOCUMENT_NON_RECONNU";
    case "document_protege":
    case "non_configure":
    case "type_non_lisible":
    case "trop_volumineux":
    case "objet_absent":
    case "injoignable":
    case "delai_depasse":
    case "service_sature":
    case "refus":
    case "reponse_illisible":
      return "ECHEC_TECHNIQUE";
    default: {
      const jamais: never = cause;
      return jamais;
    }
  }
}


export async function analyserUnePiece(
  tache: Tache,
  extraire: Extracteur = lExtracteur(),
): Promise<Suite> {
  const version = await db.documentVersion.findUnique({
    where: { id: tache.versionId },
    include: {
      document: { include: { application: { include: { visaRule: true } } } },
      analyses: { take: 1, select: { id: true } },
    },
  });
  if (!version || !version.objectKey) return "TERMINEE";
  // I.D — aucun fichier non balayé n'est transmis à l'extraction. Le job
  // n'est mis en file qu'après promotion ; la condition est là pour le jour
  // où un autre appelant l'oubliera.
  if (!transmissibleALAnalyse(version.scanState)) return "TERMINEE";

  /*
    Une version s'analyse une fois — INV-6, revue du 07/10/2026, E5.

    La file rejoue un job dont l'acquittement s'est perdu : worker arrêté
    après l'écriture du verdict, base indisponible le temps de recalculer
    la complétude. Sans cette garde, le rejeu débitait une seconde
    analyse, rappelait le modèle, écrivait un second verdict et envoyait
    une seconde notification — le candidat payait deux fois sans que
    personne ne le voie. Avant le débit et avant toute lecture : un rejeu
    ne coûte rien. Deux exécutions simultanées passent toutes deux ici ;
    c'est l'unicité en base (`documentanalysis_une_par_version`) qui
    départage, dans `consignerUneFois`.
  */
  if (version.analyses.length > 0) return "TERMINEE";

  /*
    Une version remplacée ne se lit plus — RF-2, FON-02, choix A-2 du
    09/10/2026. Le candidat a déposé un autre fichier depuis la mise en
    file, ou son dossier est déposé ou clôturé : rien de ce que dirait
    cette lecture ne s'afficherait. Ni débit, ni appel au modèle, ni
    écriture — la nouvelle version a sa propre tâche.

    Exécuté avant correction : une v1 restée en file derrière une v2 déjà
    conforme était envoyée au service, payée, et son verdict « à
    corriger » remplaçait celui de la v2.
  */
  if (!(await commandeLaPiece(version.documentId, version.rank))) {
    // Une exécution arrêtée avant ce remplacement avait peut-être débité :
    // sa réservation est rendue (RF-3, E5).
    await rendreLaReservation(tache.applicationId, version.id, MOTIF_OBSOLETE);
    return "TERMINEE";
  }

  const document = version.document;
  const application = document.application;
  const regle = application.visaRule;
  const regles = regle ? payload(regle) : null;
  const conditions = regles ? conditionsDeLaPiece(regles.conditions, document.code) : [];

  const demande: DemandeDeLecture = {
    codeAttendu: document.code,
    intituleAttendu: document.label,
    /*
      Toute la checklist, et pas seulement la pièce attendue : c'est ce
      qui permet au modèle de nommer la ligne où reclasser un fichier
      déposé au mauvais endroit, plutôt que de rendre « on dirait autre
      chose » (DOC-11, WF-06, cas limites).
    */
    codesDeLaChecklist: regles?.pieces_requises.map((p) => p.code) ?? [document.code],
    champs: champsDemandes(conditions),
  };

  /*
    RG-02.1 — l'autorisation d'analyse est révocable.

    Le balayage l'a déjà lue, et elle se relit ici : entre la promotion et
    la reprise d'un job par la file, il peut s'écouler des minutes, et
    c'est précisément dans cet intervalle qu'un candidat qui se ravise
    clique. Sans cette seconde lecture, le retrait n'arrêtait rien — le
    fichier était relu, envoyé au modèle, une analyse débitée et un
    verdict écrit, après que l'accord eut été retiré.

    Avant le débit et avant la lecture du fichier : ni jeton dépensé, ni
    octet transmis.
  */
  if (!(await autorisationAccordee(application.userId, "pieces_identite"))) {
    await ecrireSurLaPieceCourante(db, document.id, version.rank, {
      status: "ATTENDUE",
      remedy: "REMPLACER",
      feedback: MENTION_NON_ANALYSEE.autorisation_retiree,
      finding: null,
    });
    await rendreLaReservation(
      tache.applicationId,
      version.id,
      "Lecture arrêtée : l'autorisation d'analyse a été retirée",
    );
    await recalculerCompletude(tache.applicationId);
    return "TERMINEE";
  }

  /*
    La reprise après un verdict illisible ne se paie pas — WF-06, cas
    limites.

    La règle était écrite en trois endroits et appliquée nulle part :
    `consommeUneAnalyse` dans le domaine, sans appelant ; le pied de C-08,
    qui affiche « Cette reprise ne consomme pas d'analyse » ; et le schéma
    lui-même, sur `creditConsumed` — « une reprise après ILLISIBLE ne
    débite rien ». Le débit, lui, était inconditionnel. Constaté en
    exécution sur une vraie base :

        verdict : ILLISIBLE · solde : 5
        l'écran affiche : « Cette reprise ne consomme pas d'analyse »
        après la reprise : verdict CONFORME · solde 4
        la reprise a coûté : 1 analyse(s)

    Le candidat achète ses analyses. On lui promettait la gratuité d'un
    geste qu'on lui facturait — et le geste en question lui est imposé par
    une lecture que *nous* n'avons pas su faire.

    Le verdict précédent se lit sur la version d'avant, et non sur
    `document.status` : le dépôt d'une nouvelle version remet la pièce en
    analyse, si bien que l'état de la pièce a déjà oublié pourquoi le
    candidat revient.
  */
  const consomme = await lectureAPayer(document.id, version.rank);

  // INV-6 — le débit précède l'appel. Débiter après laisserait une analyse
  // gratuite à chaque interruption, et l'invariant dit « jamais de
  // dépassement silencieux », pas « le plus souvent ».
  // L'octroi entamé est gardé : un rendu y retourne (S.92).
  /*
    Le quota a pu s'épuiser entre la promotion et ce débit : une autre
    pièce ou la rédaction assistée a pris la dernière analyse. Le débit
    lève `quota_epuise`, et le job échouait sept fois avant que la file
    l'abandonne, la pièce restant « en analyse ». Elle est conservée, comme
    à la promotion (revue du 07/10/2026, E6).
  */
  let debit: Awaited<ReturnType<typeof debiterUneAnalyse>> | null = null;
  if (consomme) {
    try {
      // La réservation nomme sa version : un rejeu après un arrêt la
      // reprend au lieu d'en poser une seconde (RF-3, E5).
      debit = await debiterUneAnalyse(tache.applicationId, undefined, { versionId: version.id });
    } catch (erreur) {
      if (!(erreur instanceof EchecHttp) || erreur.echec.code !== "quota_epuise") throw erreur;
      await conserverFauteDeQuota(version, tache);
      return "TERMINEE";
    }
  }
  const entame = debit?.octroi ?? null;

  const lu = await extraire(
    { objectKey: version.objectKey, mimeType: version.mimeType },
    demande,
  );

  await noterLesJetons(
    application.userId,
    tache.applicationId,
    `analyse:${document.code}`,
    lu.jetonsEntree,
    lu.jetonsSortie,
    lu.appel,
  );

  if (lu.etat === "NON_LUE") {
    const tentatives = version.analysisAttempts + 1;

    if (seReprendSeule(lu.cause) && tentatives < TENTATIVES_AVANT_REVUE) {
      /*
        Rien n'est écrit sur la pièce : elle reste en analyse, et c'est
        la vérité. Le quota débité est rendu tout de suite — une reprise
        ne se paie pas trois fois — et la file rejouera avec une attente
        croissante.
      */
      await db.documentVersion.update({
        where: { id: version.id },
        data: { analysisAttempts: tentatives, analysisLastAttemptAt: new Date() },
      });
      /*
        Le rendu suit le débit. Rendre ce qu'on n'a pas pris offrirait une
        analyse à chaque reprise gratuite, et le solde monterait à chaque
        photo floue — le défaut inverse de celui qu'on corrige, et plus
        difficile à voir parce qu'il arrange le candidat.
      */
      if (consomme) {
        await rendreUneTentative(
          tache.applicationId,
          `Lecture non aboutie (${lu.cause}), tentative ${tentatives} — reprise en attente`,
          entame,
          version.id,
        );
      }
      return "A_REPRENDRE";
    }

    // Aucune lecture : la pièce ne peut pas être déclarée conforme, et elle
    // ne peut pas être déclarée non conforme non plus. Elle part en revue
    // humaine, et l'analyse est rendue — elle n'a rien rendu.
    const consignee = await consignerUneFois(tache, consomme, entame, async (tx) => {
      const analyse = await tx.documentAnalysis.create({
        data: {
          versionId: version.id,
          verdict: "ILLISIBLE",
          title: "Cette pièce demande une relecture",
          body: MESSAGE_AU_CANDIDAT[lu.cause],
          engineLog: `${MOTIF_DE_NON_LECTURE[lu.cause]} — ${lu.detail}`,
          inputTokens: lu.jetonsEntree,
          outputTokens: lu.jetonsSortie,
          // Rien n'a été pris sur ce chemin : ni par le débit quand la
          // reprise est gratuite, ni après le rendu ci-dessous.
          creditConsumed: false,
        },
      });
      // RF-2 : la pièce n'est écrite, et la revue ouverte, que si cette
      // version est encore la sienne. Relire un fichier remplacé
      // n'avancerait rien.
      const courante = await ecrireSurLaPieceCourante(tx, document.id, version.rank, {
        status: "ILLISIBLE",
        feedback: analyse.body,
        analyzedAt: new Date(),
      });
      if (courante) {
        await tx.manualReview.create({
          data: { analysisId: analyse.id, reason: motifDeRevue(lu.cause) },
        });
      }
      await solderLesTentatives(version.id, version.analysisAttempts, tx);
      if (consomme) {
        await rendreUneAnalyse(
          tache.applicationId,
          analyse.id,
          "Lecture automatique sans résultat",
          entame,
          tx,
        );
      }
      /*
        Et le candidat l'apprend — comme pour les trois autres verdicts.

        Celui-ci n'en produisait aucun, alors qu'il ouvre la seule attente
        du produit qui dépend d'une personne : la pièce part en revue, et
        rien ne dit quand elle en reviendra. Le silence y coûtait donc plus
        qu'ailleurs, et c'est là qu'il était.

        Le corps est celui de l'analyse, pas un second texte : deux
        formulations du même fait finiraient par se contredire, et celle
        que le candidat lit dans sa checklist est celle-là.
      */
      if (courante) {
        await tx.notification.create({
          data: {
            userId: application.userId,
            applicationId: tache.applicationId,
            kind: "ANALYSE",
            title: analyse.title,
            body: analyse.body,
          },
        });
      }
    });
    if (!consignee) return "TERMINEE";
    await recalculerCompletude(tache.applicationId);
    return "TERMINEE";
  }

  await solderLesTentatives(version.id, version.analysisAttempts);

  /*
    Le modèle a reconnu une autre pièce de la checklist. Le dire ici
    plutôt que de le déduire de champs tous nuls : l'un nomme la ligne où
    reclasser le fichier, l'autre laisse chercher. Le repli sur les
    champs nuls reste dans `evaluerConditions` — il attrape le fichier
    qui ne ressemble à rien de la liste.

    Seul l'intitulé du référentiel s'affiche, jamais ce que le modèle a
    écrit : `lireLaReponse` refuse déjà un code hors checklist, et un
    code sans intitulé ne nomme aucune ligne où reclasser (revue E7).
  */
  const intituleReconnu =
    lu.pieceIdentifiee !== null && lu.pieceIdentifiee !== document.code
      ? regles?.pieces_requises.find((p) => p.code === lu.pieceIdentifiee)?.libelle
      : undefined;
  if (intituleReconnu !== undefined) {
    return acheverHorsSujet(tache, version.id, version.rank, document.id, application.userId, intituleReconnu, {
      consomme,
      ligne: debit?.ligne ?? null,
      entame,
    });
  }

  /*
    De ce qui est écrit à ce qui se compare. La date cible du dossier est
    le repère des durées ; sans elle, la condition passe en réserve
    plutôt que d'être jugée sur un repère choisi d'office.
  */
  const repere = application.targetDate
    ? application.targetDate.toISOString().slice(0, 10)
    : null;
  const mesures = mesurer(conditions, lu.bruts, repere);
  const verdict = evaluerConditions(conditions, mesures.champs, mesures.reserves);

  const consignee = await consignerUneFois(tache, consomme, entame, async (tx) => {
    /*
      RF-2 — la pièce d'abord, sous condition : le candidat a pu déposer un
      autre fichier, ou clore son dossier, pendant l'appel. Si cette
      version ne commande plus la pièce, son verdict reste à l'historique,
      sans avis, et la lecture est rendue (choix A-2) : le candidat ne
      paie pas un résultat qu'il ne reçoit pas. Les jetons, eux, sont
      déjà notés.
    */
    const courante = await ecrireSurLaPieceCourante(tx, document.id, version.rank, {
      status: verdict.verdict,
      feedback: verdict.corps,
      finding: verdict.constat,
      extracted: lu.bruts as never,
      analyzedAt: new Date(),
      // Le remède suit l'état réel : une pièce déjà déposée se **remplace**,
      // elle ne s'ajoute pas. « Ajouter » sur une ligne où un fichier existe
      // déjà fait croire qu'il manque, et fait chercher ce qu'on a déjà
      // envoyé. C'est le remède qui commande le libellé du bouton.
      //
      // Une pièce seulement **sous réserve** n'a rien à se reprocher : le
      // geste attendu porte sur le dossier, et proposer de remplacer le
      // fichier enverrait refaire ce qui est déjà bon.
      ...(verdict.verdict === "A_CORRIGER" &&
      verdict.echecs.length > 0 &&
      document.remedy === "TELEVERSER"
        ? { remedy: "REMPLACER" as const }
        : {}),
    });
    const analyse = await tx.documentAnalysis.create({
      data: {
        versionId: version.id,
        verdict: verdict.verdict,
        /*
          Ce que cette analyse a réellement coûté, et non ce que son verdict
          laisse deviner : le schéma le dit — « recalculer la règle à la
          lecture la ferait diverger du grand livre de crédits ». La colonne
          portait sa valeur par défaut sur ce chemin, c'est-à-dire `true`,
          y compris pour une reprise gratuite.
        */
        creditConsumed: consomme && courante,
        // Les **faits bruts**, et non les mesures : la date lue reste utile
        // le jour où la date cible est renseignée, et c'est elle qu'un
        // opérateur relit. Une durée calculée ne se relit pas sur la pièce.
        fields: lu.bruts as never,
        title: verdict.titre,
        body: verdict.corps,
        inputTokens: lu.jetonsEntree,
        outputTokens: lu.jetonsSortie,
      },
    });
    /*
      Le débit nomme l'analyse qu'il a payée (S.92) : une revue qui la rend
      plus tard retrouve ainsi l'octroi entamé, au lieu d'un rendu sans lien
      qu'il faudrait deviner.
    */
    if (debit) {
      await tx.analysisCredit.updateMany({
        where: { id: debit.ligne, analysisId: null },
        data: { analysisId: analyse.id },
      });
    }

    if (!courante) {
      if (consomme) {
        await rendreUneAnalyse(tache.applicationId, analyse.id, MOTIF_OBSOLETE, entame, tx);
      }
      return;
    }

    await tx.notification.create({
      data: {
        userId: application.userId,
        applicationId: tache.applicationId,
        kind: "ANALYSE",
        title: verdict.titre,
        body: verdict.corps,
      },
    });
  });
  if (!consignee) return "TERMINEE";

  await recalculerCompletude(tache.applicationId);
  return "TERMINEE";
}

/**
 * Remet le compteur à zéro dès qu'un verdict tombe.
 *
 * Le compteur mesure une attente **en cours**, pas un passé : le laisser
 * ferait basculer en revue humaine la prochaine pièce dont la première
 * tentative échoue. Conditionnée pour ne pas écrire quand il n'y a rien
 * à solder — la contrainte lie le compteur à sa date, et une remise à
 * zéro doit effacer les deux ensemble.
 */
async function solderLesTentatives(
  versionId: string,
  tentatives: number,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<void> {
  if (tentatives === 0) return;
  await client.documentVersion.update({
    where: { id: versionId },
    data: { analysisAttempts: 0, analysisLastAttemptAt: null },
  });
}

/**
 * Le fichier est lisible, mais ce n'est pas la pièce attendue.
 *
 * Le message nomme la ligne où le reclasser. « Ce n'est pas le bon
 * document » se constate sans aide ; savoir où le mettre est ce qui fait
 * avancer le dossier.
 */
async function acheverHorsSujet(
  tache: Tache,
  versionId: string,
  rangVersion: number,
  documentId: string,
  userId: string,
  intituleReconnu: string,
  /*
    Ce que la lecture a coûté. Le chemin écrivait `creditConsumed` à sa
    valeur par défaut, `true`, y compris sur une reprise gratuite, et ne
    reliait pas le débit à l'analyse : une revue qui la rendrait plus
    tard ne retrouvait pas l'octroi entamé (S.92).
  */
  cout: { consomme: boolean; ligne: string | null; entame: string | null },
): Promise<Suite> {
  const titre = "Ce document ne correspond pas à la pièce attendue";
  const corps = `Ce fichier ressemble à : ${intituleReconnu}. Reclasse-le dans cette ligne de la checklist, puis dépose ici la pièce attendue.`;

  const consignee = await consignerUneFois(tache, cout.consomme, cout.entame, async (tx) => {
    // RF-2 — même règle que le verdict : la pièce sous condition, la
    // lecture rendue si la version ne la commande plus (A-2).
    const courante = await ecrireSurLaPieceCourante(tx, documentId, rangVersion, {
      status: "HORS_SUJET",
      feedback: corps,
      analyzedAt: new Date(),
    });
    const analyse = await tx.documentAnalysis.create({
      data: {
        versionId,
        verdict: "HORS_SUJET",
        title: titre,
        body: corps,
        creditConsumed: cout.consomme && courante,
      },
    });
    if (cout.ligne) {
      await tx.analysisCredit.updateMany({
        where: { id: cout.ligne, analysisId: null },
        data: { analysisId: analyse.id },
      });
    }
    if (!courante) {
      if (cout.consomme) {
        await rendreUneAnalyse(tache.applicationId, analyse.id, MOTIF_OBSOLETE, cout.entame, tx);
      }
      return;
    }
    await tx.notification.create({
      data: {
        userId,
        applicationId: tache.applicationId,
        kind: "ANALYSE",
        title: titre,
        body: corps,
      },
    });
  });
  if (!consignee) return "TERMINEE";
  await recalculerCompletude(tache.applicationId);
  return "TERMINEE";
}

/**
 * Écrit le verdict d'une version, une fois — INV-6, revue du 07/10/2026, E5.
 *
 * Le verdict, le lien du débit, l'état de la pièce et la notification
 * tombent ensemble ou pas du tout. Écrits l'un après l'autre, un arrêt
 * entre deux laissait une analyse sans notification, ou une pièce
 * toujours « en analyse » avec un verdict que la garde du rejeu voyait :
 * plus rien ne la faisait avancer.
 *
 * Deux exécutions simultanées de la même version passent toutes deux la
 * garde de tête. La seconde bute sur l'unicité de la version en base
 * (`documentanalysis_une_par_version`) : rien de ce qu'elle écrivait ne
 * reste, et l'analyse qu'elle avait débitée est rendue — le candidat a
 * payé une lecture, pas deux. Rend `false` dans ce cas.
 */
async function consignerUneFois(
  tache: Tache,
  consomme: boolean,
  entame: string | null,
  ecrire: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<boolean> {
  try {
    await db.$transaction(ecrire);
    return true;
  } catch (erreur) {
    if ((erreur as { code?: unknown } | null)?.code !== "P2002") throw erreur;
    /*
      RF-3, E5 : deux exécutions d'une même version partagent désormais sa
      réservation — la seconde reprend celle de la première. La gagnante
      l'a liée à son analyse, ou l'a rendue : il ne reste rien à rendre, et
      rendre ici offrirait une analyse. Seule une réservation encore
      ouverte l'est.
    */
    if (consomme) {
      await rendreLaReservation(
        tache.applicationId,
        tache.versionId,
        "Lecture en double : la pièce était déjà analysée par une autre tâche",
      );
    }
    return false;
  }
}
