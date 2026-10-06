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
 * La route **ouvre** un remboursement, et envoie la demande. Elle ne
 * verse rien : seule la notification signée du fournisseur écrit le
 * versement (INV-7). Une réponse 200 du fournisseur ressemble à de
 * l'argent rendu — c'est précisément pourquoi elle ne suffit pas, et la
 * dette reste visible en B-04 jusqu'à la notification.
 *
 * L'issue de l'envoi est rendue telle quelle à l'opérateur : il a besoin
 * de savoir si la demande est partie, si elle a été refusée pour de bon,
 * ou si le rail de ce fournisseur n'est pas branché — les trois
 * n'appellent pas la même suite.
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
     * L'obligation ouverte, la demande part — arbitrages du 21 et du
     * 22/09/2026.
     *
     * L'initiation réserve la tentative, retire les droits non
     * consommés une seule fois, et envoie. Un second clic de
     * l'opérateur pendant que le premier appel est en cours repart avec
     * `deja_en_cours` : aucune seconde demande ne part.
     *
     * Un pack entamé part au prorata des analyses restantes (RG-15.2),
     * fixé sous le verrou du grand livre au retrait des droits. Sur un
     * dossier déclaré déposé ou clos, il ne part pas du tout : il ouvre
     * un écart, et la direction tranche. Entièrement consommé, il n'a
     * même pas d'obligation — l'ouverture l'a refusé ci-dessus, raison
     * comprise.
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
