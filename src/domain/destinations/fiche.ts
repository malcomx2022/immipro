/**
 * Fiches destination — P-03, P-04, et les cartes de P-01.
 *
 * Le modèle de vue dérive du référentiel `visa_rules` : une fiche porte
 * toujours sa source et sa date de vérification (INV-8), et le type les rend
 * obligatoires. Une fiche sans source ne se construit pas.
 *
 * Rien ici ne classe par probabilité : le rang est celui d'une comparaison
 * d'exigences publiées, et les destinations écartées le sont sur un critère
 * nommé, pas sur un pronostic (INV-1).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Mention {
  /** Domaine de l'autorité ou du service : « ind.nl ». */
  source: string;
  /** Date de la dernière vérification, ISO. */
  verifieeLe: string;
  /** Date de la prochaine relecture programmée (WF-14). */
  relectureLe?: string;
  /** Intitulé complet de l'autorité, affiché en tête de fiche sur P-04. */
  autorite?: string;
}

/** Une ligne « intitulé / valeur » des tableaux de P-03 et P-04. */
export interface Repere {
  intitule: string;
  valeur: string;
}

export interface Reserve {
  texte: string;
  /** `attention` pour ce qui peut changer, `neutre` pour une précision. */
  ton: "attention" | "neutre";
}

export interface FicheDestination {
  slug: string;
  /** Code à deux lettres, affiché en pastille monospace. */
  code: string;
  pays: string;
  /** « Séjour études — permis VVR étudiant ». */
  intitule: string;
  /** Une phrase, affichée sous le pays sur P-03. */
  resume: string;
  /** Repères comparables d'une destination à l'autre, sur P-03. */
  reperes: readonly Repere[];
  /** Conditions détaillées de P-04. */
  conditions: readonly Repere[];
  travailEtudiant: string;
  apresDiplome: string;
  reserves: readonly Reserve[];
  /** Nombre de pièces de la checklist, annoncé dans la barre d'action de P-04. */
  piecesAReunir: number;
  mention: Mention;
}

/** Destination retirée du classement, avec le motif exact du retrait. */
export interface DestinationEcartee {
  code: string;
  pays: string;
  /** Le motif est un fait vérifiable, jamais « profil non adapté ». */
  motif: string;
}

export interface Classement {
  retenues: readonly FicheDestination[];
  ecartees: readonly DestinationEcartee[];
  mention: Mention;
}

/** Rang affiché à côté du pays sur P-03. Les rangs partent de 1. */
export const rangAffiche = (index: number) => String(index + 1);

export const ficheParSlug = (
  fiches: readonly FicheDestination[],
  slug: string,
): FicheDestination | undefined => fiches.find((f) => f.slug === slug);

/**
 * Libellé du nombre de pièces, accordé. Il sert la barre d'action de P-04 :
 * « 8 pièces à réunir ».
 */
export const libellePieces = (n: number) =>
  n > 1 ? `${n} pièces à réunir` : `${n} pièce à réunir`;
