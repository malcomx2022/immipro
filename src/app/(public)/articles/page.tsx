import type { Metadata } from "next";
import { Rubrique } from "@/components/ui/Rubrique";
import { rubrique } from "@/server/lecture/editorial";
import { CHAPEAU_RUBRIQUE, TITRE_RUBRIQUE } from "@/domain/editorial/document";

/**
 * P-09 — Index des articles. P.A.
 *
 * Classés du plus récent au plus ancien : un article est daté, et un texte
 * de l'an dernier sur une règle qui a changé depuis n'est pas ce qu'on veut
 * lire en premier.
 */
/**
 * Rendu à la demande, et non régénéré — la différence tient au segment.
 *
 * Les pages de document (`/guides/[pays]`) portent un paramètre dynamique
 * que rien n'énumère au build : Next ne peut pas les pré-rendre, et leur
 * `revalidate` suffit. Une page d'index n'a pas de paramètre : Next la
 * pré-rend au build, où il n'y a pas de base de données (J.8), et la
 * construction échoue. `force-dynamic` est donc la seule réponse honnête
 * ici, et son coût est une requête par visite sur une liste de quelques
 * lignes.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: TITRE_RUBRIQUE.ARTICLE,
  description: CHAPEAU_RUBRIQUE.ARTICLE,
};

export default async function PageArticles() {
  return <Rubrique genre="ARTICLE" entetes={await rubrique("ARTICLE")} />;
}
