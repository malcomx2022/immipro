import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PieceDuDossier } from "./PieceDuDossier";
import { RECHARGE_ANALYSES, deviseParDefaut } from "@/domain/payments/pricing";
import {
  ANALYSE_RESSOURCES,
  PIECES_PAR_DOSSIER,
  dossierParId,
  piecesDuDossier,
  QUOTA,
} from "@/lib/contenu/dossiers";
import { formatMontant } from "@/lib/utils";

/**
 * C-07 et C-08 — une pièce du dossier. WF-06, RG-06.5.
 *
 * Le prix de la recharge n'est pas écrit dans l'écran : il vient de la grille
 * tarifaire, comme le volume. Le prototype affichait « 3 000 F » en dur, et
 * le montant comme le volume de la recharge attendent encore la mesure du
 * coût réel d'une analyse — un chiffre recopié dans une page aurait survécu
 * à cette mesure sans que personne le voie.
 */
export function generateStaticParams() {
  return Object.entries(PIECES_PAR_DOSSIER).flatMap(([id, pieces]) =>
    pieces.map((piece) => ({ id, pieceId: piece.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}): Promise<Metadata> {
  const { id, pieceId } = await params;
  const piece = piecesDuDossier(id).find((p) => p.id === pieceId);
  if (!piece) return { title: "Pièce introuvable" };
  return {
    title: piece.libelle,
    description: "Déposer cette pièce, ou lire le résultat de son analyse.",
  };
}

export default async function PagePiece({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}) {
  const { id, pieceId } = await params;
  const dossier = dossierParId(id);
  const piece = piecesDuDossier(id).find((p) => p.id === pieceId);
  if (!dossier || !piece) notFound();

  // Une seule pièce porte une analyse dans le jeu de démonstration ; la
  // lecture viendra de la base avec le schéma DOC-11.
  const analyse =
    dossier.id === "nl-4471" && piece.id === "attestation-de-ressources"
      ? ANALYSE_RESSOURCES
      : undefined;

  const devise = deviseParDefaut("BJ");

  return (
    <PieceDuDossier
      dossier={dossier}
      piece={piece}
      quota={QUOTA}
      analyse={analyse}
      prixRecharge={formatMontant(RECHARGE_ANALYSES.prix[devise], devise)}
      volumeRecharge={RECHARGE_ANALYSES.volume}
    />
  );
}
