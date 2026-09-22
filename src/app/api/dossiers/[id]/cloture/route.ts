import { z } from "zod";
import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { mentionCloture } from "@/domain/dossiers/cloture";
import { cloturerLeDossier, ISSUE_STOCKEE } from "@/server/dossiers/parcours";

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
    const { dossier: maj, purgeLe, purgeDansJours } = await cloturerLeDossier(
      dossier,
      ISSUE_STOCKEE[corps.issue],
      corps.detail ?? null,
    );

    return {
      statut: maj.status,
      purgeLe: purgeLe.toISOString().slice(0, 10),
      purgeDansJours,
      mention: mentionCloture(corps.issue),
    };
  },
});
