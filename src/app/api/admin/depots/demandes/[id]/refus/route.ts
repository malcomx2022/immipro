import { z } from "zod";
import { route } from "@/server/http/route";
import { refuserLaCorrectionDuDepot } from "@/server/dossiers/parcours";

/**
 * Une demande de correction de la date de dépôt non retenue — B-03, S.90.
 *
 * La réponse est lue par le candidat : elle part dans ses alertes et au
 * journal d'audit comme motif. Pour **retenir** une demande, l'opérateur
 * applique la correction elle-même (`/api/admin/dossiers/[id]/depot`),
 * qui tranche la demande en même temps.
 */
export const POST = route({
  nom: "admin.depot.correction.refus",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    reponse: z
      .string()
      .trim()
      .min(20, "Explique au candidat pourquoi la date reste inchangée, et ce qu'il peut fournir.")
      .max(1000),
  }),
  async traiter({ params, corps, acteur }) {
    const demande = await refuserLaCorrectionDuDepot(params.id!, {
      reponse: corps.reponse,
      acteurId: acteur!.id,
    });
    return { statut: demande.status };
  },
});
