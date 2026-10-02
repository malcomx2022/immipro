import type { MetadataRoute } from "next";
import { ESPACES_NON_INDEXES, adresseAbsolue, origineDuSite } from "@/domain/exploitation/plan-du-site";

/**
 * `robots.txt` — l'adresse répondait 404 (contrôle du 02/10/2026).
 *
 * Il ouvre le site public, ferme l'espace candidat, les écrans du compte et
 * l'API, et désigne le plan du site par son adresse absolue. Il ne lit
 * aucune donnée : seule l'origine vient de l'environnement, lue à la
 * requête pour que l'image construite en CI serve la bonne adresse en
 * production.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origine = origineDuSite(process.env.APP_URL).origin;
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...ESPACES_NON_INDEXES] },
    sitemap: adresseAbsolue(origine, "/sitemap.xml"),
  };
}
