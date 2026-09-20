/**
 * Combien de temps garder le motif d'un échec — O.B, tranché à
 * quatre-vingt-dix jours le 20/09/2026.
 *
 * Le motif partait déjà avec le compte (RG-10.4), et la raison invoquée là
 * vaut aussi bien pour un compte vivant : « l'obligation comptable tient au
 * montant, à la date et à la référence — pas au fait qu'une carte a été
 * refusée pour solde un jour de septembre, qui décrit une personne ». Ce
 * module est cette règle sur une horloge.
 *
 * **Ce qui part, et ce qui reste.** Le motif seul. Le paiement, son
 * montant, sa date, son statut et sa référence suivent leur propre
 * politique comptable et ne sont pas touchés : c'est parce que le motif
 * vit dans sa propre colonne qu'on peut l'effacer sans toucher au reste,
 * et c'est ce qui rend la minimisation réelle plutôt que déclarative.
 *
 * Une fois le motif parti, $-05 retombe sur la déduction par l'état, qui
 * dit « le paiement a été refusé, la raison ne nous est pas communiquée »
 * (O.A). La dégradation est exactement celle qu'il faut : l'écran perd une
 * précision, il ne gagne pas une erreur.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Trois mois : la fenêtre du support et des réclamations ordinaires. */
export const CONSERVATION_MOTIF_JOURS = 90;

/**
 * Et le sursis après la clôture d'un dossier ouvert.
 *
 * Il ne raccourcit jamais la conservation ordinaire : une réclamation
 * close au cinquième jour n'avance pas l'effacement au trente-cinquième.
 * Les deux échéances valent ensemble, et c'est la plus tardive qui
 * s'applique — sinon ouvrir puis refermer une réclamation deviendrait un
 * moyen de faire disparaître un motif plus tôt que la règle ne le prévoit.
 */
export const SURSIS_APRES_CLOTURE_JOURS = 30;

/**
 * Ce que la plateforme sait d'un dossier ouvert sur un paiement.
 *
 * Elle n'a pas de modèle de réclamation, et O.B n'en demande pas un : deux
 * états existants disent qu'un dossier est ouvert — un écart de
 * réconciliation non résolu (B-04), et un remboursement décidé que
 * personne n'a encore versé (K.C).
 */
export interface EtatDuLitige {
  /** Un dossier ouvert suspend l'effacement, quelle que soit l'ancienneté. */
  ouvert: boolean;
  /**
   * Quand il s'est refermé, si la plateforme sait le dire.
   *
   * `null` ne veut pas dire « jamais ouvert » : il veut dire « pas de date
   * de clôture ». Un remboursement versé en porte une ; un écart de
   * réconciliation, non — rien ne date sa résolution aujourd'hui, et le
   * sursis de trente jours ne peut donc pas courir pour lui. Le jour où
   * B-04 saura fermer un écart, il devra le dater, et cette fonction
   * l'utilisera sans changer.
   */
  closLe: Date | null;
}

const JOUR = 24 * 60 * 60 * 1000;

/** Une durée en jours ne connaît pas les mois inégaux : l'addition suffit. */
const apres = (depuis: Date, jours: number): Date =>
  new Date(depuis.getTime() + jours * JOUR);

/**
 * Quand le motif doit disparaître, ou `null` tant qu'un dossier est ouvert.
 *
 * Rendre une date plutôt qu'un booléen se paie d'une ligne et rapporte la
 * possibilité de l'annoncer : « ce motif sera effacé le … » se dit avec
 * elle, et ne se dit pas avec un booléen.
 */
export function echeanceDuMotif(echoueLe: Date, litige: EtatDuLitige): Date | null {
  if (litige.ouvert) return null;
  const ordinaire = apres(echoueLe, CONSERVATION_MOTIF_JOURS);
  if (!litige.closLe) return ordinaire;
  const apresCloture = apres(litige.closLe, SURSIS_APRES_CLOTURE_JOURS);
  return apresCloture > ordinaire ? apresCloture : ordinaire;
}

/** L'échéance est-elle atteinte ? La borne est incluse. */
export function motifEffacable(
  echoueLe: Date,
  litige: EtatDuLitige,
  maintenant: Date,
): boolean {
  const echeance = echeanceDuMotif(echoueLe, litige);
  return echeance !== null && maintenant >= echeance;
}
