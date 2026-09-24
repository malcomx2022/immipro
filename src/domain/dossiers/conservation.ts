/**
 * Conservation des pièces selon l'état du dossier — INV-5, arbitrage S.78.
 *
 * ── Ce qui est conservé, et ce qui ne l'est pas ─────────────────────
 *
 * La conservation des **octets** est dissociée de celle du dossier. Une
 * purge de pièces efface les fichiers et ce qui les recopie (champs lus,
 * réponses d'entretien) ; elle ne supprime ni le dossier, ni son
 * historique, ni ses verdicts, ni ses traces d'audit.
 *
 * ── Avant l'arbitrage ───────────────────────────────────────────────
 *
 * Seuls deux chemins posaient une échéance de purge : la clôture déclarée
 * et l'abandon d'un **brouillon** inactif. Un dossier payé, soumis ou
 * suspendu dont le candidat ne revenait jamais gardait ses pièces
 * d'identité sans terme. La sonde de santé le comptait depuis S.78 ; rien
 * ne le traitait.
 *
 * ── Les quatre règles ───────────────────────────────────────────────
 *
 * - `BROUILLON`, `ACTIF`, `PRET` : RG-04.2 pour tous. Relance à 90 jours
 *   sans activité, `ABANDONNE` à 12 mois, pièces purgées sous 30 jours.
 *   Le paiement n'est pas un motif de conservation.
 * - `SOUMIS` : l'inactivité ne vaut pas abandon, le candidat attend un
 *   tiers. Pièces conservées 12 mois après le dépôt déclaré ; une
 *   confirmation explicite que l'instruction continue prolonge de 6 mois,
 *   renouvelable. Sans réponse, un préavis de 30 jours précède la purge.
 *   Le dossier reste `SOUMIS`.
 * - `SUSPENDU` : aucune inactivité ne clôt un dossier que la plateforme a
 *   suspendu. Avertissement à 11 mois de suspension, purge à 12 si elle
 *   n'est pas levée. Le dossier, son motif et son statut antérieur
 *   restent ; les pièces encore nécessaires sont redemandées à la reprise.
 * - Suppression de compte : purge immédiate, RG-10.4, inchangée.
 *
 * Toute purge est annoncée à l'avance — l'échéance n'est jamais plus
 * proche que le préavis, même quand la passe arrive en retard sur un
 * stock ancien —, indépendante de l'action du candidat, et réexécutable :
 * l'échéance reste posée tant qu'un objet résiste.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { decalerDeMois } from "@/domain/format/mois";
import { jourCivil } from "@/domain/format/fuseau";
import { jourEnFrancais } from "@/domain/format/moment";
import type { EtatStocke } from "./etat";

const JOUR = 24 * 60 * 60 * 1000;

/** Les états que RG-04.2 surveille : le paiement n'en retire aucun. */
export const ETATS_SOUMIS_A_L_INACTIVITE: readonly EtatStocke[] = [
  "BROUILLON",
  "ACTIF",
  "PRET",
];

/** Délai minimal entre l'annonce d'une purge et la purge elle-même. */
export const PREAVIS_JOURS = 30;

/** `SOUMIS` — conservation après le dépôt déclaré. */
export const CONSERVATION_SOUMIS_MOIS = 12;
/** `SOUMIS` — prolongation accordée par une confirmation explicite. */
export const PROLONGATION_MOIS = 6;
/**
 * `SOUMIS` — l'invitation à confirmer part avant le préavis, pour que la
 * confirmation arrive avant qu'une purge ne soit annoncée. Trente jours
 * de plus que le préavis : un mois pour répondre sans rien recevoir
 * d'alarmant.
 */
export const INVITATION_AVANT_JOURS = 60;

/** `SUSPENDU` — l'avertissement, puis la purge si rien n'est levé. */
export const SUSPENSION_AVERTISSEMENT_MOIS = 11;
export const SUSPENSION_PURGE_MOIS = 12;

/**
 * L'état que garde un dossier une fois ses pièces purgées.
 *
 * La purge faisait passer en `ARCHIVE` tout dossier purgé en entier.
 * C'était juste pour les deux chemins qui la programmaient — une clôture
 * déclarée, un abandon —, et faux pour ceux qu'ouvre l'arbitrage : un
 * dossier soumis attend toujours la réponse d'un tiers, un dossier
 * suspendu attend toujours la plateforme. Les archiver effacerait
 * précisément ce que la décision garde : l'état, et la dette.
 *
 * La suppression de compte archive tout, comme avant : le compte part, et
 * aucun dossier ne reste à suivre.
 */
