import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { intituleDeLaPiece } from "@/domain/facturation/numerotation";
import { CONSERVATION_PIECES_COMPTABLES_ANS } from "@/domain/facturation/facture";

/**
 * Une facture ou un avoir, pour le client qu'elle nomme — avis M.C.
 *
 * La pièce se lit telle qu'elle a été figée à l'émission : rien n'est
 * recalculé ni relu ailleurs. Le filtre sur le propriétaire est dans la
 * requête, comme pour le reçu : un numéro se suit, et une facture porte
 * un nom et une adresse.
 */
export interface PieceComptable {
  numero: string;
  genre: "FACTURE" | "AVOIR";
  serie: "REELLE" | "ESSAI";
  intitule: string;
  emiseLe: string;
  emetteur: readonly string[] | null;
  client: { nom: string | null; adresse: string | null; qualite: string };
  designation: string;
  devise: string;
  ttc: number;
  ht: number;
  tva: number;
  tauxBp: number | null;
  mentionTva: string;
  enLettres: string;
  reglement: string;
  certification: { code: string; le: string } | null;
  annulation: { le: string; motif: string } | null;
  /** Le numéro de la facture d'origine, pour un avoir. */
  origine: string | null;
  /** La référence du paiement, pour revenir au reçu. */
  reference: string;
  /**
   * Jusqu'où la pièce est conservée au moins : dix ans après son émission
   * (OHADA et fiscal béninois). Rien ne la supprime avant — la base
   * refuse toute suppression d'une pièce émise.
   */
  conserveeJusquau: string;
}

export async function pieceDuClient(numero: string, userId: string): Promise<PieceComptable> {
  const piece = await db.invoice.findFirst({
    where: { number: numero, transaction: { userId } },
    include: { origin: { select: { number: true } }, transaction: { select: { reference: true } } },
  });
  if (!piece) throw echec("introuvable");
  const emetteur = Array.isArray(piece.emitter)
    ? piece.emitter.filter((l): l is string => typeof l === "string")
    : null;
  return {
    numero: piece.number,
    genre: piece.kind,
    serie: piece.series,
    intitule: intituleDeLaPiece(piece.kind, piece.series),
    emiseLe: piece.issuedAt.toISOString(),
    emetteur,
    client: { nom: piece.clientName, adresse: piece.clientAddress, qualite: piece.clientQuality },
    designation: piece.designation,
    devise: piece.currency,
    ttc: piece.amountIncl,
    ht: piece.amountExcl,
    tva: piece.vatAmount,
    tauxBp: piece.vatRateBp,
    mentionTva: piece.vatNote,
    enLettres: piece.amountInWords,
    reglement: piece.paymentMethod,
    certification:
      piece.certificationCode && piece.certifiedAt
        ? { code: piece.certificationCode, le: piece.certifiedAt.toISOString() }
        : null,
    annulation:
      piece.cancelledAt && piece.cancelReason
        ? { le: piece.cancelledAt.toISOString(), motif: piece.cancelReason }
        : null,
    origine: piece.origin?.number ?? null,
    reference: piece.transaction.reference,
    conserveeJusquau: (() => {
      const fin = new Date(piece.issuedAt);
      fin.setUTCFullYear(fin.getUTCFullYear() + CONSERVATION_PIECES_COMPTABLES_ANS);
      return fin.toISOString();
    })(),
  };
}
