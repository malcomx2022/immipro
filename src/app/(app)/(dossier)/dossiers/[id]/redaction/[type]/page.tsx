import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Redaction } from "./Redaction";
import { vueDuDossier } from "@/server/lecture/dossiers";
import {
  pieceARediger,
  reponsesDeLEntretien,
  versionsDeLaPiece,
} from "@/server/lecture/redaction";
import { exigerCandidat } from "@/server/securite/page";

/**
 * R-02 entretien et R-03 éditeur — WF-08.
 *
 * Rendu à la demande : l'éditeur date ses versions en « il y a 4 minutes ».
 * Figée au build, cette ligne resterait vraie une seule minute.
 *
 * L'écran ouvre sur l'entretien tant qu'aucune version n'existe, et sur
 * l'éditeur dès qu'il y en a une. C'est l'état réel de la pièce qui décide,
 * pas son type : une lettre commencée puis abandonnée doit se reprendre là
 * où elle en est.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}): Promise<Metadata> {
  const { id, type } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction/${type}`);
  const piece = await pieceARediger(id, type, acteur.id).catch(() => null);
  if (!piece) return { title: "Pièce introuvable" };
  return { title: piece.libelle, description: piece.objet };
}

export default async function PagePieceRedigee({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction/${type}`);

  const [vue, piece] = await Promise.all([
    vueDuDossier(id, acteur.id).catch(() => null),
    pieceARediger(id, type, acteur.id).catch(() => null),
  ]);
  if (!vue || !piece) notFound();

  return (
    <Redaction
      dossier={vue.dossier}
      piece={piece}
      // L'entretien reprend où il s'est arrêté. La lecture existait
      // depuis le début ; personne ne la passait à l'écran, et l'état
      // repartait de zéro à chaque chargement.
      reponsesEnregistrees={await reponsesDeLEntretien(piece.documentId)}
      versions={await versionsDeLaPiece(piece.documentId)}
      maintenant={new Date().toISOString()}
    />
  );
}
