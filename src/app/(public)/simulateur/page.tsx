import type { Metadata } from "next";
import { Simulateur } from "./Simulateur";

/**
 * P-02 — Simulateur. WF-01.
 *
 * Six questions, une par écran. Aucun compte n'est créé et les réponses ne
 * quittent pas l'appareil : c'est écrit sous les choix, pas seulement dans
 * la politique de confidentialité.
 */
export const metadata: Metadata = {
  title: "Simulateur",
  description:
    "Six questions pour situer votre projet. Aucun compte à créer, aucune réponse conservée après la session.",
};

export default function PageSimulateur() {
  return <Simulateur />;
}
