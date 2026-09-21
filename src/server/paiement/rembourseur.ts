/**
 * Le contrat d'envoi d'une demande de remboursement.
 *
 * ── Ce que cette couche ne fait pas, et ne fera jamais ───────────────
 *
 * Elle ne rend pas d'argent. Elle demande. La distinction n'est pas
 * rhétorique : entre la demande acceptée et le virement, il peut
 * s'écouler des jours, et le fournisseur peut encore l'annuler. Seule sa
 * notification signée écrit `refundedAt` et `REMBOURSEE` (INV-7, M.B) —
 * ni cette couche, ni l'appelant, ni un geste d'opérateur.
 *
 * C'est la tentation principale du module : un appel API qui rend 200
 * *ressemble* à un remboursement fait, et le classer là éteindrait une
 * dette que personne n'a payée. La file des obligations se viderait
 * toute seule, ce qui est le pire des états — il a l'air sain.
 *
 * ── Cinq issues, parce qu'elles n'appellent pas la même suite ────────
 *
 * Le détail des cinq vit dans le domaine (`IssueDeDemande`), avec ce que
 * chacune implique. Ici, seule la forme : ce que l'adaptateur rend, et
 * ce qu'il a le droit de rendre. Aucune n'est une exception — un
 * fournisseur injoignable est un cas ordinaire du métier.
 *
 * `detail` décrit la **forme** de ce qui s'est passé : un code de
 * réponse, un champ absent. Jamais un secret, jamais le corps reçu.
 */
import type { IssueDeDemande } from "@/domain/paiement/remboursement";

export interface DemandeDeRemboursement {
  /** Notre référence interne, celle de la pièce comptable. */
  reference: string;
  /** L'identifiant chez le fournisseur, préfixé, déjà vérifié par l'appelant. */
  providerTxId: string;
  /** En unités majeures, comme la base les stocke. L'adaptateur convertit. */
  montant: number;
  devise: string;
  /** Dérivée de la référence : deux tentatives portent la même (domaine). */
  cle: string;
}

export type Remboursement =
  | {
      issue: Extract<IssueDeDemande, "acceptee">;
      /**
       * L'horodatage de l'accusé, pris sur notre horloge et non sur celle
       * du fournisseur : c'est nous qui datons ce que nous avons reçu.
       */
      accepteLe: Date;
      /** L'identifiant du remboursement chez lui, pour le retrouver à la main. */
      providerRefundId: string;
    }
  | { issue: Exclude<IssueDeDemande, "acceptee">; detail: string };

export interface Rembourseur {
  readonly fournisseur: "FEDAPAY" | "STRIPE";
  /**
   * L'adaptateur sait-il parler à ce fournisseur ?
   *
   * `false` quand il est écrit mais non opérationnel — le cas de FedaPay,
   * dont le format de remboursement n'a pas pu être vérifié. Il répond
   * alors `non_configure` sans appeler personne.
   *
   * C'est une déclaration, et une déclaration se dément : un test
   * l'éprouve contre le comportement des deux adaptateurs, parce qu'un
   * `operationnel: true` posé sur un adaptateur qui n'appelle rien est
   * exactement le genre d'affirmation rassurante que ce produit s'est
   * déjà faite à lui-même.
   */
  readonly operationnel: boolean;
  demander: (demande: DemandeDeRemboursement) => Promise<Remboursement>;
}
