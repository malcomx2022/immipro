import type { Metadata } from "next";
import { MotDePasse } from "./MotDePasse";

/**
 * A-04 — Mot de passe. WF-02.
 *
 * Trois étapes sur une même route : demande, lien envoyé, nouveau mot de
 * passe. L'étape vient du lien reçu par email, pas d'un choix de l'écran.
 */
export const metadata: Metadata = {
  title: "Mot de passe",
  description: "Réinitialise le mot de passe de ton compte ImmiPro.",
};

export default function PageMotDePasse() {
  return <MotDePasse />;
}
