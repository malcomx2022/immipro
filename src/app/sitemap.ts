import type { MetadataRoute } from "next";
import { fichesPubliees } from "@/server/lecture/destinations";
import { adressesPubliees } from "@/server/lecture/editorial";
import { pagesPubliees } from "@/server/juridique/lecture";
import { MODELES, PAGES_JURIDIQUES } from "@/domain/juridique/modeles";
import { PAGES_STABLES, adresseAbsolue, origineDuSite } from "@/domain/exploitation/plan-du-site";

/**
 * Le plan du site — Q.B, fermé sans liens dynamiques pour la V1.
 *
 * La décision garde le pied de page stable et le fait mener au catalogue
 * plutôt qu'à trois destinations du moment. Elle tient parce que les liens
 * profonds sont assurés ailleurs : par le catalogue, par les pages
 * éditoriales, **et par le plan du site**. Les deux premiers existaient ;
 * celui-ci, non — la justification reposait sur un mécanisme absent, et
 * `adressesPubliees` avait été écrite pour lui sans que rien ne l'appelle.
 *
 * **Une seule route dynamique, et c'est tout l'argument de Q.B.** Faire
 * lire la base au pied de page aurait rendu dynamiques toutes les pages
 * du gabarit, y compris le simulateur et les tarifs, qui n'ont aucune
 * raison de l'être. Ici, une seule adresse paie ce coût, et c'est celle
 * dont les moteurs se servent précisément pour trouver les pages
 * profondes.
 *
 * `force-dynamic` n'est pas une précaution : sans lui la construction
 * échoue. Un plan du site n'a pas de segment dynamique, Next le pré-rend
 * donc au build, et le build tourne sans base de données (J.8). C'est
 * exactement la panne constatée sur les trois pages d'index (Q.5), au même
 * endroit et pour la même raison.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ fiches }, guides, articles, juridiques] = await Promise.all([
    fichesPubliees(),
    adressesPubliees("GUIDE"),
    adressesPubliees("ARTICLE"),
    pagesPubliees(),
  ]);

  /**
   * Rien qui ne soit publié, et le filtrage est dans la requête — INV-4,
   * même esprit. Un plan du site est lu par des moteurs : y faire figurer
   * une fiche en brouillon la ferait indexer avant qu'elle existe, ce qui
   * est la version automatisée du défaut que P.A a trouvé dans le pied de
   * page.
   */
  const profondes = [
    ...fiches.map((f) => `/destinations/${f.slug}`),
    ...guides.map((slug) => `/guides/${slug}`),
    ...articles.map((slug) => `/articles/${slug}`),
    // S.101 — une page juridique n'entre au plan qu'une fois validée.
    ...PAGES_JURIDIQUES.filter((p) => juridiques[p] !== undefined).map((p) => MODELES[p].adresse),
  ];

  /**
   * L'origine vient de l'environnement, et le repli vaut pour le
   * développement local. En production, une variable absente produirait un
   * plan qui renvoie vers `localhost` — invisible à tout test, parfaitement
   * lisible par un moteur.
   */
  const origine = origineDuSite(process.env.APP_URL).origin;
  const maintenant = new Date();
  return [...PAGES_STABLES, ...profondes].map((adresse) => ({
    url: adresseAbsolue(origine, adresse),
    lastModified: maintenant,
  }));
}
