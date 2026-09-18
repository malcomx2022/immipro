/**
 * Code de vérification de l'adresse email — WF-02, écran A-03.
 *
 * Six chiffres, valables dix minutes. La saisie tolère espaces et tirets :
 * un code recopié depuis un email en contient souvent.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const LONGUEUR_CODE = 6;
export const VALIDITE_MINUTES = 10;

/** Ne garde que les chiffres, et jamais plus que la longueur attendue. */
export const normaliserCode = (saisie: string): string =>
  saisie.replace(/\D/gu, "").slice(0, LONGUEUR_CODE);

export const codeComplet = (saisie: string): boolean =>
  normaliserCode(saisie).length === LONGUEUR_CODE;

/**
 * « 3 chiffres sur 6 · le code expire dans 10 minutes ».
 * Une fois complet, l'écran cesse de rappeler l'échéance : il n'y a plus
 * qu'à valider.
 */
export function libelleAvancementCode(saisie: string): string {
  const n = normaliserCode(saisie).length;
  if (n === LONGUEUR_CODE) return "Code complet.";
  const chiffres = n > 1 ? `${n} chiffres` : `${n} chiffre`;
  return `${chiffres} sur ${LONGUEUR_CODE} · le code expire dans ${VALIDITE_MINUTES} minutes`;
}
