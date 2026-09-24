/**
 * Connexion — A-02, WF-02.
 *
 * Deux décisions tiennent cet écran, et aucune n'est cosmétique.
 *
 * **L'erreur porte sur le couple, jamais sur un champ.** Signaler « adresse
 * inconnue » confirme qu'une adresse a un compte ici, ce qui suffit à
 * dresser une liste de clients à partir d'un carnet d'adresses. L'écran le
 * fait déjà ; le serveur doit rendre le même message dans les deux cas, et
 * mettre le même temps à le rendre.
 *
 * **Le blocage se compte par compte.** Une attaque par liste de mots de
 * passe change d'adresse d'appel à chaque essai : un comptage par adresse ne
 * la voit pas passer. Le prix à payer est qu'un tiers peut bloquer le compte
 * de quelqu'un en se trompant volontairement — d'où un blocage court, qui
 * gêne l'attaque sans enfermer la personne dehors.
 *
 * ── Question ouverte : le décompte annoncé dit si l'adresse existe ───
 *
 * La première règle ci-dessus — « le serveur doit rendre le même message
 * dans les deux cas » — n'est pas tenue par le décompte. Mesuré au
 * **premier** essai, une adresse inconnue rend « il te reste 5 essais » et
 * une adresse connue « il te reste 4 » : le compteur de l'une est
 * incrémenté avant que la phrase soit composée, l'autre n'en a pas. Un seul
 * essai suffit donc à savoir si une adresse a un compte ici — ce que tout
 * cet écran existe pour taire.
 *
 * Le temps de réponse, lui, a été aligné (24/09/2026) : l'empreinte est
 * calculée avant toute branche, blocage compris.
 *
 * Deux biens s'y opposent, et ce n'est pas au code de choisir :
 *
 * - **garder le décompte vivant** est la raison écrite plus bas, « une
 *   personne qui se trompe de mot de passe a besoin de le savoir avant
 *   d'être dehors » ;
 * - **le rendre identique** demande soit de ne plus annoncer qu'une règle
 *   fixe — « après cinq essais, le compte se bloque quinze minutes » —,
 *   soit de compter les échecs d'adresses **sans compte**, c'est-à-dire de
 *   stocker l'adresse de qui n'est pas client, ce qui a son propre prix.
 *
 * Et même alors, le message du blocage ne se produit que pour un compte
 * réel : la parité complète suppose la seconde branche.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const ESSAIS_AVANT_BLOCAGE = 5;
export const BLOCAGE_MINUTES = 15;

export interface Verdict {
  bloque: boolean;
  /** Essais restants avant blocage. Zéro pendant le blocage. */
  essaisRestants: number;
  /** Minutes avant réouverture. Zéro hors blocage. */
  reprendDansMinutes: number;
}

export function verdictDeConnexion(
  echecs: number,
  bloqueJusqua: Date | null,
  maintenant: Date,
): Verdict {
  if (bloqueJusqua && bloqueJusqua.getTime() > maintenant.getTime()) {
    return {
      bloque: true,
      essaisRestants: 0,
      reprendDansMinutes: Math.max(
        1,
        Math.ceil((bloqueJusqua.getTime() - maintenant.getTime()) / 60_000),
      ),
    };
  }
  return {
    bloque: false,
    essaisRestants: Math.max(0, ESSAIS_AVANT_BLOCAGE - echecs),
    reprendDansMinutes: 0,
  };
}

/** Le compte se bloque au énième échec, pas au premier au-delà. */
export const aBloquer = (echecsApresCetEssai: number): boolean =>
  echecsApresCetEssai >= ESSAIS_AVANT_BLOCAGE;

export const finDuBlocage = (maintenant: Date): Date =>
  new Date(maintenant.getTime() + BLOCAGE_MINUTES * 60_000);

/**
 * Message d'échec. Il dit le même mot dans les deux cas — adresse inconnue
 * ou mot de passe faux — et annonce ce qui reste avant le blocage : une
 * personne qui se trompe de mot de passe a besoin de le savoir avant d'être
 * dehors, pas après.
 */
export function libelleEchec(verdict: Verdict): string {
  if (verdict.bloque) {
    return verdict.reprendDansMinutes > 1
      ? `Trop d'essais. Le compte se rouvre dans ${verdict.reprendDansMinutes} minutes.`
      : "Trop d'essais. Le compte se rouvre dans une minute.";
  }
  return verdict.essaisRestants > 1
    ? `Il te reste ${verdict.essaisRestants} essais avant que le compte soit bloqué ${BLOCAGE_MINUTES} minutes.`
    : `Dernier essai avant que le compte soit bloqué ${BLOCAGE_MINUTES} minutes.`;
}
