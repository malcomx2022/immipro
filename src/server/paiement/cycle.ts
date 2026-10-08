import type { TransactionStatus } from "@prisma/client";
import { formatMineur, versMineur } from "@/domain/facturation/montants";
import { sommeARendre } from "@/domain/paiement/remboursement";

/**
 * Cycle de vie d'un paiement — DOC-11 §2.3.
 *
 * `INITIEE → EN_ATTENTE → (CONFIRMEE | ECHOUEE | EXPIREE) → [REMBOURSEE]`
 *
 * La table est ici, pure et testable, parce que c'est elle qui rend
 * l'idempotence vérifiable. INV-7 dit qu'un webhook rejoué ne crédite jamais
 * deux fois ; la clé d'idempotence (`providerTxId`) empêche d'en créer deux,
 * et cette table empêche d'en faire progresser un qui a déjà abouti — un
 * `CONFIRMEE → CONFIRMEE` n'est pas une transition, c'est un rejeu.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

const SUITES: Record<TransactionStatus, readonly TransactionStatus[]> = {
  INITIEE: ["EN_ATTENTE", "ECHOUEE", "EXPIREE", "CONFIRMEE"],
  EN_ATTENTE: ["CONFIRMEE", "ECHOUEE", "EXPIREE"],
  CONFIRMEE: ["REMBOURSEE"],
  ECHOUEE: [],
  EXPIREE: [],
  REMBOURSEE: [],
};

export type Effet =
  /** La transition a lieu ; l'appelant écrit et crédite s'il y a lieu. */
  | { type: "appliquer"; vers: TransactionStatus; crediteLePack: boolean }
  /** Rien à faire : la notification répète un état déjà atteint. */
  | { type: "rejeu" }
  /** La transition n'existe pas. Elle est journalisée, pas appliquée. */
  | { type: "refus"; raison: string };

/**
 * Ce qu'il faut faire d'une notification. Le crédit du pack n'accompagne que
 * l'entrée en `CONFIRMEE`, une seule fois : c'est la ligne où INV-7 se joue.
 */
export function effetDeLaNotification(
  actuel: TransactionStatus,
  annonce: TransactionStatus,
): Effet {
  if (actuel === annonce) return { type: "rejeu" };
  if (!SUITES[actuel].includes(annonce)) {
    return {
      type: "refus",
      raison: `${actuel} ne mène pas à ${annonce}`,
    };
  }
  return { type: "appliquer", vers: annonce, crediteLePack: annonce === "CONFIRMEE" };
}

/**
 * Une confirmation qui arrive sur un paiement déjà tenu pour échoué ou
 * expiré — relevé en bac à sable le 05/10/2026.
 *
 * La table des transitions la refuse, et elle a raison : on ne réécrit pas
 * un état abouti sur la parole d'un message. Mais le refus seul se
 * contentait d'une ligne au journal. Or c'est précisément le cas où le
 * candidat a payé — le bac à sable l'a montré le 05/10 : `declined` à
 * 16 h 58, puis `approved` à 17 h 59 sur la **même** transaction — et ne
 * reçoit rien, sans que personne le voie en B-04. L'écart s'ouvre donc,
 * avec ce qu'il faut faire. Le pack n'a pas été ouvert et la transaction
 * reste échouée : la somme se rend au tableau de bord du fournisseur,
 * comme pour un second paiement, puis l'écart se referme sur l'issue
 * « Écart expliqué, sans correction financière », la note citant la
 * référence du remboursement. « Remboursement à initier » ne convient
 * pas : il renvoie à un remboursement depuis la transaction, qu'une
 * transaction échouée n'ouvre pas.
 *
 * Rend le constat à écrire, ou `null` si la situation n'est pas celle-là.
 */
export function ecartDeConfirmationTardive(
  actuel: TransactionStatus,
  annonce: TransactionStatus,
  providerTxId: string,
): string | null {
  if (annonce !== "CONFIRMEE" || (actuel !== "ECHOUEE" && actuel !== "EXPIREE")) return null;
  const etat = actuel === "ECHOUEE" ? "échouée" : "expirée";
  return `Paiement confirmé par le fournisseur (${providerTxId}) alors que la transaction était tenue pour ${etat} : aucun pack n'a été ouvert. Vérifier l'encaissement au tableau de bord du fournisseur et, s'il est réel, y rembourser la somme.`;
}

/** États sur lesquels plus rien n'arrive, hors remboursement. */
export const ABOUTI: readonly TransactionStatus[] = [
  "CONFIRMEE",
  "ECHOUEE",
  "EXPIREE",
  "REMBOURSEE",
];

export const estAbouti = (statut: TransactionStatus): boolean => ABOUTI.includes(statut);

/**
 * RG-05.4 : le job de réconciliation interroge le fournisseur sur les
 * transactions en attente depuis plus de dix minutes. Le webhook peut se
 * perdre, et un paiement débité sans crédit est le pire des défauts de ce
 * produit — le candidat a payé et ne voit rien.
 */
