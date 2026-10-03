import { z } from "zod";
import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { demanderUneRelecture } from "@/server/dossiers/relecture-completude";
import { EXPLICATION_MAX } from "@/domain/completeness/relecture";

/**
 * Demande de relecture humaine de la complétude — C-09, avis juridique L.A
 * du 03/10/2026 : le calcul est automatique, la contestation ne l'est pas.
 */
export const POST = route({
  nom: "dossier.completude.relecture",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({ explication: z.string().max(EXPLICATION_MAX * 2) }),
  async traiter({ params, corps, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const demande = await demanderUneRelecture(dossier.id, corps.explication);
    return { statut: demande.status, demandeeLe: demande.createdAt.toISOString() };
  },
});
