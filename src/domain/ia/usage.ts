/**
 * Ce qu'un fournisseur dit avoir consommé — INV-6, D1, REV11-L2 (S.173).
 *
 * ── Une mesure inconnue n'est pas une consommation nulle ────────────
 *
 * Les adaptateurs lisaient les compteurs de jetons ainsi : un nombre fini
 * passait tel quel, tout le reste valait zéro. Trois défauts en sortaient,
 * reproduits par le diagnostic du 11/10 :
 *
 * - DIA-01 : une réponse **sans** mesure devenait une lecture à 0/0 —
 *   gratuite en apparence, et absente de B-07, puisque l'écriture ignore
 *   un appel à 0/0 ;
 * - DIA-02 : des compteurs **négatifs ou fractionnaires** partaient tels
 *   quels vers des colonnes entières, et l'écriture échouait en SQL après
 *   l'appel — le job se rejouait, et l'appel se payait deux fois ;
 * - DIA-03 : une enveloppe sans contenu exploitable perdait les jetons
 *   qu'elle annonçait, alors que le fournisseur les avait facturés.
 *
 * Ici, chaque compteur est lu pour ce qu'il est : **connu** (un entier
 * positif ou nul, qui tient dans une colonne entière), **absent**, ou
 * **invalide**. Rien n'est arrondi, borné ni remplacé.
 *
 * ── Ce qui en découle — arbitrage du 11/10 ───────────────────────────
 *
 * - Une mesure absente ne bloque rien : la réponse est publiée, l'appel
 *   est inscrit avec un usage inconnu, et B-07 demande un rapprochement
 *   avec la facture du fournisseur. Le quota, lui, se compte en analyses
 *   (D1) : il ne dépend pas de la mesure.
 * - Une mesure **invalide** rend l'enveloppe non conforme : une réponse
 *   qui contredit son propre protocole ne fait pas foi pour le reste. Elle
 *   finit en `reponse_illisible`, qui ne se rejoue pas — aucun appel payé
 *   deux fois —, et la part connue de la mesure est conservée.
 *
 * Domaine pur : ni SDK, ni Prisma. Les adaptateurs y passent les valeurs
 * brutes, le grand livre y lit l'état qu'il inscrit.
 */

/** Le plus grand entier d'une colonne `INTEGER` PostgreSQL. */
export const COMPTEUR_MAXIMUM = 2_147_483_647;

/** Un compteur de jetons, tel que le fournisseur l'a transmis. */
export type Compteur =
  | { etat: "connu"; valeur: number }
  | { etat: "absent" }
  | { etat: "invalide" };

/**
 * Lit un compteur. `undefined` et `null` sont une absence : JSON n'a pas
 * d'autre façon de dire qu'un champ manque. Tout le reste doit être un
 * entier positif ou nul qui tient dans une colonne entière ; une chaîne
 * `"120"` est invalide, pas convertie.
 */
export function lireUnCompteur(valeur: unknown): Compteur {
  if (valeur === undefined || valeur === null) return { etat: "absent" };
  if (
    typeof valeur === "number" &&
    Number.isSafeInteger(valeur) &&
    valeur >= 0 &&
    valeur <= COMPTEUR_MAXIMUM
  ) {
    return { etat: "connu", valeur };
  }
  return { etat: "invalide" };
}

/**
 * Les jetons d'un appel. `null` dit qu'un compteur n'est pas connu —
 * jamais zéro, qui serait une mesure.
 */
export interface JetonsLus {
  entree: number | null;
  sortie: number | null;
  /** Un compteur était présent mais invalide : l'enveloppe n'est pas conforme. */
  invalide: boolean;
}

/** Lit les deux compteurs d'une réponse, quelle que soit leur forme. */
export function lireLesJetons(entree: unknown, sortie: unknown): JetonsLus {
  const e = lireUnCompteur(entree);
  const s = lireUnCompteur(sortie);
  return {
    entree: e.etat === "connu" ? e.valeur : null,
    sortie: s.etat === "connu" ? s.valeur : null,
    invalide: e.etat === "invalide" || s.etat === "invalide",
  };
}

/** Ce que la cause d'échec dit d'une mesure invalide, pour le journal d'exploitation. */
export const DETAIL_MESURE_INVALIDE =
  "la mesure de consommation transmise n'est pas un nombre entier de jetons : la réponse n'est pas retenue, et le fournisseur est à vérifier";

/**
 * L'état d'une mesure, tel que le grand livre l'inscrit — `MesureDUsage`
 * dans le schéma. Une ligne antérieure à S.173 n'en a pas : elle reste
 * nulle, non qualifiée, et rien ne la réécrit.
 */
export const ETATS_DE_MESURE = ["MESUREE", "ENTREE_SEULE", "SORTIE_SEULE", "INCONNUE"] as const;
export type EtatDeMesure = (typeof ETATS_DE_MESURE)[number];

export function etatDeMesure(entree: number | null, sortie: number | null): EtatDeMesure {
  if (entree !== null && sortie !== null) return "MESUREE";
  if (entree !== null) return "ENTREE_SEULE";
  if (sortie !== null) return "SORTIE_SEULE";
  return "INCONNUE";
}

/** La mesure est-elle complète ? Une ligne antérieure (`null`) n'est pas qualifiée. */
export const mesureComplete = (etat: EtatDeMesure | null): boolean => etat === "MESUREE";

/** La mesure est-elle connue pour être incomplète ? Ce que B-07 demande de rapprocher. */
export const mesureARapprocher = (etat: EtatDeMesure | null): boolean =>
  etat !== null && etat !== "MESUREE";

/**
 * Ce que les colonnes entières du grand livre portent : la part connue, et
 * zéro pour la part qui ne l'est pas. Ce zéro n'est **pas** une mesure —
 * l'état inscrit à côté le dit, et c'est lui que lisent B-07 et l'export.
 */
export const partConnue = (jetons: number | null): number => jetons ?? 0;

/** Les jetons d'une ligne du grand livre, relus avec leur état : `null` pour une part inconnue. */
export function jetonsDeLaLigne(
  etat: EtatDeMesure | null,
  entree: number,
  sortie: number,
): { entree: number | null; sortie: number | null } {
  switch (etat) {
    case "ENTREE_SEULE":
      return { entree, sortie: null };
    case "SORTIE_SEULE":
      return { entree: null, sortie };
    case "INCONNUE":
      return { entree: null, sortie: null };
    default:
      // Mesurée, ou antérieure à S.173 : les colonnes sont relues telles quelles.
      return { entree, sortie };
  }
}

/** Ce que B-07 dit des appels à rapprocher — S.173. */
export function phraseDesAppelsARapprocher(appels: number): string {
  return appels === 1
    ? "1 appel n'a pas reçu de mesure complète de ses jetons : les jetons et les coûts affichés n'en comptent que la part mesurée."
    : `${appels} appels n'ont pas reçu de mesure complète de leurs jetons : les jetons et les coûts affichés n'en comptent que la part mesurée.`;
}

export const COMMENT_RAPPROCHER =
  "Rapprocher ces appels de la facture du fournisseur, et vérifier qu'il transmet l'usage de chaque réponse. Le quota des candidats se compte en analyses : il n'en dépend pas.";
