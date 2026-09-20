/**
 * Proposition d'un consultant partenaire — T-03, WF-13.
 *
 * L'écran s'ouvre quand le dossier dépasse ce que la plateforme sait faire.
 * Trois règles le tiennent, et aucune n'est négociable :
 *
 * 1. Le motif est nommé. « Tu as déclaré un refus de visa Schengen en 2024 »
 *    dit pourquoi la proposition arrive maintenant ; sans lui, elle se lit
 *    comme une réclame déclenchée au hasard.
 * 2. La commission est annoncée dans l'écran, pas dans les conditions
 *    générales. Une recommandation rémunérée non déclarée est un conflit
 *    d'intérêts, quel que soit le sérieux du partenaire.
 * 3. Refuser ne coûte rien, et l'écran le dit. Une proposition qu'on ne peut
 *    pas décliner sans crainte n'est pas une proposition.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Partenaire {
  id: string;
  nom: string;
  ville: string;
  /** Mention d'agrément et ancienneté : « agréé, 9 ans d'exercice ». */
  qualification: string;
  /** Destinations sur lesquelles le partenaire est habilité (cf. `access.ts`). */
  destinations: readonly string[];
}

/** Ce qui déclenche la proposition. Toujours une situation déclarée, jamais un profil deviné. */
export interface MotifProposition {
  /** Situation déclarée par le candidat, telle qu'il l'a saisie. */
  constat: string;
  /** Pourquoi elle dépasse ce que la plateforme sait faire. */
  raison: string;
}

/**
 * Engagements affichés sous la proposition. Ils portent sur ce que la
 * plateforme ne fera pas : c'est la seule forme d'engagement vérifiable par
 * qui lit l'écran.
 */
export const ENGAGEMENTS: readonly string[] = [
  "Nous ne transmettons aucune pièce sans ton accord explicite.",
  "Refuser ne change rien à ton dossier ni à ton pack.",
];

/**
 * Vaut pour tout partenaire, quel qu'il soit (INV-1). Qui répond de la
 * prestation dépend en revanche du partenaire, et cette seconde phrase vit
 * dans `domain/partenaires/affiliation` : sous un courtier en assurance,
 * « les consultants partenaires » ne désignait personne.
 */
export const MENTION_INDEPENDANCE = "ImmiPro n'est pas un cabinet de conseil en immigration.";

/**
 * Les trois issues de l'écran. Le refus définitif en est une, et il se
 * respecte.
 *
 * Leurs libellés vivent dans `domain/partenaires/affiliation` : le même
 * écran propose un consultant ou un courtier, et « continuer sans
 * consultant » ne voulait rien dire sous le second.
 */
export type SuiteProposition = "CRENEAUX" | "CONTINUER_SEUL" | "NE_PLUS_PROPOSER";

/**
 * Une proposition refusée définitivement ne revient pas, quelle que soit la
 * situation déclarée ensuite. Sans cette règle, « ne plus me proposer » ne
 * vaut que jusqu'au prochain déclencheur, et la promesse est fausse.
 */
export const peutProposer = (refusDefinitif: boolean): boolean => !refusDefinitif;

/** « Premier entretien : 20 000 F, 45 minutes » — montant et durée viennent de la grille. */
export const libelleOffre = (prixFormate: string, dureeMinutes: number): string =>
  `Premier entretien : ${prixFormate}, ${dureeMinutes} minutes`;
