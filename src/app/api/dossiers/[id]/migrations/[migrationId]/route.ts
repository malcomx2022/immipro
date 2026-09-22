import { z } from "zod";
import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { arbitrerLaDivergence } from "@/server/dossiers/migration";

/**
 * Arbitrage d'une divergence réglementaire — T-02, WF-11 étape 4.
 *
 * La décision vit dans `server/dossiers/migration.ts`, pour qu'une fumée
 * puisse l'appeler : c'est ainsi qu'on a vu qu'elle ne passait pas sur un
 * dossier prêt, et que « je conserve » ne levait jamais la pause.
 */
export const POST = route({
  nom: "dossier.migration",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({ decision: z.enum(["MIGRER", "CONSERVER"]) }),
  async traiter({ corps, params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    return arbitrerLaDivergence(dossier, params.migrationId!, corps.decision);
  },
});
