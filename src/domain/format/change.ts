/**
 * Conversion de devises — le strict nécessaire, et rien de plus.
 *
 * Le produit évite les conversions : la grille tarifaire est native dans
 * chaque devise, précisément pour ne dépendre d'aucun taux. Le simulateur
 * n'a pas ce luxe — il compare un budget déclaré en francs CFA à un coût
 * publié par une autorité étrangère dans sa propre monnaie.
 *
 * **Le franc CFA est le seul cas sûr.** Sa parité avec l'euro est fixe
 * (1 EUR = 655,957 XOF) et ne se périme pas : ce n'est pas un cours, c'est
 * un régime de change. La convertir n'introduit donc aucune information non
 * sourcée.
 *
 * **Les autres monnaies n'ont pas de taux ici, et c'est délibéré.** Un cours
 * du franc suisse ou du dirham est une donnée de marché : il change tous les
 * jours, et l'afficher demanderait sa source et sa date de relevé comme
 * toute autre information de la plateforme (INV-8). Écrire un nombre
 * plausible en dur serait exactement ce que ce produit reproche aux sites
 * qu'il remplace. Tant qu'aucune source n'est branchée, la conversion rend
 * `null` et l'appelant dit que le montant n'est pas comparable — plutôt que
 * de comparer faux.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Parité fixe du franc CFA, en vigueur depuis 1999. Ce n'est pas un cours relevé. */
export const PARITE_XOF_EUR = 655.957;

export const SOURCE_PARITE = "Parité fixe XOF/EUR, régime de change de la zone franc";

/** Devises que le référentiel peut porter. */
export type DeviseSource = "EUR" | "CHF" | "AED" | "XOF" | "USD" | "CAD";

/**
 * Convertit en francs CFA. Rend `null` quand aucune parité sûre n'existe —
 * l'absence de résultat est une information, pas une panne.
 */
export function versXOF(valeur: number, devise: DeviseSource): number | null {
  switch (devise) {
    case "XOF":
      return valeur;
    case "EUR":
      return Math.round(valeur * PARITE_XOF_EUR);
    default:
      return null;
  }
}

export const convertible = (devise: DeviseSource): boolean =>
  versXOF(1, devise) !== null;

/** Ce qu'un écran écrit quand la comparaison n'est pas possible. */
export const MENTION_NON_COMPARABLE =
  "Montant publié dans une autre monnaie : il n'est pas comparé à ton budget faute de taux de change vérifié.";
