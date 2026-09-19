import { z } from "zod";
import { route } from "@/server/http/route";
import { journal } from "@/server/lecture/backoffice";

/**
 * Journal d'audit — B-06, RG-15.1.
 *
 * Il se lit, il ne s'écrit pas depuis ici, et il ne s'efface pas : un
 * journal qu'un administrateur peut modifier ne prouve rien. Le motif est
 * rendu tel quel, entier — c'est lui qu'on relit six mois plus tard.
 */
export const GET = route({
  nom: "admin.journal",
  acces: "admin",
  limite: "lecture",
  requete: z.object({
    categorie: z.enum(["PAIEMENT", "REGLE", "ACCES_PIECE", "COMPTE"]).optional(),
  }),
  async traiter({ requete }) {
    return { journal: await journal(requete.categorie) };
  },
});
