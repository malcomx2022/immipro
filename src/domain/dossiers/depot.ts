/**
 * Déclaration de dépôt — WF-10 étape 1, écran C-11a.
 *
 * « Le passage `PRET → SOUMIS` est déclaré, jamais calculé — la plateforme
 * ne dépose rien à la place du candidat » (DOC-11 §2.1, INV-1).
 *
 * La route existait depuis WF-10 et la décision depuis S.47 ; aucun écran ne
 * l'appelait. Aucun dossier ne pouvait donc devenir `SOUMIS` par
 * l'interface, et tout ce qui s'y rattache — la conservation de douze mois
 * de l'arbitrage S.78, le bloc « L'instruction continue », la clôture après
 * réponse de l'autorité — restait hors d'atteinte du parcours.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { StatutDossier } from "./dossier";
import { MENTION_EN_PAUSE } from "./dossier";
import { CONSERVATION_SOUMIS_MOIS, INVITATION_AVANT_JOURS, PROLONGATION_MOIS } from "./conservation";
import { jourEnFrancais } from "@/domain/format/moment";
import { decalerDeMois } from "@/domain/format/mois";

/**
 * Ce que la déclaration enregistre, dit au moment du geste et dans la
 * réponse du serveur. Une seule phrase pour les deux : l'écran et la route
 * ne peuvent pas décrire deux engagements différents.
 */
export const MENTION_DECLARATION =
  "C'est ta déclaration qui est enregistrée. ImmiPro ne transmet aucune demande à une autorité.";

/**
 * Ce qui se passe à la déclaration, dans l'ordre où cela concerne le
 * candidat : ce qui se fige, ce qui est conservé et jusqu'à quand, ce qui
 * reste à faire.
 *
 * Aucune phrase ne parle de la suite de l'instruction : la plateforme n'en
 * sait rien, et rien ici ne doit ressembler à une estimation (INV-1, INV-2).
 */
export const EFFETS_DEPOT: readonly string[] = [
  "Ton dossier passe à « Déposé » : ses pièces ne se modifient plus ici, puisqu'elles sont parties à l'autorité.",
  `Tes pièces sont conservées ${CONSERVATION_SOUMIS_MOIS} mois après la date de ton dépôt. ${INVITATION_AVANT_JOURS} jours avant l'échéance, nous te demanderons si l'instruction continue : une confirmation les garde ${PROLONGATION_MOIS} mois de plus.`,
  "Trente puis soixante jours après ton dépôt, nous te demanderons si l'autorité t'a répondu.",
  "Quand l'autorité aura répondu, tu déclareras l'issue depuis « Clôturer ».",
];

/** La case, non pré-cochée : la déclaration fige le dossier. */
export const LIBELLE_CONFIRMATION_DEPOT =
  "J'ai déposé ma demande auprès de l'autorité ou de son prestataire.";

export const RAISON_BOUTON_DEPOT =
  "Coche d'abord la case : la déclaration fige ton dossier, et c'est toi seul qui sais que la demande est partie.";

export const AVERTISSEMENT_DEPOT =
  "Une fois déclaré, le dépôt ne s'annule pas depuis ImmiPro. Si tu n'as pas encore déposé, reviens après l'avoir fait.";

export interface EtatDuDepot {
  /** Le bouton de déclaration s'affiche-t-il ? */
  declarable: boolean;
  titre: string;
  corps: string;
}

/**
 * Ce que l'écran dit selon l'état du dossier.
 *
 * Seul un dossier prêt se déclare déposé, et c'est une cohérence plutôt
 * qu'une permission : déclarer un dépôt alors qu'une pièce obligatoire
 * manque signifie que la checklist ou la déclaration est fausse. Les autres
 * états ne tombent pas sur un bouton désactivé sans explication : chacun
 * reçoit sa raison, et le geste qui lui reste.
 */
export function etatDuDepot(statut: StatutDossier): EtatDuDepot {
  switch (statut) {
    case "PRET":
      return {
        declarable: true,
        titre: "As-tu déposé ta demande ?",
        corps:
          "Toutes les pièces obligatoires sont réunies et aucune exigence ne bloque. Le dépôt se fait auprès de l'autorité ou de son prestataire : quand tu l'as fait, déclare-le ici.",
      };
    case "EN_PAUSE":
      return { declarable: false, titre: "Ton dossier est en pause", corps: MENTION_EN_PAUSE };
    case "SOUMIS":
      return {
        declarable: false,
        titre: "Ton dépôt est déjà déclaré",
        corps:
          "Ta checklist dit jusqu'à quand tes pièces sont conservées. Quand l'autorité aura répondu, déclare l'issue depuis « Clôturer ».",
      };
    case "CLOTURE":
      return {
        declarable: false,
        titre: "Ce dossier est clôturé",
        corps: "Son archive reste consultable. Pour une nouvelle demande, ouvre un nouveau dossier.",
      };
    default:
      return {
        declarable: false,
        titre: "Ton dossier n'est pas encore complet",
        corps:
          "Il reste des pièces obligatoires à réunir ou une exigence à lever avant de déposer. La checklist dit lesquelles.",
      };
  }
}

