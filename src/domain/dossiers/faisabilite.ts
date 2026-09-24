/**
 * Le calendrier tient-il encore ? — WF-09 étape 4.
 *
 * ── Ce que l'échéancier savait dire, et ce qu'il ne disait pas ─────────
 *
 * C-10 comptait les retards : « 3 échéances sont en retard. » Le candidat
 * lisait trois lignes rouges et continuait, parce que rien ne lui disait la
 * seule chose qui compte — qu'avec les délais de sa procédure, sa date de
 * départ n'est plus atteignable. Compter des retards n'est pas un
 * diagnostic : c'est la même erreur que le zéro de B-07 et que le « rien à
 * reprendre » de R-04, le chiffre tenant lieu de constat.
 *
 * WF-09 étape 4 demande les deux moitiés : l'alerte d'incompatibilité,
 * **et** la proposition de replanification. Elles sont ici, et elles sont
 * déterministes — les délais viennent du référentiel figé (RG-09.1), pas
 * d'une estimation.
 *
 * ── Ce qu'on ne sait pas n'est pas zéro ────────────────────────────────
 *
 * Toutes les pièces n'ont pas de `delai_obtention_jours` dans la règle. Un
 * calcul qui compte l'absence comme zéro conclut « ça tient » sur un
 * dossier dont on ignore la moitié des délais — l'affirmation rassurante,
 * encore. D'où l'état `INDETERMINE`, qui n'est ni un feu vert ni une
 * alerte : il nomme les pièces dont le délai n'est pas connu et s'arrête
 * là.
 *
 * ── Le verdict porte sur les pièces obligatoires ───────────────────────
 *
 * RG-07.2 l'a déjà tranché pour la complétude : une pièce bloquante
 * manquante ne se compense pas. Le calendrier suit la même frontière —
 * « il ne tient plus » veut dire qu'une pièce **obligatoire** ne peut plus
 * arriver. Une pièce complémentaire en retard reste visible dans
 * l'échéancier, elle ne condamne pas la date.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau. Dates en UTC.
 */

import { joursEntre } from "./echeancier";
import { jourEnFrancais } from "../format/moment";

export interface PieceAObtenir {
  code: string;
  libelle: string;
  /**
   * Délai d'obtention annoncé par l'autorité, en jours (RG-09.1).
   * `null` quand la règle n'en annonce pas — et `null` n'est pas zéro.
   */
  delaiJours: number | null;
  /** Obligatoire au sens de la règle figée. */
  obligatoire: boolean;
  /**
   * Le délai d'obtention a déjà été dépensé : le document est entre les
   * mains du candidat, ou déjà sur nos serveurs.
   *
   * Obligatoire, et non facultatif avec une valeur par défaut : c'est le
   * champ dont l'absence a produit le défaut, et un défaut de valeur le
   * reproduirait en silence sur le prochain appelant. `delaiDobtentionDepense`
   * le tranche depuis l'état de la pièce.
   */
  dejaEnMain: boolean;
}

export interface CalendrierAEvaluer {
  /** Date du serveur, ISO `AAAA-MM-JJ`. */
  aujourdhui: string;
  /** Date de départ visée, ISO. `null` quand le dossier n'en a pas. */
  dateCible: string | null;
  /**
   * Délai d'instruction maximum, en jours. `null` quand la règle n'en
   * annonce pas : le dépôt retombe alors sur la date cible, approximation
   * prudente que la lecture de l'échéancier fait déjà.
   */
  delaiInstructionJours: number | null;
  /** Les pièces encore à obtenir. Une pièce conforme n'en est plus. */
  aObtenir: readonly PieceAObtenir[];
}

export type EtatCalendrier =
  /** Pas de date visée : il n'y a pas de calendrier à tenir. */
  | "SANS_DATE"
  /** Une pièce obligatoire ne peut plus arriver, ou la date de dépôt est passée. */
  | "INTENABLE"
  /** Rien n'est en retard, mais un délai manque : nous ne pouvons pas conclure. */
  | "INDETERMINE"
  /** Tous les délais sont connus, et tous tiennent. */
  | "TENABLE";

