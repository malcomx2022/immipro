import { useSyncExternalStore } from "react";
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
  memoire = reponses;
  try {
    window.sessionStorage.setItem(CLE, JSON.stringify(reponses));
  } catch {
    // Stockage indisponible : la simulation reste utilisable le temps de
    // l'écran, elle ne se retrouvera simplement pas sur le suivant.
    stockageMuet = true;
  }
  prevenir();
}

export function effacerReponses(): void {
  memoire = VIDE;
  try {
    window.sessionStorage.removeItem(CLE);
  } catch {
    // Rien à faire : il n'y avait rien à effacer.
  }
  prevenir();
}

/*
  Les réponses comme source externe pour React — S.164, RF-7.

  Les écrans les lisaient dans un effet après le montage, puis les
  recopiaient dans un état : un rendu de plus, et deux copies qui
  pouvaient diverger. `useSyncExternalStore` lit la source elle-même :
  `null` au rendu serveur et pendant l'hydratation (rien n'est encore
  lu), puis les réponses de la session.

  L'instantané doit garder la même référence tant que rien n'a changé :
  il est mis en cache sur la chaîne brute. Si le stockage refuse
  d'écrire, la mémoire du module prend le relais, pour que l'écran suive
  le geste comme il le faisait avec son état local.
*/
const VIDE: Reponses = Object.freeze({}) as Reponses;
const abonnes = new Set<() => void>();
let memoire: Reponses = VIDE;
let stockageMuet = false;
let dernierBrut: string | null | undefined;
let dernier: Reponses = VIDE;

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

function sAbonner(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

function instantane(): Reponses {
  if (stockageMuet) return memoire;
  let brut: string | null;
  try {
    brut = window.sessionStorage.getItem(CLE);
  } catch {
    return memoire;
  }
  if (brut !== dernierBrut) {
    dernierBrut = brut;
    dernier = brut === null ? VIDE : lireReponses();
  }
  return dernier;
}

const instantaneServeur = (): null => null;

/** Les réponses de la session ; `null` tant qu'elles n'ont pas pu être lues. */
export function useReponsesDeSession(): Reponses | null {
  return useSyncExternalStore<Reponses | null>(sAbonner, instantane, instantaneServeur);
}