export const DELAI_RECONCILIATION_MINUTES = 10;

/**
 * Au-delà, la transaction est tenue pour expirée côté plateforme : $-03
 * abandonne son décompte à cinq minutes, et une attente qui dure une heure
 * n'est plus une attente, c'est un paiement perdu qu'il faut pouvoir
 * relancer.
 */
export const DELAI_EXPIRATION_MINUTES = 60;

/**
 * Bail d'ouverture de la contrepartie — INV-7.
 *
 * Le temps qu'on accorde à un appelant pour ouvrir ce qu'un paiement a
 * acheté. Il est large devant le travail réel — quelques écritures — et
 * court devant la cadence du filet de réconciliation : un processus arrêté
 * en plein crédit est repris à la passe suivante, pas dans une heure.
 */
export const BAIL_DE_CREDIT_MINUTES = 5;

export const aExpirer = (creeeLe: Date, maintenant: Date): boolean =>
  maintenant.getTime() - creeeLe.getTime() > DELAI_EXPIRATION_MINUTES * 60 * 1000;

export const aReconcilier = (creeeLe: Date, maintenant: Date): boolean =>
  maintenant.getTime() - creeeLe.getTime() > DELAI_RECONCILIATION_MINUTES * 60 * 1000;

/**
 * Ce que vaut un remboursement annoncé par le fournisseur — INV-7, revue
 * du 07/10/2026, E3 (décisions D-8 et D-10 du 08/10/2026).
 *
 * `CONFIRMEE → REMBOURSEE` passait sur le seul statut. Un geste fait au
 * tableau de bord, sans obligation chez nous, soldait donc une dette qui
 * n'existait pas : avoir du prix entier, droits laissés au candidat. Et
 * un remboursement partiel ou excédentaire soldait la dette comme s'il
 * était exact.
 *
 * | Cas                                           | Effet                 |
 * |-----------------------------------------------|-----------------------|
 * | Aucune obligation (D-8)                       | écart, rien ne bouge  |
 * | Obligation non initiée (revue manuelle, M4)   | écart, rien ne bouge  |
 * | Initiée, montant non dit (FedaPay)            | appliquer             |
 * | Montant égal au dû                            | appliquer             |
 * | Montant inférieur au dû (partiel)             | écart ; le cumul suivant appliquera |
 * | Montant supérieur au dû (D-10)                | écart, à trancher avec M.C |
 *
 * Le dû est la somme figée sur l'obligation, ou le prix payé quand elle
 * n'en porte pas (`sommeARendre`). Pur : l'appelant écrit l'écart.
 */
export type VerdictDuRemboursement = { issue: "appliquer" } | { issue: "ecart"; constat: string };

export function verdictDuRemboursementAnnonce(
  t: {
    reference: string;
    amount: number;
    currency: string;
    refundDueAt: Date | null;
    refundAttemptedAt: Date | null;
    refundRequestedAt: Date | null;
    refundAmount: number | null;
  },
  rembourseMineur: number | null,
): VerdictDuRemboursement {
  const paye = versMineur(t.amount, t.currency);
  const du = sommeARendre(t.refundAmount, paye);
  const annonce =
    rembourseMineur === null ? "" : ` pour ${formatMineur(rembourseMineur, t.currency)}`;

  if (t.refundDueAt === null) {
    return {
      issue: "ecart",
      constat: `Remboursement annoncé par le fournisseur${annonce} alors qu'aucun remboursement n'était décidé pour ${t.reference} : la transaction reste confirmée, les analyses ne sont pas retirées et aucun avoir n'est émis. Si le geste est voulu, ouvrir le remboursement depuis la ligne du paiement puis l'initier : la passe suivante soldera la dette.`,
    };
  }
  if (t.refundAttemptedAt === null && t.refundRequestedAt === null) {
    return {
      issue: "ecart",
      constat: `Remboursement annoncé par le fournisseur${annonce} pour ${t.reference}, alors que la demande n'a pas été initiée par la plateforme : la somme est encore en revue. Trancher la revue en B-04 avant de solder la dette.`,
    };
  }
  if (rembourseMineur === null || rembourseMineur === du) return { issue: "appliquer" };
  if (rembourseMineur < du) {
    return {
      issue: "ecart",
      constat: `Remboursement partiel constaté pour ${t.reference} : ${formatMineur(rembourseMineur, t.currency)} rendus sur ${formatMineur(du, t.currency)} dus. La dette n'est pas soldée ; elle le sera quand le fournisseur annoncera la somme entière.`,
    };
  }
  return {
    issue: "ecart",
    constat: `Remboursement supérieur au dû constaté pour ${t.reference} : ${formatMineur(rembourseMineur, t.currency)} rendus pour ${formatMineur(du, t.currency)} dus. La dette n'est pas soldée et aucun avoir n'est émis : à trancher avec le comptable.`,
  };
}