export interface PieceEnRetard {
  piece: PieceAObtenir;
  /** Jours qui manquent entre la date d'arrivée au plus tôt et le dépôt. */
  joursManquants: number;
}

export interface Verdict {
  etat: EtatCalendrier;
  /** Date de dépôt retenue pour le calcul, ISO. `null` sans date cible. */
  depot: string | null;
  /** Le dépôt lui-même est derrière nous. */
  depotPasse: boolean;
  /** Les pièces obligatoires qui ne peuvent plus arriver à temps. */
  enRetard: readonly PieceEnRetard[];
  /** Les pièces obligatoires dont le délai n'est pas annoncé. */
  inconnues: readonly PieceAObtenir[];
  /** La marge la plus courte parmi celles qui tiennent. `null` s'il n'y en a aucune. */
  margeLaPlusCourte: { piece: PieceAObtenir; jours: number } | null;
}

/** `dateCible - delaiInstruction`, ou la date cible quand le délai est inconnu. */
export function dateDeDepot(
  dateCible: string,
  delaiInstructionJours: number | null,
): string {
  return enAjoutant(dateCible, -(delaiInstructionJours ?? 0));
}

export function enAjoutant(date: string, jours: number): string {
  const [a, m, j] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, j! + jours)).toISOString().slice(0, 10);
}

export function evaluerLeCalendrier(calendrier: CalendrierAEvaluer): Verdict {
  const { aujourdhui, dateCible, delaiInstructionJours } = calendrier;
  if (!dateCible) {
    return {
      etat: "SANS_DATE",
      depot: null,
      depotPasse: false,
      enRetard: [],
      inconnues: [],
      margeLaPlusCourte: null,
    };
  }

  const depot = dateDeDepot(dateCible, delaiInstructionJours);
  const depotPasse = joursEntre(aujourdhui, depot) < 0;
  const obligatoires = calendrier.aObtenir.filter((p) => p.obligatoire);

  const enRetard: PieceEnRetard[] = [];
  const inconnues: PieceAObtenir[] = [];
  let margeLaPlusCourte: Verdict["margeLaPlusCourte"] = null;

  for (const piece of obligatoires) {
    /*
      Le document est là : son délai d'obtention a été dépensé avant
      l'envoi, et le recompter depuis aujourd'hui annonçait qu'une pièce
      déjà fournie « ne peut plus arriver à temps ». Elle ne compte ni
      comme retard, ni comme inconnue — ignorer son délai n'est pas
      l'ignorer elle : elle est arrivée.
    */
    if (piece.dejaEnMain) continue;
    if (piece.delaiJours === null) {
      inconnues.push(piece);
      continue;
    }
    // Demandée aujourd'hui, la pièce est en main au plus tôt à cette date.
    const arrivee = enAjoutant(aujourdhui, piece.delaiJours);
    const marge = joursEntre(arrivee, depot);
    if (marge < 0) {
      enRetard.push({ piece, joursManquants: -marge });
    } else if (!margeLaPlusCourte || marge < margeLaPlusCourte.jours) {
      margeLaPlusCourte = { piece, jours: marge };
    }
  }

  enRetard.sort((a, b) => b.joursManquants - a.joursManquants);

  /*
    L'ordre des trois questions n'est pas neutre. Un dépôt déjà passé rend
    le calendrier intenable même sans aucune pièce en retard — et c'est le
    cas qu'un simple décompte de retards manquait, puisque la ligne
    « Dépôt » n'est pas une pièce à obtenir.
  */
  const etat: EtatCalendrier =
    depotPasse || enRetard.length > 0
      ? "INTENABLE"
      : inconnues.length > 0
        ? "INDETERMINE"
        : "TENABLE";

  return { etat, depot, depotPasse, enRetard, inconnues, margeLaPlusCourte };
}

