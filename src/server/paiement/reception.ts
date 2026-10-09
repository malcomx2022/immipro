import { appliquerLaNotification, type Notification } from "@/server/acces/paiements";
import { journaliser } from "@/server/acces/journal";
import { envoyerRemboursementConfirme } from "@/server/courrier";
import { prevenirDuRecu } from "@/server/paiement/recu";
import { db } from "@/lib/db";
import { formatMontant } from "@/lib/utils";
import { sommeARendre } from "@/domain/paiement/remboursement";
import { facteurMineur, prixPayeMineur } from "@/domain/facturation/montants";

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
    /*
      Le reçu est réservé, puis tenté (F3) : un courrier qui ne part pas
      est repris par la passe de réconciliation, et rien de ce qui suit le
      crédit ne renvoie d'erreur au fournisseur.
    */
    case "creditee":
      await prevenirDuRecu(resultat.transaction);
      return { recue: true, issue: "creditee" };
    /**
     * Le remboursement confirmé — arbitrage du 21/09/2026.
     *
     * Une confirmation de remboursement n'ouvre aucun droit : elle arrive
     * donc ici, sous « appliquée », et non sous « créditée ». C'est **le
     * seul endroit** où le candidat est prévenu — ni la décision de
     * rembourser, ni la demande envoyée au fournisseur ne sont l'argent
     * rendu, et annoncer trop tôt ferait chercher sur un relevé une somme
     * qui n'y est pas.
     *
     * L'échec d'un courrier ne défait pas un remboursement confirmé : la
     * notification signée a été appliquée, et c'est elle qui fait foi.
     */
    case "appliquee": {
      const transaction = resultat.transaction;
      if (transaction.status === "REMBOURSEE" && transaction.refundedAt) {
        const user = await db.user.findUnique({
          where: { id: transaction.userId },
          select: { email: true },
        });
        if (user) {
          // La somme rendue, figée à l'initiation — RG-15.2. Le prix payé
          // ne s'ajoute que s'il en diffère : un remboursement partiel.
          const payeMineur = prixPayeMineur(transaction);
          const rendu = sommeARendre(transaction.refundAmountMinor, payeMineur);
          const enUnites = (mineur: number) =>
            formatMontant(mineur / facteurMineur(transaction.currency), transaction.currency);
          await envoyerRemboursementConfirme(
            user.email,
            transaction.reference,
            enUnites(rendu),
            rendu < payeMineur ? enUnites(payeMineur) : undefined,
          ).catch(() => undefined);
        }
      }
      return { recue: true, issue: "appliquee" };
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
