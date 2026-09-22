import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { declarerLeDepot } from "@/server/dossiers/parcours";

/**
 * Déclaration de dépôt — WF-10, étape 1.
 *
 * La décision vit dans `server/dossiers/parcours.ts` : c'est elle qui
 * portait le défaut, et une route ne s'appelle pas depuis une fumée.
 * Cette route lit le dossier du candidat et rend la réponse.
 */
export const POST = route({
  nom: "dossier.depot",
  acces: "candidat_verifie",
  limite: "sensible",
  async traiter({ params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const maj = await declarerLeDepot(dossier);
    return {
      statut: maj.status,
      deposeLe: maj.submittedAt?.toISOString() ?? null,
      mention:
        "C'est ta déclaration qui est enregistrée. ImmiPro ne transmet aucune demande à une autorité.",
    };
  },
});