// ── La date réelle du dépôt — arbitrage S.89 ───────────────────────────

/**
 * La question et son aide, mot pour mot. La date déclarée commande la
 * conservation et les relances : le candidat doit savoir laquelle on lui
 * demande — pas celle d'aujourd'hui, pas celle d'un rendez-vous, celle où
 * la demande est partie.
 */
export const QUESTION_DATE_DEPOT = "Quand as-tu déposé ta demande ?";
export const AIDE_DATE_DEPOT =
  "Indique la date où tu as remis ou envoyé la demande à l'autorité ou à son prestataire.";

const DATE_CIVILE = /^\d{4}-\d{2}-\d{2}$/u;

const dateValide = (jour: string): boolean => {
  if (!DATE_CIVILE.test(jour)) return false;
  const d = new Date(`${jour}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === jour;
};

/**
 * Pourquoi une date de dépôt est refusée, ou `null` si elle convient.
 *
 * Deux bornes, et seulement deux :
 *
 * - **pas dans le futur** — un dépôt se déclare une fois fait ;
 * - **pas avant l'ouverture du dossier** — un dépôt fait avant ne peut
 *   pas s'appuyer sur cette checklist.
 *
 * Et deux absences voulues : une date antérieure au moment où le dossier
 * est devenu prêt (`readyAt`) n'est pas refusée — le candidat a pu réunir
 * ses pièces avant de les téléverser toutes —, et aucun retard maximal
 * n'est imposé : une déclaration tardive dit une date réelle ancienne, et
 * c'est la conservation qui en tient compte, pas le formulaire.
 *
 * Toutes les dates sont des jours civils `AAAA-MM-JJ`, lus dans le fuseau
 * du candidat par l'appelant.
 */
export function refusDeLaDateDeDepot(
  jour: string,
  aujourdhui: string,
  ouvertLe: string,
): string | null {
  if (!dateValide(jour)) {
    return "La date du dépôt n'est pas lisible : choisis-la dans le calendrier, jour, mois et année.";
  }
  if (jour > aujourdhui) {
    return `Le ${jourEnFrancais(jour)} n'est pas encore arrivé. Indique la date où ta demande est réellement partie, au plus tard aujourd'hui, le ${jourEnFrancais(aujourdhui)}.`;
  }
  if (jour < ouvertLe) {
    return `Ton dossier a été ouvert le ${jourEnFrancais(ouvertLe)} : le dépôt ne peut pas le précéder. Vérifie la date saisie.`;
  }
  return null;
}

/** La date civile stockée (`@db.Date`) — minuit UTC, sans heure ni fuseau. */
export const versDateCivile = (jour: string): Date => new Date(`${jour}T00:00:00.000Z`);
export const depuisDateCivile = (date: Date): string => date.toISOString().slice(0, 10);

// ── La correction d'une date déjà déclarée — S.89 ──────────────────────

/** Fin normale de conservation : douze mois après la date réelle du dépôt. */
export const echeanceNormale = (deposeLe: string): Date =>
  decalerDeMois(versDateCivile(deposeLe), CONSERVATION_SOUMIS_MOIS);

export interface CorrectionDuDepot {
  retentionUntil: Date;
  /** `null` : l'annonce de purge tombe, le job la refera avec son préavis. */
  purgeDueAt: Date | null;
}

/**
 * Ce qu'une correction de la date réelle recalcule.
 *
 * Une fois confirmée, la date ne se modifie pas depuis le dossier : une
 * correction est une action auditée, et ce calcul est ce qu'elle écrit.
 *
 * - **L'échéance de conservation** suit la nouvelle date — sauf si le
 *   candidat a déjà prolongé la conservation : une confirmation de
 *   l'instruction ne se perd pas parce qu'une date a été corrigée, et la
 *   correction ne raccourcit jamais ce qu'il a obtenu.
 * - **Une purge déjà annoncée** garde sa date si la nouvelle échéance la
 *   précède : le candidat a reçu un préavis pour ce jour-là, et on ne le
 *   rapproche pas. Si la nouvelle échéance est plus tardive, l'annonce
 *   tombe, et la passe de conservation en refera une avec ses trente jours.
 */
export function correctionDuDepot(avant: {
  deposeLe: string;
  retentionUntil: Date | null;
  purgeDueAt: Date | null;
  nouvelle: string;
}): CorrectionDuDepot {
  const ancienneNormale = echeanceNormale(avant.deposeLe);
  const nouvelleNormale = echeanceNormale(avant.nouvelle);
  const prolongee =
    avant.retentionUntil !== null && avant.retentionUntil.getTime() > ancienneNormale.getTime();
  const retentionUntil =
    prolongee && avant.retentionUntil!.getTime() > nouvelleNormale.getTime()
      ? avant.retentionUntil!
      : nouvelleNormale;
  const purgeDueAt =
    avant.purgeDueAt !== null && retentionUntil.getTime() <= avant.purgeDueAt.getTime()
      ? avant.purgeDueAt
      : null;
  return { retentionUntil, purgeDueAt };
}
