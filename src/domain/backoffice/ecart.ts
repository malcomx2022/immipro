/**
 * La résolution d'un écart de réconciliation — arbitrage du 21/09/2026.
 *
 * B-04 affichait « Traiter les N écarts » sur un bouton sans action. Un
 * écart s'ouvrait donc au bout de vingt-quatre heures et ne se refermait
 * jamais : le compteur montait, et O.B — qui suspend la conservation du
 * motif d'échec tant qu'un dossier est ouvert — n'avait aucun événement
 * pour dater sa clôture. Le sursis de trente jours était écrit et
 * inatteignable.
 *
 * **La résolution appartient au back-office, la vérité financière non.**
 * Un administrateur constate, décide et signe ; il ne déclare pas qu'un
 * paiement est encaissé ou remboursé. Seule la notification signée du
 * fournisseur fait bouger l'état d'une transaction (INV-7), et une action
 * de guichet ne s'y substitue pas. « Remboursement à initier » est une
 * issue de guichet : elle dit qu'une somme est à rendre, elle ne la rend
 * pas.
 *
 * **Elle n'efface pas l'écart.** Le texte du désaccord reste : un
 * historique qui ne garde que la réponse a perdu la question, et c'est la
 * question qu'on relit quand le même cas se représente.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type IssueEcart =
  | "EXPLIQUE_SANS_CORRECTION"
  | "ATTENTE_CONFIRMATION"
  | "REMBOURSEMENT_A_INITIER"
  | "INCIDENT_TRANSMIS";

export const ISSUES_ECART: readonly IssueEcart[] = [
  "EXPLIQUE_SANS_CORRECTION",
  "ATTENTE_CONFIRMATION",
  "REMBOURSEMENT_A_INITIER",
  "INCIDENT_TRANSMIS",
];

export const LIBELLE_ISSUE: Record<IssueEcart, string> = {
  EXPLIQUE_SANS_CORRECTION: "Écart expliqué, sans correction financière",
  ATTENTE_CONFIRMATION: "En attente d'une nouvelle confirmation du fournisseur",
  REMBOURSEMENT_A_INITIER: "Remboursement à initier",
  INCIDENT_TRANSMIS: "Incident transmis pour investigation",
};

/**
 * Ce que chaque issue engage ensuite, dit à celui qui choisit.
 *
 * L'aide n'est pas décorative : deux de ces quatre issues referment le
 * dossier sans que rien d'autre ne se passe, et deux appellent une suite
 * ailleurs. Confondre les deux familles est la faute qui laisse une somme
 * non rendue derrière un écart marqué résolu.
 */
export const SUITE_DE_L_ISSUE: Record<IssueEcart, string> = {
  EXPLIQUE_SANS_CORRECTION:
    "Rien d'autre à faire. L'écart se referme, la transaction ne bouge pas.",
  ATTENTE_CONFIRMATION:
    "La transaction reste telle quelle. Si le fournisseur confirme plus tard, sa notification signée fera foi.",
  REMBOURSEMENT_A_INITIER:
    "Ouvre ensuite le remboursement depuis la transaction : le refermer ici ne rend aucune somme.",
  INCIDENT_TRANSMIS:
    "L'investigation se poursuit hors du guichet. La transaction reste telle quelle.",
};

/** La note est obligatoire, et une note vide n'est pas une note. */
export const NOTE_MINIMUM = 10;

export interface Resolution {
  issue: IssueEcart;
  note: string;
}

/**
 * Ce qui manque pour refermer, ou `null` si rien ne manque.
 *
 * Rendre la raison plutôt qu'un booléen se paie de trois lignes et
 * rapporte le message du bouton désactivé — qui doit dire quoi faire, et
 * non griser sans explication (DOC-12 §16).
 */
export function obstacleALaResolution(
  resolution: Partial<Resolution>,
  ecartOuvert: boolean,
): string | null {
  if (!ecartOuvert) return "Cet écart est déjà refermé.";
  if (!resolution.issue) return "Choisis une issue.";
  if ((resolution.note ?? "").trim().length < NOTE_MINIMUM) {
    return `Écris ce que tu as constaté, en ${NOTE_MINIMUM} caractères au moins.`;
  }
  return null;
}

/**
 * Un écart est ouvert quand il existe et n'a pas été refermé.
 *
 * Les deux moitiés comptent. Avant cet arbitrage, la seule existence du
 * texte valait « ouvert », et rien ne pouvait le refermer — c'est
 * exactement pourquoi le sursis d'O.B n'avait pas de déclencheur.
 */
export const ecartOuvert = (etat: {
  discrepancy: string | null;
  discrepancyResolvedAt: Date | null;
}): boolean => etat.discrepancy !== null && etat.discrepancyResolvedAt === null;
