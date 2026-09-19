import type { Reponses } from "./questions";

/**
 * Classement des destinations — WF-01, étapes 2 à 4.
 *
 * Deux temps, et l'ordre compte. D'abord un **filtrage strict** : une
 * destination dont une condition bloquante échoue sort, quel que soit le
 * reste. Ensuite une **pondération** sur celles qui restent, pour les
 * ordonner. Pondérer d'abord reviendrait à compenser une condition
 * éliminatoire par un bon budget, ce qui donnerait un premier rang à une
 * destination inaccessible.
 *
 * **Ce que le classement n'est pas.** Le rang dit « cette destination
 * correspond mieux à ce que tu as déclaré », jamais « tu as plus de
 * chances ici » (INV-1). Le nombre pondéré n'est donc pas exposé : il
 * ordonne, comme le barème de complétude, et reste dans `interne`
 * (arbitrage C-09). L'écran affiche un rang et des raisons chiffrées.
 *
 * **Ce que le classement ne sait pas encore faire.** DOC-11 §WF-01 donne six
 * composantes : langue 30 %, budget 20 %, facilité administrative 20 %,
 * débouchés post-visa 15 %, qualité de vie 10 %, coût de la vie 5 %. Les
 * quatre premières se calculent depuis le référentiel. Les deux dernières
 * n'y sont pas, et rien ne les y met : il faudrait un indice par pays, avec
 * sa source et sa date de vérification comme tout le reste (INV-8).
 * Fabriquer ces notes serait une information sans source sur une plateforme
 * dont c'est la promesse inverse. Les quatre composantes disponibles sont
 * donc renormalisées sur 100, et `composantesAbsentes` le dit à l'appelant
 * plutôt que de le taire.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type Categorie = "ETUDES" | "EMPLOI" | "FAMILLE" | "RECHERCHE_EMPLOI";

export interface DestinationEvaluable {
  code: string;
  slug: string;
  pays: string;
  categorie: Categorie;
  /** Niveau minimal exigé, dans l'échelle du référentiel : « B2 », « IELTS 6.5 ». */
  niveauLangueMin: string | null;
  languesAcceptees: readonly string[];
  /**
   * Coût de la première année, en francs CFA : scolarité minimale plus les
   * ressources à prouver ramenées à douze mois. C'est la grandeur que la
   * question de budget interroge, et la seule comparable d'un pays à
   * l'autre.
   */
  coutPremiereAnneeXOF: number | null;
  delaiTraitementJours: number | null;
  permisEmployeurRequis: boolean;
  dispositifApresDiplome: string | null;
  dureeApresDiplomeMois: number | null;
}

/** Poids de DOC-11, réduits aux composantes que le référentiel porte. */
export const POIDS = {
  langue: 30,
  budget: 20,
  facilite: 20,
  debouches: 15,
} as const;

const TOTAL_POIDS = POIDS.langue + POIDS.budget + POIDS.facilite + POIDS.debouches;

/** Ce que DOC-11 demande et que le référentiel ne porte pas. */
export const COMPOSANTES_ABSENTES: readonly string[] = ["qualité de vie", "coût de la vie"];

/** Échelle de langue, du plus faible au plus fort. L'index sert la comparaison. */
const ECHELLE = ["Débutant", "A2", "B1", "B2", "C1", "C2"];

const NIVEAU_DECLARE: Record<string, number> = {
  Débutant: 0,
  "B1 — intermédiaire": 2,
  "B2 — avancé": 3,
  "C1 et plus": 4,
};

/** Milieu de fourchette des tranches de budget de P-02, en francs CFA. */
const BUDGET_DECLARE: Record<string, number> = {
  "Moins de 4 millions F": 3_000_000,
  "4 à 8 millions F": 6_000_000,
  "8 à 12 millions F": 10_000_000,
  "Plus de 12 millions F": 15_000_000,
};

const CATEGORIE_VISEE: Record<string, Categorie> = {
  Étudier: "ETUDES",
  Travailler: "EMPLOI",
  "Rejoindre ma famille": "FAMILLE",
  "Créer une activité": "EMPLOI",
};

