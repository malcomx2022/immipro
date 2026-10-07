import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { rendreUneAnalyse } from "@/server/acces/quota";
import { recalculerCompletude } from "@/server/acces/dossiers";
import {
  TITRE_DE_LA_DECISION,
  recrediteLeQuota,
  refusDuMessage,
  type Decision,
} from "@/domain/backoffice/revue";

/**
 * La décision d'une revue manuelle — B-05, WF-15.
 *
 * ── Le message n'était envoyé à personne ────────────────────────────
 *
 * `CLAUDE.md` énumère quatre points d'application du vocabulaire
 * interdit, dont « B-05 pour le message **envoyé** après une revue
 * manuelle ». L'en-tête de `refusDuMessage` dit « validation du message
 * envoyé au candidat ». Celui de la route disait « le candidat **lit ce
 * message** comme la parole d'une personne ».
 *
 * Il était écrit, refusé s'il le fallait, rangé dans
 * `ManualReview.message`, recopié dans `Document.feedback` — et aucun
 * avis n'en partait. Les trois verdicts que la machine rend en
 * produisent un chacun : `jobs/analyse.ts` pour un verdict de conditions
 * et pour une pièce hors sujet, `jobs/balayage.ts` pour une pièce
 * refusée au contrôle. Le seul qu'une personne rédige, à l'adresse d'une
 * autre personne, n'en produisait aucun.
 *
 * C'est le chemin le plus lent du produit — il attend qu'un opérateur
 * ouvre la pièce —, donc celui où le silence coûte le plus : le candidat
 * n'apprend pas que l'attente est finie.
 *
 * ── Pourquoi la décision vit ici ────────────────────────────────────
 *
 * La même raison que `server/regles/publication.ts`,
 * `server/editorial/publication.ts` et `server/regles/edition.ts` : dans
 * sa route, elle était derrière `next/headers`, donc hors de portée de
 * toute fumée. Le silence de cet enchaînement ne se voyait qu'en
 * comptant les lignes de `Notification` après coup, ce qu'aucun essai ne
 * pouvait faire tant que rien ne s'exécutait.
 */

export interface Operateur {
  id: string;
}

export interface Tranche {
  decision: Decision;
  /** Le texte que le candidat lira, tel quel. */
  message: string;
  /** Ce qui part au journal d'audit. */
  motif: string;
}

export interface Suite {
  decidee: true;
  quotaRendu: boolean;
}

export async function trancherLaRevue(
  revueId: string,
  operateur: Operateur,
  tranche: Tranche,
): Promise<Suite> {
  const revue = await db.manualReview.findUnique({
    where: { id: revueId },
    include: {
      analysis: {
        include: {
          version: {
            include: {
              // L'avis a un destinataire : il se lit sur le dossier de la
              // pièce, et non sur l'opérateur qui tranche.
              document: { include: { application: { select: { userId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!revue) throw echec("introuvable");
  if (revue.decidedAt) {
    throw echec("etat_incompatible", { corps: "Cette pièce a déjà été tranchée." });
  }

  const refus = refusDuMessage(tranche.message, tranche.decision);
  if (refus) {
    throw echec("champs_invalides", {
      corps: `${refus.raison} ${refus.consigne}`,
      champs: { message: refus.consigne },
    });
  }

  const document = revue.analysis.version.document;
  const rendu = recrediteLeQuota(tranche.decision);

  /*
    Une revue se tranche une fois — revue du 07/10/2026, F4.

    La garde `decidedAt` ci-dessus lit l'état avant d'écrire. Deux
    opérateurs qui tranchent la même pièce dans la même seconde la
    passaient tous deux : deux décisions, deux avis au candidat, et deux
    analyses rendues. L'écriture est donc conditionnée à `decidedAt` nul,
    et c'est elle qui départage ; le perdant ne laisse rien.

    La décision, l'état de la pièce et l'avis tombent ensemble. L'avis
    part avec la décision et jamais sans elle : annoncer ce que la
    transaction n'aurait pas retenu enverrait le candidat lire un état
    qui n'existe pas. Le corps est le message de l'opérateur tel quel —
    c'est lui que le candidat doit lire, et le résumer le trahirait.
  */
  await db.$transaction(async (tx) => {
    const { count } = await tx.manualReview.updateMany({
      where: { id: revue.id, decidedAt: null },
      data: {
        reviewerId: operateur.id,
        decision: tranche.decision,
        message: tranche.message,
        creditRefunded: rendu,
        decidedAt: new Date(),
      },
    });
    if (count === 0) {
      throw echec("etat_incompatible", {
        corps:
          "Cette pièce vient d'être tranchée par un autre membre de l'équipe. Recharge la file pour voir sa décision.",
      });
    }
    await tx.document.update({
      where: { id: document.id },
      data: {
        status: tranche.decision,
        feedback: tranche.message,
        analyzedAt: new Date(),
      },
    });
    await tx.notification.create({
      data: {
        userId: document.application.userId,
        applicationId: document.applicationId,
        kind: "ANALYSE",
        title: TITRE_DE_LA_DECISION[tranche.decision],
        body: tranche.message,
      },
    });
  });

  // Au journal, la décision retenue, et elle seule.
  await journaliser({
    acteurId: operateur.id,
    action: "revue.decision",
    cible: `document:${document.id}`,
    motif: tranche.motif,
    details: { decision: tranche.decision },
  });

  if (rendu) {
    await rendreUneAnalyse(
      document.applicationId,
      revue.analysisId,
      "Analyse rendue après revue manuelle",
    );
  }

  await recalculerCompletude(document.applicationId);
  return { decidee: true, quotaRendu: rendu };
}
