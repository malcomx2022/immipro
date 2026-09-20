import { route } from "@/server/http/route";
import { vueDuDossier } from "@/server/lecture/dossiers";

/** Checklist d'un dossier — C-06. */
export const GET = route({
  nom: "dossier",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    const { dossier, checklist, quota } = await vueDuDossier(params.id!, acteur!.id);
    // Compteur d'analyses, jamais un nombre de jetons (INV-6, lu côté écran).
    return { dossier, checklist, quota };
  },
});
