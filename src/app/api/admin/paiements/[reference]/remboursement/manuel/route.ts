import { z } from "zod";
import { route } from "@/server/http/route";
import { journaliser } from "@/server/acces/journal";
import { declarerLeRemboursementManuel } from "@/server/acces/paiements";
import { db } from "@/lib/db";
import { formatMineur } from "@/domain/facturation/montants";

/**
 * Déclarer un remboursement FedaPay fait au tableau de bord — B-04, S.91.
 *
 * FedaPay n'expose aucune API de remboursement : l'opérateur rembourse
 * chez lui, puis saisit ici la référence que son tableau de bord affiche.
 * La route enregistre ce geste — « demandé » —, jamais un versement :
 * la dette reste due et visible jusqu'à la notification signée de FedaPay
 * (INV-7).
 *
 * Un rejeu de la même référence ne change rien et le dit. Le journal
 * porte la référence du fournisseur, qui n'est pas un secret et sans
 * laquelle le geste ne se relit pas ; il ne porte aucune clé d'API — la
 * route n'en manipule aucune.
 */
export const POST = route({
  nom: "admin.paiement.remboursement.manuel",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    referenceFournisseur: z.string().max(200),
  }),
  async traiter({ corps, params, acteur }) {
    const declaration = await declarerLeRemboursementManuel(
      params.reference!,
      corps.referenceFournisseur,
      acteur!.id,
    );

    // Un rejeu ne se journalise pas deux fois : il n'y a pas eu de
    // second geste.
    if (declaration.issue === "declaree") {
      const transaction = await db.transaction.findUnique({
        where: { reference: params.reference! },
        select: { id: true, currency: true },
      });
      // Le montant déclaré est la somme figée à l'initiation (RG-15.2) :
      // un remboursement partiel se relit au journal avec son chiffre.
      await journaliser({
        acteurId: acteur!.id,
        action: "paiement.remboursement.manuel",
        cible: `transaction:${transaction!.id}`,
        motif: `Remboursement fait au tableau de bord FedaPay, référence ${declaration.referenceFournisseur}, pour ${formatMineur(declaration.montantMineur, transaction!.currency)}.`,
        details: {
          referenceFournisseur: declaration.referenceFournisseur,
          montantMineur: declaration.montantMineur,
        },
      });
    }

    return declaration;
  },
});
