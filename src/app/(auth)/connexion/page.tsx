import type { Metadata } from "next";
import { Connexion } from "./Connexion";

/**
 * A-02 — Connexion. WF-02.
 *
 * L'échec d'identification ne dit jamais lequel des deux champs est en
 * cause : le préciser renseignerait un attaquant sur l'existence du compte.
 */
export const metadata: Metadata = {
  title: "Connexion",
  description: "Connecte-toi à ton espace ImmiPro.",
};

export default function PageConnexion() {
  return <Connexion />;
}
