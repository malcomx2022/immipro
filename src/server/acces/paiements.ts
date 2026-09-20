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
import { suiteDictable } from "@/server/securite/secret";
import type { CauseRefus } from "@/domain/paiement/echec";

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
 * **À la notification (RG-05.2).** La clé est `PaymentEvent.providerEventId`,
 * unique en base — la notification, et non la transaction qu'elle décrit
 * (M.B). Un webhook rejoué ne crédite pas deux fois, et la table d'états
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
 *
 * Le suffixe vient d'un alphabet fait pour la voix, et non de `base64url`,
 * qui produisait des `-` et des `_` au milieu d'une référence déjà
 * ponctuée de tirets.
 */
const referenceInterne = (): string =>
  `IMP-${new Date().toISOString().slice(2, 10).replace(/-/gu, "")}-${suiteDictable(6)}`;

export interface Notification {
  /** La notification, qui est ce qui se rejoue (M.B). */
  providerEventId: string;
  /** La transaction chez le fournisseur, posée une fois (M.B). */
  providerTxId: string;
  reference: string;
  statut: TransactionStatus;
  /** Pourquoi, quand le rail le dit (N.B). */
  cause?: CauseRefus;
}

export type IssueNotification =
  | { issue: "creditee"; transaction: Transaction }
  | { issue: "appliquee"; transaction: Transaction }
  | { issue: "rejeu" }
  | { issue: "inconnue" }
  | { issue: "refusee"; raison: string };

/** Deux notifications concurrentes : la seconde n'a plus l'état qu'elle a lu. */
class EtatDejaChange extends Error {}

/**
 * Application d'une notification de paiement — RG-05.1, RG-05.2, INV-7.
 *
 * Le webhook est la seule source de vérité : aucune autre fonction de ce
 * module ne crédite un pack, et le retour de redirection du fournisseur ne
 * passe pas par ici.
 *
 * **L'idempotence porte sur la notification, pas sur la transaction** —
 * M.B. Elle tenait auparavant sur `providerTxId` : une notification dont
 * l'identifiant de transaction était déjà connu était tenue pour un rejeu.
 * Chez FedaPay, le remboursement porte le même identifiant d'entité que la
 * confirmation, et disparaissait donc sans laisser de trace ; chez Stripe,
 * il en porte un autre, et écrasait la référence opérateur du reçu.
 *
 * Deux garde-fous, parce qu'il y a deux courses différentes :
 *
 * - **la même notification deux fois** — `PaymentEvent.providerEventId` est
 *   unique, et la ligne est écrite dans la même transaction de base que le
 *   changement d'état : la seconde bute et annule tout avec elle ;
 * - **deux notifications différentes en même temps** — la mise à jour exige
 *   l'état qui vient d'être lu. La perdante n'écrit rien plutôt que
 *   d'appliquer une transition calculée sur un état périmé. C'est la course
 *   que l'ancienne clé ne couvrait pas : `succeeded` et
 *   `checkout.completed` portent deux identifiants et créditaient deux fois
 *   s'ils arrivaient ensemble.
 */
export async function appliquerLaNotification(
  notification: Notification,
): Promise<IssueNotification> {
  const transaction = await db.transaction.findUnique({
    where: { reference: notification.reference },
  });
  if (!transaction) return { issue: "inconnue" };

  const effet = effetDeLaNotification(transaction.status, notification.statut);
  if (effet.type === "rejeu") return { issue: "rejeu" };
  if (effet.type === "refus") return { issue: "refusee", raison: effet.raison };

  let maj: Transaction;
  try {
    maj = await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: {
          providerEventId: notification.providerEventId,
          transactionId: transaction.id,
          announced: notification.statut,
        },
      });

      const { count } = await tx.transaction.updateMany({
        // L'état lu est la condition : s'il a changé entre-temps, une autre
        // notification est passée et celle-ci raisonne sur le passé.
        where: { id: transaction.id, status: transaction.status },
        data: {
          status: effet.vers,
          // Posé une fois. Le remboursement de Stripe cite la charge et non
          // la session : le réécrire changerait la référence qu'un reçu déjà
          // imprimé porte.
          ...(transaction.providerTxId ? {} : { providerTxId: notification.providerTxId }),
          ...(effet.crediteLePack ? { confirmedAt: new Date() } : {}),
          // Un reçu est une pièce comptable : l'état ne va pas sans la date,
          // et la base refuse l'un sans l'autre.
          ...(effet.vers === "REMBOURSEE" ? { refundedAt: new Date() } : {}),
          /**
           * Le motif n'est écrit que sur un échec, et jamais deviné — N.B.
           *
           * La base le refuse ailleurs (`transaction_motif_seulement_sur_un_echec`),
           * et un échec annoncé par l'émetteur ne peut pas porter
           * `DELAI_DEPASSE` : il a répondu, dans le délai. Un rail qui ne dit
           * rien laisse la colonne nulle, et $-05 déduit alors de l'état —
           * mieux vaut ne rien savoir que d'inventer un solde.
           */
          ...(effet.vers === "ECHOUEE" && notification.cause && notification.cause !== "DELAI_DEPASSE"
            ? { failureCause: notification.cause }
            : {}),
        },
      });
      if (count !== 1) throw new EtatDejaChange();

      return tx.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    });
  } catch (erreur) {
    // Les deux courses se soldent de la même façon : rien n'a été écrit, et
    // la notification qui a gagné a fait le travail.
    if (erreur instanceof EtatDejaChange || estUnDoublon(erreur)) return { issue: "rejeu" };
    throw erreur;
  }

  if (!effet.crediteLePack) return { issue: "appliquee", transaction: maj };

  await crediterLAchat(maj);
  return { issue: "creditee", transaction: maj };
}

/**
 * Violation de contrainte d'unicité, reconnue sans importer le client
 * Prisma : `P2002` est le code, et c'est tout ce dont on a besoin ici.
 */
function estUnDoublon(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code?: unknown }).code === "P2002"
  );
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