export function etatApresPurge(etat: EtatStocke, surDemande: boolean): EtatStocke {
  if (surDemande) return "ARCHIVE";
  return etat === "ISSUE_DECLAREE" || etat === "ABANDONNE" ? "ARCHIVE" : etat;
}

/**
 * L'échéance ne précède jamais le préavis.
 *
 * Une passe mise en service sur un stock ancien trouve des dossiers soumis
 * depuis deux ans : leur échéance théorique est passée. Les purger le
 * jour même serait une purge non annoncée ; ils reçoivent leurs trente
 * jours.
 */
export const echeanceAnnoncee = (echeance: Date, maintenant: Date): Date =>
  new Date(Math.max(echeance.getTime(), maintenant.getTime() + PREAVIS_JOURS * JOUR));

// ── SOUMIS ─────────────────────────────────────────────────────────

/**
 * Six mois de plus, comptés depuis l'échéance en cours — ou depuis
 * aujourd'hui si elle est déjà passée, pendant le préavis. Confirmer tôt
 * ne fait rien perdre : l'échéance avance, elle ne repart pas du jour de
 * la réponse.
 */
export const echeanceProlongee = (echeance: Date, maintenant: Date): Date =>
  decalerDeMois(echeance > maintenant ? echeance : maintenant, PROLONGATION_MOIS);

export type SuiteDuDepot = "RIEN" | "INVITER" | "PREAVISER";

export interface EtatDuDepot {
  /** Fin de la conservation en cours. */
  echeance: Date;
  /** Une invitation est-elle déjà partie pour cette échéance-ci ? */
  dejaInvite: boolean;
  /** Une purge est-elle déjà annoncée ? */
  purgeAnnoncee: boolean;
  maintenant: Date;
}

/**
 * Ce qu'il faut faire d'un dossier soumis aujourd'hui.
 *
 * Le préavis passe avant l'invitation : à trente jours de l'échéance, une
 * invitation sans date de purge serait une phrase de trop. Le préavis
 * invite aussi à confirmer — c'est encore possible jusqu'à la purge.
 */
export function suiteDuDepot(etat: EtatDuDepot): SuiteDuDepot {
  if (etat.purgeAnnoncee) return "RIEN";
  const avant = (jours: number) => etat.echeance.getTime() - jours * JOUR;
  if (etat.maintenant.getTime() >= avant(PREAVIS_JOURS)) return "PREAVISER";
  if (etat.maintenant.getTime() >= avant(INVITATION_AVANT_JOURS) && !etat.dejaInvite) {
    return "INVITER";
  }
  return "RIEN";
}

/** Depuis quand une invitation compte pour l'échéance en cours. */
export const debutDeLInvitation = (echeance: Date): Date =>
  new Date(echeance.getTime() - INVITATION_AVANT_JOURS * JOUR);

/**
 * La confirmation s'ouvre avec l'invitation, pas avant.
 *
 * Ouverte en permanence, elle ferait de six mois une unité qu'on empile :
 * dix clics le jour du dépôt vaudraient cinq ans de conservation, sans que
 * l'instruction ait duré un jour de plus. Ce qu'elle atteste — « la
 * demande est toujours à l'instruction » — n'a de sens qu'à l'approche de
 * l'échéance.
 */
export const confirmationOuverte = (echeance: Date, maintenant: Date): boolean =>
  maintenant >= debutDeLInvitation(echeance);

// ── SUSPENDU ───────────────────────────────────────────────────────

export type SuiteDeLaSuspension = "RIEN" | "AVERTIR";

/**
 * Ce qu'il faut faire d'un dossier suspendu qui porte encore des pièces.
 *
 * L'avertissement est l'annonce de la purge : il pose l'échéance, et la
 * purge suit par le job ordinaire. Il n'y a donc qu'une décision à
 * prendre ici — la purge elle-même n'a rien à décider de plus.
 */
