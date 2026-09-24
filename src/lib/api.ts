import {
  ECHECS,
  type CodeEchec,
  type EchecCandidat,
  type EchecOperateur,
} from "@/server/http/echecs";

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
/**
 * L'échec tel qu'un écran le reçoit.
 *
 * `EchecCandidat` **plus** ce qu'une route du back-office ajoute, quand
 * elle l'ajoute. Le serveur sépare soigneusement les deux charges —
 * `pourCandidat` ne sérialise ni le code ni le diagnostic, `pourOperateur`
 * les conserve —, et le client les jetait : `appeler` typait toute réponse
 * d'échec en `EchecCandidat`, si bien que le `trace` qui nomme la fiche
 * illisible n'atteignait aucun écran.
 *
 * Les deux champs sont optionnels, et c'est exact : un candidat n'en reçoit
 * jamais. `BlocEchec` ne montre donc que ce qui est là.
 */
export type EchecRecu = EchecCandidat & Partial<Pick<EchecOperateur, "code" | "diagnostic">>;

export type Resultat<T> =
  | { ok: true; donnees: T }
  | { ok: false; echec: EchecRecu };

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

/**
 * Ce qu'un statut veut dire quand le corps n'est pas lisible — 24/09/2026.
 *
 * ── Le client annonçait une coupure de réseau pour tout ─────────────
 *
 * `reponse.ok ? ILLISIBLE : HORS_LIGNE` : toute réponse d'erreur sans corps
 * JSON devenait « hors ligne ». Exécuté :
 *
 *     405 de Next, corps vide (mauvaise méthode)  → « Tu es hors ligne »
 *     502 d'un relais, page HTML                  → « Tu es hors ligne »
 *     413 sans corps JSON                         → « Tu es hors ligne »
 *
 * Or `HORS_LIGNE` affirme trois choses : « La demande n'est pas partie.
 * Rien n'a été envoyé, rien n'a changé. » Les trois sont fausses quand le
 * serveur a répondu — et la dernière est la plus coûteuse : dire « rien
 * n'a été envoyé » après un délai dépassé sur un paiement est exactement
 * la phrase qui fait recommencer un règlement.
 *
 * **Une réponse arrivée n'est jamais une coupure.** Le statut décide donc
 * du message, et il le prend dans le contrat du serveur plutôt que d'en
 * réécrire un : `methode_refusee` était déclaré pour le 405 depuis le
 * début — titre, corps, action, ton — et **personne ne le levait**, parce
 * que c'est Next qui répond 405, sans corps.
 *
 * La table ne retient que les statuts dont le sens est sans ambiguïté.
 * Un 413 ou un 400 nu retombent sur `ILLISIBLE`, qui ne promet rien de
 * l'état du serveur — la seule chose honnête quand on ne sait pas.
 */
const SANS_CORPS_LISIBLE: Readonly<Record<number, CodeEchec>> = {
  405: "methode_refusee",
  429: "trop_de_requetes",
  500: "service_indisponible",
  502: "service_indisponible",
  503: "service_indisponible",
  504: "service_indisponible",
};

/** Le contrat du serveur, ramené à ce qu'un écran affiche. */
const duContrat = (code: CodeEchec): EchecCandidat => {
  const { titre, corps, conserve, action, ton } = ECHECS[code];
  return { titre, corps, ...(conserve ? { conserve } : {}), action, ton };
};

/**
 * Ce qu'on dit d'une réponse arrivée mais illisible. Jamais `HORS_LIGNE` :
 * elle est arrivée.
 */
export const echecSansCorps = (statut: number): EchecCandidat => {
  const code = SANS_CORPS_LISIBLE[statut];
  return code ? duContrat(code) : ILLISIBLE;
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
    // Le serveur a répondu : ce n'est pas une coupure, quel que soit le
    // statut. `HORS_LIGNE` affirmait « la demande n'est pas partie ».
    return { ok: false, echec: reponse.ok ? ILLISIBLE : echecSansCorps(reponse.status) };
  }

  if (!reponse.ok) {
    const echec = (charge as { echec?: EchecRecu }).echec;
    return { ok: false, echec: echec ?? ILLISIBLE };
  }
  return { ok: true, donnees: charge as T };
}
