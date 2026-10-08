import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { trancherLaRevueManuelle } from "@/server/acces/paiements";

/**
 * Trancher la revue manuelle d'un remboursement — B-04, RG-15.2, revue du
 * 07/10/2026, M4 (décision D-11 du 08/10/2026).
 *
 * Un pack entamé hors de la règle du prorata ouvre un écart et n'envoie
 * rien : la somme se fixe avec la direction. Cette route l'écrit. Une
 * somme fait partir la demande, zéro referme l'obligation et laisse au
 * candidat ses analyses. Le montant arrive tel que l'opérateur l'a saisi
 * et se lit dans le domaine (`lireLeMontantTranche`), comme à l'écran.
 *
 * Le motif est obligatoire : la décision porte le nom de qui l'a prise et
 * pourquoi, au journal comme sur l'écart.
 */
export const POST = route({
  nom: "admin.paiement.remboursement.tranche",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    montant: z.string().max(20),
    motif: z.string().trim().min(10).max(500),
  }),
  async traiter({ corps, params, acteur }) {
    const transaction = await db.transaction.findUnique({
      where: { reference: params.reference! },
      select: { id: true },
    });
    if (!transaction) throw echec("paiement_introuvable");

    const tranche = await trancherLaRevueManuelle(
      params.reference!,
      corps.montant,
      corps.motif,
      acteur!.id,
    );

    // Journalisé après coup : une ligne pour une décision refusée se
    // relirait comme une décision prise.
    const relue = await db.transaction.findUnique({
      where: { id: transaction.id },
      select: { refundAmount: true },
    });
    await journaliser({
      acteurId: acteur!.id,
      action: "paiement.remboursement.tranche",
      cible: `transaction:${transaction.id}`,
      motif: corps.motif,
      details: {
        montantMineur: tranche.issue === "refermee" ? 0 : (relue?.refundAmount ?? null),
        issue: tranche.issue,
        ...(tranche.issue === "decidee" ? { envoi: tranche.envoi } : {}),
      },
    });

    return tranche;
  },
});
