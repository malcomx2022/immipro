/**
 * Mot de passe — WF-02, écrans A-01 et A-04.
 *
 * La jauge n'est pas un score de sécurité : c'est un indicateur de longueur,
 * le seul critère que le prototype retient. Le message qui l'accompagne dit
 * quoi faire, jamais « mot de passe faible » seul.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const LONGUEUR_MINIMALE = 10;

/** 0 vide, 1 trop court, 2 convenable, 3 solide. */
export type Force = 0 | 1 | 2 | 3;

export function forceMotDePasse(motDePasse: string): Force {
  const n = motDePasse.length;
  if (n === 0) return 0;
  if (n < 8) return 1;
  if (n < 12) return 2;
  return 3;
}

const LIBELLES: Record<Force, string> = {
  0: "Au moins dix caractères.",
  1: "Trop court, il manque des caractères.",
  2: "Convenable. Un mot de passe plus long serait mieux.",
  3: "Solide.",
};

export const libelleForce = (motDePasse: string): string =>
  LIBELLES[forceMotDePasse(motDePasse)];

/** Un mot de passe trop court n'ouvre pas de compte : la règle est ici, pas dans l'écran. */
export const motDePasseRecevable = (motDePasse: string): boolean =>
  motDePasse.length >= LONGUEUR_MINIMALE;

/** Concordance des deux saisies de A-04. Le message est un constat, pas un reproche. */
export function libelleConcordance(motDePasse: string, confirmation: string): string {
  if (confirmation.length === 0) return "Répète exactement le même mot de passe.";
  return confirmation === motDePasse
    ? "Les deux mots de passe correspondent."
    : "Les deux mots de passe diffèrent.";
}

export const concordent = (motDePasse: string, confirmation: string): boolean =>
  confirmation.length > 0 && confirmation === motDePasse;
