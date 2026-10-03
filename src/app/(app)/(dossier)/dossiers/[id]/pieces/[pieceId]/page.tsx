import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { offreDeMontee } from "@/server/acces/montee";
import { PieceDuDossier } from "./PieceDuDossier";
import { RECHARGE_ANALYSES, deviseParDefaut } from "@/domain/payments/pricing";
import { db } from "@/lib/db";
import { analyseDeLaPiece, quotaDuDossier, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";
import { formatMontant } from "@/lib/utils";
import { autorisationAccordee } from "@/server/acces/consentements";

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
  const quota = await quotaDuDossier(id);
  // Lu même quand il reste des analyses : le quota peut s'épuiser au
  // dépôt suivant, et l'écran bascule alors sans recharger la page.
  const passage = await offreDeMontee(id, acteur.id);
  // RG-02.2 : aucune pièce sans cette autorisation. L'écran la demande sur
  // place au lieu de laisser le dépôt échouer sans issue (03/10/2026).
  const autorise = await autorisationAccordee(acteur.id, "pieces_identite");

  return (
    <PieceDuDossier
      dossier={vueDossier.dossier}
      piece={vuePiece.piece}
      quota={quota}
      autorise={autorise}
      analyse={vuePiece.analyse ?? undefined}
      prixRecharge={formatMontant(RECHARGE_ANALYSES.prix[devise], devise)}
      volumeRecharge={RECHARGE_ANALYSES.volume}
      prixPassage={
        passage.ouverte ? formatMontant(passage.detail.montant, passage.detail.devise) : null
      }
    />
  );
}
