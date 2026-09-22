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
export const VARIABLES = ["ANTHROPIC_API_KEY"];

/**
 * La clé est-elle posée ?
 *
 * **Ce n'est pas la question qu'un écran doit poser.** Une clé renseignée
 * dit que l'appel est possible, jamais qu'il a eu lieu — et R-04 s'en
 * servait pour décider s'il y avait un avis à montrer, ce qui faisait
 * lire « rien à reprendre » sur un texte que personne n'avait lu. Ce
 * qu'une version a reçu se constate sur la version (`critiquedAt`).
 *
 * Reste ce à quoi une configuration sert : savoir s'il faut proposer le
 * geste, et renseigner l'état de service.
 */
export const redactionConfiguree = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => VARIABLES.every((v) => (environnement[v] ?? "").trim() !== "");
