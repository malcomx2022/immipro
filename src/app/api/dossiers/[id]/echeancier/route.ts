import { route } from "@/server/http/route";
import { echeancierDuDossier } from "@/server/lecture/dossiers";

/**
 * Échéancier — C-10, WF-09.
 *
 * Les dates limites viennent de la table, où elles ont été calculées à
 * l'ouverture depuis les délais du référentiel (RG-09.1). Les « au plus tôt »
 * des pièces périssables sont recalculés à l'affichage depuis le dépôt visé :
 * demander un relevé de trois mois six mois à l'avance le fait redemander.
 */
export const GET = route({
  nom: "dossier.echeancier",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    return echeancierDuDossier(params.id!, acteur!.id);
  },
});
