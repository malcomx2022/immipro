import { z } from "zod";
import { route } from "@/server/http/route";
import { signalerUneErreurDeLecture } from "@/server/dossiers/signalement";
import { CHAMPS_SIGNALABLES_MAX } from "@/domain/dossiers/signalement";

/**
 * Signaler une erreur de lecture — C-08, WF-06, S.157 (R-03).
 *
 * Le candidat désigne les valeurs fausses parmi celles que l'écran lui a
 * montrées ; la lecture part en relecture humaine (B-05). Rejouée, la
 * demande ne crée rien de plus et répond la même chose.
 */
const demande = z.object({
  champs: z.array(z.string().min(1).max(120)).max(CHAMPS_SIGNALABLES_MAX),
});

export const POST = route({
  nom: "piece.signalement",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: demande,
  async traiter({ corps, params, acteur }) {
    return signalerUneErreurDeLecture({
      applicationId: params.id!,
      pieceId: params.pieceId!,
      userId: acteur!.id,
      champs: corps.champs,
    });
  },
});
