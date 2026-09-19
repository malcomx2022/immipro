import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PriseDeRendezVous } from "./PriseDeRendezVous";
import { consultantParId, creneaux } from "@/server/lecture/consultants";
import { tableauDeBord, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/**
 * T-05 — Prise de rendez-vous. WF-12.
 *
 * Rendu à la demande : les disponibilités sont générées à partir
 * d'aujourd'hui, et un créneau déjà réservé chez ce consultant sort
 * indisponible plutôt que d'échouer au moment de la réservation.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const consultant = await consultantParId(id);
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
  const acteur = await exigerCandidat();
  const { id } = await params;
  const { dossier: idDossier } = await searchParams;

  const dossiers = await tableauDeBord(acteur.id);
  const choisi = idDossier ?? dossiers[0]?.id;
  if (!choisi) notFound();

  const [consultant, vue] = await Promise.all([
    consultantParId(id),
    vueDuDossier(choisi, acteur.id).catch(() => null),
  ]);
  if (!consultant || !vue) notFound();

  return (
    <PriseDeRendezVous
      dossier={vue.dossier}
      pieces={vue.pieces}
      consultant={consultant}
      creneaux={await creneaux(consultant.id)}
    />
  );
}
