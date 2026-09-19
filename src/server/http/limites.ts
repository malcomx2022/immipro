/**
 * Limitation de débit — règle d'architecture 5.
 *
 * « Les webhooks sont exclus du rate limiting mais leur signature est
 * vérifiée systématiquement. » Les deux moitiés de cette phrase tiennent
 * ensemble : ce qui dispense de compter les appels, c'est la preuve
 * d'origine. Une route exemptée sans signature serait une porte ouverte,
 * et c'est exactement ce qu'un test de ce lot refuse.
 *
 * La fenêtre est glissante et non fixe : une fenêtre fixe laisse passer deux
 * fois le quota à cheval sur sa frontière, ce qui est précisément le moment
 * où un client qui boucle frappe le plus fort.
 *
 * La décision est une fonction pure de l'historique ; le stockage est à
 * côté, remplaçable. En production multi-instances, il passe dans Redis
 * sans que la règle change.
 */

export interface Regle {
  /** Nombre d'appels tolérés sur la fenêtre. */
  appels: number;
  /** Largeur de la fenêtre, en secondes. */
  fenetreSecondes: number;
}

/**
 * Les trois régimes du produit.
 *
 * `sensible` couvre ce qui coûte de l'argent ou du quota, et ce qui devine
 * un secret : création de paiement, envoi de pièce, connexion. `lecture` est
 * large — un tableau de bord qui rafraîchit ne doit pas se faire fermer la
 * porte. `attente` est à part : $-03 relève le statut du paiement toutes les
 * trois secondes pendant cinq minutes, soit cent relevés pour un parcours
 * parfaitement normal. Le limiter à la cadence des autres lectures
 * couperait le seul écran qui a besoin de boucler.
 */
export const REGLES = {
  lecture: { appels: 240, fenetreSecondes: 60 },
  sensible: { appels: 10, fenetreSecondes: 60 },
  attente: { appels: 130, fenetreSecondes: 300 },
} as const satisfies Record<string, Regle>;

export type NomRegle = keyof typeof REGLES;

export interface Verdict {
  autorise: boolean;
  restant: number;
  /** Secondes avant que le prochain appel passe. Zéro quand il passe déjà. */
  reprendDans: number;
}

/**
 * Décision pure. `historique` est la liste des horodatages (ms) des appels
 * précédents, l'appelant garde ceux que la fonction lui rend.
 */
export function decider(
  historique: readonly number[],
  maintenant: number,
  regle: Regle,
): { verdict: Verdict; historique: number[] } {
  const debut = maintenant - regle.fenetreSecondes * 1000;
  const recents = historique.filter((t) => t > debut);

  if (recents.length >= regle.appels) {
    const plusAncien = Math.min(...recents);
    const reprendDans = Math.max(1, Math.ceil((plusAncien - debut) / 1000));
    return { verdict: { autorise: false, restant: 0, reprendDans }, historique: recents };
  }

  const suite = [...recents, maintenant];
  return {
    verdict: { autorise: true, restant: regle.appels - suite.length, reprendDans: 0 },
    historique: suite,
  };
}

/**
 * Stockage en mémoire du processus. Suffisant pour une instance ; le jour où
 * il y en a plusieurs, c'est ce module qui change, pas les routes.
 *
 * Le ménage est fait à l'écriture plutôt que par un minuteur : un minuteur
 * dans un processus Next tourne aussi pendant les builds et les tests, pour
 * ne rien nettoyer d'utile.
 */
const registre = new Map<string, number[]>();

const PURGE_TOUS_LES = 500;
let ecritures = 0;

function menage(maintenant: number): void {
  const plusLongue = Math.max(...Object.values(REGLES).map((r) => r.fenetreSecondes)) * 1000;
  for (const [cle, horodatages] of registre) {
    if (horodatages.every((t) => t <= maintenant - plusLongue)) registre.delete(cle);
  }
}

export function consommer(cle: string, nom: NomRegle, maintenant = Date.now()): Verdict {
  if (++ecritures % PURGE_TOUS_LES === 0) menage(maintenant);
  const { verdict, historique } = decider(registre.get(cle) ?? [], maintenant, REGLES[nom]);
  registre.set(cle, historique);
  return verdict;
}

/** Pour les tests : repart d'un registre vide. */
export function reinitialiser(): void {
  registre.clear();
  ecritures = 0;
}

/**
 * Clé de comptage. L'identifiant du compte quand il y en a un, l'adresse
 * sinon : deux candidats derrière le même opérateur mobile partagent
 * souvent une adresse, et les compter ensemble fermerait la porte au second.
 */
export const cleDAppel = (route: string, acteurId: string | null, adresse: string): string =>
  `${route}|${acteurId ?? `ip:${adresse}`}`;
