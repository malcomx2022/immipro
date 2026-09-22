/**
 * Le brouillon qu'on laisse de côté — RG-04.2.
 *
 * « Un dossier `BROUILLON` inactif depuis 90 jours déclenche une relance,
 * puis passe en `ABANDONNE` à 12 mois. »
 *
 * ── Ce que le code affirmait sans le faire ──────────────────────────
 *
 * `ABANDONNE` existait dans l'enum Prisma, dans `EtatStocke`, et l'écran
 * avait un cas pour lui — `versStatut("ABANDONNE")` rend « CLOTURE ».
 * **Aucune écriture ne le produisait.** Exécuté avant correction, sur un
 * brouillon laissé tel quel :
 *
 *     inactif depuis              : 630 jours (21 mois)
 *     statut                      : BROUILLON
 *     relance envoyée             : 0
 *     dossiers ABANDONNE en base  : 0
 *
 * Vingt et un mois, aucune relance, aucun changement. C'est la même forme
 * que le `readyAt` de S.47 et que l'`EXPIREE` de la péremption : un état
 * que le produit décrit, que les écrans savent lire, et que personne
 * n'écrit.
 *
 * ── L'horloge, et pourquoi ce n'est pas `updatedAt` ─────────────────
 *
 * Le réflexe est de mesurer l'inactivité sur `Application.updatedAt`.
 * Il est faux, et la sonde le montre :
 *
 *     updatedAt avant                     : 2025-01-01
 *     updatedAt après un rappel système   : 2026-09-22
 *     l'horloge a-t-elle été remise à zéro par le système ? true
 *
 * `updatedAt` est `@updatedAt` : **toute** écriture le déplace, y compris
 * celles de la plateforme. Le job de rappels d'échéance réveille aussi les
 * brouillons (`ETATS_RAPPELABLES`) et pose `lastReminderAt` ; il aurait
 * donc remis l'horloge à zéro chaque semaine, et les douze mois ne
 * seraient jamais arrivés. Un dossier mort serait resté vivant parce que
 * la plateforme lui écrivait.
 *
 * L'horloge est donc ce que **le candidat** a produit : l'ouverture du
 * dossier, et le dernier dépôt de pièce. Aucune passe de nuit n'écrit de
 * `DocumentVersion` — l'analyse note un verdict, la péremption déclasse,
 * la purge efface un contenu, aucune n'en crée. La mesure ne peut pas
 * être remise à zéro par la plateforme elle-même.
 *
 * Ce qu'elle ne compte pas : un candidat qui ne ferait que déplacer sa
 * date cible, sans jamais rien déposer, pendant douze mois. C'est assumé
 * — et la relance du quatre-vingt-dixième jour est là pour ça : elle part
 * neuf mois avant l'abandon, et dit ce qui arrivera.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** RG-04.2 — la relance. */
export const RELANCE_JOURS = 90;

/** RG-04.2 — l'abandon. Douze mois, comptés de la même origine. */
export const ABANDON_JOURS = 365;

export type SuiteDInactivite = "RIEN" | "RELANCER" | "ABANDONNER";

export interface EtatDInactivite {
  /** Jours écoulés depuis la dernière chose faite par le candidat. */
  inactifDepuis: number;
  /**
   * Une relance a-t-elle déjà été envoyée **depuis** cette dernière
   * activité ? Sans cette question, la passe de nuit renverrait la même
   * relance chaque jour du quatre-vingt-dixième au trois-cent-soixante-
   * cinquième — la façon la plus sûre de se faire filtrer, et la même
   * raison qui a donné `Deadline.remindedAt` aux rappels d'échéance.
   */
  dejaRelance: boolean;
}

/**
 * Ce qu'il faut faire de ce brouillon aujourd'hui.
 *
 * L'abandon passe **avant** la relance : un dossier que personne n'a
 * touché depuis treize mois n'a pas à recevoir un avertissement pour ce
 * qui lui arrive le jour même. Le cas se produit à la première passe
 * après la mise en service, sur tout le stock accumulé — et c'est
 * précisément là que l'ordre compte.
 */
