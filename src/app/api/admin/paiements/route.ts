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
  async traiter() {
    return { paiements: await paiements(), operateur: await etatOperateur() };
  },
});
