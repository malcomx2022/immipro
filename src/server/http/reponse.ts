import { EchecHttp, pourCandidat, pourOperateur } from "./echecs";

/**
 * Mise en forme des réponses.
 *
 * Deux publics, deux sérialisations (DOC-12 §16, règle 3). Le public n'est
 * pas choisi route par route : il découle du niveau d'accès, décidé une fois
 * dans la définition de la route. Un écran candidat ne peut donc pas
 * recevoir un code technique par distraction — il faudrait déclarer la
 * route comme back-office, ce qui changerait aussi qui peut l'appeler.
 */
export type Public = "candidat" | "operateur";

/**
 * Cache. Par défaut rien n'est conservé : presque tout ce que renvoie cette
 * API est nominatif, et un intermédiaire qui garde une réponse de dossier
 * la sert au suivant. Les seules exceptions sont déclarées route par route
 * — la grille tarifaire, les fiches de destination — et restent publiques.
 */
export const SANS_CACHE = "no-store, no-cache, must-revalidate";

export interface OptionsReponse {
  statut?: number;
  /** Durée de mise en cache publique, en secondes. Réservé aux données non nominatives. */
  cachePublicSecondes?: number;
  entetes?: Record<string, string>;
}

export function json(donnees: unknown, options: OptionsReponse = {}): Response {
  const entetes: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": options.cachePublicSecondes
      ? `public, max-age=${options.cachePublicSecondes}, stale-while-revalidate=${options.cachePublicSecondes * 4}`
      : SANS_CACHE,
    ...options.entetes,
  };
  return new Response(JSON.stringify(donnees), { status: options.statut ?? 200, headers: entetes });
}

export function reponseEchec(e: EchecHttp, destinataire: Public): Response {
  const corps = destinataire === "operateur" ? pourOperateur(e) : pourCandidat(e);
  return json(
    { echec: corps },
    {
      statut: e.echec.statut,
      entetes:
        e.echec.code === "authentification_requise"
          ? { "www-authenticate": 'Cookie realm="immipro"' }
          : {},
    },
  );
}

/** 204 : la demande a abouti et il n'y a rien à lire. */
export const sansContenu = (): Response =>
  new Response(null, { status: 204, headers: { "cache-control": SANS_CACHE } });
