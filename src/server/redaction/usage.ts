/**
 * Ce qu'un appel a consommé — WF-16, INV-6.
 *
 * L'écriture vit dans `server/ia/appel.ts` : le job d'analyse en avait sa
 * propre copie, identique jusqu'au commentaire. Ce fichier reste le point
 * d'entrée que les routes de rédaction connaissent déjà.
 */
export { noterLesJetons } from "@/server/ia/appel";