// ── La replanification ─────────────────────────────────────────────────

export interface DateProposee {
  /** Première date cible compatible avec les délais connus, ISO. */
  date: string;
  /** Les codes de pièces sur lesquels le calcul s'appuie. */
  fondeeSur: readonly string[];
  /**
   * Les codes dont le délai n'est pas annoncé. Non vide : la date est un
   * plancher, et l'écran doit le dire au lieu de la présenter comme sûre.
   */
  inconnues: readonly string[];
  /** Le délai d'instruction a été compté. Faux : la date ne le comprend pas. */
  instructionComptee: boolean;
}

/**
 * La première date de départ que les délais connus laissent atteindre.
 *
 * `aujourd'hui + le plus long des délais connus + le délai d'instruction`.
 * Rien d'autre : ce n'est pas une recommandation, c'est une soustraction
 * rendue dans l'autre sens. Elle ne dit pas que la demande aboutira, et
 * elle ne dit pas que le candidat doit choisir cette date.
 */
export function premiereDateCibleTenable(
  calendrier: CalendrierAEvaluer,
): DateProposee {
  /* Même frontière que le verdict : un délai déjà dépensé ne repousse pas
     la date qu'on propose, sans quoi la replanification ajouterait des
     semaines pour des pièces déjà déposées. */
  const obligatoires = calendrier.aObtenir.filter((p) => p.obligatoire && !p.dejaEnMain);
  const connues = obligatoires.filter(
    (p): p is PieceAObtenir & { delaiJours: number } => p.delaiJours !== null,
  );
  const plusLong = connues.reduce((max, p) => Math.max(max, p.delaiJours), 0);
  const instruction = calendrier.delaiInstructionJours ?? 0;
  return {
    date: enAjoutant(calendrier.aujourdhui, plusLong + instruction),
    fondeeSur: connues.map((p) => p.code),
    inconnues: obligatoires.filter((p) => p.delaiJours === null).map((p) => p.code),
    instructionComptee: calendrier.delaiInstructionJours !== null,
  };
}

// ── Ce que l'écran en dit ──────────────────────────────────────────────

/**
 * Le ton du bandeau. `null` quand il n'y a rien à annoncer : sans date
 * visée, l'échéancier a déjà son propre écran vide, et un bandeau de plus
 * n'apprendrait rien.
 */
export const TON_DU_VERDICT: Record<EtatCalendrier, "alerte" | "attention" | "neutre" | null> = {
  INTENABLE: "alerte",
  INDETERMINE: "attention",
  TENABLE: "neutre",
  SANS_DATE: null,
};

