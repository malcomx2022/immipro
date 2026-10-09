import { db } from "@/lib/db";
import { envoyerAvisDeTrancheNulle } from "@/server/courrier";
import { lignesDuGrandLivre } from "@/server/acces/quota";
import { tenterUnCourrierReserve } from "@/server/jobs/courrier-reserve";
import { repartir } from "@/domain/payments/grand-livre";
import { libelleDeLAchat } from "@/domain/paiement/recu";
import {
  avisDeTrancheNulle,
  cleDeLAvisDeTrancheNulle,
  referenceDeLAvis,
} from "@/domain/paiement/tranche-nulle";
import type { EtatDuCourrier } from "@/domain/dossiers/preferences-rappels";

/**
 * L'avis d'une demande de remboursement tranchée à zéro — B-04, RF-4,
 * S.154 (décision du 09/10/2026 : message fixe).
 *
 * Le chemin du reçu (F3, `server/paiement/recu.ts`) : une alerte
 * `PAIEMENT` à clé unique est réservée avec un courrier `EN_ATTENTE`, la
 * première tentative part tout de suite, et la passe de rapprochement
 * reprend celui qui n'est pas parti. La tranche ne dépend pas du
 * courrier : une décision prise ne se défait pas sur un envoi.
 */

/** Au-delà, l'avis reste lisible dans l'espace du candidat, et le courrier s'abandonne. */
export const TENTATIVES_DE_L_AVIS = 5;

const decider = (
  suite: { parti: boolean; renvoyable: boolean },
  tentative: number,
): EtatDuCourrier => {
  if (suite.parti) return "ENVOYE";
  if (!suite.renvoyable || tentative >= TENTATIVES_DE_L_AVIS) return "NON_ENVOYE";
  return "EN_ATTENTE";
};

const estUnDoublon = (erreur: unknown): boolean =>
  (erreur as { code?: unknown } | null)?.code === "P2002";

/** Les analyses que l'achat laisse au candidat, sur chaque dossier servi. */
async function ceQueLAchatLaisse(transactionId: string, applicationId: string) {
  const servis = await db.analysisCredit.findMany({
    where: { transactionId, delta: { gt: 0 } },
    select: { applicationId: true },
    distinct: ["applicationId"],
  });
  const dossiers = [...new Set([applicationId, ...servis.map((d) => d.applicationId)])];
  let restantes = 0;
  for (const id of dossiers) {
    restantes += repartir(await lignesDuGrandLivre(id))
      .octrois.filter((o) => o.transactionId === transactionId)
      .reduce((n, o) => n + Math.max(0, o.restantes), 0);
  }
  return { restantes, dossiers: dossiers.length };
}

async function tenterLAvis(
  notification: { id: string; emailAttempts: number },
  userId: string,
  avis: { titre: string; corps: string },
  maintenant: Date,
): Promise<EtatDuCourrier | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, deletionRequestedAt: true },
  });
  if (!user || user.deletionRequestedAt) {
    // Un compte parti ou sur le départ ne reçoit plus de courrier.
    await db.notification.updateMany({
      where: { id: notification.id, emailStatus: "EN_ATTENTE" },
      data: { emailStatus: "NON_ENVOYE" },
    });
    return "NON_ENVOYE";
  }
  return tenterUnCourrierReserve(
    notification,
    () => envoyerAvisDeTrancheNulle(user.email, avis.titre, avis.corps),
    decider,
    maintenant,
  );
}

/**
 * À la tranche à zéro : réserver l'avis et tenter de l'envoyer. Ne lève
 * jamais — la décision est écrite, et la reprise s'occupe du courrier.
 */
export async function prevenirDeLaTrancheNulle(
  transaction: { id: string; reference: string; userId: string; applicationId: string; packCode: string },
  ouverteLe: Date,
  maintenant = new Date(),
): Promise<void> {
  try {
    const laisse = await ceQueLAchatLaisse(transaction.id, transaction.applicationId);
    const avis = avisDeTrancheNulle({
      achat: libelleDeLAchat(transaction.packCode),
      reference: transaction.reference,
      analysesRestantes: laisse.restantes,
      dossiers: laisse.dossiers,
    });
    let reservee: { id: string; emailAttempts: number };
    try {
      reservee = await db.notification.create({
        data: {
          userId: transaction.userId,
          applicationId: transaction.applicationId,
          kind: "PAIEMENT",
          title: avis.titre,
          body: avis.corps,
          dedupKey: cleDeLAvisDeTrancheNulle(transaction.reference, ouverteLe),
          emailStatus: "EN_ATTENTE",
        },
        select: { id: true, emailAttempts: true },
      });
    } catch (erreur) {
      if (estUnDoublon(erreur)) return;
      throw erreur;
    }
    await tenterLAvis(reservee, transaction.userId, avis, maintenant).catch(() => null);
  } catch (erreur) {
    console.warn(
      `[tranche] ${transaction.reference} : avis non réservé (${erreur instanceof Error ? erreur.name : "erreur"}) ; la décision est écrite, l'écart et le journal la portent`,
    );
  }
}

/**
 * La reprise des avis restés en attente — appelée par la passe de
 * rapprochement, comme celle des reçus. Rend le nombre d'avis partis.
 */
export async function reprendreLesAvisDeTrancheNulle(maintenant = new Date()): Promise<number> {
  const enAttente = await db.notification.findMany({
    where: { kind: "PAIEMENT", emailStatus: "EN_ATTENTE", dedupKey: { startsWith: "revue-refermee:" } },
    select: { id: true, emailAttempts: true, dedupKey: true, userId: true, title: true, body: true },
    take: 100,
  });
  let partis = 0;
  for (const n of enAttente) {
    if (!referenceDeLAvis(n.dedupKey!)) continue;
    // Le texte réservé est celui qui part : l'alerte et le courriel disent la même chose.
    const etat = await tenterLAvis(n, n.userId, { titre: n.title, corps: n.body }, maintenant).catch(
      () => null,
    );
    if (etat === "ENVOYE") partis += 1;
  }
  return partis;
}
