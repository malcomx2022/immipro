import { route } from "@/server/http/route";
import { retirerLePartage } from "@/server/lecture/consultants";
import { journaliser } from "@/server/acces/journal";

/**
 * Retrait d'un accord de partage — RG-12.2.
 *
 * Journalisé (RG-15.1) : le retrait est la contrepartie du consentement, et
 * une autorisation qu'on retire sans trace ne prouve rien le jour où l'on
 * demande depuis quand l'accès était fermé.
 *
 * Idempotent, et sans erreur sur un accord déjà retiré ou déjà échu : le
 * candidat n'a pas à connaître l'état de la ligne pour exercer un droit, et
 * un second appui sur un bouton ne doit pas produire un écran d'échec là où
 * le résultat voulu est déjà atteint.
 */
export const POST = route({
  nom: "comptes.partages.retrait",
  acces: "candidat",
  limite: "sensible",
  async traiter({ params, acteur }) {
    const retrait = await retirerLePartage(params.id!, acteur!.id);

    if (!retrait.dejaRetire) {
      await journaliser({
        acteurId: acteur!.id,
        action: "partage.retrait",
        cible: `application:${retrait.dossierId}`,
        motif: `Accès de ${retrait.consultant} retiré par le candidat.`,
      });
    }

    return { retire: true, dejaRetire: retrait.dejaRetire };
  },
});
