import type { Metadata } from "next";
import { Rubrique } from "@/components/ui/Rubrique";
import { rubrique } from "@/server/lecture/editorial";
import { CHAPEAU_RUBRIQUE, TITRE_RUBRIQUE } from "@/domain/editorial/document";

/**
 * P-08 — Index des guides pays. P.A.
 *
 * L'en-tête et le pied de page promettaient « Guides pays » sur chaque
 * écran public depuis le premier lot, et l'adresse répondait 404.
 *
 * Classés par pays, pas par date : celui qu'on cherche est celui où l'on
 * veut aller, pas le dernier écrit.
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
  title: TITRE_RUBRIQUE.GUIDE,
  description: CHAPEAU_RUBRIQUE.GUIDE,
};

export default async function PageGuides() {
  return <Rubrique genre="GUIDE" entetes={await rubrique("GUIDE")} />;
}
