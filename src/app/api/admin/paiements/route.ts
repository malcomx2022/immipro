import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { formatMontant } from "@/lib/utils";
import { aReconcilier } from "@/server/paiement/cycle";

/**
 * Paiements — B-04, WF-15.
 *
 * L'écart de réconciliation est distinct du cycle de paiement : un silence
 * de l'opérateur laisse `reconciledAt` nul sans faire basculer le statut en
 * échec. Aucun paiement n'est accusé sur l'absence de réponse d'un tiers.
 */
export const GET = route({
  nom: "admin.paiements",
  acces: "admin",
  limite: "lecture",
  requete: z.object({
    statut: z
      .enum(["INITIEE", "EN_ATTENTE", "CONFIRMEE", "ECHOUEE", "EXPIREE", "REMBOURSEE"])
      .optional(),
  }),
  async traiter({ requete }) {
    const transactions = await db.transaction.findMany({
      where: requete.statut ? { status: requete.statut } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true } } },
    });

    const maintenant = new Date();
    return {
      paiements: transactions.map((t) => ({
        reference: t.reference,
        compte: t.user.email,
        montant: formatMontant(t.amount, t.currency),
        devise: t.currency,
        fournisseur: t.provider,
        statut: t.status,
        creeLe: t.createdAt.toISOString(),
        confirmeLe: t.confirmedAt?.toISOString() ?? null,
        rapprocheLe: t.reconciledAt?.toISOString() ?? null,
        ecart: t.discrepancy,
        // RG-05.4 — au-delà de dix minutes en attente, le job interroge le
        // fournisseur. La colonne le signale avant qu'on le demande.
        aInterroger: t.status === "EN_ATTENTE" && aReconcilier(t.createdAt, maintenant),
      })),
    };
  },
});
