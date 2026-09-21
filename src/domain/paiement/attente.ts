/**
 * Attente de confirmation — WF-05, écran $-03.
 *
 * Cinq minutes pour confirmer, une relève toutes les trois secondes, et
 * « Réessayer » qui apparaît au bout de quatre-vingt-dix secondes : avant
 * ce délai, proposer de relancer pousse à payer deux fois.
 *
 * La variante retenue est le fil d'étapes, pas l'anneau qui tourne : un
 * anneau tourne aussi bien quand rien n'arrive, c'est le signal exact d'une
 * page bloquée. Le fil montre trois états qui avancent.
 *
 * **Les deux rails passent par cet écran** — les deux devises mènent à
 * `/paiement/attente`. Il ne parlait pourtant que Mobile Money : un payeur
 * par carte en euros lisait « Confirme le paiement sur ton téléphone » et
 * « Saisis ton code PIN », sur un rail où il n'y a ni téléphone ni code
 * PIN. Le titre d'un écran est la phrase la plus lue de l'écran, et
 * celle-ci envoyait attendre une notification qui ne viendrait jamais.
 *
 * C'est l'interdit de l'arbitrage du 21/09/2026, hors des six motifs
 * d'échec où il a été énoncé : aucun texte de carte ne mentionne une
 * notification Mobile Money, un opérateur, un téléphone, un code USSD ou
 * un portefeuille. Le corriger en $-05 et le laisser en $-03 aurait
 * réparé l'écran d'après en gardant celui d'avant.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { Rail } from "../payments/rail";

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

/**
 * Ce que l'écran dit en tête, selon le rail.
 *
 * Phrases entières des deux côtés, comme en $-05 : une phrase à trous
 * autour du nom de l'émetteur produit les accords faux qu'O.A a déjà
 * payés une fois.
 */
export const TITRE_ATTENTE: Record<Rail, string> = {
  MOBILE_MONEY: "Confirme le paiement sur ton téléphone",
  CARTE: "Confirme le paiement auprès de ta banque",
};

export const CONSIGNE_ATTENTE: Record<Rail, string> = {
  MOBILE_MONEY: "Saisis ton code PIN sur la notification que ton opérateur vient d'envoyer.",
  CARTE: "Valide la demande de confirmation que ta banque vient d'afficher.",
};

/** « vérifié auprès de … il y a 2 s » — auprès de qui, justement. */
export const AUPRES_DE: Record<Rail, string> = {
  MOBILE_MONEY: "vérifié auprès de l'opérateur",
  CARTE: "vérifié auprès de ta banque",
};

/**
 * Le lien d'échappement, quand la confirmation ne vient pas.
 *
 * Il ne contient aucun mot interdit, et c'est exactement pourquoi il a
 * survécu à la correction du reste de l'écran : « Je n'ai rien reçu »
 * décrit une notification qu'on attend sur son téléphone. Par carte, rien
 * ne s'envoie — une page s'affiche, ou elle ne s'affiche pas. Le lien
 * disait donc au payeur de chercher quelque chose qui n'existe pas, deux
 * lignes après qu'on lui a expliqué où regarder.
 *
 * La liste de mots proscrits ne pouvait pas le voir. Une prose adaptée au
 * rail ne se réduit pas à éviter des mots : elle décrit ce qui se passe
 * réellement de ce côté-là.
 */
export const RIEN_RECU: Record<Rail, string> = {
  MOBILE_MONEY: "Je n'ai rien reçu",
  CARTE: "La confirmation ne s'affiche pas",
};

/**
 * Le numéro est facultatif : ImmiPro ne conserve pas le portefeuille qui
 * paie, et un compte sans téléphone renseigné n'en a aucun à montrer.
 * Écrire « au null » vaudrait moins que ne pas le nommer.
 *
 * Il ne se cite que sur le rail qui en a un. Un payeur par carte n'a pas
 * de numéro chez nous, et n'en attend aucun à cette étape.
 */
export const LIBELLES_ETAPES: Record<
  EtapeAttente,
  (numero: string | null, rail: Rail) => string
> = {
  notification: (numero, rail) => {
    if (rail === "CARTE") return "Demande de confirmation transmise à ta banque";
    return numero ? `Notification envoyée au ${numero}` : "Notification envoyée sur ton téléphone";
  },
  code: (_numero, rail) =>
    rail === "CARTE"
      ? "Tu valides la demande auprès de ta banque"
      : "Tu saisis ton code PIN sur ton téléphone",
  // La dernière étape ne nomme personne : elle parle de nous, et elle est
  // vraie des deux côtés.
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

/** Les secondes de « vérifié auprès de … il y a 2 s ». Décoratif, `aria-hidden`. */
export const secondesDepuisReleve = (ecoulees: number): number =>
  Math.max(0, Math.trunc(ecoulees)) % PERIODE_RELEVE_SECONDES;

/**
 * Ce que l'écran fait de la relève — WF-05, étape 5.
 *
 * La décision est ici, pure, et non dans le composant : c'est la seule
 * partie de $-03 qui peut se tromper d'une façon coûteuse. Naviguer vers
 * « paiement confirmé » sur autre chose qu'un `CONFIRMEE` annoncerait un
 * débit que l'opérateur n'a pas fait.
 *
 * Le rebours épuisé ne vaut pas échec. La transaction reste ouverte tant
 * que la base ne l'a pas fermée, et un webhook en retard la confirme encore
 * (RG-05.1) : l'écran cesse de relever et dit que le délai est dépassé,
 * sans rien affirmer de l'argent.
 */
export type SuiteAttente =
  | { suite: "patienter" }
  | { suite: "confirme" }
  | { suite: "echec"; motif: "delai_depasse" | null }
  | { suite: "expire" };

const EN_COURS = new Set(["INITIEE", "EN_ATTENTE"]);

export function suiteDeLAttente(statut: string, ecoulees: number): SuiteAttente {
  if (statut === "CONFIRMEE") return { suite: "confirme" };
  // L'expiration est prononcée par la base, pas devinée par l'écran : c'est
  // le seul cas où « délai dépassé » est un fait et non une hypothèse.
  if (statut === "EXPIREE") return { suite: "echec", motif: "delai_depasse" };
  if (EN_COURS.has(statut)) {
    return attenteExpiree(ecoulees) ? { suite: "expire" } : { suite: "patienter" };
  }
  /**
   * `ECHOUEE`, et tout état que cette table ne connaît pas.
   *
   * Le motif reste nul : la raison du refus n'est pas conservée — le cycle
   * la reçoit du fournisseur et ne l'écrit nulle part. $-05 le déduit alors
   * de l'état de la transaction, ce qui vaut mieux que le repli d'avant :
   * un refus reçu en deux secondes s'y annonçait « les cinq minutes se
   * sont écoulées », et envoyait vérifier ce qui n'était pas en cause.
   */
  return { suite: "echec", motif: null };
}