/** Un niveau exigé peut être écrit « B2 » ou « IELTS 6.5 ». On lit ce qu'on sait lire. */
function exigence(niveau: string | null): number {
  if (!niveau) return 0;
  const direct = ECHELLE.indexOf(niveau.trim().toUpperCase());
  if (direct >= 0) return direct;
  const cadre = niveau.match(/\b([ABC][12])\b/iu);
  return cadre ? ECHELLE.indexOf(cadre[1]!.toUpperCase()) : 3;
}

export interface Motif {
  /** Raison chiffrée, affichée sous la destination : « B2 exigé, tu déclares B2 ». */
  texte: string;
  /** Vrai quand elle joue en faveur de la destination. */
  favorable: boolean;
}

export interface Retenue {
  destination: DestinationEvaluable;
  /** Les trois raisons principales, chiffrées (WF-01, étape 4). */
  motifs: Motif[];
  /** Ordonne, ne s'affiche pas. */
  interne: { note: number; detail: Record<keyof typeof POIDS, number> };
}

export interface Ecartee {
  destination: DestinationEvaluable;
  /** Fait vérifiable, jamais « profil non adapté ». */
  motif: string;
  /** Ce qui manque, chiffré, pour que l'écart soit franchissable. */
  ecart: string;
}

export interface Resultat {
  retenues: Retenue[];
  ecartees: Ecartee[];
  /**
   * RG-01.3 : quand rien ne passe le filtrage strict, les destinations les
   * plus proches sont montrées avec ce qui leur manque, plutôt qu'un écran
   * vide. C'est le moment où le candidat comprend ce qui lui manque.
   */
  aucuneNePasse: boolean;
  composantesAbsentes: readonly string[];
}

export function classer(
  destinations: readonly DestinationEvaluable[],
  reponses: Reponses,
): Resultat {
  const visee = reponses.objectif ? CATEGORIE_VISEE[reponses.objectif] : undefined;
  const niveau = reponses.langue ? (NIVEAU_DECLARE[reponses.langue] ?? 0) : 0;
  const budget = reponses.budget ? (BUDGET_DECLARE[reponses.budget] ?? 0) : 0;

  const retenues: Retenue[] = [];
  const ecartees: Ecartee[] = [];

  for (const d of destinations) {
    const refus = filtrageStrict(d, { visee, niveau, budget });
    if (refus) {
      ecartees.push({ destination: d, ...refus });
      continue;
    }
    retenues.push(evaluer(d, { niveau, budget }));
  }

  retenues.sort((a, b) => b.interne.note - a.interne.note);

  // RG-01.3 : plutôt qu'un écran vide, les moins éloignées d'abord.
  if (retenues.length === 0) {
    ecartees.sort((a, b) => a.ecart.length - b.ecart.length);
  }

  return {
    retenues,
    ecartees,
    aucuneNePasse: retenues.length === 0,
    composantesAbsentes: COMPOSANTES_ABSENTES,
  };
}

interface Profil {
  visee?: Categorie;
  niveau: number;
  budget: number;
}

/**
 * Filtrage strict. Trois critères seulement, et c'est délibéré : ce sont les
 * trois que les six questions du simulateur permettent d'évaluer. Les
 * conditions bloquantes du référentiel qui portent sur des pièces —
 * validité de passeport, ancienneté d'un relevé — ne se jugent pas sur une
 * déclaration ; elles arrivent à l'ouverture du dossier, avec la checklist.
 */
function filtrageStrict(
  d: DestinationEvaluable,
  profil: Profil,
): { motif: string; ecart: string } | null {
  if (profil.visee && d.categorie !== profil.visee) {
    return {
      motif: `Cette destination ne couvre pas l'objectif déclaré.`,
      ecart: `Dispositif ouvert pour : ${libelleCategorie(d.categorie)}.`,
    };
  }

  const exige = exigence(d.niveauLangueMin);
  if (exige > profil.niveau) {
    return {
      motif: `Le niveau de langue exigé n'est pas atteint.`,
      ecart: `${d.niveauLangueMin} exigé, tu déclares ${ECHELLE[profil.niveau] ?? "débutant"}.`,
    };
  }

  if (d.coutPremiereAnneeXOF !== null && profil.budget > 0 && d.coutPremiereAnneeXOF > profil.budget) {
    const manque = d.coutPremiereAnneeXOF - profil.budget;
    return {
      motif: `Le budget déclaré ne couvre pas la première année.`,
      ecart: `${francs(d.coutPremiereAnneeXOF)} demandés, ${francs(manque)} au-dessus de ton budget.`,
    };
  }

  return null;
}

