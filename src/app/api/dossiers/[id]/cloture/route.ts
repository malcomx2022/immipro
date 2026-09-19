import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { dossierDuCandidat, dateDePurge } from "@/server/acces/dossiers";
import { PURGE_JOURS, mentionCloture, type IssueDemarche } from "@/domain/dossiers/cloture";

/**
 * Clôture et issue déclarée — C-11, WF-10.
 *
 * La date de purge est écrite maintenant et rendue à l'écran : elle est
 * annoncée à l'avance et présentée comme une garantie, pas subie comme une
 * perte (RG-10.2). La purge elle-même est faite par un job, indépendamment
 * de toute action du candidat (RG-10.1).
 *
 * Le motif déclaré alimente la correction des checklists, jamais un modèle
 * prédictif (RG-10.3) : il est stocké en texte, rattaché au dossier, et rien
 * ne l'agrège par taux.
 */
const ISSUES: Record<IssueDemarche, "ACCEPTE" | "REFUSE" | "RENONCE" | "SANS_REPONSE"> = {
  OBTENU: "ACCEPTE",
  REFUS: "REFUSE",
  ABANDON: "RENONCE",
  AUTRE: "SANS_REPONSE",
};

export const POST = route({
  nom: "dossier.cloture",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    issue: z.enum(["OBTENU", "REFUS", "ABANDON", "AUTRE"]),
    detail: z.string().trim().max(2000).optional(),
  }),
  async traiter({ corps, params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const maintenant = new Date();
    const purgeLe = dateDePurge(maintenant);

    const maj = await db.application.update({
      where: { id: dossier.id },
      data: {
        status: "ISSUE_DECLAREE",
        issue: ISSUES[corps.issue],
        issueReason: corps.detail ?? null,
        purgeDueAt: purgeLe,
      },
    });

    return {
      statut: maj.status,
      purgeLe: purgeLe.toISOString().slice(0, 10),
      purgeDansJours: PURGE_JOURS,
      mention: mentionCloture(corps.issue),
    };
  },
});
