import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Redaction } from "./Redaction";
import { dossierParId } from "@/lib/contenu/dossiers";
import {
  SUGGESTION_EN_ATTENTE,
  VERSIONS_MOTIVATION,
  pieceRedigeable,
} from "@/lib/contenu/redaction";

/**
 * R-02 entretien et R-03 éditeur — WF-08.
 *
 * Rendu à la demande : l'éditeur date ses versions en « il y a 4 minutes ».
 * Figée au build, cette ligne resterait vraie une seule minute.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const piece = pieceRedigeable(type);
  if (!piece) return { title: "Pièce introuvable" };
  return { title: piece.libelle, description: piece.objet };
}

export default async function PagePieceRedigee({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;
  const dossier = dossierParId(id);
  const piece = pieceRedigeable(type);
  if (!dossier || !piece) notFound();

  // Seule la lettre de motivation porte des versions dans le jeu de
  // démonstration ; les autres ouvrent donc sur l'entretien.
  const versions = piece.type === "lettre-motivation" ? VERSIONS_MOTIVATION : [];
  const suggestion = versions.length > 0 ? SUGGESTION_EN_ATTENTE : undefined;

  return (
    <Redaction
      dossier={dossier}
      piece={piece}
      versions={versions}
      suggestion={suggestion}
      maintenant={new Date().toISOString()}
    />
  );
}
