import { jourCivil } from "@/domain/format/fuseau";

/**
 * Numérotation des factures et des avoirs — avis comptable M.C du
 * 04/10/2026.
 *
 * L'avis tranche ce que la décision du 20/09 laissait en réserve : **chaque
 * vente donne lieu à une facture**, distincte du reçu. Le reçu garde sa
 * référence tirée au hasard — c'est une preuve de paiement, et une suite
 * d'entiers y dirait le nombre de ventes du mois. La facture, elle, se
 * numérote « de façon chronologique, continue et sans rupture, par
 * exercice comptable » : les deux exigences s'excluent, ce sont donc deux
 * pièces.
 *
 * Format retenu par l'avis : `RD-2026-00001` pour une facture,
 * `AV-2026-00001` pour un avoir, chaque série avec sa propre suite.
 *
 * ── La série d'essai ────────────────────────────────────────────────
 *
 * Le bac à sable confirme des paiements qui ne sont pas des ventes. Les
 * numéroter dans la série réelle consommerait `RD-2026-00001` pour un
 * paiement fictif, et la suite des vraies ventes commencerait par un trou
 * qu'aucune comptabilité n'expliquerait. Un paiement d'essai reçoit donc
 * une facture d'essai, dans une série à part, préfixée `ESSAI-` : le
 * circuit facture + avoir se teste de bout en bout sans toucher à la
 * suite réelle, et le document dit lui-même qu'il n'a aucune valeur.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type GenrePiece = "FACTURE" | "AVOIR";
export type Serie = "REELLE" | "ESSAI";

const PREFIXE: Record<GenrePiece, string> = { FACTURE: "RD", AVOIR: "AV" };

/** Cinq chiffres, comme dans l'avis ; une suite plus longue s'allonge sans se tronquer. */
const LARGEUR = 5;

export function prefixeDe(genre: GenrePiece, serie: Serie): string {
  return serie === "ESSAI" ? `ESSAI-${PREFIXE[genre]}` : PREFIXE[genre];
}

export function numeroDeLaPiece(
  genre: GenrePiece,
  serie: Serie,
  exercice: number,
  rang: number,
): string {
  if (!Number.isInteger(rang) || rang < 1) {
    throw new RangeError(`Rang de pièce invalide : ${rang}. La suite commence à 1.`);
  }
  return `${prefixeDe(genre, serie)}-${exercice}-${String(rang).padStart(LARGEUR, "0")}`;
}

/**
 * L'exercice d'une pièce : l'année civile de son émission, **à l'heure de
 * Cotonou**. Une vente du 31 décembre à 23 h 30 appartient à l'exercice
 * qui se termine, même s'il est déjà le 1er janvier en UTC.
 */
export const exerciceDe = (emiseLe: Date): number => Number(jourCivil(emiseLe).slice(0, 4));

/** Le titre que porte la pièce, en tête du document. */
export function intituleDeLaPiece(genre: GenrePiece, serie: Serie): string {
  const base = genre === "FACTURE" ? "Facture" : "Facture d'avoir";
  return serie === "ESSAI" ? `${base} d'essai` : base;
}

/**
 * Ce que dit une pièce d'essai, en tête et en évidence. Une pièce qui
 * ressemble à une facture et n'en est pas une doit le dire avant tout le
 * reste.
 */
export const MENTION_ESSAI =
  "Pièce d'essai, émise sur un paiement de l'espace de test : aucune somme n'a été encaissée, et ce document n'a aucune valeur comptable ni fiscale.";
