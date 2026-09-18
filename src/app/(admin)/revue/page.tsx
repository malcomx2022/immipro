import type { Metadata } from "next";
import { RevueDesPieces } from "./RevueDesPieces";
import { piecesEnEchec } from "@/lib/contenu/backoffice";

/**
 * B-05 — Revue manuelle des pièces en échec. WF-15.
 *
 * Rendu à la demande : l'âge d'une pièce et le dépassement du délai cible se
 * calculent depuis maintenant.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pièces en échec",
  description: "Relecture humaine des pièces que l'analyse automatique n'a pas su lire.",
};

export default function PageRevue() {
  const maintenant = new Date();
  return (
    <RevueDesPieces
      pieces={piecesEnEchec(maintenant)}
      maintenant={maintenant.toISOString()}
    />
  );
}
