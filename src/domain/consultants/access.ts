/**
 * Accès d'un consultant à un dossier — WF-12, pack Accompagné (lot 4).
 *
 * Deux tables de droits, l'accès est leur intersection (arbitrage du 13/09/2026) :
 * 1. Habilitation par destination, portée par le consultant.
 * 2. Accord nominatif du candidat, porté par le dossier, révocable à tout moment.
 *
 * Aucune des deux ne couvre l'autre : la première répond à la compétence,
 * la seconde au consentement (pièces d'identité, cf. A-05).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Habilitation {
  consultantId: string;
  /** Code pays ISO 3166-1 alpha-2 de la destination couverte. */
  destination: string;
  habiliteLe: Date;
  /** Une habilitation retirée reste en table, datée. */
  retireeLe?: Date | null;
}

export interface AccordAcces {
  dossierId: string;
  consultantId: string;
  donneLe: Date;
  /** La révocation coupe l'accès sans supprimer les échanges tenus. */
  revoqueLe?: Date | null;
}

export interface DossierRef {
  id: string;
  destination: string;
}

/** Ce qu'un consultant autorisé peut lire. Le moyen de paiement et l'historique d'achat n'en font pas partie. */
export type PorteeLecture = "pieces" | "analyse" | "checklist" | "echeancier" | "echanges";
export const PORTEE_CONSULTANT: readonly PorteeLecture[] = ["pieces", "analyse", "checklist", "echeancier", "echanges"];

export type MotifRefus = "NON_HABILITE" | "SANS_ACCORD";

export type Decision =
  | { autorise: true; portee: readonly PorteeLecture[] }
  | { autorise: false; motifs: MotifRefus[] };

const actif = (debut: Date, fin: Date | null | undefined, a: Date) =>
  debut <= a && (fin == null || fin > a);

export function peutLire(
  consultantId: string,
  dossier: DossierRef,
  habilitations: readonly Habilitation[],
  accords: readonly AccordAcces[],
  a: Date = new Date(),
): Decision {
  const habilite = habilitations.some(
    (h) => h.consultantId === consultantId && h.destination === dossier.destination && actif(h.habiliteLe, h.retireeLe, a),
  );
  const accorde = accords.some(
    (x) => x.consultantId === consultantId && x.dossierId === dossier.id && actif(x.donneLe, x.revoqueLe, a),
  );
  if (habilite && accorde) return { autorise: true, portee: PORTEE_CONSULTANT };
  const motifs: MotifRefus[] = [];
  if (!habilite) motifs.push("NON_HABILITE");
  if (!accorde) motifs.push("SANS_ACCORD");
  return { autorise: false, motifs };
}

/**
 * Événement de journal : toute lecture par un consultant s'inscrit (B-06),
 * autorisée ou refusée. Le candidat peut en demander l'extrait depuis A-05.
 */
export interface LectureConsultant {
  type: "LECTURE_CONSULTANT";
  horodatage: Date;
  consultantId: string;
  dossierId: string;
  portee: readonly PorteeLecture[];
  resultat: "AUTORISEE" | "REFUSEE";
  motifs?: MotifRefus[];
}

export function evenementLecture(
  consultantId: string,
  dossier: DossierRef,
  decision: Decision,
  portee: readonly PorteeLecture[] = PORTEE_CONSULTANT,
  a: Date = new Date(),
): LectureConsultant {
  return decision.autorise
    ? { type: "LECTURE_CONSULTANT", horodatage: a, consultantId, dossierId: dossier.id, portee, resultat: "AUTORISEE" }
    : { type: "LECTURE_CONSULTANT", horodatage: a, consultantId, dossierId: dossier.id, portee, resultat: "REFUSEE", motifs: decision.motifs };
}
