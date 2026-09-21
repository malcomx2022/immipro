/**
 * L'envoi d'une demande de remboursement au fournisseur — arbitrage du
 * 21/09/2026.
 *
 * **Il n'est pas branché, et rien ne le simule.** C'est la règle d'I.C :
 * aucun service absent n'est simulé. Un `NON_BRANCHE` qui rendrait
 * « accepté » ferait apparaître des demandes parties que personne n'a
 * envoyées, et la file des obligations se viderait toute seule — c'est le
 * pire des états, parce qu'il a l'air sain.
 *
 * Ce qui est écrit ici est ce qui peut l'être sans les clés : le point de
 * branchement, un seul, et la clé d'idempotence qui rend une nouvelle
 * tentative sûre. Le jour où FedaPay et Stripe sont branchés, c'est cette
 * fonction qu'on remplace, et rien d'autre.
 */

export interface DemandeDeRemboursement {
  reference: string;
  /** L'identifiant de la transaction chez le fournisseur, s'il est connu. */
  providerTxId: string | null;
  montant: number;
  devise: string;
  /** Dérivée de la référence : deux tentatives portent la même (voir domaine). */
  cle: string;
}

/**
 * Rend l'accusé de réception du fournisseur, ou `null` s'il n'a pas pu
 * être obtenu — service absent, appel en échec, réponse inattendue.
 *
 * `null` n'est pas un refus de rembourser : c'est « la demande n'est pas
 * partie ». La dette reste, la tentative est comptée, et l'appel suivant
 * portera la même clé.
 */
export type Rembourseur = (demande: DemandeDeRemboursement) => Promise<{ accepteLe: Date } | null>;

export const NON_BRANCHE: Rembourseur = async () => null;

/** Les clés sans lesquelles aucune demande ne part. */
export const VARIABLES = ["FEDAPAY_API_KEY", "STRIPE_API_KEY"];

export const remboursementConfigure = (): boolean =>
  VARIABLES.every((v) => (process.env[v] ?? "").trim() !== "");
