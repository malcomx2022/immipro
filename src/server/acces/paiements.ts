import type { Transaction, TransactionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import {
  getPack,
  MONTANT_MINIMUM_XOF,
  RECHARGE_ANALYSES,
  CONSULTATION,
  type Devise,
} from "@/domain/payments/pricing";
import { effetDeLaNotification } from "@/server/paiement/cycle";
import { ouvrirDuQuota } from "./quota";
import { jeton } from "@/server/securite/secret";

/**
 * Paiements — WF-05, INV-7.
 *
 * L'idempotence se joue à deux endroits, et il faut les deux.
 *
 * **À la création (RG-05, « double soumission »).** Un candidat qui tape
 * deux fois sur « Payer » ne crée pas deux transactions : celle qui est déjà
 * en attente est reprise. Sans cela, la seconde reste orpheline et fausse la
 * réconciliation.
 *
 * **À la notification (RG-05.2).** La clé est `providerTxId`, unique en
 * base. Un webhook rejoué ne crédite pas deux fois, et la table d'états
 * refuse en plus de faire progresser une transaction déjà aboutie — un
 * rejeu n'est pas une transition.
 */

export type Achat =
  | { type: "pack"; code: string; applicationId: string }
  | { type: "recharge"; applicationId: string }
  | { type: "consultation"; applicationId: string };

export function montantDe(achat: Achat, devise: Devise): { montant: number; libelle: string } {
  if (achat.type === "pack") {
    const pack = getPack(achat.code);
    if (!pack) throw echec("champs_invalides", { champs: { pack: "Ce pack n'existe pas." } });
    return { montant: pack.prix[devise], libelle: pack.libelle };
  }
  const complement = achat.type === "recharge" ? RECHARGE_ANALYSES : CONSULTATION;
  return { montant: complement.prix[devise], libelle: complement.libelle };
}

/**
 * Création, ou reprise de la transaction en cours.
 *
 * La devise ne change plus une fois la transaction créée (WF-05, cas
 * limites) : un montant affiché dans une monnaie et encaissé dans une autre
 * est un litige, pas une commodité.
 */
export async function creerOuReprendre(
  userId: string,
  achat: Achat,
  devise: Devise,
): Promise<{ transaction: Transaction; reprise: boolean }> {
  const enCours = await db.transaction.findFirst({
    where: {
      userId,
      applicationId: achat.applicationId,
      status: { in: ["INITIEE", "EN_ATTENTE"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (enCours) {
    if (enCours.currency !== devise) throw echec("devise_figee");
    return { transaction: enCours, reprise: true };
  }

  const { montant } = montantDe(achat, devise);
  if (devise === "XOF" && montant < MONTANT_MINIMUM_XOF) {
    // RG-05.5 — sous ce seuil, frais de collecte et coût d'analyse dépassent
    // la somme encaissée.
    throw echec("montant_sous_le_minimum");
  }

  const transaction = await db.transaction.create({
    data: {
      reference: referenceInterne(),
      userId,
      applicationId: achat.applicationId,
      packCode: achat.type === "pack" ? achat.code : achat.type,
      amount: montant,
      currency: devise,
      provider: devise === "XOF" ? "FEDAPAY" : "STRIPE",
      status: "INITIEE",
    },
  });
  return { transaction, reprise: false };
}

/**
 * Référence interne, lisible et non devinable.
 *
 * Lisible parce qu'elle est dictée au téléphone à un opérateur pendant une
 * réclamation ; non séquentielle parce qu'une suite d'entiers dit le nombre
 * de paiements du mois à qui en voit deux.
 */
const referenceInterne = (): string =>
  `IMP-${new Date().toISOString().slice(2, 10).replace(/-/gu, "")}-${jeton(4).toUpperCase().slice(0, 6)}`;

export interface Notification {
  providerTxId: string;
  reference: string;
  statut: TransactionStatus;
}

export type IssueNotification =
  | { issue: "creditee"; transaction: Transaction }
  | { issue: "appliquee"; transaction: Transaction }
  | { issue: "rejeu" }
  | { issue: "inconnue" }
  | { issue: "refusee"; raison: string };

/**
 * Application d'une notification de paiement — RG-05.1, RG-05.2.
 *
 * Le webhook est la seule source de vérité : aucune autre fonction de ce
 * module ne crédite un pack, et le retour de redirection du fournisseur ne
 * passe pas par ici.
 *
 * Le `providerTxId` est posé dans la même écriture que le changement
 * d'état. Deux notifications concurrentes pour la même transaction se
 * heurtent alors à la contrainte d'unicité : la seconde échoue et ne
 * crédite rien, au lieu de créditer une seconde fois.
 */
export async function appliquerLaNotification(
  notification: Notification,
): Promise<IssueNotification> {
  const existante = await db.transaction.findUnique({
    where: { providerTxId: notification.providerTxId },
  });
  if (existante) return { issue: "rejeu" };

  const transaction = await db.transaction.findUnique({
    where: { reference: notification.reference },
  });
  if (!transaction) return { issue: "inconnue" };

  const effet = effetDeLaNotification(transaction.status, notification.statut);
  if (effet.type === "rejeu") return { issue: "rejeu" };
  if (effet.type === "refus") return { issue: "refusee", raison: effet.raison };

  const maj = await db.transaction.update({
    where: { id: transaction.id },
    data: {
      status: effet.vers,
      providerTxId: notification.providerTxId,
      ...(effet.crediteLePack ? { confirmedAt: new Date() } : {}),
    },
  });

  if (!effet.crediteLePack) return { issue: "appliquee", transaction: maj };

  await crediterLAchat(maj);
  return { issue: "creditee", transaction: maj };
}

/**
 * Crédit du pack — WF-05, étape 7.
 *
 * Le dossier passe en `ACTIF` et le quota d'analyses s'ouvre. Le nombre
 * d'analyses vient de la grille tarifaire, jamais d'une constante recopiée :
 * un pack dont le contenu change doit changer en un seul endroit.
 */
async function crediterLAchat(transaction: Transaction): Promise<void> {
  if (!transaction.applicationId) return;

  if (transaction.packCode === "recharge") {
    await ouvrirDuQuota({
      applicationId: transaction.applicationId,
      analyses: RECHARGE_ANALYSES.volume,
      motif: "RECHARGE",
      transactionId: transaction.id,
      note: RECHARGE_ANALYSES.libelle,
    });
    return;
  }

  const pack = getPack(transaction.packCode);
  if (!pack) return;

  await db.$transaction([
    db.application.update({
      where: { id: transaction.applicationId },
      data: { status: "ACTIF" },
    }),
    db.analysisCredit.create({
      data: {
        applicationId: transaction.applicationId,
        delta: pack.analyses,
        reason: "ACHAT_PACK",
        transactionId: transaction.id,
        note: `Pack ${pack.libelle}`,
      },
    }),
  ]);
}
