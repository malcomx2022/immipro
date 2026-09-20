/**
 * Annulation d'un rendez-vous, et suppression de compte — K.C, tranché le
 * 20/09/2026.
 *
 * Le problème naissait d'un croisement, pas d'une règle manquante : la
 * suppression libère les créneaux à venir, la grille prévoit des frais
 * au-delà de vingt-quatre heures, et personne n'avait dit lequel des deux
 * l'emportait.
 *
 * **La suppression du compte n'annule pas les conditions commerciales du
 * rendez-vous.** Elle est une annulation comme une autre, et la limite déjà
 * acceptée décide :
 *
 * - avant la limite, le rendez-vous est annulé et la consultation
 *   remboursée ;
 * - après, les frais prévus restent dus.
 *
 * Les deux autres issues avaient chacune leur défaut. Rembourser à tout
 * moment ferait de la suppression de compte un contournement des conditions
 * d'annulation — il suffirait de supprimer son compte une heure avant pour
 * ne rien payer. Retenir systématiquement, même la veille d'un créneau à
 * trois semaines, serait plus dur que la règle ordinaire, et la suppression
 * de compte est précisément le moment où l'on ne veut pas surprendre.
 *
 * **Le créneau se libère indépendamment du traitement financier.** Un
 * consultant qui attend quelqu'un qui ne viendra pas perd son heure : rien
 * ne justifie de retarder cette libération pour une question d'argent qui
 * se règle ailleurs, et plus tard.
 *
 * **La force majeure reste une décision de support, jamais une branche.**
 * Un remboursement au-delà de la limite existe, mais il porte le nom de
 * quelqu'un et son motif. Une exception automatique n'est plus une
 * exception : c'est la règle, écrite en creux.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { CONSULTATION_ANNULATION_HEURES } from "@/domain/payments/pricing";

export type IssueAnnulation =
  /** Avant la limite : le rendez-vous est annulé et la somme rendue. */
  | "REMBOURSABLE"
  /** Après la limite : le créneau se libère, les frais restent dus. */
  | "FRAIS_DUS";

/**
 * L'issue se lit sur la limite **stockée avec le rendez-vous**, jamais
 * recalculée depuis la grille.
 *
 * C'est la raison d'être de `Appointment.freeUntil` : la condition
 * opposable est celle acceptée le jour de la réservation. Une grille qui
 * passerait de vingt-quatre à quarante-huit heures ne doit pas rendre
 * payant, rétroactivement, un rendez-vous réservé sous l'ancienne.
 */
export function issueDeLAnnulation(limiteIso: string, maintenant: Date): IssueAnnulation {
  return maintenant.getTime() <= new Date(limiteIso).getTime() ? "REMBOURSABLE" : "FRAIS_DUS";
}

export const MOTIF_REMBOURSEMENT_SUPPRESSION =
  "Suppression de compte avant la limite d'annulation (K.C)";

/**
 * Ce que le candidat lit **avant** le bouton de suppression.
 *
 * Même règle que « ce qui reste » : découvrir après coup qu'une
 * consultation a été retenue, c'est avoir été trompé — même quand la
 * retenue est légitime.
 *
 * Une phrase par cas, et le cas qui coûte en premier. À l'écran, les deux
 * tenaient dans un même paragraphe : « annulé et remboursé » ouvrait, et la
 * retenue se lisait comme la fin de la même bonne nouvelle. Quelqu'un qui
 * s'arrête à la première ligne doit s'arrêter sur celle qui coûte.
 */
export interface RendezVousConcerne {
  /** « vendredi 19 septembre à 15 h 30 », déjà mis en forme par l'appelant. */
  quand: string;
  issue: IssueAnnulation;
}

export function avertissementSuppression(
  rendezVous: readonly RendezVousConcerne[],
): string[] {
  const remboursables = rendezVous.filter((r) => r.issue === "REMBOURSABLE");
  const dus = rendezVous.filter((r) => r.issue === "FRAIS_DUS");

  const phrases: string[] = [];
  // Ce qui coûte d'abord. À l'écran, les deux cas tenaient dans un même
  // paragraphe et la phrase chère se lisait comme la suite de l'autre :
  // quelqu'un qui s'arrête à la première ligne partait rassuré.
  if (dus.length > 0) {
    phrases.push(
      `${sujet(dus)} annulé${accord(dus)}, mais la consultation reste due : ${liste(dus)}. La limite de ${CONSULTATION_ANNULATION_HEURES} h acceptée à la réservation est passée, et supprimer le compte ne la lève pas.`,
    );
  }
  if (remboursables.length > 0) {
    phrases.push(
      `${sujet(remboursables)} annulé${accord(remboursables)} et remboursé${accord(remboursables)} : ${liste(remboursables)}.`,
    );
  }
  return phrases;
}

const accord = (r: readonly RendezVousConcerne[]) => (r.length > 1 ? "s" : "");

const sujet = (r: readonly RendezVousConcerne[]) =>
  r.length > 1 ? `Tes ${r.length} rendez-vous sont` : "Ton rendez-vous est";

const liste = (r: readonly RendezVousConcerne[]) => r.map((x) => x.quand).join(", ");

/**
 * Ce que l'écran ajoute quand au moins un remboursement est ouvert : le
 * délai n'est pas immédiat, et ne rien dire laisserait croire à un virement
 * dans l'heure.
 *
 * La phrase ne promet pas un jour précis. Le remboursement part par le même
 * fournisseur que l'encaissement, dont le délai n'est pas le nôtre ; annoncer
 * « sous 48 heures » serait une promesse que nous ne tenons pas nous-mêmes.
 */
export const MENTION_DELAI_REMBOURSEMENT =
  "Le remboursement part vers le moyen de paiement utilisé. Il reste visible dans tes reçus, qui survivent à la suppression.";
