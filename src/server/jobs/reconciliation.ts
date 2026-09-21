import { db } from "@/lib/db";
import { aExpirer, aReconcilier } from "@/server/paiement/cycle";
import { journaliser } from "@/server/acces/journal";
import { appliquerLaNotification } from "@/server/acces/paiements";
import { cleDEvenementDeReconciliation } from "@/domain/paiement/ouverture";
import { leConsultant, type Consultant } from "@/server/paiement/consultation";

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
 * ── Ce que la consultation change, et ce qu'elle ne change pas ───────
 *
 * Le fournisseur est maintenant **interrogé** (voir `paiement/consultation.ts`),
 * et un état retrouvé est appliqué par **le même service que les webhooks**
 * — `appliquerLaNotification`. Une seule fonction écrit un état de paiement
 * et crédite un pack, et c'est elle : la réconciliation n'a pas son propre
 * chemin d'écriture, donc pas sa propre façon de se tromper. Elle hérite au
 * passage de l'idempotence par `PaymentEvent.providerEventId` et de la
 * protection contre les courses, qui exige que l'état lu n'ait pas bougé.
 *
 * Ce qui ne change pas :
 *
 * - **une absence de réponse n'est pas un refus.** Un fournisseur
 *   injoignable, ou dont l'adaptateur n'est pas branché, ne fait rien
 *   écrire du tout ;
 * - **l'expiration reste celle de la plateforme.** Ni Stripe ni FedaPay ne
 *   la prononcent : `aExpirer` seul décide, comme avant ;
 * - **l'écart s'ouvre au délai prévu**, que la consultation ait répondu ou
 *   non — c'est le filet du filet.
 */
export const HEURES_AVANT_TICKET = 24;

export interface Bilan {
  examinees: number;
  /** États retrouvés chez le fournisseur et appliqués. */
  rattrapees: number;
  expirees: number;
  ecartsOuverts: number;
}

/** Le consultant du fournisseur d'une transaction, mis en cache par passe. */
type Annuaire = (fournisseur: "FEDAPAY" | "STRIPE") => Consultant | null;

export async function reconcilierLesPaiements(
  maintenant = new Date(),
  consultantDe: Annuaire = (fournisseur) => leConsultant(fournisseur),
): Promise<Bilan> {
  const enAttente = await db.transaction.findMany({
    where: { status: { in: ["INITIEE", "EN_ATTENTE"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const bilan: Bilan = { examinees: 0, rattrapees: 0, expirees: 0, ecartsOuverts: 0 };

  for (const transaction of enAttente) {
    if (!aReconcilier(transaction.createdAt, maintenant)) continue;
    bilan.examinees += 1;

    const consultant = consultantDe(transaction.provider);
    const vu = consultant
      ? await consultant
          .consulter(transaction.providerTxId, transaction.reference)
          // Un adaptateur qui lève est un adaptateur indisponible : le job
          // ne s'arrête pas sur une transaction, il en a cent quatre-vingt
          // dix-neuf autres à examiner.
          .catch(() => ({ issue: "indisponible" as const, detail: "appel en erreur" }))
      : ({ issue: "indisponible", detail: "aucun consultant configuré" } as const);

    /*
      Un écart de consultation n'est pas l'écart de délai : celui-ci dit
      que le fournisseur a répondu autre chose que ce qu'on attendait, et
      il se lit tout de suite, pas dans vingt-quatre heures.
    */
    if (vu.issue === "incoherent" && !transaction.discrepancy) {
      await db.transaction.update({
        where: { id: transaction.id },
        data: { discrepancy: `Consultation incohérente : ${vu.detail}.` },
      });
      bilan.ecartsOuverts += 1;
    }

    /*
      Le fournisseur ne connaît pas une transaction qu'on a pourtant
      ouverte chez lui : anomalie. Sans identifiant, il n'y a rien à
      connaître, et ce n'en est pas une.
    */
    if (vu.issue === "introuvable" && transaction.providerTxId && !transaction.discrepancy) {
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          discrepancy: `Le fournisseur ne connaît pas la session ${transaction.providerTxId}.`,
        },
      });
      bilan.ecartsOuverts += 1;
    }

    if (vu.issue === "connu") {
      /*
        Le même service que les webhooks, avec un identifiant d'événement
        déterministe : deux passes qui lisent le même état écrivent la
        même clé, et la seconde est un rejeu. Si un webhook est passé
        entre-temps, la table des transitions refuse — c'est un rejeu
        aussi, et rien n'est crédité deux fois.
      */
      const issue = await appliquerLaNotification({
        providerEventId: cleDEvenementDeReconciliation(transaction.reference, vu.statut),
        providerTxId: vu.providerTxId,
        reference: transaction.reference,
        statut: vu.statut,
        ...(vu.cause ? { cause: vu.cause } : {}),
      });
      if (issue.issue === "creditee" || issue.issue === "appliquee") {
        bilan.rattrapees += 1;
        await journaliser({
          acteurId: "systeme:reconciliation",
          action: "paiement.reconciliation",
          cible: `transaction:${transaction.reference}`,
          motif: `État retrouvé chez le fournisseur : ${vu.statut} (RG-05.4)`,
        }).catch(() => undefined);
        // L'état vient de changer : les règles de délai ci-dessous
        // raisonneraient sur l'état d'avant.
        continue;
      }
    }

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
        // La date de l'échec est celle de ce passage, pas celle de
        // l'ouverture : c'est depuis elle que court la conservation du
        // motif (O.B), et entre les deux il y a le délai de rattrapage.
        data: { status: "EXPIREE", failureCause: "DELAI_DEPASSE", failureCauseAt: maintenant },
      });
      bilan.expirees += 1;
    }
  }

  return bilan;
}
