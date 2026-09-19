import { route } from "@/server/http/route";
import { reglesPubliees, versFiche } from "@/server/acces/regles";

/**
 * Fiches destination publiées — P-03.
 *
 * INV-4 tient dans `reglesPubliees`, qui ne sait construire qu'un filtre.
 * La route ne peut donc pas demander « toutes les règles » : la fonction
 * n'existe pas de ce côté du serveur.
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
    const regles = await reglesPubliees();
    return { destinations: regles.map(versFiche).filter((f) => f !== null) };
  },
});