export function suiteDInactivite(etat: EtatDInactivite): SuiteDInactivite {
  if (etat.inactifDepuis >= ABANDON_JOURS) return "ABANDONNER";
  if (etat.inactifDepuis >= RELANCE_JOURS && !etat.dejaRelance) return "RELANCER";
  return "RIEN";
}

/**
 * Le jour où ce dossier sera clos si rien ne bouge — annoncé, jamais
 * deviné.
 *
 * Un message d'échéance sans date apprend au candidat qu'il a « du
 * temps », ce qui n'est pas une information. Il en a jusqu'à un jour
 * précis, et c'est celui-là qui se dit.
 */
export const jourDeLAbandon = (derniereActivite: Date): Date =>
  new Date(derniereActivite.getTime() + ABANDON_JOURS * 24 * 60 * 60 * 1000);

/** Jours pleins écoulés, en UTC : une relance ne change pas de jour selon le fuseau. */
export function joursDInactivite(derniereActivite: Date, maintenant: Date): number {
  const jour = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((jour(maintenant) - jour(derniereActivite)) / (24 * 60 * 60 * 1000));
}

const DATE_LISIBLE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface Relance {
  titre: string;
  corps: string;
  /** Objet du courrier. Distinct du titre : une boîte mail n'a pas de contexte. */
  objet: string;
}

/**
 * La relance du quatre-vingt-dixième jour.
 *
 * Elle est **actionnable** : elle dit ce qui existe déjà, ce qui manque,
 * la date à laquelle le dossier sera clos, et ce qu'il faut faire pour
 * que ça n'arrive pas. « Ton dossier est inactif » seul n'apprend rien à
 * quelqu'un qui le sait déjà.
 *
 * Elle ne reproche rien. Quelqu'un qui n'a pas ouvert son dossier depuis
 * trois mois a le plus souvent une raison — un financement qui n'est pas
 * réuni, une rentrée repoussée. La phrase laisse la place à ces deux
 * situations, et dit que reprendre ne coûte rien.
 */
export function relanceDeBrouillon(
  destination: string,
  derniereActivite: Date,
  piecesDeposees: number,
): Relance {
  const echeance = DATE_LISIBLE.format(jourDeLAbandon(derniereActivite));
  const acquis =
    piecesDeposees > 0
      ? `Les ${piecesDeposees} pièces que tu as déjà déposées sont toujours là.`
      : "Tu n'as encore déposé aucune pièce.";
  return {
    titre: `Ton dossier ${destination} est en attente`,
    objet: `Ton dossier ${destination} sera clos le ${echeance}`,
    corps: `Tu n'as rien ajouté à ton dossier ${destination} depuis trois mois. ${acquis}

Sans reprise de ta part, il sera clos le ${echeance} et ses pièces supprimées. Déposer une pièce suffit à le garder ouvert.

Si ton projet est reporté, tu peux le laisser : rien ne se perd avant cette date.`,
  };
}

export interface Abandon {
  titre: string;
  corps: string;
}

/**
 * Ce que le candidat lit quand le dossier a été clos.
 *
 * La clôture est dite au passé et sans détour — elle a eu lieu. Le
 * message dit aussi la seule chose qui lui reste à décider : rouvrir un
 * dossier, et que ses pièces sont en cours de suppression, parce qu'INV-5
 * ne laisse pas des pièces d'identité derrière un dossier clos.
 */
export function abandonDeBrouillon(destination: string, purgeJours: number): Abandon {
  return {
    titre: `Ton dossier ${destination} a été clos`,
    corps: `Sans activité depuis douze mois, ton dossier ${destination} a été clos. Ses pièces sont supprimées de nos serveurs sous ${purgeJours} jours.

Tu peux ouvrir un nouveau dossier quand tu veux : la checklist repart de la règle en vigueur ce jour-là.`,
  };
}
