import { route } from "@/server/http/route";
import { alertesDuCandidat } from "@/server/lecture/alertes";

/**
 * Alertes — T-01, WF-11.
 *
 * RG-11.2 : les alertes sont ciblées par dossier, jamais diffusées à toute
 * la base. La requête le tient : elle filtre par compte, et chaque ligne
 * porte le dossier qu'elle concerne.
 *
 * Les dates sortent en brut : le délai se recalcule à l'affichage. Écrit
 * ici, « dans 7 jours » resterait affiché le jour même, puis une semaine
 * après.
 */
export const GET = route({
  nom: "notifications",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    const alertes = await alertesDuCandidat(acteur!.id);
    return { alertes, nonLues: alertes.filter((a) => !a.lue).length };
  },
});
