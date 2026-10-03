import { z } from "zod";
import { route } from "@/server/http/route";
import { repondreALaRelecture } from "@/server/dossiers/relecture-completude";

/**
 * Réponse à une demande de relecture de la complétude — B-05, avis L.A.
 * La réponse est lue par le candidat : elle part dans ses alertes et au
 * journal d'audit comme motif.
 */
export const POST = route({
  nom: "admin.completude.relecture",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    reponse: z
      .string()
      .trim()
      .min(20, "Dis au candidat ce que la relecture a établi, et ce qu'il peut faire ensuite.")
      .max(1000),
  }),
  async traiter({ params, corps, acteur }) {
    const demande = await repondreALaRelecture(params.id!, {
      reponse: corps.reponse,
      acteurId: acteur!.id,
    });
    return { statut: demande.status };
  },
});
