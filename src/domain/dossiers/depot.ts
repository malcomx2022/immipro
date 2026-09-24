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
  `Tes pièces sont conservées ${CONSERVATION_SOUMIS_MOIS} mois après cette déclaration. ${INVITATION_AVANT_JOURS} jours avant l'échéance, nous te demanderons si l'instruction continue : une confirmation les garde ${PROLONGATION_MOIS} mois de plus.`,
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
