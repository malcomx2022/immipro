/**
 * Veille réglementaire — B-01, WF-14.
 *
 * Deux règles tiennent cet écran, et toutes deux sont des refus d'automatisme.
 *
 * **RG-14.3 : rien n'est dépublié automatiquement.** Une source muette ne
 * vaut pas un changement de règle. La ligne garde sa place et la date de sa
 * dernière collecte réussie, les candidats continuent de voir la règle
 * publiée, et c'est un opérateur humain qui décide de la retirer.
 *
 * **Une file vide est un état normal.** La date du dernier relevé le prouve,
 * et l'écran l'affiche : sans elle, une file vide se lit comme une panne de
 * collecte.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import type { NiveauSource } from "./regle";

export type StatutFiche = "PUBLIE" | "BROUILLON" | "ARCHIVE";

export const LIBELLE_STATUT_FICHE: Record<StatutFiche, string> = {
  PUBLIE: "Publié",
  BROUILLON: "Brouillon",
  ARCHIVE: "Archivé",
};

export interface FicheSuivie {
  id: string;
  /** Code pays à deux lettres, en pastille monospace. */
  code: string;
  pays: string;
  procedure: string;
  niveauSource: NiveauSource;
  source: string;
  /** Dernière vérification réussie, ISO. */
  verifieeLe: string;
  /** Échéance de relecture programmée, ISO. */
  relectureLe: string;
  version: number;
  statut: StatutFiche;
  /** Écart constaté à la dernière collecte, quand il y en a un. */
  ecart?: string;
}

export type FiltreVeille = "EN_RETARD" | "TOUTES" | "OFFICIEL" | "BROUILLON";

export const LIBELLE_FILTRE_VEILLE: Record<FiltreVeille, string> = {
  EN_RETARD: "En retard",
  TOUTES: "Toutes",
  OFFICIEL: "Officiel",
  BROUILLON: "Brouillon",
};

export const FILTRES_VEILLE: readonly FiltreVeille[] = [
  "EN_RETARD",
  "TOUTES",
  "OFFICIEL",
  "BROUILLON",
];

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const jour = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a!, m! - 1, j!);
};

export const joursDeRetard = (fiche: FicheSuivie, aujourdhui: string): number =>
  Math.round((jour(aujourdhui) - jour(fiche.relectureLe)) / MS_PAR_JOUR);

export const enRetard = (fiche: FicheSuivie, aujourdhui: string): boolean =>
  joursDeRetard(fiche, aujourdhui) > 0;

/** « En retard de 3 j » ou « Dans 90 j » — l'écart, jamais la seule date. */
export function libelleRelecture(fiche: FicheSuivie, aujourdhui: string): string {
  const retard = joursDeRetard(fiche, aujourdhui);
  if (retard > 0) return `En retard de ${retard} j`;
  if (retard === 0) return "À relire aujourd'hui";
  return `Dans ${-retard} j`;
}

/** Le plus en retard d'abord : c'est l'ordre du travail, pas l'ordre alphabétique. */
export function trierParEcheance(
  fiches: readonly FicheSuivie[],
  aujourdhui: string,
): FicheSuivie[] {
  return [...fiches].sort(
    (a, b) => joursDeRetard(b, aujourdhui) - joursDeRetard(a, aujourdhui),
  );
}

export function filtrerVeille(
  fiches: readonly FicheSuivie[],
  filtre: FiltreVeille,
  recherche: string,
  aujourdhui: string,
): FicheSuivie[] {
  const q = recherche.trim().toLowerCase();
  return trierParEcheance(fiches, aujourdhui).filter((f) => {
    if (filtre === "EN_RETARD" && !enRetard(f, aujourdhui)) return false;
    if (filtre === "OFFICIEL" && f.niveauSource !== "OFFICIEL") return false;
    if (filtre === "BROUILLON" && f.statut !== "BROUILLON") return false;
    if (q && !`${f.pays} ${f.procedure} ${f.source}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

/** « 42 fiches suivies · 5 en retard de relecture · 3 écarts détectés ». */
export function resumeVeille(
  fiches: readonly FicheSuivie[],
  aujourdhui: string,
): string {
  const retard = fiches.filter((f) => enRetard(f, aujourdhui)).length;
  const ecarts = fiches.filter((f) => f.ecart).length;
  return [
    `${fiches.length} ${fiches.length > 1 ? "fiches suivies" : "fiche suivie"}`,
    `${retard} en retard de relecture`,
    `${ecarts} ${ecarts > 1 ? "écarts détectés" : "écart détecté"}`,
  ].join(" · ");
}

/**
 * État d'une source à la dernière collecte. `PERIME` ne veut pas dire que la
 * règle a changé : il dit qu'on ne sait plus, et la règle publiée reste
 * publiée (RG-14.3).
 */
export type EtatSource = "A_JOUR" | "A_ARBITRER" | "PERIME";

export const LIBELLE_ETAT_SOURCE: Record<EtatSource, string> = {
  A_JOUR: "À jour",
  A_ARBITRER: "À arbitrer",
  PERIME: "Périmé",
};

export interface Collecte {
  /** Sources interrogées et sources qui ont répondu. */
  sources: number;
  relevees: number;
  /** Horodatage de la collecte, ISO. */
  faiteLe: string;
  /** Prochaine collecte programmée, ISO. */
  prochaineLe: string;
  /** Source muette, le cas échéant, et sa dernière collecte réussie. */
  injoignable?: { source: string; derniereReussite: string; tentatives: number };
}

export const collecteComplete = (collecte: Collecte): boolean =>
  collecte.relevees === collecte.sources;

/**
 * Ce que l'écran annonce en tête. Une collecte partielle le dit avec le
 * compte exact : « 13 sources sur 14 » se vérifie, « collecte partielle »
 * non.
 */
export function resumeCollecte(collecte: Collecte, formaterMoment: (iso: string) => string): string {
  return collecteComplete(collecte)
    ? `${collecte.sources} sources suivies · dernière collecte ${formaterMoment(collecte.faiteLe)}`
    : `${collecte.relevees} sources sur ${collecte.sources} relevées ${formaterMoment(collecte.faiteLe)}`;
}

/**
 * Message d'incident. Il dit ce qui continue de fonctionner avant ce qui est
 * cassé : l'opérateur a besoin de savoir que les candidats ne voient rien
 * d'erroné, pas seulement qu'une source est muette.
 */
export function messageSourceInjoignable(
  collecte: Collecte,
  formaterMoment: (iso: string) => string,
): string | null {
  if (!collecte.injoignable) return null;
  const { source, derniereReussite, tentatives } = collecte.injoignable;
  return `${source} n'a pas répondu, après ${tentatives} tentatives. Les règles affichées datent de la dernière collecte réussie, ${formaterMoment(derniereReussite)}. Elles restent publiées et les candidats continuent de les voir : une source muette ne vaut pas un changement de règle.`;
}

export const MENTION_FILE_VIDE =
  "Une file vide est un état normal, pas une panne de collecte : la date du dernier relevé le prouve.";

export const MENTION_SANS_DEPUBLICATION =
  "Rien n'est dépublié automatiquement : la décision de retirer une règle appartient à l'opérateur (RG-14.3).";
