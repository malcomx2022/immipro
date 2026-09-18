import type { Metadata } from "next";
import { Attente } from "./Attente";

/**
 * $-03 — Attente de confirmation Mobile Money. WF-05.
 *
 * Variante retenue : le fil d'étapes. Un anneau qui tourne est le signal
 * exact d'une page bloquée — il tourne aussi bien quand rien n'arrive.
 */
export const metadata: Metadata = {
  title: "Confirmation en cours",
  description: "Confirmez le paiement sur votre téléphone.",
};

export default function PageAttente() {
  return <Attente />;
}
