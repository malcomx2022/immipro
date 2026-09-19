import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { versDossier, versPiece } from "@/server/vue/dossier";
import { versFiche } from "@/server/acces/regles";
import { compteur } from "@/server/acces/quota";
import { grouperPourCompletude } from "@/domain/dossiers/piece";

/** Checklist d'un dossier — C-06. */
export const GET = route({
  nom: "dossier",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    const dossier = await db.application.findFirst({
      where: { id: params.id, userId: acteur!.id },
      include: {
        documents: { orderBy: [{ family: "asc" }, { createdAt: "asc" }] },
        visaRule: true,
      },
    });
    if (!dossier) throw echec("introuvable");

    const fiche = dossier.visaRule ? versFiche(dossier.visaRule) : null;
    if (!fiche) throw echec("regle_indisponible");

    const pieces = dossier.documents.map(versPiece);
    const { bloquantes, ensuite, conformes } = grouperPourCompletude(pieces);

    return {
      dossier: versDossier(dossier, dossier.documents, fiche),
      checklist: { bloquantes, ensuite, conformes },
      // Compteur d'analyses, jamais un nombre de jetons (INV-6, lu côté écran).
      quota: await compteur(dossier.id),
    };
  },
});
