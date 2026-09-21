/**
 * La consultation d'un paiement chez le fournisseur — RG-05.4.
 *
 * Le webhook peut se perdre. Un candidat débité qui ne voit rien arriver
 * est le pire défaut de ce produit : il paie sur un forfait mobile, il
 * n'a pas de recours simple, et une réclamation lui coûte un
 * déplacement. La réconciliation est ce filet-là.
 *
 * ── Ce que la consultation a le droit de conclure ────────────────────
 *
 * Cinq issues, et leurs frontières sont la règle :
 *
 * - **`connu`** — le fournisseur prononce un état, et on le traduit dans
 *   le cycle interne. La cause d'échec n'accompagne que ce qu'il a dit :
 *   jamais déduite (N.B).
 * - **`sans_paiement`** — il connaît la transaction, aucun paiement n'a
 *   eu lieu, et personne n'a rien refusé. Ce n'est pas un échec : une
 *   session abandonnée n'est pas une carte rejetée.
 * - **`introuvable`** — il ne connaît pas cette transaction.
 * - **`indisponible`** — réseau, panne, ou adaptateur non opérationnel.
 *   **Une absence de réponse n'est pas un refus bancaire.** C'est la
 *   frontière la plus importante du module : la confondre écrirait
 *   « paiement refusé » sur le dossier d'un candidat que personne n'a
 *   refusé, et le motif partirait jusque sur son écran.
 * - **`incoherent`** — la transaction rendue n'est pas la nôtre. On
 *   n'applique rien et l'écart s'ouvre.
 *
 * Aucune de ces issues n'expire quoi que ce soit : l'expiration suit la
 * règle de la plateforme (`aExpirer`, `DELAI_EXPIRATION_MINUTES`) et
 * elle seule.
 */
import type { TransactionStatus } from "@prisma/client";
import type { CauseRefus } from "@/domain/paiement/echec";
import type { Devise } from "@/domain/payments/pricing";
import { fournisseurDe } from "@/domain/payments/rail";
import { CLES, environnementNormalise } from "./secrets";
import { consultantStripe } from "./stripe";
import { consultantFedaPay } from "./fedapay";

export type EtatConsulte =
  | {
      issue: "connu";
      statut: TransactionStatus;
      /** Préfixé comme le webhook le préfixe : une seule graphie en base. */
      providerTxId: string;
      /** Seulement ce que le fournisseur a dit. Jamais déduite (N.B). */
      cause?: CauseRefus;
    }
  | { issue: "sans_paiement" }
  | { issue: "introuvable" }
  | { issue: "indisponible"; detail: string }
  | { issue: "incoherent"; detail: string };

export interface Consultant {
  readonly fournisseur: "FEDAPAY" | "STRIPE";
  /**
   * `providerTxId` est nul tant qu'aucune session n'a été ouverte : la
   * consultation n'a alors rien à demander, et le dit.
   */
  consulter: (providerTxId: string | null, reference: string) => Promise<EtatConsulte>;
}

/**
 * Le consultant du fournisseur d'une transaction.
 *
 * Le fournisseur se déduit de la colonne `provider`, posée à la création
 * d'après la devise (N.A). Il ne se redevine pas ici : une transaction
 * ouverte chez l'un ne se consulte pas chez l'autre.
 */
export function leConsultant(
  fournisseur: "FEDAPAY" | "STRIPE",
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Consultant | null {
  const lu = environnementNormalise(environnement);
  if (fournisseur === "FEDAPAY") {
    const cle = (lu[CLES.FEDAPAY.apiKey] ?? "").trim();
    return cle ? consultantFedaPay() : null;
  }
  const cle = (lu[CLES.STRIPE.apiKey] ?? "").trim();
  return cle ? consultantStripe(cle) : null;
}

/** Le même, à partir d'une devise — pour les appelants qui n'ont qu'elle. */
export const leConsultantDeLaDevise = (
  devise: Devise,
  environnement?: Readonly<Record<string, string | undefined>>,
): Consultant | null => leConsultant(fournisseurDe(devise), environnement);
