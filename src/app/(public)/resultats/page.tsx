import type { Metadata } from "next";
import { Resultats } from "./Resultats";

/**
 * P-03 — Résultats. WF-01.
 *
 * Le classement compare des exigences publiées. Il ne dit rien de la
 * décision de l'administration, et l'écrit (INV-1).
 */
export const metadata: Metadata = {
  title: "Vos destinations",
  description:
    "Les destinations qui correspondent à vos réponses, avec le coût de la première année et ce qu'il faut prouver.",
};

export default function PageResultats() {
  return <Resultats />;
}
