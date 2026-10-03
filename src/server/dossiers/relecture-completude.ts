import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import { avisDeRelecture, refusDeLaDemande } from "@/domain/completeness/relecture";

/**
 * Relecture humaine de la complétude — avis juridique L.A, 03/10/2026.
 *
 * Le calcul de complétude reste automatique, et sa pondération n'est pas
 * exposée ; l'avis l'admet à condition qu'une personne puisse relire
 * l'évaluation à la demande du candidat. Le mécanisme est celui de la
 * correction de la date de dépôt (S.90) : le candidat demande, avec ce
 * qui lui semble inexact ; un relecteur répond ; la réponse part dans ses
 * alertes et au journal.
 */

/** Ce que l'écran C-09 montre de la dernière demande du dossier. */
export type EtatDeLaRelecture =
  | { etat: "aucune" }
  | { etat: "en_attente"; demandeeLe: string }
  | { etat: "traitee"; reponse: string; traiteeLe: string };

export async function etatDeLaRelecture(applicationId: string): Promise<EtatDeLaRelecture> {
  const derniere = await db.completenessReviewRequest.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
  if (!derniere) return { etat: "aucune" };
  if (derniere.status === "EN_ATTENTE") {
    return { etat: "en_attente", demandeeLe: derniere.createdAt.toISOString() };
  }
  return {
    etat: "traitee",
    reponse: derniere.answer ?? "",
    traiteeLe: (derniere.resolvedAt ?? derniere.createdAt).toISOString(),
  };
}

/** Le candidat demande une relecture. Une seule en attente par dossier ; la base le garantit. */
export async function demanderUneRelecture(applicationId: string, explication: string) {
  const refus = refusDeLaDemande(explication);
  if (refus) throw echec("champs_invalides", { champs: { explication: refus } });
  try {
    return await db.completenessReviewRequest.create({
      data: { applicationId, explanation: explication.trim() },
    });
  } catch (erreur) {
    if ((erreur as { code?: unknown } | null)?.code === "P2002") {
      throw echec("etat_incompatible", {
        corps:
          "Une demande de relecture est déjà en cours pour ce dossier : un membre de l'équipe la relit, et te répond dans tes alertes.",
      });
    }
    throw erreur;
  }
}

/**
 * Le relecteur répond. La réponse est **pour le candidat** : elle passe
 * par le vocabulaire interdit de l'écran candidat — ni promesse, ni note
 * sur cent, ni « chances » —, comme tout texte qu'un opérateur lui adresse.
 */
export async function repondreALaRelecture(
  demandeId: string,
  { reponse, acteurId, maintenant = new Date() }: { reponse: string; acteurId: string; maintenant?: Date },
) {
  const demande = await db.completenessReviewRequest.findUnique({
    where: { id: demandeId },
    include: { application: { select: { userId: true } } },
  });
  if (!demande) throw echec("introuvable");
  if (demande.status !== "EN_ATTENTE") {
    throw echec("etat_incompatible", { corps: "Cette demande a déjà reçu sa réponse." });
  }
  const fautes = verifierTexte(reponse, INTERDITS_ECRAN_CANDIDAT);
  if (fautes.length > 0) {
    throw echec("champs_invalides", {
      champs: {
        reponse: `Reformule sans « ${fautes[0]!.extrait} » : cette réponse est lue par le candidat.`,
      },
    });
  }

  await journaliser({
    acteurId,
    action: "dossier.completude.relecture",
    cible: `application:${demande.applicationId}`,
    motif: reponse,
    details: { demandeId },
  });
  const avis = avisDeRelecture(reponse);
  const [maj] = await db.$transaction([
    db.completenessReviewRequest.update({
      where: { id: demandeId },
      data: { status: "TRAITEE", resolvedAt: maintenant, resolvedBy: acteurId, answer: reponse.trim() },
    }),
    db.notification.create({
      data: {
        userId: demande.application.userId,
        applicationId: demande.applicationId,
        kind: "ANALYSE",
        title: avis.titre,
        body: avis.corps,
      },
    }),
  ]);
  return maj;
}

/** La file du relecteur, la plus ancienne d'abord. */
export async function fileDesRelectures() {
  const demandes = await db.completenessReviewRequest.findMany({
    where: { status: "EN_ATTENTE" },
    orderBy: { createdAt: "asc" },
    include: {
      application: {
        select: { id: true, user: { select: { email: true } }, visaRule: { select: { countryCode: true } } },
      },
    },
  });
  return demandes.map((d) => ({
    id: d.id,
    dossierId: d.application.id,
    candidat: d.application.user.email,
    pays: d.application.visaRule?.countryCode ?? "—",
    explication: d.explanation,
    demandeeLe: d.createdAt.toISOString(),
  }));
}
