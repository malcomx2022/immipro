import type { Metadata } from "next";
import { Tarifs } from "./Tarifs";

/**
 * P-06 — Tarifs. WF-05.
 *
 * Deux grilles natives, pas une conversion : aucun taux de change n'est
 * affiché. Les frais versés à l'administration ne sont pas inclus et ne
 * passent jamais par ImmiPro — c'est dit sur l'écran qui parle d'argent.
 */
export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Un paiement, un dossier. Pas d'abonnement : la checklist reste accessible jusqu'à la clôture du dossier.",
};

export default function PageTarifs() {
  return <Tarifs />;
}
