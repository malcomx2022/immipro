import type { Metadata } from "next";
import { Recapitulatif } from "./Recapitulatif";

/**
 * $-02 — Récapitulatif. WF-05.
 *
 * Le montant est répété juste avant le déclenchement du paiement, et la case
 * des conditions n'est pas cochée d'avance : c'est l'écran qui porte
 * l'acceptation et la mention de non-garantie.
 */
export const metadata: Metadata = {
  title: "Récapitulatif",
  description: "Vérifiez le montant et le moyen de paiement avant de confirmer.",
};

export default function PageRecapitulatif() {
  return <Recapitulatif />;
}
