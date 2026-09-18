/**
 * Attente de confirmation Mobile Money — WF-05, écran $-03.
 *
 * Cinq minutes pour confirmer, une relève de l'opérateur toutes les trois
 * secondes, et « Réessayer » qui apparaît au bout de quatre-vingt-dix
 * secondes : avant ce délai, proposer de relancer pousse à payer deux fois.
 *
 * La variante retenue est le fil d'étapes, pas l'anneau qui tourne : un
 * anneau tourne aussi bien quand rien n'arrive, c'est le signal exact d'une
 * page bloquée. Le fil montre trois états qui avancent.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const DUREE_ATTENTE_SECONDES = 5 * 60;
export const PERIODE_RELEVE_SECONDES = 3;
export const DELAI_REESSAI_SECONDES = 90;

/** Les trois étapes du fil, dans l'ordre. */
export type EtapeAttente = "notification" | "code" | "confirmation";

export const ETAPES_ATTENTE: readonly EtapeAttente[] = [
  "notification",
  "code",
  "confirmation",
];

export type EtatEtape = "faite" | "en_cours" | "a_venir";

/**
 * Tant que l'opérateur n'a pas répondu, la notification est partie et c'est
 * au candidat de saisir son code : la deuxième étape est celle en cours.
 */
export function etatDeLEtape(etape: EtapeAttente): EtatEtape {
  if (etape === "notification") return "faite";
  if (etape === "code") return "en_cours";
  return "a_venir";
}

export const LIBELLES_ETAPES: Record<EtapeAttente, (numero: string) => string> = {
  notification: (numero) => `Notification envoyée au ${numero}`,
  code: () => "Tu saisis ton code PIN sur ton téléphone",
  confirmation: () => "Nous recevons la confirmation, ton pack s'ouvre",
};

export const secondesRestantes = (ecoulees: number): number =>
  Math.max(0, DUREE_ATTENTE_SECONDES - Math.max(0, Math.trunc(ecoulees)));

/** « 04:12 ». Décompte affiché, jamais annoncé (règle clavier 10). */
export function rebours(ecoulees: number): string {
  const restant = secondesRestantes(ecoulees);
  const minutes = Math.floor(restant / 60);
  const secondes = String(restant % 60).padStart(2, "0");
  return `${minutes}:${secondes}`;
}

export const attenteExpiree = (ecoulees: number): boolean =>
  secondesRestantes(ecoulees) === 0;

/** Proposer de relancer trop tôt pousse à payer deux fois. */
export const reessaiPropose = (ecoulees: number): boolean =>
  ecoulees >= DELAI_REESSAI_SECONDES;

/** « vérifié auprès de l'opérateur il y a 2 s ». Décoratif, `aria-hidden`. */
export const secondesDepuisReleve = (ecoulees: number): number =>
  Math.max(0, Math.trunc(ecoulees)) % PERIODE_RELEVE_SECONDES;
