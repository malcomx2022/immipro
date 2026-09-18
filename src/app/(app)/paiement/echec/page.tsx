import type { Metadata } from "next";
import { Echec } from "./Echec";

/**
 * $-05 — Échec ou expiration. WF-05.
 *
 * Deux motifs, deux écrans : un délai dépassé n'est pas un refus. Chacun dit
 * ce qui est conservé, propose le repli gratuit et un autre moyen de
 * paiement, et n'affiche aucun code technique.
 */
export const metadata: Metadata = {
  title: "Paiement non abouti",
  description: "Votre dossier est conservé. Vous pouvez relancer le paiement.",
};

export default function PageEchec() {
  return <Echec />;
}
