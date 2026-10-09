import { unstable_cache } from "next/cache";
import { MODELES, PAGES_JURIDIQUES } from "@/domain/juridique/modeles";
import { pagesPubliees } from "./lecture";

/**
 * Les liens juridiques du pied de page, servis dans le HTML — revue du
 * 07/10/2026, M14 (D-19 du 08/10/2026).
 *
 * Ils étaient demandés par le navigateur après coup : absents du HTML,
 * invisibles sans JavaScript, et pour les moteurs. Les lire en base à
 * chaque rendu aurait rendu dynamiques toutes les pages publiques (Q.B).
 * D-19 accepte le compromis : un cache serveur de cinq minutes, étiqueté,
 * que la validation d'un texte en B-08 invalide aussitôt. Les pages
 * publiques passent de « statiques » à « revalidées toutes les cinq
 * minutes ».
 *
 * Ce cache ne sert qu'à l'affichage. Ce qui **enregistre** une version
 * acceptée — l'inscription, le paiement — et le plan du site lisent
 * `pagesPubliees()` en direct : une case d'acceptation ne peut pas citer
 * une version vieille de cinq minutes.
 *
 * `next build` tourne sans base (J.8) : la lecture échoue, l'appelant ne
 * rend rien, et la page reste revalidable — le premier rendu après cinq
 * minutes porte les liens.
 */
export const ETIQUETTE_TEXTES_JURIDIQUES = "textes-juridiques";
export const REVALIDATION_LIENS_JURIDIQUES_S = 300;

export interface LienJuridique {
  adresse: string;
  titre: string;
}

export const liensJuridiquesPublies = unstable_cache(
  async (): Promise<LienJuridique[]> => {
    const publiees = await pagesPubliees();
    return PAGES_JURIDIQUES.filter((p) => publiees[p] !== undefined).map((p) => ({
      adresse: MODELES[p].adresse,
      titre: MODELES[p].titre,
    }));
  },
  ["liens-juridiques"],
  { tags: [ETIQUETTE_TEXTES_JURIDIQUES], revalidate: REVALIDATION_LIENS_JURIDIQUES_S },
);
