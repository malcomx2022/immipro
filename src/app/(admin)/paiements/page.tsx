import type { Metadata } from "next";
import { Paiements } from "./Paiements";
import { OPERATEUR, PAIEMENTS } from "@/lib/contenu/backoffice";
import { jourEnFrancais } from "@/domain/format/moment";

/** B-04 — Paiements et réconciliation. WF-15, INV-7. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paiements",
  description: "Rapprochement des paiements et traitement des écarts.",
};

export default function PagePaiements() {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return (
    <Paiements
      paiements={PAIEMENTS}
      operateur={OPERATEUR}
      journee={`Journée du ${jourEnFrancais(aujourdhui)}`}
    />
  );
}
