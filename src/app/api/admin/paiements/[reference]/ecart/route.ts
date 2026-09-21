import { z } from "zod";
import { route } from "@/server/http/route";
import { journaliser } from "@/server/acces/journal";
import { resoudreLEcart } from "@/server/acces/paiements";
import { ISSUES_ECART, LIBELLE_ISSUE, NOTE_MINIMUM } from "@/domain/backoffice/ecart";

/**
 * Résolution manuelle d'un écart — B-04, arbitrage du 21/09/2026.
 *
 * Le bouton « Traiter les écarts » n'avait pas d'action derrière lui.
 * Celle-ci enregistre ce qu'un administrateur a constaté et décidé : une
 * issue fermée, une note obligatoire, la date, et lui.
 *
 * **Elle ne touche pas à l'argent.** Aucune écriture sur `status`, ni sur
 * les dates d'encaissement ou de remboursement : une correction
 * financière est confirmée par le fournisseur et réconciliée par sa
 * notification signée (INV-7). Un test le vérifie sur le `data` de
 * l'écriture, pas sur l'intention.
 */
export const POST = route({
  nom: "admin.paiement.ecart",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    issue: z.enum(ISSUES_ECART as unknown as [string, ...string[]]),
    /**
     * La note est obligatoire, et le minimum n'est pas décoratif : « ok »
     * ne se relit pas six mois plus tard, et c'est précisément quand on
     * relit un écart refermé qu'on a besoin de savoir ce qui avait été
     * constaté.
     */
    note: z.string().trim().min(NOTE_MINIMUM).max(1000),
  }),
  async traiter({ corps, params, acteur }) {
    const issue = corps.issue as keyof typeof LIBELLE_ISSUE;
    const { resolu } = await resoudreLEcart(
      params.reference!,
      { issue, note: corps.note },
      acteur!.id,
    );

    if (resolu) {
      await journaliser({
        acteurId: acteur!.id,
        action: "paiement.reconciliation",
        cible: `transaction:${params.reference}`,
        motif: `Écart refermé — ${LIBELLE_ISSUE[issue]} — ${corps.note}`,
        details: { issue },
      });
    }
    return { resolu };
  },
});
