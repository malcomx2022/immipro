/**
 * Ce qu'une offre de partenaire doit dire — T-06, WF-13.
 *
 * **K.A, tranché le 20/09/2026.** L'offre ne s'affiche plus dans l'espace
 * dossier : elle vit sur une surface dédiée, où le candidat vient la
 * chercher. Ce module ne bouge pas pour autant — les trois règles qu'il
 * porte tenaient à la nature de l'offre, pas à l'écran qui la montrait :
 *
 * 1. Le motif est nommé. « Ton dossier demande une assurance maladie » dit
 *    à quoi l'offre se rapporte ; sans lui, elle se lit comme une réclame.
 * 2. La commission est annoncée dans l'écran, pas dans les conditions
 *    générales. Une recommandation rémunérée non déclarée est un conflit
 *    d'intérêts, quel que soit le sérieux du partenaire.
 * 3. Refuser ne coûte rien, et l'écran le dit. Ce qui a disparu, c'est le
 *    bouton pour refuser : on ne décline pas ce qui n'est pas proposé.
 *
 * Ce qui est parti d'ici avec la décision : les trois issues de l'ancien
 * écran, et le libellé du tarif de consultation. Une consultation se
 * réserve dans l'annuaire, qui écrit son propre tarif.
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
