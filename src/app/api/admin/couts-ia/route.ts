import { route } from "@/server/http/route";
import { coutsParDossier } from "@/server/lecture/backoffice";
import { SEUIL_MARGE_IA } from "@/domain/payments/pricing";

/**
 * Coûts IA — B-07, WF-16.
 *
 * RG-16.1 : le coût marginal moyen d'un dossier doit rester sous 15 % du
 * prix du pack correspondant. La route rapproche le coût réel enregistré du
 * prix effectivement payé, dossier par dossier plutôt qu'en moyenne : une
 * moyenne saine masque exactement le dossier qui déborde, et c'est celui-là
 * qu'il faut voir (RG-16.2).
 */
export const GET = route({
  nom: "admin.couts",
  acces: "admin",
  limite: "lecture",
  async traiter() {
    const dossiers = await coutsParDossier();
    return {
      seuil: SEUIL_MARGE_IA,
      dossiers,
      // La mesure sur dix dossiers réels reste à faire : tant qu'elle
      // manque, les quotas de la grille sont des ordres de grandeur.
      dossiersMesures: dossiers.length,
    };
  },
});
