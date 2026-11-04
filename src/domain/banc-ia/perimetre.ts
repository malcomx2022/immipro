/**
 * Ce que le banc ne présente pas au modèle, et pourquoi — S.213.
 *
 * ── Le constat ──────────────────────────────────────────────────────
 *
 * Le 28/10, L06 (attestation de bourse) a épuisé deux fois le délai de
 * lecture, et L14 (attestation de garant) une fois : trois 499 côté Google,
 * campagne arrêtée à chaque fois. L'examen local a écarté la consigne, le
 * format, le rendu et le montant sous le seuil. Seul point commun : ce
 * sont les deux seules preuves de ressources émises **par un tiers** qui
 * s'engage (une fondation, un garant), et non un relevé du titulaire.
 *
 * ── La règle ────────────────────────────────────────────────────────
 *
 * Décision du responsable (04/11) : sur le banc seul, une preuve de
 * ressources dont l'émetteur déclaré est un tiers est classée
 * `TIERS_HORS_PERIMETRE` **avant tout appel réseau** : ni réserve au
 * journal, ni appel, ni verdict. Elle n'est pas comptée comme une erreur
 * du modèle, ni comme un échec du fournisseur : elle n'a pas été lue.
 * Le produit ne connaît pas l'émetteur avant la lecture ; une déclaration
 * au dépôt serait un autre lot, à décider sur le résultat de L5.
 *
 * Tout ce qui se décide ici se décide sans IA (règle d'architecture 2) :
 * l'émetteur est déclaré dans le jeu d'essai, jamais deviné.
 *
 * Module pur : aucune dépendance à Prisma, Next, au réseau ou à un SDK.
 */
import type { CauseDAppel } from "@/domain/ia/appel";

/** Qui a émis la pièce, tel que le jeu d'essai le déclare. */
export type EmetteurDeLaPiece =
  /** Le candidat lui-même, ou sa banque sur son compte. */
  | "TITULAIRE"
  /** Un établissement, un employeur, un assureur, une autorité. */
  | "ORGANISME"
  /** Un tiers qui s'engage pour le candidat : fondation, garant. */
  | "TIERS";

/** Les lignes de checklist qui prouvent des ressources. */
export const PIECES_DE_RESSOURCES: ReadonlySet<string> = new Set(["preuve_fonds"]);

export const MOTIF_TIERS_HORS_PERIMETRE =
  "preuve de ressources émise par un tiers (fondation, garant) : hors du périmètre du banc depuis S.213, après trois lectures abandonnées par délai le 28/10 ; aucune réserve, aucun appel";

export type ClassementAvantAppel =
  | { classe: "A_LIRE" }
  | { classe: "TIERS_HORS_PERIMETRE"; motif: string };

/** Le classement d'une pièce, avant la moindre réserve ou le moindre octet envoyé. */
export function classerAvantAppel(cas: {
  codeAttendu: string;
  emetteurDeLaPiece?: EmetteurDeLaPiece;
}): ClassementAvantAppel {
  return cas.emetteurDeLaPiece === "TIERS" && PIECES_DE_RESSOURCES.has(cas.codeAttendu)
    ? { classe: "TIERS_HORS_PERIMETRE", motif: MOTIF_TIERS_HORS_PERIMETRE }
    : { classe: "A_LIRE" };
}

/** Sépare les pièces à lire de celles écartées, dans l'ordre du jeu. */
export function partagerLesLectures<T extends { id: string; codeAttendu: string; emetteurDeLaPiece?: EmetteurDeLaPiece }>(
  cas: readonly T[],
): { aLire: T[]; horsPerimetre: { id: string; motif: string }[] } {
  const aLire: T[] = [];
  const horsPerimetre: { id: string; motif: string }[] = [];
  for (const c of cas) {
    const classement = classerAvantAppel(c);
    if (classement.classe === "A_LIRE") aLire.push(c);
    else horsPerimetre.push({ id: c.id, motif: classement.motif });
  }
  return { aLire, horsPerimetre };
}

/**
 * Ce qu'un appel non abouti dit du fournisseur — S.213.
 *
 * - `ECHEC_FOURNISSEUR` : le service n'a pas répondu, trop tard, ou faute
 *   de capacité. Ni la pièce ni le modèle ne sont jugés ; la mesure est à
 *   rapprocher de la console avant toute reprise (S.201).
 * - `CONFIGURATION` : clé, adresse ou modèle refusés. Rien à rapprocher,
 *   tout à corriger avant de relancer.
 * - `LECTURE` : le service a répondu, mais refusé ou rendu une réponse
 *   hors schéma. C'est une issue de la lecture, notée comme telle.
 */
export type IssueDUnEchec = "ECHEC_FOURNISSEUR" | "CONFIGURATION" | "LECTURE";

const DU_FOURNISSEUR: ReadonlySet<string> = new Set<CauseDAppel>(["injoignable", "delai_depasse", "service_sature"]);

export function issueDUnEchec(cause: string): IssueDUnEchec {
  if (DU_FOURNISSEUR.has(cause)) return "ECHEC_FOURNISSEUR";
  if (cause === "non_configure") return "CONFIGURATION";
  return "LECTURE";
}

export const CONSIGNE_ECHEC_FOURNISSEUR =
  "échec du fournisseur : rapprocher la requête dans la console (code, minute, jetons) avec `npm run banc:ia:rapprocher` avant toute reprise ; ne pas allonger le délai pour la faire passer";
