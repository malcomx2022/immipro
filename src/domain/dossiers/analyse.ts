import type { DocumentState } from "@/domain/completeness/score";
import type { BlocDExigences } from "@/domain/dossiers/verification";
import type { Mention } from "@/domain/destinations/fiche";

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
  /**
   * Ce que la règle demande de cette pièce — et non ce qu'on a lu dedans.
   *
   * C'était un `ChampLu` de plus, ajouté à la suite de `champs` par
   * l'écran, donc affiché sous « Ce que nous avons lu » : une exigence
   * n'est pas une lecture, et une exigence absente s'y rendait « non lue »
   * — le mot qui, partout ailleurs, dit que la pièce du candidat était
   * illisible sur ce point.
   *
   * Vide quand la règle n'attache aucun seuil à la pièce. C'est un état
   * normal, que `SANS_EXIGENCE_CHIFFREE` nomme.
   */
  exigences: readonly BlocDExigences[];
  /**
   * Source et date de vérification de la règle citée — INV-8.
   *
   * Nulle quand la règle figée ne se relit plus : rien n'est alors cité,
   * donc rien n'a de source à porter.
   */
  mention: Mention | null;
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