const enumerer = (libelles: readonly string[]): string =>
  libelles.length <= 1
    ? (libelles[0] ?? "")
    : `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;

export function titreDuVerdict(verdict: Verdict): string {
  switch (verdict.etat) {
    case "SANS_DATE":
      return "Ce dossier n'a pas de date de départ visée";
    case "INTENABLE":
      return verdict.depotPasse
        ? "La date de dépôt est passée"
        : verdict.enRetard.length > 1
          ? `${verdict.enRetard.length} pièces obligatoires ne peuvent plus arriver à temps`
          : "Une pièce obligatoire ne peut plus arriver à temps";
    case "INDETERMINE":
      return "Nous ne pouvons pas dire si ce calendrier tient";
    case "TENABLE":
      return "Le calendrier tient";
  }
}

/**
 * Le corps dit le constat, puis sa conséquence, puis ce qu'il y a à faire
 * (RG-06.3). Jamais un pronostic sur la demande : une date atteignable ne
 * dit rien de la décision de l'administration (INV-1).
 */
export function corpsDuVerdict(verdict: Verdict): string {
  switch (verdict.etat) {
    case "SANS_DATE":
      return "Sans date visée, il n'y a pas d'échéancier à tenir. Tu peux en fixer une à tout moment : les dates se recalculent depuis les délais de ta procédure.";

    case "INTENABLE": {
      const morceaux: string[] = [];
      if (verdict.depotPasse && verdict.depot) {
        morceaux.push(
          `Le dépôt était à faire le ${jourEnFrancais(verdict.depot)}, et cette date est derrière nous.`,
        );
      }
      if (verdict.enRetard.length > 0 && verdict.depot) {
        const details = verdict.enRetard.map(
          ({ piece, joursManquants }) =>
            `${piece.libelle} (${piece.delaiJours} jours d'obtention, ${joursManquants} de trop)`,
        );
        morceaux.push(
          `Demandée aujourd'hui, ${verdict.enRetard.length > 1 ? "chacune de ces pièces arriverait" : "cette pièce arriverait"} après le dépôt du ${jourEnFrancais(verdict.depot)} : ${enumerer(details)}.`,
        );
      }
      morceaux.push(
        "Une date de départ plus tardive rend ces délais tenables. Elle se change ici, et tout l'échéancier se recalcule.",
      );
      return morceaux.join(" ");
    }

    case "INDETERMINE": {
      const libelles = verdict.inconnues.map((p) => p.libelle);
      return `Ta procédure n'annonce pas de délai d'obtention pour ${verdict.inconnues.length > 1 ? "ces pièces obligatoires" : "cette pièce obligatoire"} : ${enumerer(libelles)}. Ce que nous savons tient ; ce que nous ignorons n'est pas compté comme nul. Renseigne-toi sur ${verdict.inconnues.length > 1 ? "ces délais" : "ce délai"} auprès de l'autorité qui délivre ${verdict.inconnues.length > 1 ? "ces pièces" : "cette pièce"}.`;
    }

    case "TENABLE": {
      const marge = verdict.margeLaPlusCourte;
      if (!marge || !verdict.depot) {
        return "Il ne reste aucune pièce obligatoire à obtenir : plus aucun délai d'obtention ne pèse sur cette date.";
      }
      return `Toutes les pièces obligatoires qui restent peuvent arriver avant le dépôt du ${jourEnFrancais(verdict.depot)}. La plus tendue est « ${marge.piece.libelle} », avec ${marge.jours} ${marge.jours > 1 ? "jours" : "jour"} de marge si tu la demandes aujourd'hui.`;
    }
  }
}

/**
 * La proposition de replanification — la seconde moitié de WF-09 étape 4.
 *
 * Elle n'est affichée que sur un calendrier intenable : proposer de
 * repousser une date qui tient reviendrait à conseiller de retarder son
 * départ, ce qui n'est pas notre rôle.
 */
export function phraseDeReplanification(proposition: DateProposee): string {
  const base = `En partant d'aujourd'hui, la première date de départ compatible avec les délais connus est le ${jourEnFrancais(proposition.date)}.`;
  const reserves: string[] = [];
  if (proposition.inconnues.length > 0) {
    /*
      Sans virgule à la place du deux-points, la phrase en portait deux —
      « C'est un plancher, pas une prévision : 3 pièces n'ont pas de délai
      annoncé : la vraie date … ». Deux niveaux d'explication dans une
      seule phrase, et on ne sait plus lequel qualifie quoi.
    */
    reserves.push(
      `${proposition.inconnues.length} ${proposition.inconnues.length > 1 ? "pièces obligatoires n'ont" : "pièce obligatoire n'a"} pas de délai annoncé, ce qui peut la repousser`,
    );
  }
  if (!proposition.instructionComptee) {
    reserves.push(
      "le délai d'instruction n'est pas annoncé par la procédure et n'est donc pas compté",
    );
  }
  if (reserves.length === 0) return base;
  return `${base} C'est un plancher, pas une prévision : ${enumerer(reserves)}.`;
}
