/**
 * Clôture du dossier — C-11, WF-10.
 *
 * La purge est annoncée comme une garantie, pas comme une perte : c'est
 * l'engagement d'INV-5 rendu visible au moment où il se déclenche. L'écran
 * dit donc ce qui part, ce qui reste, et ce qu'il faut faire avant.
 *
 * L'issue déclarée sert à corriger les checklists. Elle n'est jamais
 * présentée comme une statistique de réussite : ce que la plateforme en
 * retient, c'est ce qui a bloqué, pas combien de dossiers ont abouti.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type IssueDemarche = "OBTENU" | "REFUS" | "ABANDON" | "AUTRE";

export interface OptionIssue {
  cle: IssueDemarche;
  libelle: string;
}

export const ISSUES: readonly OptionIssue[] = [
  { cle: "OBTENU", libelle: "J'ai obtenu mon visa" },
  { cle: "REFUS", libelle: "Ma demande a été refusée" },
  { cle: "ABANDON", libelle: "J'ai abandonné la démarche" },
  { cle: "AUTRE", libelle: "Autre situation" },
];

/**
 * Le détail n'est demandé que là où il apprend quelque chose. Après un visa
 * obtenu, la checklist a tenu : rien à corriger, donc rien à demander.
 */
export const demandeUnDetail = (issue: IssueDemarche): boolean => issue !== "OBTENU";

/**
 * La question posée sous l'issue. Elle est différente à chaque fois : « Des
 * précisions ? » ne fait écrire personne, « Quel motif de refus a été
 * indiqué ? » fait recopier la lettre du consulat.
 */
export function libelleDetail(issue: IssueDemarche): string {
  switch (issue) {
    case "REFUS":
      return "Quel motif de refus a été indiqué ?";
    case "ABANDON":
      return "Qu'est-ce qui t'a arrêté ?";
    default:
      return "Précise ta situation";
  }
}

export const AIDE_DETAIL = "Optionnel. C'est ce champ qui nous aide le plus.";

/** Délai de purge des pièces après la clôture (INV-5). */
export const PURGE_JOURS = 30;

const PHRASE_PURGE = `Tes pièces seront supprimées sous ${PURGE_JOURS} jours.`;

/** Mention de pied, sous le bouton de clôture. */
export const mentionCloture = (issue: IssueDemarche): string =>
  issue === "OBTENU" ? `Félicitations. ${PHRASE_PURGE}` : PHRASE_PURGE;

/**
 * Ce qui se passe à la clôture, dans l'ordre où cela concerne le candidat :
 * ce qui disparaît, ce qu'il peut sauver, ce qui reste malgré lui.
 */
export const EFFETS_CLOTURE: readonly string[] = [
  `Tes pièces sont supprimées de nos serveurs sous ${PURGE_JOURS} jours : passeport, relevés, diplômes, tout.`,
  "Tu peux télécharger l'ensemble de ton dossier avant la suppression.",
  "Ton compte et tes reçus de paiement restent, pour l'obligation comptable.",
];

export const AVERTISSEMENT_IRREVERSIBLE =
  "La suppression est définitive. Si tu redéposes une demande plus tard, il faudra téléverser tes pièces à nouveau.";
