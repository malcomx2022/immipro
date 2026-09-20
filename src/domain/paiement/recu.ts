import { PACKS, RECHARGE_ANALYSES, CONSULTATION } from "@/domain/payments/pricing";

/**
 * Reçu de paiement — $-06, WF-05.
 *
 * Un reçu est une pièce comptable, pas un écran de plus. Trois conséquences
 * qui décident tout ce qui suit :
 *
 * **Il ne se rédige qu'après coup.** Une transaction en attente n'a pas de
 * reçu : elle a une promesse. Écrire « Payé » sur un paiement que
 * l'opérateur n'a pas confirmé produirait un document faux, et le
 * fournisseur seul confirme (RG-05.1).
 *
 * **Il dit ce qu'il atteste, et ce qu'il n'atteste pas.** Un candidat
 * pourrait le joindre à sa demande de visa ; les frais versés à
 * l'administration n'y sont pour rien, et le reçu le dit lui-même (INV-1).
 *
 * **Il change de nature quand l'argent revient.** Un paiement remboursé
 * garde son reçu — l'obligation comptable ne s'efface pas — mais il ne se
 * présente plus comme payé.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** États d'une transaction, du point de vue du reçu. */
export type EtatRecu = "paye" | "rembourse" | "en_cours" | "sans_suite";

const ETAT: Record<string, EtatRecu> = {
  CONFIRMEE: "paye",
  REMBOURSEE: "rembourse",
  INITIEE: "en_cours",
  EN_ATTENTE: "en_cours",
  ECHOUEE: "sans_suite",
  EXPIREE: "sans_suite",
};

/** Un statut inconnu ne devient jamais « payé » par défaut. */
export const etatDuRecu = (statut: string): EtatRecu => ETAT[statut] ?? "sans_suite";

/** Seul un paiement encore acquis porte un reçu qu'on renvoie ou qu'on imprime. */
export const estAttestable = (etat: EtatRecu): boolean => etat === "paye" || etat === "rembourse";

export const LIBELLE_ETAT: Record<EtatRecu, string> = {
  paye: "Payé",
  rembourse: "Remboursé",
  en_cours: "En attente",
  sans_suite: "Sans suite",
};

/**
 * Moyen de paiement tel qu'il se lit sur un reçu — et sur le tableau B-04,
 * qui lit la même table. Le nom du fournisseur technique n'y figure pas :
 * « FedaPay » ne dit rien à qui a payé depuis son téléphone.
 */
export const LIBELLE_MOYEN: Record<string, string> = {
  FEDAPAY: "Mobile Money",
  STRIPE: "Carte bancaire",
};

export const moyenDe = (fournisseur: string): string =>
  LIBELLE_MOYEN[fournisseur] ?? "Moyen de paiement";

/**
 * Ce qui a été acheté. `packCode` porte soit le code d'un pack, soit le
 * genre du complément — la grille tarifaire reste la seule source des
 * intitulés, pour qu'un pack renommé le soit en un seul endroit.
 */
export function libelleDeLAchat(packCode: string): string {
  if (packCode === "recharge") return RECHARGE_ANALYSES.libelle;
  if (packCode === "consultation") return CONSULTATION.libelle;
  return PACKS.find((p) => p.code === packCode)?.libelle ?? packCode;
}

/** Émetteur, sur le reçu comme sur la facture. */
export const EMETTEUR = "ImmiPro SAS · RCCM Cotonou · service@immipro.bj";

export const MENTION_ATTESTATION =
  "Ce reçu atteste du paiement d'un service de préparation de dossier. Il ne constitue pas une pièce à joindre à ta demande de visa, et les frais de demande versés à l'administration en sont exclus.";

/**
 * Comment on en fait un fichier. La même doctrine que l'archive d'un
 * dossier : c'est le navigateur qui fabrique le PDF, aucune bibliothèque
 * n'entre au dépôt pour cela.
 */
export const MENTION_PDF =
  "Dans la fenêtre d'impression, choisis « Enregistrer au format PDF » pour en garder un fichier.";

export const MENTION_REMBOURSE =
  "Ce paiement a été remboursé. Le reçu reste consultable pour ta comptabilité, mais il n'atteste plus d'une somme acquise.";

/** Pourquoi le renvoi est fermé sur un reçu remboursé (règle de désactivation 3). */
export const RAISON_RENVOI_FERME =
  "Le courrier de reçu annonce une somme encaissée ; ce paiement a été remboursé.";

export const confirmationDeRenvoi = (adresse: string): string =>
  `Reçu renvoyé à ${adresse}.`;

/** Ce que l'écran dit d'un paiement qui n'a pas encore abouti. */
export const EN_COURS_TITRE = "Ce paiement n'est pas encore confirmé";
export const EN_COURS_CORPS =
  "Ton opérateur ne nous a pas encore dit que la somme était débitée. Tant qu'il ne l'a pas fait, il n'y a pas de reçu à établir.";

export const SANS_SUITE_TITRE = "Ce paiement n'a pas abouti";
export const SANS_SUITE_CORPS =
  "Aucune somme n'a été débitée, et aucun reçu n'a donc été établi. Ton dossier est conservé en l'état.";
