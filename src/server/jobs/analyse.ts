import type { ReviewReason } from "@prisma/client";
import { db } from "@/lib/db";
import { noterLesJetons } from "@/server/ia/appel";
import { payload } from "@/server/acces/regles";
import {
  debiterUneAnalyse,
  rendreUneAnalyse,
  rendreUneTentative,
} from "@/server/acces/quota";
import { recalculerCompletude } from "@/server/acces/dossiers";
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
    include: { document: { include: { application: { include: { visaRule: true } } } } },
  });
  if (!version || !version.objectKey) return "TERMINEE";
  // I.D — aucun fichier non balayé n'est transmis à l'extraction. Le job
  // n'est mis en file qu'après promotion ; la condition est là pour le jour
  // où un autre appelant l'oubliera.
  if (!transmissibleALAnalyse(version.scanState)) return "TERMINEE";

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
    await db.document.update({
      where: { id: document.id },
      data: {
        status: "ATTENDUE",
        remedy: "REMPLACER",
        feedback: MENTION_NON_ANALYSEE.autorisation_retiree,
        finding: null,
      },
    });
    await recalculerCompletude(tache.applicationId);
    return "TERMINEE";
  }

  // INV-6 — le débit précède l'appel. Débiter après laisserait une analyse
  // gratuite à chaque interruption, et l'invariant dit « jamais de
  // dépassement silencieux », pas « le plus souvent ».
  await debiterUneAnalyse(tache.applicationId);

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
      await rendreUneTentative(
        tache.applicationId,
        `Lecture non aboutie (${lu.cause}), tentative ${tentatives} — reprise en attente`,
      );
      return "A_REPRENDRE";
    }

    // Aucune lecture : la pièce ne peut pas être déclarée conforme, et elle
    // ne peut pas être déclarée non conforme non plus. Elle part en revue
    // humaine, et l'analyse est rendue — elle n'a rien rendu.
    const analyse = await db.documentAnalysis.create({
      data: {
        versionId: version.id,
        verdict: "ILLISIBLE",
        title: "Cette pièce demande une relecture",
        body: MESSAGE_AU_CANDIDAT[lu.cause],
        engineLog: `${MOTIF_DE_NON_LECTURE[lu.cause]} — ${lu.detail}`,
        inputTokens: lu.jetonsEntree,
        outputTokens: lu.jetonsSortie,
        creditConsumed: false,
      },
    });
    await db.manualReview.create({
      data: { analysisId: analyse.id, reason: motifDeRevue(lu.cause) },
    });
    await db.document.update({
      where: { id: document.id },
      data: { status: "ILLISIBLE", feedback: analyse.body, analyzedAt: new Date() },
    });
    await solderLesTentatives(version.id, version.analysisAttempts);
    await rendreUneAnalyse(tache.applicationId, analyse.id, "Lecture automatique sans résultat");
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
  */
  if (lu.pieceIdentifiee !== null && lu.pieceIdentifiee !== document.code) {
    const attendue =
      regles?.pieces_requises.find((p) => p.code === lu.pieceIdentifiee)?.libelle ??
      lu.pieceIdentifiee;
    return acheverHorsSujet(tache, version.id, document.id, application.userId, attendue);
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

  const analyse = await db.documentAnalysis.create({
    data: {
      versionId: version.id,
      verdict: verdict.verdict,
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

  await db.document.update({
    where: { id: document.id },
    data: {
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
    },
  });

  await db.notification.create({
    data: {
      userId: application.userId,
      applicationId: tache.applicationId,
      kind: "ANALYSE",
      title: verdict.titre,
      body: verdict.corps,
    },
  });

  await recalculerCompletude(tache.applicationId);
  void analyse;
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
async function solderLesTentatives(versionId: string, tentatives: number): Promise<void> {
  if (tentatives === 0) return;
  await db.documentVersion.update({
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
  documentId: string,
  userId: string,
  intituleReconnu: string,
): Promise<Suite> {
  const titre = "Ce document ne correspond pas à la pièce attendue";
  const corps = `Ce fichier ressemble à : ${intituleReconnu}. Reclasse-le dans cette ligne de la checklist, puis dépose ici la pièce attendue.`;

  await db.documentAnalysis.create({
    data: { versionId, verdict: "HORS_SUJET", title: titre, body: corps },
  });
  await db.document.update({
    where: { id: documentId },
    data: { status: "HORS_SUJET", feedback: corps, analyzedAt: new Date() },
  });
  await db.notification.create({
    data: {
      userId,
      applicationId: tache.applicationId,
      kind: "ANALYSE",
      title: titre,
      body: corps,
    },
  });
  await recalculerCompletude(tache.applicationId);
  return "TERMINEE";
}

