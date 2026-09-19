import type { Metadata } from "next";
import { RevueDesPieces } from "./RevueDesPieces";
import { fileDeRevue } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";

/**
 * B-05 — Revue manuelle des pièces en échec. WF-15.
 *
 * Rendu à la demande : l'âge d'une pièce et le dépassement du délai cible se
 * calculent depuis maintenant, jamais à l'écriture — une file dont les âges
 * sont figés cesse de dire ce qui est en retard.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pièces en échec",
  description: "Relecture humaine des pièces que l'analyse automatique n'a pas su lire.",
};

export default async function PageRevue() {
  await exigerAdmin("/revue");
  const maintenant = new Date();
  return (
    <RevueDesPieces pieces={await fileDeRevue()} maintenant={maintenant.toISOString()} />
  );
}
