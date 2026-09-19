import { z } from "zod";
import { route } from "@/server/http/route";
import { creerOuReprendre, montantDe } from "@/server/acces/paiements";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { formatMontant } from "@/lib/utils";

/**
 * Création d'un paiement — $-02, WF-05.
 *
 * La route ne crédite rien et ne confirme rien : elle ouvre une transaction
 * locale et rend de quoi rejoindre la page hébergée du fournisseur. Le
 * crédit vient du webhook signé, et de lui seul (RG-05.1).
 *
 * Une seconde soumission reprend la transaction en attente au lieu d'en
 * créer une (WF-05, cas limites) : deux transactions pour un paiement
 * faussent la réconciliation et laissent une ligne orpheline en back-office.
 */
export const POST = route({
  nom: "paiements.creation",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    dossierId: z.string().uuid(),
    achat: z.discriminatedUnion("type", [
      z.object({ type: z.literal("pack"), code: z.string().min(1) }),
      z.object({ type: z.literal("recharge") }),
      z.object({ type: z.literal("consultation") }),
    ]),
    devise: z.enum(["XOF", "EUR"]),
  }),
  async traiter({ corps, acteur }) {
    const dossier = await dossierDuCandidat(corps.dossierId, acteur!.id);
    const achat = { ...corps.achat, applicationId: dossier.id } as Parameters<
      typeof montantDe
    >[0];

    const { transaction, reprise } = await creerOuReprendre(acteur!.id, achat, corps.devise);

    return {
      reference: transaction.reference,
      montant: transaction.amount,
      montantFormate: formatMontant(transaction.amount, transaction.currency),
      devise: transaction.currency,
      fournisseur: transaction.provider,
      statut: transaction.status,
      reprise,
    };
  },
});
