import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import {
  redactionAssisteeOuverte,
  type CouvertureDuDossier,
} from "@/domain/payments/droits";

/**
 * Les couvertures effectivement attribuées à un dossier — arbitrage S.80.
 *
 * Lues dans le grand livre, comme `destinationsServies` : les octrois
 * `ACHAT_PACK` du dossier, et la transaction qui les porte. Rien n'est
 * stocké à part, rien ne peut diverger de ce qui a réellement été ouvert.
 */
export async function couverturesDuDossier(
  applicationId: string,
): Promise<CouvertureDuDossier[]> {
  const octrois = await db.analysisCredit.findMany({
    where: {
      applicationId,
      reason: "ACHAT_PACK",
      delta: { gt: 0 },
      transactionId: { not: null },
    },
    select: { transaction: { select: { packCode: true, refundDueAt: true } } },
  });
  return octrois.flatMap((o) =>
    o.transaction
      ? [{ packCode: o.transaction.packCode, retiree: o.transaction.refundDueAt !== null }]
      : [],
  );
}

export const redactionAssisteeDuDossier = async (applicationId: string): Promise<boolean> =>
  redactionAssisteeOuverte(await couverturesDuDossier(applicationId));

/**
 * La garde des gestes qui appellent le service — génération, analyse
 * critique, et ceux qui viendront : reformulation, recoupement par lecture
 * des pièces. Elle passe **avant** le débit et avant l'appel : un refus ne
 * coûte rien et n'écrit rien, et les réponses, le texte et les versions du
 * candidat ne sont pas touchés.
 */
export async function exigerRedactionAssistee(applicationId: string): Promise<void> {
  if (!(await redactionAssisteeDuDossier(applicationId))) {
    throw echec("redaction_non_couverte");
  }
}
