import { z } from "zod";
import { route } from "@/server/http/route";
import {
  deviseDeLAchat,
  montantDe,
  ouvrirLeTunnel,
  preparerLAchat,
} from "@/server/acces/paiements";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { schemaAchat } from "@/domain/payments/achat";
import { formatMontant } from "@/lib/utils";
import { db } from "@/lib/db";
import { versionAcceptee } from "@/domain/comptes/acceptation";
import { pagesPubliees } from "@/server/juridique/lecture";

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
    const achat = await preparerLAchat(corps.achat, dossier.id, acteur!.id);
    // La montée garde la devise de l'achat Essentiel (S.88).
    const devise = deviseDeLAchat(achat, corps.devise);

    const { montant } = montantDe(achat, devise);
    const { reference, url, reprise } = await ouvrirLeTunnel(acteur!.id, achat, devise);

    /*
      L'acceptation des conditions publiées, avec leur version — S.101.
      L'écran ne laisse payer qu'une fois la case cochée ; les conditions
      disent que « chaque acceptation est enregistrée avec la version des
      conditions acceptée et sa date », et c'est ici qu'elle l'est. Une
      reprise du même tunnel n'en ajoute pas une seconde.
    */
    const version = versionAcceptee(["conditions"], await pagesPubliees());
    if (version && !reprise) {
      await db.consent.create({ data: { userId: acteur!.id, kind: "CGU", granted: true, version } });
    }

    return {
      reference,
      /**
       * L'adresse de la page hébergée, vérifiée avant d'être rendue :
       * https, et sur le domaine du fournisseur. C'est le navigateur qui
       * s'y rend — rien de ce qui s'y passe ne revient par cette route.
       */
      url,
      montant,
      montantFormate: formatMontant(montant, devise),
      devise,
      reprise,
    };
  },
});
