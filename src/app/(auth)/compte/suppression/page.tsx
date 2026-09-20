import type { Metadata } from "next";
import { SuppressionDuCompte } from "./SuppressionDuCompte";
import { exigerCandidat } from "@/server/securite/page";

/**
 * Suppression de compte — A-05, RG-10.4.
 *
 * Rendu à la demande et derrière la garde : l'écran le plus irréversible du
 * produit ne s'ouvre pas à quelqu'un qui n'est pas connecté, et la question
 * « de quel compte parle-t-on ? » ne doit jamais se poser.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supprimer mon compte",
  description: "Ce qui est supprimé, ce qui reste, et pourquoi.",
};

export default async function PageSuppression() {
  const acteur = await exigerCandidat("/compte/suppression");
  return <SuppressionDuCompte email={acteur.email} />;
}
