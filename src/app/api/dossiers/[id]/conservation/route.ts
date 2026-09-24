import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { confirmerLInstruction } from "@/server/dossiers/parcours";
import { PROLONGATION_MOIS } from "@/domain/dossiers/conservation";

/**
 * « L'instruction continue » — arbitrage S.78.
 *
 * Le candidat d'un dossier soumis confirme que sa demande est toujours à
 * l'instruction : la conservation de ses pièces est prolongée de six mois,
 * et une purge annoncée est annulée. La décision vit dans
 * `server/dossiers/parcours.ts`, que la fumée appelle.
 */
export const POST = route({
  nom: "dossier.conservation",
  acces: "candidat_verifie",
  limite: "sensible",
  async traiter({ params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const { jusquAu } = await confirmerLInstruction(dossier);
    return {
      piecesConserveesJusquAu: jusquAu.toISOString(),
      mention: `Tes pièces sont conservées ${PROLONGATION_MOIS} mois de plus. Tu pourras confirmer à nouveau avant cette date si l'instruction se poursuit.`,
    };
  },
});
