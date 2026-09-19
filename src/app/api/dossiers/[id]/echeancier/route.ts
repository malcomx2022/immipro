import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { dossierDuCandidat } from "@/server/acces/dossiers";

/**
 * Échéancier — C-10, WF-09.
 *
 * Les dates viennent de la table, où elles ont été calculées à l'ouverture
 * depuis les délais du référentiel (RG-09.1). Aucune n'est recalculée ici :
 * un échéancier qui bouge à chaque affichage ne se planifie pas.
 */
export const GET = route({
  nom: "dossier.echeancier",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const echeances = await db.deadline.findMany({
      where: { applicationId: dossier.id },
      orderBy: { dueAt: "asc" },
    });
    return {
      depotVise: dossier.targetDate?.toISOString().slice(0, 10) ?? null,
      echeances: echeances.map((e) => ({
        code: e.code,
        libelle: e.label,
        echeanceLe: e.dueAt.toISOString().slice(0, 10),
        faiteLe: e.doneAt?.toISOString().slice(0, 10) ?? null,
      })),
    };
  },
});
