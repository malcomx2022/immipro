import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PriseDeRendezVous } from "./PriseDeRendezVous";
import { consultantParId, creneaux as creneauxDuJour } from "@/lib/contenu/consultants";
import { DOSSIERS, dossierParId, piecesDuDossier } from "@/lib/contenu/dossiers";

/**
 * T-05 — Prise de rendez-vous. WF-12.
 *
 * Rendu à la demande : les disponibilités sont posées en jours à venir, et
 * figées au build elles finiraient toutes dans le passé.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const consultant = consultantParId(id);
  if (!consultant) return { title: "Consultant introuvable" };
  return {
    title: `Rendez-vous — ${consultant.nom}`,
    description: "Donner son accord d'accès, puis choisir un créneau.",
  };
}

export default async function PageRendezVous({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dossier?: string }>;
}) {
  const { id } = await params;
  const { dossier: idDossier } = await searchParams;
  const consultant = consultantParId(id);
  const dossier = dossierParId(idDossier ?? DOSSIERS[0]!.id);
  if (!consultant || !dossier) notFound();

  return (
    <PriseDeRendezVous
      dossier={dossier}
      pieces={piecesDuDossier(dossier.id)}
      consultant={consultant}
      creneaux={creneauxDuJour(new Date())}
    />
  );
}
