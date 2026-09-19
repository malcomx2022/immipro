import { appliquerLaNotification, type Notification } from "@/server/acces/paiements";
import { journaliser } from "@/server/acces/journal";
import { envoyerRecu } from "@/server/courrier";
import { db } from "@/lib/db";
import { formatMontant } from "@/lib/utils";

/**
 * Réception d'une notification de paiement, commune aux deux rails.
 *
 * **La réponse est toujours 200, sauf défaillance de notre côté.** Un
 * fournisseur qui reçoit une erreur rejoue, avec une temporisation
 * croissante, pendant des heures. Rejouer ne réparera pas une charge utile
 * qu'on ne sait pas lire ni une référence qui n'existe pas : le bon geste
 * est d'accuser réception, de journaliser, et de laisser la réconciliation
 * périodique rattraper ce qui doit l'être (RG-05.4).
 *
 * Ce qui reste en 5xx : une panne de base. Là, le rejeu est exactement ce
 * qu'il faut.
 */
export async function traiterLaNotification(
  lue: Notification | null,
  rail: string,
): Promise<{ recue: true; issue: string }> {
  if (!lue) {
    console.warn(`[webhook:${rail}] charge utile non reconnue`);
    return { recue: true, issue: "illisible" };
  }

  const resultat = await appliquerLaNotification(lue);

  switch (resultat.issue) {
    case "creditee": {
      const transaction = resultat.transaction;
      const user = await db.user.findUnique({
        where: { id: transaction.userId },
        select: { email: true },
      });
      if (user) {
        await envoyerRecu(
          user.email,
          transaction.reference,
          formatMontant(transaction.amount, transaction.currency),
        );
      }
      return { recue: true, issue: "creditee" };
    }
    case "refusee":
      // Une transition impossible n'est pas un incident de transport : elle
      // signale un désaccord d'état avec le fournisseur, que la
      // réconciliation devra trancher. Elle se journalise, elle ne s'écrit pas.
      await journaliser({
        acteurId: `webhook:${rail}`,
        action: "paiement.reconciliation",
        cible: `transaction:${lue.reference}`,
        motif: `Notification refusée — ${resultat.raison}`,
      }).catch(() => undefined);
      return { recue: true, issue: "refusee" };
    default:
      return { recue: true, issue: resultat.issue };
  }
}
