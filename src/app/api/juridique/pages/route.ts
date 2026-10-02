import { route } from "@/server/http/route";
import { MODELES, PAGES_JURIDIQUES } from "@/domain/juridique/modeles";
import { pagesPubliees } from "@/server/juridique/lecture";

/**
 * Les pages juridiques publiées — S.101.
 *
 * Lue par le pied de page, qui reste sans données pour garder statiques
 * toutes les pages du gabarit (Q.B) : il ne promet une page juridique
 * qu'une fois qu'elle est servie. Ni texte, ni variable : des adresses,
 * des titres et des numéros de version.
 */
export const GET = route({
  nom: "juridique.pages",
  acces: "public",
  limite: "lecture",
  async traiter() {
    const publiees = await pagesPubliees();
    return {
      pages: PAGES_JURIDIQUES.filter((p) => publiees[p] !== undefined).map((p) => ({
        adresse: MODELES[p].adresse,
        titre: MODELES[p].titre,
        version: publiees[p]!,
      })),
    };
  },
});
