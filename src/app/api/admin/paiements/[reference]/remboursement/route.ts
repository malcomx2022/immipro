import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { initierLeRemboursement, ouvrirUnRemboursement } from "@/server/acces/paiements";

/**
 * Geste de remboursement — B-04, K.C tranché le 20/09/2026.
 *
 * La décision garde la force majeure hors du code, et c'est délibéré : une
 * exception automatique n'est plus une exception, c'est la règle écrite en
 * creux. Un remboursement au-delà de la limite d'annulation existe donc,
 * mais il porte le nom d'un opérateur et son motif — c'est-à-dire qu'il se
 * relit, se compte, et se discute.
 *
 * Le motif est obligatoire et n'a pas de valeur par défaut. « Geste
 * commercial » proposé en liste déroulante deviendrait la case qu'on coche
 * sans écrire, et la traçabilité que la décision demande se réduirait à une
 * date.
 *
 * La route **ouvre** un remboursement, elle ne verse rien. Le fournisseur
 * de paiement n'est pas branché (I.C) ; se déclarer quitte sans avoir rien
 * versé serait précisément la simulation qu'il interdit.
 */
export const POST = route({
  nom: "admin.paiement.remboursement",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    motif: z.string().trim().min(10).max(500),
  }),
  async traiter({ corps, params, acteur }) {
    const transaction = await db.transaction.findUnique({
      where: { reference: params.reference! },
      select: { id: true },
    });
    if (!transaction) throw echec("paiement_introuvable");

    const ouverture = await ouvrirUnRemboursement(
      transaction.id,
      `Geste de support — ${corps.motif}`,
    );
    if (!ouverture.ouvert) {
      throw echec("etat_incompatible", {
        corps: `Aucun remboursement à ouvrir sur ce paiement : ${ouverture.raison}.`,
      });
    }

    /**
     * L'obligation ouverte, la demande part — arbitrage du 21/09/2026.
     *
     * L'initiation retire les droits non consommés et tente l'envoi. Elle
     * ne verse rien : le rail n'est pas branché, l'appel rend `null`, et
     * la dette reste visible en B-04. Un pack partiellement consommé ne
     * part pas du tout — il ouvre un écart, parce que ce que vaut une
     * analyse déjà rendue est une question commerciale.
     */
    const envoi = await initierLeRemboursement(ouverture.reference);

    // Journalisé après coup et non avant : une ligne d'audit pour un geste
    // qui n'a pas eu lieu se relit comme un geste refusé sans trace.
    await journaliser({
      acteurId: acteur!.id,
      action: "paiement.remboursement",
      cible: `transaction:${transaction.id}`,
      motif: corps.motif,
      details: { origine: "geste_support", envoi: envoi.issue },
    });

    return { ouvert: true, envoi: envoi.issue };
  },
});
