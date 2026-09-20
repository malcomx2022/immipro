import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Completude } from "./Completude";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/** C-09 — Complétude du dossier. WF-07. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/completude`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) return { title: "Dossier introuvable" };
  return {
    title: `Complétude — ${vue.dossier.destination.pays}`,
    description: "Ce qui manque au dossier, pièce par pièce, dans l'ordre à traiter.",
  };
}

export default async function PageCompletude({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/completude`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) notFound();

  return <Completude dossier={vue.dossier} pieces={vue.pieces} />;
}
