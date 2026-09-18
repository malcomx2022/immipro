/**
 * Analyse critique d'une pièce rédigée — R-04, WF-08.
 *
 * La relecture relève des incohérences et des imprécisions. Elle ne note pas
 * le texte et ne prédit pas la décision de l'administration (INV-1) : une
 * note portée sur une lettre se retiendrait comme un pronostic sur la
 * décision, exactement ce que l'arbitrage C-09 a retiré du dossier.
 *
 * L'apport réel est le croisement : une date qui diffère entre la lettre et
 * le relevé de notes ne se voit sur aucune des deux pièces prise seule.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type GenreRemarque = "INCOHERENCE" | "A_RENFORCER" | "FORME";

export const LIBELLE_GENRE: Record<GenreRemarque, string> = {
  INCOHERENCE: "Incohérence entre pièces",
  A_RENFORCER: "À renforcer",
  FORME: "Remarque de forme",
};

/** Les deux valeurs qui divergent, chacune avec la pièce qui la porte. */
export interface Ecart {
  source: string;
  valeur: string;
}

export interface Remarque {
  id: string;
  genre: GenreRemarque;
  titre: string;
  /** Constat puis conséquence, puis ce qu'il y a à faire (RG-06.3). */
  corps: string;
  /** Présent sur une incohérence : ce qui diffère, et où. */
  ecarts?: readonly [Ecart, Ecart];
  /** Libellé de l'action principale. */
  action: string;
  /** Action secondaire, quand voir l'autre pièce a du sens. */
  actionSecondaire?: string;
}

/** L'incohérence passe avant le reste : c'est la seule qui se voit de l'extérieur. */
const RANG: Record<GenreRemarque, number> = {
  INCOHERENCE: 0,
  A_RENFORCER: 1,
  FORME: 2,
};

export const trierRemarques = (remarques: readonly Remarque[]): Remarque[] =>
  [...remarques].sort((a, b) => RANG[a.genre] - RANG[b.genre]);

export const compterBloquantes = (remarques: readonly Remarque[]): number =>
  remarques.filter((r) => r.genre === "INCOHERENCE").length;

/**
 * « Trois points à traiter, dont une incohérence avec une autre pièce de ton
 * dossier. » Le résumé dit le nombre et nomme ce qui compte le plus.
 */
export function resumeRelecture(remarques: readonly Remarque[]): string {
  if (remarques.length === 0) {
    return "Rien à reprendre sur cette version.";
  }
  const points = `${remarques.length} ${remarques.length > 1 ? "points à traiter" : "point à traiter"}`;
  const incoherences = compterBloquantes(remarques);
  if (incoherences === 0) return `${points}, aucune incohérence avec tes autres pièces.`;
  return incoherences > 1
    ? `${points}, dont ${incoherences} incohérences avec d'autres pièces de ton dossier.`
    : `${points}, dont une incohérence avec une autre pièce de ton dossier.`;
}

/**
 * Remarque de longueur, calculée sur le texte réel.
 *
 * Le prototype annonçait « 412 mots pour une limite conseillée de 400 »
 * au-dessus d'une lettre qui en comptait 134 : le chiffre venait de la
 * maquette, pas du document. Une relecture qui se trompe sur ce qu'elle
 * vient de compter ne se croit plus sur ce qu'elle a lu.
 *
 * `null` quand le texte tient dans la limite : une remarque de forme qui ne
 * demande rien n'a pas à occuper une place dans la liste.
 */
export function remarqueLongueur(
  mots: number,
  limiteConseillee: number,
  etablissement: string,
): Remarque | null {
  if (mots <= limiteConseillee) return null;
  const ecart = mots - limiteConseillee;
  return {
    id: "longueur",
    genre: "FORME",
    titre: `${mots} mots pour une limite conseillée de ${limiteConseillee}`,
    corps: `${etablissement} ne fixe pas de limite stricte. ${ecart} ${ecart > 1 ? "mots" : "mot"} au-dessus n'est pas un problème : tu peux laisser le texte tel quel.`,
    action: "Laisser tel quel",
  };
}

export const CE_QUE_NOUS_NE_JUGEONS_PAS =
  "Nous relevons les incohérences et les imprécisions. Nous ne notons pas ta lettre et nous ne prédisons pas la décision de l'administration.";

export const MENTION_RELECTURE =
  "Elle ne remplace pas la lecture d'un consultant.";
