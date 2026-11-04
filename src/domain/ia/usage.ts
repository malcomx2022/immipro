/** INV-6 / D1 : une consommation non observée n'est jamais un zéro. */
export type EtatDeMesure = "CONNUE" | "INCONNUE" | "PARTIELLE" | "INVALIDE";
export interface MesureDeJetons {
  etat: EtatDeMesure;
  jetonsEntree: number | null;
  /**
   * La sortie **facturée** : texte rendu et raisonnement compris, quand le
   * fournisseur rapporte le raisonnement (S.213). C'est elle que le coût,
   * les bornes du banc et B-07 lisent.
   */
  jetonsSortie: number | null;
  /**
   * La part de `jetonsSortie` passée en raisonnement — S.213. `null` : le
   * fournisseur ne l'a pas rapportée, ce qui n'est pas un zéro. Absente
   * des mesures qui ne la cherchent pas (Anthropic, historique).
   */
  jetonsRaisonnement?: number | null;
  /** D'où vient `jetonsRaisonnement` quand il est connu. */
  sourceDuRaisonnement?: SourceDuRaisonnement;
}

/**
 * Où le raisonnement a été lu — S.213.
 *
 * - `DETAIL_DE_SORTIE` : `completion_tokens_details.reasoning_tokens`,
 *   forme OpenAI, déjà **compris** dans `completion_tokens` ;
 * - `GEMINI_THOUGHTS` : `thoughtsTokenCount` (ou `thoughts_token_count`),
 *   forme Gemini, **hors** de `candidatesTokenCount` / `completion_tokens` ;
 * - `ECART_DU_TOTAL` : aucun champ, mais `total_tokens` dépasse entrée +
 *   sortie ; l'écart est ce que le fournisseur a compté sans le nommer.
 */
export type SourceDuRaisonnement = "DETAIL_DE_SORTIE" | "GEMINI_THOUGHTS" | "ECART_DU_TOTAL";

/** Limite de la colonne PostgreSQL INTEGER, contrôlée avant toute écriture. */
export const MAXIMUM_JETONS = 2_147_483_647;
export const compteurValide = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAXIMUM_JETONS;

export function mesurerLesJetons(entree: unknown, sortie: unknown): MesureDeJetons {
  const jetonsEntree = compteurValide(entree) ? entree : null;
  const jetonsSortie = compteurValide(sortie) ? sortie : null;
  const invalide = [entree, sortie].some((v) => v !== undefined && v !== null && !compteurValide(v));
  return {
    etat: invalide ? "INVALIDE" : jetonsEntree !== null && jetonsSortie !== null ? "CONNUE"
      : jetonsEntree !== null || jetonsSortie !== null ? "PARTIELLE" : "INCONNUE",
    jetonsEntree, jetonsSortie,
  };
}

/**
 * La mesure d'un bloc `usage` de la forme compatible OpenAI, raisonnement
 * compris — S.213, F-3 de la revue du 31/10.
 *
 * Le 28/10, Google a facturé 3 201 jetons de sortie pour 1 631 mesurés :
 * l'adaptateur ne lisait que `completion_tokens`. Le raisonnement se lit
 * désormais là où un fournisseur le range, et s'ajoute à la sortie quand il
 * n'y est pas déjà compté. La sortie rendue est donc toujours la sortie
 * facturée, et le coût suit sans autre changement.
 *
 * Décision du responsable (04/11) : un raisonnement non rapporté laisse la
 * mesure `CONNUE`, avec `jetonsRaisonnement` à `null`. Le point compatible
 * de Vertex ne rend aujourd'hui aucun compteur (S.204) : passer en
 * `PARTIELLE` enverrait chaque lecture en revue humaine. Un compteur
 * présent mais invalide, lui, rend la mesure `INVALIDE`, comme les autres.
 */
