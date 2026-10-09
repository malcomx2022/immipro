import type { Transaction } from "@prisma/client";
import { db } from "@/lib/db";
import { envoyerRecu } from "@/server/courrier";
import { formatMontant } from "@/lib/utils";
import { tenterUnCourrierReserve } from "@/server/jobs/courrier-reserve";
import type { EtatDuCourrier } from "@/domain/dossiers/preferences-rappels";

/**
 * Le reçu d'un paiement confirmé — WF-05 étape 8, RG-05.1, revue du
 * 07/10/2026, F3.
 *
 * La réception du webhook envoyait le reçu elle-même et ignorait l'issue
 * de l'envoi : un reçu qui ne partait pas n'était jamais repris. Et une
 * lecture de la base ou un transport qui levait après le crédit renvoyait
 * une erreur au fournisseur, qui rejouait une notification déjà appliquée
 * — rejeu muet, toujours sans reçu.
 *
 * Le reçu suit désormais le chemin des rappels et des relances (S.87,
 * S.89) : une notification `PAIEMENT` à clé unique (`recu:<référence>`) est
 * réservée avec un courrier `EN_ATTENTE`, la première tentative part tout
 * de suite, et la passe de réconciliation reprend celui qui n'est pas
 * parti. La réponse au fournisseur ne dépend plus du courrier.
 */
export const cleDuRecu = (reference: string): string => `recu:${reference}`;

/** Au-delà, le reçu reste consultable dans l'espace du candidat, et le courrier s'abandonne. */
export const TENTATIVES_DU_RECU = 5;

/**
 * Ce que la réception attend de la première tentative avant de répondre au
 * fournisseur. Un relais lent ne retient plus la réponse quarante
 * secondes : passé ce délai, l'envoi continue sans elle, et la passe
 * reprendra s'il échoue.
 */
export const ATTENTE_DU_PREMIER_ENVOI_MS = 3_000;

const decider = (
  suite: { parti: boolean; renvoyable: boolean },
  tentative: number,
): EtatDuCourrier => {
  if (suite.parti) return "ENVOYE";
  if (!suite.renvoyable || tentative >= TENTATIVES_DU_RECU) return "NON_ENVOYE";
  return "EN_ATTENTE";
};

const montantDe = (t: Pick<Transaction, "amountMajor" | "currency">) =>
  formatMontant(t.amountMajor, t.currency);

const estUnDoublon = (erreur: unknown): boolean =>
  (erreur as { code?: unknown } | null)?.code === "P2002";

/** Réserve le reçu d'une transaction, une fois. `null` s'il l'est déjà. */
async function reserverLeRecu(
  transaction: Transaction,
): Promise<{ id: string; emailAttempts: number } | null> {
  try {
    return await db.notification.create({
      data: {
        userId: transaction.userId,
        applicationId: transaction.applicationId,
        kind: "PAIEMENT",
        title: "Paiement enregistré",
        body: `Ton paiement de ${montantDe(transaction)} est enregistré sous la référence ${transaction.reference}. Le reçu détaillé est consultable dans ton espace.`,
        dedupKey: cleDuRecu(transaction.reference),
        emailStatus: "EN_ATTENTE",
      },
      select: { id: true, emailAttempts: true },
    });
  } catch (erreur) {
    if (estUnDoublon(erreur)) return null;
    throw erreur;
  }
}

async function tenterLeRecu(
  notification: { id: string; emailAttempts: number },
  transaction: Pick<Transaction, "userId" | "reference" | "amountMajor" | "currency">,
  maintenant: Date,
): Promise<EtatDuCourrier | null> {
  const user = await db.user.findUnique({
    where: { id: transaction.userId },
    select: { email: true, deletionRequestedAt: true },
  });
  if (!user || user.deletionRequestedAt) {
    // Un compte parti ou sur le départ ne reçoit plus de courrier.
    await db.notification.updateMany({
      where: { id: notification.id, emailStatus: "EN_ATTENTE" },
      data: { emailStatus: "NON_ENVOYE" },
    });
    return "NON_ENVOYE";
  }
  return tenterUnCourrierReserve(
    notification,
    () => envoyerRecu(user.email, transaction.reference, montantDe(transaction)),
    decider,
    maintenant,
  );
}

/**
 * À la confirmation : réserver le reçu et tenter de l'envoyer. Ne lève
 * jamais — un crédit appliqué ne se défait pas sur un courrier.
 */
export async function prevenirDuRecu(transaction: Transaction, maintenant = new Date()): Promise<void> {
  try {
    const reserve = await reserverLeRecu(transaction);
    if (!reserve) return;
    const tentative = tenterLeRecu(reserve, transaction, maintenant).catch(() => null);
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      tentative,
      new Promise((resoudre) => {
        minuterie = setTimeout(resoudre, ATTENTE_DU_PREMIER_ENVOI_MS);
      }),
    ]);
    clearTimeout(minuterie);
  } catch (erreur) {
    console.warn(
      `[recu] ${transaction.reference} : reçu non réservé (${erreur instanceof Error ? erreur.name : "erreur"}) ; il reste consultable et renvoyable depuis l'espace du candidat ($-06)`,
    );
  }
}

/**
 * La reprise des reçus restés en attente — appelée par la passe de
 * réconciliation. Rend le nombre de reçus partis.
 */
export async function reprendreLesRecus(maintenant = new Date()): Promise<number> {
  const enAttente = await db.notification.findMany({
    where: { kind: "PAIEMENT", emailStatus: "EN_ATTENTE", dedupKey: { startsWith: "recu:" } },
    select: { id: true, emailAttempts: true, dedupKey: true },
    take: 100,
  });
  let partis = 0;
  for (const n of enAttente) {
    const reference = n.dedupKey!.slice("recu:".length);
    const transaction = await db.transaction.findUnique({
      where: { reference },
      select: { userId: true, reference: true, amountMajor: true, currency: true },
    });
    if (!transaction) continue;
    const etat = await tenterLeRecu(n, transaction, maintenant).catch(() => null);
    if (etat === "ENVOYE") partis += 1;
  }
  return partis;
}
