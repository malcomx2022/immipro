import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChoixDeLaPiece } from "./ChoixDeLaPiece";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { piecesARediger } from "@/server/lecture/redaction";
import { exigerCandidat } from "@/server/securite/page";

/**
 * R-01 — Rédaction assistée, choix de la pièce. WF-08.
 *
 * Les pièces proposées sont celles de **ce** dossier dont le remède est
 * « rédiger », pas le catalogue entier : proposer d'écrire une lettre que la
 * destination n'exige pas fait perdre une heure à quelqu'un qui en a peu.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) return { title: "Dossier introuvable" };
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
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) notFound();

  return (
    <ChoixDeLaPiece dossier={vue.dossier} pieces={await piecesARediger(id, acteur.id)} />
  );
}
