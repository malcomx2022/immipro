/** INV-6 / D1 : une consommation non observée n'est jamais un zéro. */
export type EtatDeMesure = "CONNUE" | "INCONNUE" | "PARTIELLE" | "INVALIDE";
export interface MesureDeJetons {
  etat: EtatDeMesure;
  jetonsEntree: number | null;
  jetonsSortie: number | null;
}

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
