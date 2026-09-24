import type { Metadata } from "next";
import { FileDeVeille } from "./FileDeVeille";
import { collecte, fichesSuivies } from "@/server/lecture/backoffice";
import { exigerVeilleur } from "@/server/securite/page";
import { jourCivil } from "@/domain/format/fuseau";

/**
 * B-01 — File de veille réglementaire. WF-14.
 *
 * Rendu à la demande : les retards de relecture se comptent depuis
 * aujourd'hui. Figés au build, ils vieilliraient d'un jour par jour.
 *
 * Accès veilleur, pas administrateur : relire des sources est son métier, et
 * le moindre privilège veut qu'il n'ait pas davantage (RG-15.3).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Veille réglementaire",
  description: "Les fiches à relire, les écarts détectés et l'état des sources.",
};

export default async function PageVeille() {
  await exigerVeilleur("/veille");
  const [fiches, etatCollecte] = await Promise.all([fichesSuivies(), collecte()]);

  return (
    <FileDeVeille
      fiches={fiches}
      collecte={etatCollecte}
      aujourdhui={jourCivil(new Date())}
    />
  );
}
