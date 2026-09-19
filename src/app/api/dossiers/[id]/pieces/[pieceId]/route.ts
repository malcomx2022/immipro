import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { pieceDuDossier, urlDeLecture } from "@/server/acces/pieces";
import { versPiece } from "@/server/vue/dossier";
import { sousTitreDepot, estAPhotographier } from "@/domain/dossiers/piece";
import { CONSEILS_PHOTO } from "@/domain/dossiers/televersement";

/**
 * Détail d'une pièce — C-07 et C-08.
 *
 * L'URL de lecture est signée à la demande et expire en cinq minutes
 * (RG-06.4). Elle n'est jamais stockée : une URL conservée en base serait
 * une URL qui fuit avec la base.
 */
export const GET = route({
  nom: "piece",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const document = await pieceDuDossier(params.pieceId!, dossier.id, acteur!.id);

    const versions = await db.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { rank: "desc" },
      include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
    });
    const derniere = versions[0];
    const piece = versPiece(document);

    return {
      piece,
      consignes: {
        sousTitre: sousTitreDepot(piece),
        // Les conseils de prise de vue n'ont de sens que sur une pièce qu'on
        // photographie : sous une lettre de motivation, ils font douter du reste.
        photo: estAPhotographier(piece) ? CONSEILS_PHOTO : [],
      },
      versions: versions.map((v) => ({
        id: v.id,
        rang: v.rank,
        deposeeLe: v.uploadedAt.toISOString(),
        motif: v.changeNote,
        purgee: v.purgedAt !== null,
      })),
      analyse: derniere?.analyses[0]
        ? {
            verdict: derniere.analyses[0].verdict,
            titre: derniere.analyses[0].title,
            corps: derniere.analyses[0].body,
            champs: derniere.analyses[0].fields,
            analyseeLe: derniere.analyses[0].analyzedAt.toISOString(),
          }
        : null,
      apercu: derniere ? await urlDeLecture(derniere) : null,
    };
  },
});
