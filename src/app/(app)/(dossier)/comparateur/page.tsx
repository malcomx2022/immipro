import type { Metadata } from "next";
import { Comparateur } from "./Comparateur";
import { comparaison, fichesPubliees } from "@/server/lecture/destinations";
import { exigerCandidat } from "@/server/securite/page";

/**
 * C-03 — Comparateur. WF-03.
 *
 * Toutes les valeurs viennent du référentiel. Le prototype les écrivait à la
 * main, et trois d'entre elles avaient déjà divergé de la fiche qu'elles
 * résumaient : un comparateur qui contredit la fiche qu'il compare est pire
 * qu'un comparateur absent.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comparer les destinations",
  description: "Les exigences publiées de trois destinations, critère par critère.",
};

export default async function PageComparateur() {
  await exigerCandidat("/comparateur");
  const { fiches: toutes } = await fichesPubliees();
  const { fiches, valeurs, mention, lectureAttentive } = await comparaison(
    toutes.map((f) => f.slug),
  );

  return (
    <Comparateur
      fiches={fiches}
      valeurs={valeurs}
      mention={mention}
      lectureAttentive={lectureAttentive}
    />
  );
}
