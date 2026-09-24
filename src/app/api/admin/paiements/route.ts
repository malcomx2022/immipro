import { z } from "zod";
import { route } from "@/server/http/route";
import { etatOperateur, paiements } from "@/server/lecture/backoffice";

/**
 * Paiements — B-04, WF-15.
 *
 * L'état de rapprochement est distinct de l'état du paiement : un silence de
 * l'opérateur laisse une transaction confirmée non rapprochée, sans la faire
 * basculer en échec. Aucun paiement n'est accusé sur l'absence de réponse
 * d'un tiers.
 */
export const GET = route({
  nom: "admin.paiements",
  acces: "admin",
  limite: "lecture",
  /*
    Le jour est un paramètre, et il borne la lecture — 24/09/2026. Elle
    rendait les cent dernières transactions, toutes dates confondues, sous
    un écran qui annonce une journée. Absent, c'est aujourd'hui : c'est ce
    que la page demande.
  */
  requete: z.object({
    jour: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date attendue au format AAAA-MM-JJ")
      .optional(),
  }),
  async traiter({ requete }) {
    const jour = requete.jour ?? new Date().toISOString().slice(0, 10);
    return { paiements: await paiements(jour), operateur: await etatOperateur() };
  },
});
