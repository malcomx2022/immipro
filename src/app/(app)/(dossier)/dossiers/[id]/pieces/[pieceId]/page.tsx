import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PieceDuDossier } from "./PieceDuDossier";
import { RECHARGE_ANALYSES, deviseParDefaut } from "@/domain/payments/pricing";
import { db } from "@/lib/db";
import { analyseDeLaPiece, quotaDuDossier, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";
import { formatMontant } from "@/lib/utils";

/**
 * C-07 et C-08 — une pièce du dossier. WF-06, RG-06.5.
 *
 * Le prix de la recharge n'est pas écrit dans l'écran : il vient de la grille
 * tarifaire, comme le volume. Le prototype affichait « 3 000 F » en dur, et
 * le montant comme le volume de la recharge attendent encore la mesure du
 * coût réel d'une analyse — un chiffre recopié dans une page aurait survécu
 * à cette mesure sans que personne le voie.
 *
 * La devise suit le pays du compte : un candidat qui paie en euros n'a pas à
 * lire un prix en francs CFA pour le convertir de tête.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}): Promise<Metadata> {
  const { id, pieceId } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/pieces/${pieceId}`);
  const vue = await analyseDeLaPiece(pieceId, id, acteur.id).catch(() => null);
  if (!vue) return { title: "Pièce introuvable" };
  return {
    title: vue.piece.libelle,
    description: "Déposer cette pièce, ou lire le résultat de son analyse.",
  };
}

export default async function PagePiece({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}) {
  const { id, pieceId } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/pieces/${pieceId}`);

  const [vueDossier, vuePiece, compte] = await Promise.all([
    vueDuDossier(id, acteur.id).catch(() => null),
    analyseDeLaPiece(pieceId, id, acteur.id).catch(() => null),
    db.user.findUnique({ where: { id: acteur.id }, select: { countryCode: true } }),
  ]);
  if (!vueDossier || !vuePiece) notFound();

  const devise = deviseParDefaut(compte?.countryCode);

  return (
    <PieceDuDossier
      dossier={vueDossier.dossier}
      piece={vuePiece.piece}
      quota={await quotaDuDossier(id)}
      analyse={vuePiece.analyse ?? undefined}
      prixRecharge={formatMontant(RECHARGE_ANALYSES.prix[devise], devise)}
      volumeRecharge={RECHARGE_ANALYSES.volume}
    />
  );
}
