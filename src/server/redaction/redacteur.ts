import { FOURNISSEURS, fournisseurChoisi, manqueDuFournisseur } from "@/domain/ia/fournisseurs";
/**
 * La mise en forme et l'analyse critique — R-03 et R-04, WF-08.
 *
 * Branchées le 22/09/2026. Ce fichier ne porte plus que ce qui décide
 * **si** elles le sont : l'appel lui-même vit dans `adaptateur.ts`, et
 * les formes échangées dans `domain/redaction/commande.ts`.
 *
 * Les deux fonctions emploient la même clé et ne font pas le même
 * métier : se tromper sur un paragraphe est un défaut de rédaction, ne
 * pas voir une incohérence est un défaut de lecture. Le registre les
 * sépare déjà d'`extraction`, qui lit les pièces déposées.
 */
export type {
  Critique,
  Redaction,
  Redacteur,
  Relecture,
} from "./adaptateur";
export { CRITIQUE_NON_BRANCHEE, REDACTEUR_NON_BRANCHE } from "./adaptateur";
export type {
  CritiqueProduite,
  MatiereDeLaPiece,
  RemarqueProduite,
  TexteProduit,
} from "@/domain/redaction/commande";

/** La clé sans laquelle ni l'une ni l'autre ne tourne. */
/** Les variables du fournisseur par défaut ; celles du fournisseur choisi se lisent dans `domain/ia/fournisseurs.ts`. */
export const VARIABLES = FOURNISSEURS.anthropic.variables;

/**
 * La rédaction est-elle configurée ? Pour le fournisseur **choisi**
 * (`AI_FOURNISSEUR_REDACTION`, Anthropic par défaut) — S.94. Un
 * fournisseur inconnu ne l'est jamais.
 */
export const redactionConfiguree = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => {
  const choix = fournisseurChoisi(environnement, "redaction");
  return choix.connu && manqueDuFournisseur(environnement, choix.fournisseur) === null;
};
