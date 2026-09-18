import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChoixDeLaPiece } from "./ChoixDeLaPiece";
import { DOSSIERS, dossierParId } from "@/lib/contenu/dossiers";
import { PIECES_REDIGEABLES } from "@/lib/contenu/redaction";

/**
 * R-01 — Rédaction assistée, choix de la pièce. WF-08.
 */
export function generateStaticParams() {
  return DOSSIERS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dossier = dossierParId(id);
  if (!dossier) return { title: "Dossier introuvable" };
  return {
    title: "Rédaction assistée",
    description:
      "Choisir la pièce à rédiger : nous posons les questions, le texte se met en forme à partir de vos réponses.",
  };
}

export default async function PageRedaction({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dossier = dossierParId(id);
  if (!dossier) notFound();

  return <ChoixDeLaPiece dossier={dossier} pieces={PIECES_REDIGEABLES} />;
}
