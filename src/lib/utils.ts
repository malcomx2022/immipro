import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Formatage des montants — le XOF n'a pas de décimales. */
export function formatMontant(valeur: number, devise: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: devise,
    maximumFractionDigits: devise === "XOF" ? 0 : 2,
  }).format(valeur);
}
