import { route } from "@/server/http/route";
import { fileDeRevue } from "@/server/lecture/backoffice";

/**
 * File de revue manuelle — B-05, WF-06 (cas limites) et WF-15.
 *
 * Les pièces qui arrivent ici sont celles que la machine n'a pas su lire :
 * échec d'analyse, document non reconnu, ou signalement du candidat.
 * L'ancienneté est rendue brute — l'écran calcule le retard sur l'heure
 * d'affichage, pour la même raison qu'une alerte d'échéance ne fige pas son
 * délai dans son titre.
 */
export const GET = route({
  nom: "admin.revue",
  acces: "admin",
  limite: "lecture",
  async traiter() {
    return { file: await fileDeRevue() };
  },
});
