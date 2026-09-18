import { SEUIL_MARGE_IA } from "@/domain/payments/pricing";

/**
 * Supervision des coûts IA — B-07, WF-16.
 *
 * Écran livré en état vide, et c'est une décision, pas un manque : tant que
 * dix dossiers réels n'ont pas alimenté `AiUsage`, aucune valeur n'est
 * affichée. Un chiffre posé ici serait repris comme une spécification, puis
 * comme un budget, puis comme un prix — c'est déjà ce qui s'est passé avec
 * les quotas de tokens des packs.
 *
 * Ce que l'écran affiche donc : le nom exact de chaque métrique, sa source
 * de calcul, et les garde-fous exprimés en ratio — un ratio reste vrai quel
 * que soit le coût réel.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Metrique {
  cle: string;
  libelle: string;
  /** D'où viendra la valeur. Affiché sous la métrique, à la place du chiffre. */
  source: string;
  /** Valeur mesurée. `null` tant qu'aucune mesure n'existe. */
  valeur: string | null;
}

export const METRIQUES: readonly Metrique[] = [
  {
    cle: "depense-mois",
    libelle: "Dépensé ce mois",
    source: "somme de AiUsage.costXof sur la période",
    valeur: null,
  },
  {
    cle: "cout-par-dossier",
    libelle: "Coût IA par dossier payant",
    source: "indicateur qui conditionne la grille tarifaire",
    valeur: null,
  },
  {
    cle: "analyses",
    libelle: "Analyses exécutées",
    source: "dont reprises non décomptées au candidat",
    valeur: null,
  },
  {
    cle: "part-du-pack",
    libelle: "Part du prix du pack",
    source: "seuil d'alerte fixé par RG-16.1",
    valeur: null,
  },
];

export const aucuneMesure = (metriques: readonly Metrique[]): boolean =>
  metriques.every((m) => m.valeur === null);

export interface GardeFou {
  libelle: string;
  /** Le seuil, exprimé en ratio ou en règle — jamais en montant. */
  seuil: string;
  /** Ce qui se passe au-delà. Un seuil sans conséquence n'est pas un garde-fou. */
  consequence: string;
}

/** Plafond quotidien : au-delà, la file bascule en revue humaine (WF-16). */
export const FACTEUR_PLAFOND_QUOTIDIEN = 3;
export const JOURS_MEDIANE = 7;
/** Alerte à l'équipe produit avant d'atteindre le budget. */
export const SEUIL_ALERTE_BUDGET = 0.8;

const enPourcent = (ratio: number) =>
  new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(
    ratio,
  );

export const GARDE_FOUS: readonly GardeFou[] = [
  {
    libelle: "Coût IA par dossier",
    seuil: `${enPourcent(SEUIL_MARGE_IA)} du prix du pack`,
    consequence: "au-delà, le pack est vendu trop bas (RG-16.1)",
  },
  {
    libelle: "Plafond quotidien",
    seuil: `${FACTEUR_PLAFOND_QUOTIDIEN} × la médiane des ${JOURS_MEDIANE} derniers jours`,
    consequence: "au-delà, la file passe en revue humaine",
  },
  {
    libelle: "Alerte de dépassement",
    seuil: `${enPourcent(SEUIL_ALERTE_BUDGET)} du budget`,
    consequence: "email à l'équipe produit",
  },
];

/**
 * Médiane des sept derniers jours, base du plafond quotidien. Elle résiste à
 * une journée exceptionnelle là où une moyenne la laisserait relever le
 * plafond — c'est tout l'intérêt de prendre la médiane.
 */
export function medianeQuotidienne(depenses: readonly number[]): number | null {
  if (depenses.length === 0) return null;
  const triees = [...depenses].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? triees[milieu]!
    : (triees[milieu - 1]! + triees[milieu]!) / 2;
}

export function plafondQuotidien(depenses: readonly number[]): number | null {
  const mediane = medianeQuotidienne(depenses.slice(-JOURS_MEDIANE));
  return mediane === null ? null : mediane * FACTEUR_PLAFOND_QUOTIDIEN;
}

export const MENTION_ETAT_VIDE =
  "L'histogramme se remplit dès la première écriture dans AiUsage. Un jour sans appel reste affiché à zéro, pas masqué.";

export const COMMENT_SE_REMPLIT =
  "Dix dossiers complets réels passés dans le pipeline, AiUsage enregistré à chaque appel. Une semaine suffit pour obtenir le coût moyen par type de pièce.";

export const POURQUOI_AUCUNE_VALEUR =
  "Tant que cette mesure n'existe pas, l'écran n'affiche aucune valeur : un chiffre posé ici serait repris comme une spécification.";

export const MENTION_SANS_DONNEE_CANDIDAT =
  "Aucune donnée de candidat n'apparaît sur cet écran : seuls les volumes et les coûts sont remontés.";