export function mesurerLUsageCompatible(usage: unknown): MesureDeJetons {
  const u = (usage !== null && typeof usage === "object" ? usage : {}) as Record<string, unknown>;
  const base = mesurerLesJetons(u.prompt_tokens, u.completion_tokens);
  if (base.etat !== "CONNUE") return { ...base, jetonsRaisonnement: null };
  const entree = base.jetonsEntree!;
  const sortie = base.jetonsSortie!;
  const invalide = (): MesureDeJetons => ({ etat: "INVALIDE", jetonsEntree: entree, jetonsSortie: null, jetonsRaisonnement: null });
  const present = (v: unknown) => v !== undefined && v !== null;

  const details = u.completion_tokens_details as Record<string, unknown> | null | undefined;
  const detail = details && typeof details === "object" ? details.reasoning_tokens : undefined;
  if (present(detail)) {
    if (!compteurValide(detail) || detail > sortie) return invalide();
    return { ...base, jetonsRaisonnement: detail, sourceDuRaisonnement: "DETAIL_DE_SORTIE" };
  }

  const pensees = present(u.thoughtsTokenCount) ? u.thoughtsTokenCount : u.thoughts_token_count;
  if (present(pensees)) {
    if (!compteurValide(pensees) || sortie + pensees > MAXIMUM_JETONS) return invalide();
    return { ...base, jetonsSortie: sortie + pensees, jetonsRaisonnement: pensees, sourceDuRaisonnement: "GEMINI_THOUGHTS" };
  }

  // Un total plus petit que la somme ne prouve rien de plus : il est ignoré.
  const total = u.total_tokens;
  if (compteurValide(total) && total > entree + sortie) {
    const ecart = total - entree - sortie;
    return { ...base, jetonsSortie: sortie + ecart, jetonsRaisonnement: ecart, sourceDuRaisonnement: "ECART_DU_TOTAL" };
  }
  return { ...base, jetonsRaisonnement: null };
}

/** La sortie rendue au candidat, sans le raisonnement ; `null` si l'un manque. */
export const sortieVisible = (m: Pick<MesureDeJetons, "jetonsSortie" | "jetonsRaisonnement">): number | null =>
  m.jetonsSortie === null || m.jetonsRaisonnement == null ? m.jetonsSortie ?? null : m.jetonsSortie - m.jetonsRaisonnement;

export const DETAIL_MESURE_INCOMPLETE =
  "les compteurs de consommation sont absents, incomplets ou invalides : rapprocher cet appel du relevé fournisseur dans B-07 ; aucune relance automatique pour cette cause";

/** Les anciens nombres restent lisibles, sans leur attribuer une preuve absente. */
export function usageARapprocher(etat: string | null | undefined, entree: number | null, sortie: number | null): boolean {
  return etat === "CONNUE" ? !compteurValide(entree) || !compteurValide(sortie)
    : etat != null || !compteurValide(entree) || !compteurValide(sortie) || (entree === 0 && sortie === 0);
}

/**
 * Les compteurs d'un bloc `usage`, et rien d'autre — S.204.
 *
 * Le diagnostic du banc relève la forme exacte de l'usage que rend un
 * fournisseur, pour savoir où il range les jetons de réflexion. On n'en
 * garde que les nombres, rangés sous leurs clés : jamais un texte, qui
 * pourrait porter un extrait de la pièce ou de la réponse.
 */
export type UsageNumerique = { [cle: string]: number | UsageNumerique };

export function usageNumerique(usage: unknown, profondeur = 0): UsageNumerique | null {
  if (usage === null || typeof usage !== "object" || Array.isArray(usage) || profondeur > 3) return null;
  const garde: UsageNumerique = {};
  for (const [cle, valeur] of Object.entries(usage as Record<string, unknown>)) {
    if (typeof valeur === "number" && Number.isFinite(valeur)) garde[cle] = valeur;
    else {
      const imbrique = usageNumerique(valeur, profondeur + 1);
      if (imbrique && Object.keys(imbrique).length > 0) garde[cle] = imbrique;
    }
  }
  return garde;
}
