import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Annuaire } from "./Annuaire";
import { CONSULTANTS } from "@/lib/contenu/consultants";
import { DOSSIERS, dossierParId } from "@/lib/contenu/dossiers";

/**
 * T-04 — Annuaire des consultants habilités. WF-12, pack Accompagné.
 *
 * L'annuaire est propre à un dossier : l'habilitation se vérifie destination
 * par destination, et la liste n'a pas de sens hors de l'une d'elles.
 */
export const metadata: Metadata = {
  title: "Consultants habilités",
  description:
    "Les consultants dont le titre d'exercice a été vérifié pour cette destination.",
};

export default async function PageConsultants({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const { dossier: id } = await searchParams;
  const dossier = dossierParId(id ?? DOSSIERS[0]!.id);
  if (!dossier) notFound();

  return (
    <Annuaire
      dossier={dossier}
      consultants={CONSULTANTS}
      destination={dossier.destination.code}
    />
  );
}
