import { z } from "zod";
import { route } from "@/server/http/route";
import { montantDe, ouvrirLeTunnel, rattacher } from "@/server/acces/paiements";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { schemaAchat } from "@/domain/payments/achat";
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
 * Elle reprend aussi la session ouverte chez le fournisseur, par la même
 * clé d'idempotence — un second clic ne produit pas un second débit.
 *
 * **Le fournisseur n'est jamais reçu du client.** Il se déduit de la
 * devise (N.A), et la devise se relit sur la grille : le corps de la
 * requête ne porte ni fournisseur, ni montant. Les deux sont recalculés
 * ici, et le montant rendu est celui que la base a enregistré.
 *
 * **L'achat vient du domaine, schéma compris.** Il était redécrit ici en
 * `zod`, et l'achat analysé rejoignait `montantDe` par une conversion
 * forcée — c'est-à-dire sans que rien ne vérifie que les deux
 * descriptions parlaient de la même chose. Le schéma est maintenant
 * celui du domaine, et le résultat de l'analyse est confié tel quel :
 * une divergence ne compile plus.
 */
export const POST = route({
  nom: "paiements.creation",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    dossierId: z.string().uuid(),
    achat: schemaAchat,
    devise: z.enum(["XOF", "EUR"]),
  }),
  async traiter({ corps, acteur }) {
    const dossier = await dossierDuCandidat(corps.dossierId, acteur!.id);
    const achat = rattacher(corps.achat, dossier.id);

    const { montant } = montantDe(achat, corps.devise);
    const { reference, url, reprise } = await ouvrirLeTunnel(acteur!.id, achat, corps.devise);

    return {
      reference,
      /**
       * L'adresse de la page hébergée, vérifiée avant d'être rendue :
       * https, et sur le domaine du fournisseur. C'est le navigateur qui
       * s'y rend — rien de ce qui s'y passe ne revient par cette route.
       */
      url,
      montant,
      montantFormate: formatMontant(montant, corps.devise),
      devise: corps.devise,
      reprise,
    };
  },
});
