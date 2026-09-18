import type { DocumentState } from "@/domain/completeness/score";

/**
 * Résultat d'analyse d'une pièce — C-08, WF-06.
 *
 * Trois verdicts seulement remontent au candidat, et aucun ne s'arrête au
 * constat : chaque message finit par ce qu'il y a à faire. « Non conforme »
 * seul est interdit (§3.5, RG-06.3).
 *
 * La lecture automatique est affichée champ par champ, avec la valeur exigée
 * en regard : c'est ce qui permet au candidat de repérer une erreur de
 * lecture, et donc de la signaler. Une analyse qui ne montre pas ce qu'elle a
 * lu ne se conteste pas.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type VerdictAnalyse = Extract<
  DocumentState,
  "CONFORME" | "A_CORRIGER" | "ILLISIBLE"
>;

/** Une ligne de la lecture automatique : ce qui a été lu, et ce qui est exigé. */
export interface ChampLu {
  intitule: string;
  /** Valeur lue. `null` quand la pièce est illisible sur ce champ. */
  valeur: string | null;
}

export interface ResultatAnalyse {
  verdict: VerdictAnalyse;
  /** Nom du fichier analysé, tel que déposé. */
  fichier: string;
  /** Horodatage de l'analyse, ISO. */
  analyseeLe: string;
  pages: number;
  /** Titre du verdict : il porte la mesure, pas l'étiquette. */
  titre: string;
  /** Constat puis action, en une à trois phrases. */
  corps: string;
  champs: readonly ChampLu[];
  /** Exigence de la règle, affichée en regard de la lecture. */
  exigence: ChampLu;
}

/** Valeur affichée d'un champ non lu. Jamais une case vide : le vide se lit comme zéro. */
export const VALEUR_NON_LUE = "non lue";

export const valeurAffichee = (champ: ChampLu): string => champ.valeur ?? VALEUR_NON_LUE;

/**
 * Libellé du bouton principal. L'illisible renvoie à la prise de vue, le
 * reste au remplacement : ce ne sont pas les mêmes gestes.
 */
export function libelleSuite(verdict: VerdictAnalyse): string {
  switch (verdict) {
    case "CONFORME":
      return "Revenir à la checklist";
    case "A_CORRIGER":
      return "Téléverser une autre version";
    case "ILLISIBLE":
      return "Reprendre la photo";
  }
}

/**
 * Une reprise après illisible ne consomme pas d'analyse.
 *
 * C'est une règle de justice, pas une faveur : le quota se décompte d'une
 * lecture rendue, et une pièce déclarée illisible n'a rien rendu. Sans elle,
 * une photo mal éclairée coûte au candidat deux analyses pour un seul
 * document, et il le comprend comme une pénalité.
 */
export const consommeUneAnalyse = (verdictPrecedent: VerdictAnalyse | null): boolean =>
  verdictPrecedent !== "ILLISIBLE";

/** Mention de pied de C-08, sous le bouton. Elle dit ce que coûte la suite. */
export function mentionSuite(
  verdict: VerdictAnalyse,
  quota: { restantes: number; total: number },
): string {
  if (verdict === "ILLISIBLE") return "Cette reprise ne consomme pas d'analyse";
  return `Analyses restantes : ${quota.restantes} sur ${quota.total}`;
}

/**
 * Réserve obligatoire sous toute lecture automatique. Elle ouvre le recours
 * humain : sans lui, une erreur de lecture devient une décision sans appel.
 */
export const RESERVE_LECTURE =
  "Lecture automatique, susceptible d'erreur. Si une valeur est fausse, signale-le : nous faisons relire la pièce par un humain.";

/**
 * Portée de l'analyse. Elle dit ce qu'ImmiPro vérifie — la forme de la pièce
 * — et ce qu'elle ne vérifie pas (INV-1).
 */
export const PORTEE_ANALYSE =
  "Cette analyse est automatique et porte sur la forme de la pièce. Elle ne vaut pas décision consulaire.";
