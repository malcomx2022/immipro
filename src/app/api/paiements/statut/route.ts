import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { estAbouti } from "@/server/paiement/cycle";

/**
 * Relève de statut — $-03, WF-05 étape 5.
 *
 * L'écran d'attente interroge cette route toutes les trois secondes pendant
 * cinq minutes. Elle est donc appelée cent fois pour un parcours normal :
 * d'où son régime de limitation propre, `attente`, qui tolère cette cadence
 * là où les autres lectures ne la toléreraient pas.
 *
 * Elle lit, et ne décide de rien. Le statut vient de la table, que seul le
 * webhook fait avancer (RG-05.1) : une relève ne confirme jamais un
 * paiement, même si le fournisseur vient de rediriger le navigateur avec un
 * « succès » dans l'URL.
 */
export const GET = route({
  nom: "paiements.statut",
  acces: "candidat",
  limite: "attente",
  requete: z.object({ tx: z.string().min(1) }),
  async traiter({ requete, acteur }) {
    const transaction = await db.transaction.findFirst({
      where: { reference: requete.tx, userId: acteur!.id },
      select: { status: true, reference: true, confirmedAt: true, applicationId: true },
    });
    if (!transaction) throw echec("paiement_introuvable");

    return {
      reference: transaction.reference,
      statut: transaction.status,
      abouti: estAbouti(transaction.status),
      confirmeLe: transaction.confirmedAt?.toISOString() ?? null,
      dossierId: transaction.applicationId,
    };
  },
});
