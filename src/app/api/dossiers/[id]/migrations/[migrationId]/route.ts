import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierDuCandidat, checklistDepuis, recalculerCompletude } from "@/server/acces/dossiers";
import { payload } from "@/server/acces/regles";

/**
 * Arbitrage d'une divergence réglementaire — T-02, WF-11 étape 4.
 *
 * « Le candidat décide de migrer ou non. » INV-3 tient ici : la publication
 * d'une version n'a rien changé à son dossier, et c'est ce choix qui change
 * quelque chose. Une migration d'office aurait rendu ce modèle inutile.
 *
 * RG-11.1 : la migration recalcule la checklist **sans jamais supprimer une
 * pièce déjà validée**. Les pièces conformes sont conservées telles quelles,
 * les nouvelles exigences sont ajoutées à l'état attendu, et une exigence
 * disparue laisse sa pièce en place plutôt que d'effacer un travail fait.
 */
export const POST = route({
  nom: "dossier.migration",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({ decision: z.enum(["MIGRER", "CONSERVER"]) }),
  async traiter({ corps, params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const migration = await db.ruleMigration.findFirst({
      where: { id: params.migrationId, applicationId: dossier.id },
      include: { toRule: true },
    });
    if (!migration) throw echec("introuvable");
    if (migration.decision) throw echec("etat_incompatible", {
      corps: "Cette divergence a déjà été arbitrée.",
    });

    if (corps.decision === "CONSERVER") {
      await db.ruleMigration.update({
        where: { id: migration.id },
        data: { decision: "CONSERVER", decidedAt: new Date() },
      });
      return {
        decision: "CONSERVER",
        mention:
          "Ton dossier reste régi par la version que tu as figée à son ouverture. Rien ne change dans ta checklist.",
      };
    }

    const nouvelles = checklistDepuis(payload(migration.toRule));
    const existantes = await db.document.findMany({
      where: { applicationId: dossier.id },
      select: { code: true },
    });
    const connus = new Set(existantes.map((d) => d.code));

    await db.$transaction([
      // RG-11.1 — on ajoute, on ne retire pas.
      db.document.createMany({
        data: nouvelles
          .filter((p) => !connus.has(p.code))
          .map((p) => ({ ...p, applicationId: dossier.id })),
      }),
      db.application.update({
        where: { id: dossier.id },
        data: { visaRuleId: migration.toRuleId, status: "ACTIF" },
      }),
      db.ruleMigration.update({
        where: { id: migration.id },
        data: { decision: "MIGRER", decidedAt: new Date() },
      }),
    ]);

    await recalculerCompletude(dossier.id);

    return {
      decision: "MIGRER",
      piecesAjoutees: nouvelles.filter((p) => !connus.has(p.code)).map((p) => p.label),
      mention: "Aucune pièce déjà validée n'a été retirée.",
    };
  },
});
