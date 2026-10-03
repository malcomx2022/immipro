import type { Metadata } from "next";
import { RevueDesPieces } from "./RevueDesPieces";
import { fileDeRevue } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";
import { RelecturesDeLaCompletude } from "./RelecturesDeLaCompletude";
import { fileDesRelectures } from "@/server/dossiers/relecture-completude";

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
    <>
      <RevueDesPieces pieces={await fileDeRevue()} maintenant={maintenant.toISOString()} />
      {/* Avis juridique L.A (03/10/2026) : la relecture humaine de la
          complétude, à la demande du candidat, est portée par la même
          personne que la revue des pièces. */}
      <div className="mx-auto w-full max-w-[880px] px-4 pb-8 md:px-8">
        <RelecturesDeLaCompletude demandes={await fileDesRelectures()} />
      </div>
    </>
  );
}
