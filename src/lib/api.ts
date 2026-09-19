import type { EchecCandidat } from "@/server/http/echecs";

/**
 * Appel de l'API depuis un écran.
 *
 * Le serveur rend déjà un échec complet — titre, corps, ce qui est conservé,
 * action, ton (DOC-12 §16). Ce module n'en fabrique qu'un seul : celui que le
 * serveur ne peut pas envoyer, parce qu'il n'a pas été joint. Le réseau
 * coupé est le cas le plus fréquent du public visé, et c'est précisément
 * celui qu'une implémentation pressée laisse en « Failed to fetch ».
 *
 * Son ton est `attente` et non `echec` : rien n'a échoué, tout est différé
 * (règle 7). Et il dit ce qui est conservé, comme les autres (règle 2).
 */
export type Resultat<T> =
  | { ok: true; donnees: T }
  | { ok: false; echec: EchecCandidat };

export const HORS_LIGNE: EchecCandidat = {
  titre: "Tu es hors ligne",
  corps: "La demande n'est pas partie. Rien n'a été envoyé, rien n'a changé.",
  conserve: "Ce que tu as saisi est toujours là, tu n'as rien à ressaisir.",
  action: "Réessayer",
  ton: "attente",
};

const ILLISIBLE: EchecCandidat = {
  titre: "La réponse n'a pas pu être lue",
  corps: "Le serveur a répondu quelque chose d'inattendu.",
  conserve: "Ce que tu as saisi est toujours là.",
  action: "Réessayer",
  ton: "echec",
};

export interface Options {
  methode?: "GET" | "POST" | "PUT" | "DELETE";
  corps?: unknown;
  signal?: AbortSignal;
}

export async function appeler<T>(url: string, options: Options = {}): Promise<Resultat<T>> {
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: options.methode ?? (options.corps ? "POST" : "GET"),
      headers: options.corps ? { "content-type": "application/json" } : undefined,
      body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
      // Les réponses de cette API sont nominatives : jamais de cache.
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, echec: HORS_LIGNE };
  }

  if (reponse.status === 204) return { ok: true, donnees: undefined as T };

  let charge: unknown;
  try {
    charge = await reponse.json();
  } catch {
    return { ok: false, echec: reponse.ok ? ILLISIBLE : HORS_LIGNE };
  }

  if (!reponse.ok) {
    const echec = (charge as { echec?: EchecCandidat }).echec;
    return { ok: false, echec: echec ?? ILLISIBLE };
  }
  return { ok: true, donnees: charge as T };
}
