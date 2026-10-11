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
