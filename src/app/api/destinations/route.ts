import { route } from "@/server/http/route";
import { fichesPubliees } from "@/server/lecture/destinations";

/**
 * Fiches destination publiées — P-03.
 *
 * L'assemblée est dans `lecture/destinations`, partagée avec les pages
 * serveur : deux chemins vers la même donnée divergent, et c'est l'écran qui
 * finit par mentir. INV-4 et RG-14.1 y tiennent dans la requête.
 *
 * La réponse est mise en cache : elle ne dépend d'aucun compte, et une
 * minute de fraîcheur sur des fiches relues tous les quatre-vingt-dix jours
 * est sans effet. La durée reste courte pour qu'une dépublication en
 * urgence — une règle dont la relecture vient d'échoir — disparaisse vite.
 */
export const GET = route({
  nom: "destinations",
  acces: "public",
  limite: "lecture",
  cachePublicSecondes: 60,
  async traiter() {
    const { fiches, mention } = await fichesPubliees();
    return { destinations: fiches, mention };
  },
});
