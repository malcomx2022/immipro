import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierDuCandidat, exigerModifiable } from "@/server/acces/dossiers";
import { pieceDuDossier } from "@/server/acces/pieces";
import { journaliser } from "@/server/acces/journal";
import { champsLus } from "@/server/lecture/dossiers";
import { MOTIF_DU_SIGNALEMENT, refusDuSignalement } from "@/domain/dossiers/signalement";

/**
 * Le signalement d'une erreur de lecture — C-08, WF-06, S.157 (R-03).
 *
 * Il ouvre la revue manuelle de la lecture **affichée** : la dernière de la
 * version courante, comme l'écran (RG-06.8). Une lecture n'a qu'une revue
 * (`ManualReview.analysisId` unique) : un second signalement, un double
 * clic ou une revue déjà ouverte par la machine ne créent rien de plus, et
 * le candidat lit qu'une personne relit déjà la pièce.
 *
 * La revue et sa trace au journal tiennent ou tombent ensemble.
 */
export async function signalerUneErreurDeLecture(demande: {
  applicationId: string;
  pieceId: string;
  userId: string;
  champs: readonly string[];
}): Promise<{ dejaEnRelecture: boolean }> {
  const dossier = await dossierDuCandidat(demande.applicationId, demande.userId);
  exigerModifiable(dossier);
  const piece = await pieceDuDossier(demande.pieceId, dossier.id, demande.userId);

  const courante = await db.documentVersion.findFirst({
    where: { documentId: piece.id },
    orderBy: { rank: "desc" },
    select: {
      analyses: {
        orderBy: { analyzedAt: "desc" },
        take: 1,
        select: { id: true, fields: true, review: { select: { id: true } } },
      },
    },
  });
  const lecture = courante?.analyses[0];
  if (!lecture) {
    throw echec("etat_incompatible", {
      corps:
        "La dernière version de cette pièce n'a pas encore été lue : il n'y a rien à signaler pour l'instant. Reviens quand le résultat s'affiche.",
    });
  }
  if (lecture.review) return { dejaEnRelecture: true };

  const refus = refusDuSignalement(
    demande.champs,
    champsLus(lecture.fields).map((c) => c.intitule),
  );
  if (refus) throw echec("champs_invalides", { corps: refus, champs: { champs: refus } });

  try {
    await db.$transaction(async (tx) => {
      await tx.manualReview.create({
        data: { analysisId: lecture.id, reason: "SIGNALE_PAR_LE_CANDIDAT" },
      });
      await journaliser(
        {
          acteurId: demande.userId,
          action: "piece.signalement",
          cible: `document:${piece.id}`,
          motif: MOTIF_DU_SIGNALEMENT,
          details: { analyse: lecture.id, champs: [...demande.champs] },
        },
        tx,
      );
    });
  } catch (erreur) {
    // Deux envois de la même seconde : la revue existe, c'est ce qui compte.
    if ((erreur as { code?: unknown } | null)?.code === "P2002") return { dejaEnRelecture: true };
    throw erreur;
  }
  return { dejaEnRelecture: false };
}
