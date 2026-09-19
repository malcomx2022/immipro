import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { rendreUneAnalyse } from "@/server/acces/quota";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { refusDuMessage, recrediteLeQuota, type Decision } from "@/domain/backoffice/revue";

/**
 * Décision de revue — B-05.
 *
 * Le message au candidat passe par la même validation que tout le reste :
 * un constat nu — « non conforme » — est refusé, et une promesse aussi. RG-06.3
 * s'applique à un humain comme à la machine, et c'est même ici qu'il compte
 * le plus : le candidat lit ce message comme la parole d'une personne.
 *
 * Une analyse rendue recrédite le quota (INV-6) : la lecture automatique n'a
 * rien rendu, elle n'a donc rien à coûter. Le recrédit est idempotent, une
 * décision rejouée ne rend pas deux analyses.
 */
export const POST = route({
  nom: "admin.revue.decision",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    decision: z.enum(["CONFORME", "A_CORRIGER", "ILLISIBLE", "HORS_SUJET"]),
    message: z.string().trim().min(1),
    motif: z.string().trim().min(3).max(500),
  }),
  async traiter({ corps, params, acteur }) {
    const revue = await db.manualReview.findUnique({
      where: { id: params.id },
      include: {
        analysis: { include: { version: { include: { document: true } } } },
      },
    });
    if (!revue) throw echec("introuvable");
    if (revue.decidedAt) {
      throw echec("etat_incompatible", { corps: "Cette pièce a déjà été tranchée." });
    }

    const refus = refusDuMessage(corps.message, corps.decision as Decision);
    if (refus) {
      throw echec("champs_invalides", {
        corps: `${refus.raison} ${refus.consigne}`,
        champs: { message: refus.consigne },
      });
    }

    const document = revue.analysis.version.document;

    await journaliser({
      acteurId: acteur!.id,
      action: "revue.decision",
      cible: `document:${document.id}`,
      motif: corps.motif,
      details: { decision: corps.decision },
    });

    await db.$transaction([
      db.manualReview.update({
        where: { id: revue.id },
        data: {
          reviewerId: acteur!.id,
          decision: corps.decision,
          message: corps.message,
          creditRefunded: recrediteLeQuota(corps.decision as Decision),
          decidedAt: new Date(),
        },
      }),
      db.document.update({
        where: { id: document.id },
        data: { status: corps.decision, feedback: corps.message, analyzedAt: new Date() },
      }),
    ]);

    if (recrediteLeQuota(corps.decision as Decision)) {
      await rendreUneAnalyse(
        document.applicationId,
        revue.analysisId,
        "Analyse rendue après revue manuelle",
      );
    }

    await recalculerCompletude(document.applicationId);
    return { decidee: true, quotaRendu: recrediteLeQuota(corps.decision as Decision) };
  },
});
