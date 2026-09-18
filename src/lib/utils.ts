import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Échelle de tailles du projet, fermée à neuf crans.
 *
 * `tailwind-merge` ne connaît que l'échelle native (`text-sm`, `text-lg`…) :
 * sans cette extension il classe `text-16` parmi les couleurs et le supprime
 * dès qu'une couleur de texte suit — un bouton primaire perdait sa taille au
 * profit de `text-white`. Toute nouvelle taille doit être ajoutée ici en même
 * temps que dans `tailwind.config.ts`.
 */
const TAILLES = ["13", "14", "15", "16", "19", "24", "28", "32", "44"];

const merge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: TAILLES }] } },
});

export const cn = (...inputs: ClassValue[]) => merge(clsx(inputs));

/**
 * Formatage des montants.
 *
 * Le XOF n'a pas de décimales, et le produit l'écrit « 5 000 F » — pas
 * « 5 000 F CFA », que rend `style: "currency"` en fr-FR. L'euro perd ses
 * décimales quand elles sont nulles : la grille annonce « 12 € », pas
 * « 12,00 € ». Les deux formes sont celles du prototype, qui fait foi pour
 * les textes, et elles servent aussi bien P-06 que les écrans de paiement.
 */
export function formatMontant(valeur: number, devise: string): string {
  const nombre = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: devise === "XOF" ? 0 : 2,
  }).format(valeur);
  return devise === "XOF" ? `${nombre} F` : `${nombre} €`;
}
