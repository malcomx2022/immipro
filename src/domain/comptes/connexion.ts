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
 * ── Le décompte ne dit pas si l'adresse existe (D-3, 08/10/2026) ─────
 *
 * La première règle ci-dessus n'était pas tenue par le décompte : au
 * **premier** essai, une adresse inconnue rendait « il te reste 5 essais »
 * et une adresse connue « il te reste 4 », faute de compteur pour la
 * première. Un seul essai disait donc si une adresse avait un compte ici
 * (revue du 07/10/2026, M2).
 *
 * Le produit a tranché pour garder le décompte vivant — « une personne qui
 * se trompe de mot de passe a besoin de le savoir avant d'être dehors » —
 * et pour compter les échecs des adresses **sans compte**, sous une
 * empreinte salée, en mémoire (`server/acces/echecs-sans-compte.ts`). Les
 * mêmes fonctions décident pour les deux : même phrase, même blocage.
 *
 * Le temps de réponse, lui, a été aligné le 24/09/2026 : l'empreinte est
 * calculée avant toute branche, blocage compris.
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
