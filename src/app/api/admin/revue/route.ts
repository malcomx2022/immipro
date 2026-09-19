import { route } from "@/server/http/route";
import { db } from "@/lib/db";

/**
 * File de revue manuelle — B-05, WF-06 (cas limites) et WF-15.
 *
 * Les pièces qui arrivent ici sont celles que la machine n'a pas su lire :
 * trois échecs d'analyse, un document non reconnu, ou un signalement du
 * candidat. L'ancienneté est rendue brute — l'écran calcule le retard sur
 * l'heure d'affichage, pour la même raison qu'une alerte d'échéance ne fige
 * pas son délai dans son titre.
 */
export const GET = route({
  nom: "admin.revue",
  acces: "admin",
  limite: "lecture",
  async traiter() {
    const file = await db.manualReview.findMany({
      where: { decidedAt: null },
      orderBy: { queuedAt: "asc" },
      include: {
        analysis: {
          include: {
            version: { include: { document: { select: { label: true, code: true, applicationId: true } } } },
          },
        },
      },
    });

    return {
      file: file.map((r) => ({
        id: r.id,
        motif: r.reason,
        enFileDepuis: r.queuedAt.toISOString(),
        piece: {
          code: r.analysis.version.document.code,
          libelle: r.analysis.version.document.label,
          dossierId: r.analysis.version.document.applicationId,
        },
        verdictMachine: r.analysis.verdict,
        // Trace technique : elle est pour l'opérateur, pas pour le candidat
        // (DOC-12 §16, règle 3 — l'exception assumée du message B-02).
        trace: r.analysis.engineLog,
      })),
    };
  },
});