function evaluer(d: DestinationEvaluable, profil: Profil): Retenue {
  const exige = exigence(d.niveauLangueMin);
  // Une marge au-dessus de l'exigence compte, mais plafonne : dépasser B2 de
  // deux crans n'ouvre pas deux fois plus de portes.
  const langue = Math.min(1, (profil.niveau - exige + 1) / 2);

  const budget =
    d.coutPremiereAnneeXOF === null || profil.budget === 0
      ? 0.5
      : Math.min(1, profil.budget / d.coutPremiereAnneeXOF - 1 + 0.5);

  // Facilité administrative : le délai de traitement, et le permis employeur
  // qui n'est pas une formalité — le droit au travail appartient à
  // l'employeur, pas à l'étudiant (RG-03.3).
  const delai = d.delaiTraitementJours === null ? 0.5 : Math.min(1, 90 / d.delaiTraitementJours);
  const facilite = delai * (d.permisEmployeurRequis ? 0.7 : 1);

  const debouches =
    d.dispositifApresDiplome === null
      ? 0
      : Math.min(1, (d.dureeApresDiplomeMois ?? 12) / 24);

  const detail = {
    langue: borne(langue) * POIDS.langue,
    budget: borne(budget) * POIDS.budget,
    facilite: borne(facilite) * POIDS.facilite,
    debouches: borne(debouches) * POIDS.debouches,
  };
  const brute = detail.langue + detail.budget + detail.facilite + detail.debouches;

  return {
    destination: d,
    motifs: motifsDe(d, profil).slice(0, 3),
    interne: { note: Math.round((brute / TOTAL_POIDS) * 100), detail },
  };
}

const borne = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Raisons chiffrées. Elles citent une valeur du référentiel et la réponse
 * déclarée, pour qu'on puisse les vérifier — « bon profil » ne se vérifie
 * pas. Les défavorables sont dites aussi : une destination retenue qui exige
 * un permis employeur doit le dire au rang où elle apparaît, pas trois
 * écrans plus loin.
 */
function motifsDe(d: DestinationEvaluable, profil: Profil): Motif[] {
  const motifs: Motif[] = [];

  if (d.niveauLangueMin) {
    motifs.push({
      texte: `${d.niveauLangueMin} exigé, tu déclares ${ECHELLE[profil.niveau] ?? "débutant"}.`,
      favorable: exigence(d.niveauLangueMin) <= profil.niveau,
    });
  } else {
    motifs.push({ texte: "Aucun niveau de langue exigé.", favorable: true });
  }

  if (d.coutPremiereAnneeXOF !== null) {
    const reste = profil.budget - d.coutPremiereAnneeXOF;
    motifs.push({
      texte:
        reste >= 0
          ? `Première année estimée à ${francs(d.coutPremiereAnneeXOF)}, ${francs(reste)} de marge sur ton budget.`
          : `Première année estimée à ${francs(d.coutPremiereAnneeXOF)}.`,
      favorable: reste >= 0,
    });
  }

  if (d.permisEmployeurRequis) {
    motifs.push({
      texte: "Travail étudiant soumis à un permis que l'employeur doit obtenir.",
      favorable: false,
    });
  }

  if (d.dispositifApresDiplome) {
    motifs.push({
      texte: `${d.dispositifApresDiplome} après le diplôme${
        d.dureeApresDiplomeMois ? ` — ${d.dureeApresDiplomeMois} mois` : ""
      }.`,
      favorable: true,
    });
  }

  if (d.delaiTraitementJours !== null) {
    motifs.push({
      texte: `Traitement annoncé en ${d.delaiTraitementJours} jours.`,
      favorable: d.delaiTraitementJours <= 90,
    });
  }

  return motifs;
}

const francs = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  ETUDES: "études",
  EMPLOI: "emploi qualifié",
  FAMILLE: "regroupement familial",
  RECHERCHE_EMPLOI: "recherche d'emploi après diplôme",
};

const libelleCategorie = (c: Categorie) => LIBELLE_CATEGORIE[c];

/** Les trois meilleures, comme l'affiche P-03. */
export const TROIS_MEILLEURES = 3;
