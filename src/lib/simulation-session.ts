import type { Reponses } from "@/domain/simulateur/questions";

/**
 * Réponses du simulateur — WF-01.
 *
 * Elles ne quittent pas l'appareil et ne survivent pas à la session : le
 * simulateur ne crée pas de compte et ne conserve rien côté serveur. D'où
 * `sessionStorage`, et non un cookie qui partirait à chaque requête.
 *
 * Tous les accès sont gardés : en navigation privée, avec les données de
 * site bloquées, ou pendant le rendu serveur, la lecture échoue — l'écran
 * doit alors montrer son état vide, pas une erreur.
 */
const CLE = "immipro.simulation";

export function lireReponses(): Reponses {
  try {
    const brut = window.sessionStorage.getItem(CLE);
    if (!brut) return {};
    const valeur: unknown = JSON.parse(brut);
    if (typeof valeur !== "object" || valeur === null) return {};
    return valeur as Reponses;
  } catch {
    return {};
  }
}

export function ecrireReponses(reponses: Reponses): void {
  try {
    window.sessionStorage.setItem(CLE, JSON.stringify(reponses));
  } catch {
    // Stockage indisponible : la simulation reste utilisable le temps de
    // l'écran, elle ne se retrouvera simplement pas sur le suivant.
  }
}

export function effacerReponses(): void {
  try {
    window.sessionStorage.removeItem(CLE);
  } catch {
    // Rien à faire : il n'y avait rien à effacer.
  }
}
