import type { Metadata } from "next";
import { Resultats } from "./Resultats";
import { acteurCourant } from "@/server/securite/page";

/**
 * P-03 — Résultats. WF-01.
 *
 * Le classement compare des exigences publiées. Il ne dit rien de la
 * décision de l'administration, et l'écrit (INV-1).
 *
 * La page lit la session pour une seule raison : « Ouvrir un dossier » mène
 * un candidat connecté à l'ouverture de dossier, et non à une inscription
 * qu'il a déjà faite.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tes destinations",
  description:
    "Les destinations qui correspondent à tes réponses, avec le coût de la première année et ce qu'il faut prouver.",
};

export default async function PageResultats() {
  return <Resultats connecte={(await acteurCourant()) !== null} />;
}
