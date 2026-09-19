import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierDuCandidat } from "@/server/acces/dossiers";

/**
 * Déclaration de dépôt — WF-10, étape 1.
 *
 * « Le passage `PRET → SOUMIS` est déclaré, jamais calculé — la plateforme
 * ne dépose rien à la place du candidat » (DOC-11 §2.1, INV-1). Cette route
 * enregistre une déclaration, elle ne transmet rien à aucune autorité, et
 * le message le dit.
 *
 * Le dossier doit être `PRET`, c'est-à-dire que le déterministe est complet.
 * Ce n'est pas une permission mais une cohérence : déclarer un dépôt alors
 * qu'une pièce obligatoire manque signifie soit que la checklist est
 * fausse, soit que la déclaration l'est, et les deux méritent d'être vues.
 */
export const POST = route({
  nom: "dossier.depot",
  acces: "candidat_verifie",
  limite: "sensible",
  async traiter({ params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    if (dossier.status !== "PRET") {
      throw echec("etat_incompatible", {
        corps:
          "Ton dossier n'est pas encore complet : il reste des pièces obligatoires à réunir. La checklist dit lesquelles.",
      });
    }
    const maj = await db.application.update({
      where: { id: dossier.id },
      data: { status: "SOUMIS", submittedAt: new Date() },
    });
    return {
      statut: maj.status,
      deposeLe: maj.submittedAt?.toISOString() ?? null,
      mention:
        "C'est ta déclaration qui est enregistrée. ImmiPro ne transmet aucune demande à une autorité.",
    };
  },
});
