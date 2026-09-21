/**
 * Échéancier du dossier — C-10, WF-09.
 *
 * Un calendrier à rebours, pas une liste de rappels : chaque date est
 * calculée depuis la date de dépôt, et les pièces périssables s'y demandent au
 * plus tôt, jamais au plus tard. Un relevé bancaire obtenu trop tôt est
 * périmé le jour du dépôt, et le candidat le refait pour rien.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau. Les dates sont
 * manipulées en UTC : un échéancier ne doit pas changer de jour selon le
 * fuseau du navigateur.
 */

export interface Echeance {
  id: string;
  /** Date de l'échéance, ISO `AAAA-MM-JJ`. */
  date: string;
  titre: string;
  /** Pourquoi cette date, et ce qu'elle implique. Jamais une date nue. */
  detail: string;
  /**
   * Pièce à durée de validité limitée : la date est un « au plus tôt », et
   * l'écran le dit. Sans cette distinction, le candidat lit une date limite
   * et s'y prend trop tôt.
   */
  perissable?: boolean;
  /** Date imposée par un tiers, non déplaçable : clôture d'admission, dépôt. */
  imposee?: boolean;
}

export type UrgenceEcheance = "EN_RETARD" | "CE_MOIS_CI" | "A_VENIR";

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const jour = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a!, m! - 1, j!);
};

/** Nombre de jours pleins entre deux dates ISO. Négatif si la cible est passée. */
export const joursEntre = (depuis: string, jusqua: string): number =>
  Math.round((jour(jusqua) - jour(depuis)) / MS_PAR_JOUR);

/**
 * « 126 jours restants » — le seul compte à rebours de l'écran.
 *
 * Il ne nomme plus ce qu'il compte. Il le nommait — « Date de dépôt
 * dépassée de 50 jours » — et la phrase composée bégayait dès qu'on le
 * nommait aussi devant : « Dépôt le 2 août 2026 — date de dépôt dépassée
 * de 50 jours ». Le compte à rebours dit le délai, l'appelant dit de quoi.
 */
export function libelleCompteARebours(aujourdhui: string, echeance: string): string {
  const jours = joursEntre(aujourdhui, echeance);
  if (jours < 0) {
    const passes = -jours;
    return `Dépassé de ${passes} ${passes > 1 ? "jours" : "jour"}`;
  }
  if (jours === 0) return "C'est aujourd'hui";
  return `${jours} ${jours > 1 ? "jours restants" : "jour restant"}`;
}

export function urgence(echeance: Echeance, aujourdhui: string): UrgenceEcheance {
  const jours = joursEntre(aujourdhui, echeance.date);
  if (jours < 0) return "EN_RETARD";
  return echeance.date.slice(0, 7) === aujourdhui.slice(0, 7) ? "CE_MOIS_CI" : "A_VENIR";
}

/** Délai affiché sur la ligne : il dit l'écart, pas seulement la catégorie. */
export function libelleDelai(echeance: Echeance, aujourdhui: string): string {
  const jours = joursEntre(aujourdhui, echeance.date);
  if (jours < 0) {
    const retard = -jours;
    return `En retard de ${retard} ${retard > 1 ? "jours" : "jour"}`;
  }
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Demain";
  return `Dans ${jours} jours`;
}

export interface MoisDEcheances {
  /** `AAAA-MM`, clé de rendu. */
  cle: string;
  /** « Septembre 2026 ». */
  libelle: string;
  echeances: Echeance[];
}

const FORMAT_MOIS = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const capitale = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

/** Groupement par mois, dans l'ordre chronologique. */
export function grouperParMois(echeances: readonly Echeance[]): MoisDEcheances[] {
  const mois = new Map<string, MoisDEcheances>();
  for (const e of [...echeances].sort((a, b) => a.date.localeCompare(b.date))) {
    const cle = e.date.slice(0, 7);
    if (!mois.has(cle)) {
      mois.set(cle, {
        cle,
        libelle: capitale(FORMAT_MOIS.format(new Date(jour(e.date)))),
        echeances: [],
      });
    }
    mois.get(cle)!.echeances.push(e);
  }
  return [...mois.values()];
}

/**
 * Une phrase au-dessus du calendrier. Le retard passe avant le mois en
 * cours : c'est la seule information qui demande un geste aujourd'hui.
 */
export function resumeEcheancier(
  echeances: readonly Echeance[],
  aujourdhui: string,
): string {
  const retard = echeances.filter((e) => urgence(e, aujourdhui) === "EN_RETARD").length;
  if (retard > 0) {
    return retard > 1
      ? `${retard} échéances sont en retard.`
      : "1 échéance est en retard.";
  }
  const ceMois = echeances.filter((e) => urgence(e, aujourdhui) === "CE_MOIS_CI").length;
  if (ceMois === 0) return "Aucune échéance ce mois-ci.";
  return ceMois > 1
    ? `${ceMois} échéances tombent ce mois-ci.`
    : "1 échéance tombe ce mois-ci.";
}

/**
 * Date à laquelle demander une pièce périssable au plus tôt.
 *
 * Une pièce de validité `validiteMois` doit être encore valable le jour du
 * dépôt : la demander avant `depot - validiteMois`, c'est la refaire.
 * C'est la règle que le prototype énonce en toutes lettres sur le relevé
 * bancaire — « il doit avoir moins de trois mois le jour du dépôt » — sans
 * la calculer.
 */
export function dateAuPlusTot(depot: string, validiteMois: number): string {
  const [a, m, j] = depot.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1 - validiteMois, j!));
  return d.toISOString().slice(0, 10);
}
