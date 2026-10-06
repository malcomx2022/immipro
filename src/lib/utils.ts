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
 *
 * ── Toute autre devise s'écrit avec la sienne ───────────────────────
 *
 * Le dernier cas rendait l'euro. Pas « par défaut » : **toujours**. Les
 * deux devises du produit sont le franc CFA et l'euro, et la grille
 * tarifaire n'en connaît pas d'autre — mais le référentiel réglementaire,
 * lui, cite la monnaie de chaque autorité. Constaté en exécution sur le
 * référentiel livré :
 *
 *     CH/etudes_permis_b : devise réelle = CHF | affiché = « 21 000 € »
 *
 * Vingt et un mille francs suisses annoncés en euros. Ce n'est pas une
 * approximation, c'est une autre somme — et le produit retire ailleurs
 * jusqu'aux conversions de parité fixe pour ne pas donner « pour un
 * montant opposable ce qui n'est qu'un ordre de grandeur »
 * (`domain/notifications/divergence`). Afficher un montant dans une
 * monnaie que l'autorité n'emploie pas est le même défaut, en pire : il
 * ne s'annonce pas comme une conversion.
 *
 * Le code ISO plutôt qu'un symbole : « 21 000 CHF » se lit sans savoir
 * quel pays écrit « Fr. » et lequel écrit « CHF », et il n'y a pas de
 * table de symboles à tenir à jour derrière le référentiel.
 */
export function formatMontant(valeur: number, devise: string): string {
  // Un montant entier s'écrit sans décimales (12 €) ; un prorata en euros
  // porte ses centimes en entier (7,20 €, et non 7,2 €) — RG-15.2.
  const centimes = devise !== "XOF" && !Number.isInteger(valeur);
  const nombre = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: centimes ? 2 : 0,
    maximumFractionDigits: devise === "XOF" ? 0 : 2,
  }).format(valeur);
  if (devise === "XOF") return `${nombre} F`;
  if (devise === "EUR") return `${nombre} €`;
  return `${nombre} ${devise}`;
}
