import { db } from "@/lib/db";
import { aExpirer, aReconcilier } from "@/server/paiement/cycle";
import { journaliser } from "@/server/acces/journal";

/**
 * Réconciliation des paiements — RG-05.4.
 *
 * « Un job de réconciliation interroge le fournisseur toutes les quinze
 * minutes sur les transactions `EN_ATTENTE` de plus de dix minutes — le
 * webhook peut se perdre. »
 *
 * C'est le filet du pire défaut possible de ce produit : un candidat débité
 * qui ne voit rien arriver. Il paie sur un forfait mobile, il n'a pas de
 * recours simple, et une réclamation lui coûte un déplacement.
 *
 * **L'interrogation du fournisseur n'est pas branchée.** Les clés d'API
 * FedaPay et Stripe sont vides dans `.env.example`, et inventer un appel
 * sans pouvoir l'essayer donnerait l'illusion d'un filet. Ce qui est fait
 * ici est ce qui peut l'être sans les clés : marquer ce qui dépasse le
 * délai, ouvrir un écart en back-office au-delà de vingt-quatre heures
 * (WF-05, cas limites), et expirer ce qui n'aboutira plus. La fonction
 * `interroger` est le point de branchement, et un seul.
 */
export type Interrogation = (providerTxId: string | null, reference: string) => Promise<null>;

const NON_BRANCHEE: Interrogation = async () => null;

export const HEURES_AVANT_TICKET = 24;

export interface Bilan {
  examinees: number;
  expirees: number;
  ecartsOuverts: number;
}

export async function reconcilierLesPaiements(
  maintenant = new Date(),
  interroger: Interrogation = NON_BRANCHEE,
): Promise<Bilan> {
  const enAttente = await db.transaction.findMany({
    where: { status: { in: ["INITIEE", "EN_ATTENTE"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const bilan: Bilan = { examinees: 0, expirees: 0, ecartsOuverts: 0 };

  for (const transaction of enAttente) {
    if (!aReconcilier(transaction.createdAt, maintenant)) continue;
    bilan.examinees += 1;

    await interroger(transaction.providerTxId, transaction.reference);

    const ageHeures = (maintenant.getTime() - transaction.createdAt.getTime()) / 3_600_000;

    if (ageHeures >= HEURES_AVANT_TICKET && !transaction.discrepancy) {
      // WF-05, cas limites : « au-delà de 24 h, ticket automatique en
      // back-office ». L'écart est porté par la transaction elle-même, où
      // B-04 le lit, plutôt que dans une table de tickets qu'il faudrait
      // tenir à jour en double.
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          discrepancy: `Sans confirmation depuis ${Math.floor(ageHeures)} heures. Vérifier auprès du fournisseur avant toute décision.`,
        },
      });
      await journaliser({
        acteurId: "systeme:reconciliation",
        action: "paiement.reconciliation",
        cible: `transaction:${transaction.reference}`,
        motif: "Sans confirmation au-delà du délai de rattrapage (RG-05.4)",
      }).catch(() => undefined);
      bilan.ecartsOuverts += 1;
    }

    if (aExpirer(transaction.createdAt, maintenant) && transaction.status !== "INITIEE") {
      // L'expiration ne ferme pas le dossier de la réclamation : l'écart
      // reste ouvert, et un paiement retrouvé plus tard se rattrape à la
      // main depuis B-04. Ce qui est fermé, c'est l'attente côté écran.
      await db.transaction.update({
        where: { id: transaction.id },
        // Le motif est celui que la plateforme peut honnêtement prononcer :
        // personne n'a refusé ce paiement, personne n'a répondu (N.B).
        data: { status: "EXPIREE", failureCause: "DELAI_DEPASSE" },
      });
      bilan.expirees += 1;
    }
  }

  return bilan;
}