export function suiteDeLaSuspension(
  suspenduLe: Date,
  dejaAverti: boolean,
  maintenant: Date,
): SuiteDeLaSuspension {
  if (dejaAverti) return "RIEN";
  return maintenant >= decalerDeMois(suspenduLe, SUSPENSION_AVERTISSEMENT_MOIS)
    ? "AVERTIR"
    : "RIEN";
}

/** Douze mois de suspension, jamais moins que le préavis. */
export const echeanceDeLaSuspension = (suspenduLe: Date, maintenant: Date): Date =>
  echeanceAnnoncee(decalerDeMois(suspenduLe, SUSPENSION_PURGE_MOIS), maintenant);

// ── Ce qu'on écrit ─────────────────────────────────────────────────

export interface AvisDeConservation {
  titre: string;
  /** Objet du courrier : une boîte mail n'a pas de contexte. */
  objet: string;
  corps: string;
}

const jourLisible = (instant: Date): string => jourEnFrancais(jourCivil(instant));

/** Ce qui survit à toute purge de pièces, dit à chaque annonce. */
const CE_QUI_RESTE =
  "Ton dossier, ses verdicts et son historique restent consultables après la suppression.";

/**
 * L'invitation, soixante jours avant l'échéance.
 *
 * Elle ne suppose rien de l'instruction : la plateforme ne sait pas si
 * l'autorité a répondu, et c'est au candidat de le dire. Elle dit ce qui
 * se passe s'il ne répond pas — la purge, annoncée à nouveau avant d'avoir
 * lieu — pour qu'un silence ne soit jamais une surprise.
 */
export function invitationDuDepot(destination: string, echeance: Date): AvisDeConservation {
  const date = jourLisible(echeance);
  return {
    titre: `Ta demande ${destination} est-elle toujours à l'instruction ?`,
    objet: `Tes pièces ${destination} sont conservées jusqu'au ${date}`,
    corps: `Tu as déclaré le dépôt de ta demande ${destination}. Ses pièces sont conservées jusqu'au ${date}.

Si l'instruction continue, confirme-le depuis ton dossier : elles seront conservées ${PROLONGATION_MOIS} mois de plus.

Sans confirmation, elles seront supprimées à cette date, après un dernier avis ${PREAVIS_JOURS} jours avant. ${CE_QUI_RESTE}`,
  };
}

/** Le préavis, trente jours au moins avant la purge. */
export function preavisDuDepot(destination: string, purgeLe: Date): AvisDeConservation {
  const date = jourLisible(purgeLe);
  return {
    titre: `Les pièces de ton dossier ${destination} seront supprimées le ${date}`,
    objet: `Tes pièces ${destination} seront supprimées le ${date}`,
    corps: `Tes pièces ${destination} seront supprimées de nos serveurs le ${date} : passeport, relevés, diplômes, tout.

Si ta demande est toujours à l'instruction, confirme-le depuis ton dossier avant cette date : la suppression sera annulée et tes pièces conservées ${PROLONGATION_MOIS} mois de plus.

${CE_QUI_RESTE}`,
  };
}

/**
 * L'avertissement d'un dossier suspendu, à onze mois.
 *
 * La pause est le fait de la plateforme, pas du candidat : le texte ne
 * lui reproche rien, et dit ce qui la lève. Il dit aussi que rien du
 * dossier ne se perd hormis les fichiers, et que ceux qui manqueront
 * seront redemandés — sans quoi la suppression se lirait comme une fin.
 */
export function avertissementDeSuspension(
  destination: string,
  purgeLe: Date,
): AvisDeConservation {
  const date = jourLisible(purgeLe);
  return {
    titre: `Ton dossier ${destination} est en pause depuis ${SUSPENSION_AVERTISSEMENT_MOIS} mois`,
    objet: `Tes pièces ${destination} seront supprimées le ${date}`,
    corps: `Ton dossier ${destination} est en pause depuis ${SUSPENSION_AVERTISSEMENT_MOIS} mois, le temps d'arbitrer un changement de règle. Ses pièces seront supprimées de nos serveurs le ${date} si la pause n'est pas levée d'ici là.

Pour la lever, ouvre le changement de règle dans ton dossier et choisis de conserver ta version ou d'appliquer la nouvelle.

Le dossier, le motif de la pause et son historique restent conservés. Les pièces encore nécessaires te seront redemandées à la reprise.`,
  };
}
