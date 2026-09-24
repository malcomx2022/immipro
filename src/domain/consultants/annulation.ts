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

/* ------------------------------------------------------------------ *
 * L'annulation par le candidat lui-même.
 * ------------------------------------------------------------------ */

/**
 * Le geste que trois surfaces promettaient, et qu'aucune n'offrait.
 *
 * `conditions()` s'affiche sous les créneaux, avant le paiement ; l'écran
 * de confirmation le répète ; le courrier de confirmation le répète
 * encore : « **Annulation ou report sans frais** jusqu'au [date]. Passé ce
 * délai, la consultation est due. »
 *
 * Aucune route n'annulait. `issueDeLAnnulation` avait deux appelants —
 * une lecture d'écran, et `acheverLaSuppression` — si bien que le seul
 * moyen d'annuler une consultation était de **supprimer son compte**. Un
 * candidat qui voulait décaler une heure devait effacer son dossier.
 *
 * Ce qui manquait n'était pas la règle : RG-12.5 la fixe déjà, et le
 * traitement existe en entier — la limite stockée, la libération du
 * créneau, l'ouverture du remboursement. Il manquait le geste.
 *
 * **Le report n'est pas ici**, et c'est volontaire. Déplacer un rendez-vous
 * demande de savoir si le consultant y consent, si son ancien créneau se
 * libère avant que le nouveau soit tenu, et ce qu'il advient du paiement
 * entre les deux : trois arbitrages que WF-12 ne porte pas. Annuler avant
 * la limite est remboursé et reprendre un créneau est libre : la phrase le
 * dit ainsi désormais, en deux gestes nommés plutôt qu'en un mot qui
 * n'existait pas.
 */
export const ETATS_ANNULABLES = ["RESERVE", "REPORTE"] as const;

export type RefusDAnnulation =
  /** Déjà annulé, ou jamais confirmé : il n'y a rien à annuler. */
  | "sans_objet"
  /** Le créneau est passé. On n'annule pas ce qui a eu lieu. */
  | "passe";

/**
 * Peut-on encore annuler ? Deux refus, et ils n'ont pas le même remède.
 *
 * Le créneau passé est le seul cas où l'annulation n'a plus de sens : la
 * consultation a eu lieu, ou elle n'a pas été honorée, et ni l'un ni
 * l'autre ne se défait. C'est aussi le cas que la limite ne couvre pas —
 * `FRAIS_DUS` dit « les frais restent dus », pas « c'est trop tard ».
 */
export function refusDeLAnnulation(
  rendezVous: { etat: string; debut: Date },
  maintenant: Date,
): RefusDAnnulation | null {
  if (!(ETATS_ANNULABLES as readonly string[]).includes(rendezVous.etat)) return "sans_objet";
  if (rendezVous.debut.getTime() <= maintenant.getTime()) return "passe";
  return null;
}

/**
 * Ce que le candidat lit **avant** de confirmer son annulation.
 *
 * Même règle que l'avertissement de suppression : découvrir après coup
 * qu'une consultation a été retenue, c'est avoir été trompé — même quand
 * la retenue est légitime. Le cas qui coûte se lit en entier, et il ne
 * s'ouvre pas sur une bonne nouvelle.
 */
export function avertissementAnnulation(rendezVous: RendezVousConcerne): string {
  return rendezVous.issue === "REMBOURSABLE"
    ? `Ton rendez-vous du ${rendezVous.quand} sera annulé et la consultation remboursée. Le créneau redevient libre immédiatement, et tu peux en reprendre un autre.`
    : `La consultation du ${rendezVous.quand} reste due : la limite de ${CONSULTATION_ANNULATION_HEURES} h acceptée à la réservation est passée. Le créneau sera libéré, et la somme ne sera pas rendue.`;
}

/** Ce que le candidat lit une fois l'annulation faite. */
export function suiteDeLAnnulation(issue: IssueAnnulation): string {
  return issue === "REMBOURSABLE"
    ? `Ton rendez-vous est annulé et le remboursement est parti. ${MENTION_DELAI_REMBOURSEMENT}`
    : "Ton rendez-vous est annulé et le créneau est libéré. La consultation reste due : la limite acceptée à la réservation était passée.";
}

export const MOTIF_REMBOURSEMENT_ANNULATION =
  "Annulation par le candidat avant la limite d'annulation (RG-12.5)";

/**
 * L'état vide de la liste des rendez-vous.
 *
 * Il dit où l'on prend un rendez-vous, parce qu'une liste vide sans issue
 * laisse chercher : c'est la règle des états vides du projet.
 */
export const RENDEZ_VOUS_VIDES =
  "Tu n'as aucun rendez-vous à venir. Un rendez-vous se prend depuis l'annuaire des consultants, dossier par dossier.";

/**
 * Ce que la liste dit sous elle, et que la promesse taisait.
 *
 * « Report » figurait dans les trois phrases qui annoncent les conditions,
 * sans qu'aucun mécanisme ne déplace un rendez-vous. Décaler se fait en
 * deux gestes nommés — annuler avant la limite, reprendre un créneau —, et
 * les nommer vaut mieux qu'un mot qui n'existait pas.
 */
export const MENTION_DECALAGE =
  "Pour décaler un rendez-vous, annule-le avant sa limite et reprends le créneau qui te convient : l'annulation est alors remboursée et les créneaux libres se choisissent comme la première fois.";

/**
 * Les états dans lesquels un rendez-vous **occupe** son créneau — RG-12.5.
 *
 * L'unicité de la base était totale : une ligne par consultant et par
 * créneau, quel que soit son état. Elle disait donc qu'un rendez-vous
 * annulé garde son horaire, et RG-12.5 promet l'inverse — « une
 * suppression de compte annule les rendez-vous à venir et libère les
 * créneaux immédiatement ».
 *
 * Les deux surfaces se contredisaient sans que rien ne les confronte :
 * `creneaux()` lisait les horaires occupés depuis `RESERVE`, `REPORTE` et
 * les tenues en cours, donc affichait le créneau **libre** ;
 * `tenirLeCreneau` butait sur l'unicité, donc répondait « ce créneau vient
 * d'être pris ». Le candidat remplissait l'accord de partage pour lire un
 * refus. Établi par exécution, avant correction :
 *
 *     ✓ le rendez-vous est annulé (ANNULE)
 *     ✗ et le créneau est repris par quelqu'un d'autre
 *
 * `libererLaTenue` avait diagnostiqué la cause sans que personne n'en
 * tire la conséquence : « une ligne annulée occuperait le créneau au
 * regard de l'unicité, qui ne connaît pas les états. »
 *
 * Trois états, et la liste est celle de l'unicité partielle de la base
 * (`appointment_creneau_vivant`) : une seule règle, à deux endroits qui ne
 * peuvent plus diverger. `TENU` y figure quelle que soit son échéance —
 * une tenue échue est reprise par une mise à jour, pas par une seconde
 * ligne.
 */
export const ETATS_VIVANTS = ["TENU", "RESERVE", "REPORTE"] as const;
