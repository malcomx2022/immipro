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
  /**
   * D'où vient le montant en francs, quand il n'est pas celui que
   * l'autorité publie — INV-8.
   *
   * La source seule ne suffisait pas. `ind.nl` publie « 1 130,77 € par
   * mois » et le candidat lisait « 8 900 838 F » : ni l'annualisation ni
   * la conversion ne se lisaient, et la source était citée pour un chiffre
   * qu'elle ne porte pas. Absente quand rien n'a été transformé.
   */
  conversion?: string;
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
 *
 * Zéro n'est pas un nombre de pièces, c'est une absence de liste. La forme
 * accordée rendait « 0 pièce à réunir », et C-04 enchaînait « le détail,
 * pièce par pièce, s'ouvre avec le dossier » — un détail promis sur une
 * liste vide. `pieces_requises` est un tableau sans minimum dans le schéma :
 * une règle sans pièce est valide, et quatre écrans lisaient ce libellé.
 */
export const libellePieces = (n: number) =>
  n <= 0
    ? "Aucune pièce n'est consignée"
    : n > 1
      ? `${n} pièces à réunir`
      : `${n} pièce à réunir`;

/**
 * Ce qu'une section de fiche dit quand sa liste est vide — C-04 et P-04.
 *
 * ── Ce que les écrans faisaient ─────────────────────────────────────
 *
 * Rien. Rendu avec des listes vides, C-04 affichait :
 *
 *     Conditions   → ""
 *     Coûts        → ""
 *     Réserves     → ""
 *
 * Un panneau blanc sous l'onglet qu'on vient de choisir. P-04 était pire :
 * ses listes vivent sous des titres — « Conditions principales »,
 * « Réserves » — et un titre sans rien dessous se lit comme une page qui a
 * échoué à charger.
 *
 * Le cas n'est pas théorique : `reserves` porte `.default([])` dans le
 * schéma, et ni `conditions` ni `pieces_requises` n'ont de minimum. Une
 * règle sans réserve est la règle qu'on écrit par défaut.
 *
 * ── Ce que chaque phrase doit tenir ─────────────────────────────────
 *
 * Elle dit que **le référentiel n'en consigne pas**, jamais qu'il n'y en a
 * pas. La nuance porte tout le poids sur « Réserves » : « aucune réserve »
 * se lirait comme « aucun risque », c'est-à-dire comme une promesse sur une
 * décision qui ne nous appartient pas (INV-1). Et elle dit où regarder,
 * comme tout message de ce dépôt.
 */
export const LISTE_VIDE = {
  conditions:
    "Aucune condition chiffrée n'est consignée pour cette destination. Ce qui est exigé se lit alors pièce par pièce, dans la checklist du dossier.",
  couts:
    "Aucun repère de coût n'est consigné pour cette destination. Les montants officiels sont publiés par l'autorité citée en bas de page.",
  reserves:
    "Aucune réserve n'est consignée pour cette destination. Une réserve signale une difficulté que notre veille a relevée ; son absence dit qu'il n'y en a pas de relevée, pas qu'il n'y a rien à surveiller.",
} as const;
