import { momentRelatif } from "@/domain/format/moment";

/**
 * Versions d'une pièce rédigée — R-03, WF-08.
 *
 * Le texte reste celui du candidat : il peut tout réécrire, et chaque
 * enregistrement laisse une version restaurable. Sans historique, la
 * suggestion acceptée puis regrettée n'a aucun retour en arrière, et la
 * personne cesse d'accepter les suggestions.
 *
 * Les versions suivent la rétention du dossier : supprimées à la clôture,
 * avec le reste (INV-5).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Paragraphe {
  /** Intertitre, repris de la section de la question qui l'a nourri. */
  section: string;
  texte: string;
}

export interface Version {
  /** Rang croissant : la version 3 est postérieure à la version 2. */
  rang: number;
  /** Horodatage de l'enregistrement, ISO. */
  enregistreeLe: string;
  paragraphes: readonly Paragraphe[];
  /** Ce qui a changé, en une phrase. Une liste de versions sans motif ne se lit pas. */
  motif: string;
}

export const compterMotsTexte = (texte: string): number => {
  const propre = texte.trim();
  return propre.length === 0 ? 0 : propre.split(/\s+/u).length;
};

export const motsDeLaVersion = (version: Version): number =>
  version.paragraphes.reduce((total, p) => total + compterMotsTexte(p.texte), 0);

/** La plus récente. C'est elle qu'on édite ; les autres se restaurent. */
export const versionCourante = (versions: readonly Version[]): Version | undefined =>
  [...versions].sort((a, b) => b.rang - a.rang)[0];

/** De la plus récente à la plus ancienne : on cherche d'abord ce qu'on vient de faire. */
export const parOrdreDeLecture = (versions: readonly Version[]): Version[] =>
  [...versions].sort((a, b) => b.rang - a.rang);

export const estCourante = (version: Version, versions: readonly Version[]): boolean =>
  version.rang === versionCourante(versions)?.rang;

/**
 * « il y a 4 minutes », « hier à 21 h 04 », « 9 septembre 2026 ».
 *
 * Une date absolue sur un enregistrement d'il y a quatre minutes oblige à
 * calculer ; un « il y a 3 mois » sur une version ancienne cache la date
 * qu'on cherche. Le seuil est le jour civil (`domain/format/moment`).
 */
const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const libelleAnciennete = (iso: string, maintenant: Date): string =>
  momentRelatif(iso, maintenant, { formatAbsolu: FORMAT_JOUR });

/** Ligne d'identité de la version affichée en tête d'éditeur. */
export const libelleVersion = (version: Version, maintenant: Date): string =>
  `Version ${version.rang} · modifiée ${libelleAnciennete(version.enregistreeLe, maintenant)} · ${motsDeLaVersion(version)} mots`;

export const MENTION_RETENTION_VERSIONS =
  "Les versions sont conservées jusqu'à la clôture du dossier, puis supprimées avec le reste.";

/**
 * Suggestion posée sur un paragraphe. Elle se répond ou s'ignore : jamais
 * appliquée d'office, puisque le texte appartient au candidat.
 */
export interface Suggestion {
  /** Section visée, pour ancrer la suggestion au bon paragraphe. */
  section: string;
  texte: string;
}
