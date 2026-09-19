import type { TransactionStatus } from "@prisma/client";

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

export const aExpirer = (creeeLe: Date, maintenant: Date): boolean =>
  maintenant.getTime() - creeeLe.getTime() > DELAI_EXPIRATION_MINUTES * 60 * 1000;

export const aReconcilier = (creeeLe: Date, maintenant: Date): boolean =>
  maintenant.getTime() - creeeLe.getTime() > DELAI_RECONCILIATION_MINUTES * 60 * 1000;
