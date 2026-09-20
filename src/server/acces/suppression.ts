import { db } from "@/lib/db";
import { jeton } from "@/server/securite/secret";
import { fermerToutesLesSessions } from "@/server/securite/session";
import { journaliser } from "@/server/acces/journal";
import { purgerSurDemande } from "@/server/jobs/purge";
import { adresseAnonymisee } from "@/domain/comptes/suppression";
import {
  issueDeLAnnulation,
  MOTIF_REMBOURSEMENT_SUPPRESSION,
} from "@/domain/consultants/annulation";
import { ouvrirUnRemboursement } from "@/server/acces/paiements";

/**
 * Suppression de compte — RG-10.4.
 *
 * « Une demande de suppression de compte purge immédiatement les pièces et
 * anonymise les métadonnées, sans attendre l'échéance. »
 *
 * Deux temps, et ce n'est pas un détour. La demande ferme l'accès tout de
 * suite — sessions, codes à usage unique — parce que c'est gratuit et
 * immédiat. L'anonymisation vient après la purge des pièces, qui dépend d'un
 * stockage objet : anonymiser d'abord laisserait, en cas de panne de MinIO,
 * des fichiers sans propriétaire identifiable, que plus personne ne saurait
 * ni retrouver ni rattacher. L'ordre est celui de la réversibilité : ce qui
 * se rejoue en premier, ce qui ne se rejoue pas en dernier.
 *
 * Entre les deux, le compte est « suppression demandée » — l'état que B-03
 * affiche déjà et que `acheverLesSuppressionsEnAttente` reprend.
 */

export interface BilanSuppression {
  /** Dossiers purgés à cette occasion. */
  dossiers: number;
  versions: number;
  /** Vrai quand le compte est anonymisé ; faux s'il reste à reprendre. */
  anonymise: boolean;
}

/**
 * Demande de suppression.
 *
 * Idempotente : rejouée sur un compte déjà anonymisé, elle ne réécrit rien
 * et rend le même bilan. Un candidat qui appuie deux fois, ou une reprise
 * après coupure réseau, ne doivent pas produire deux lignes d'audit
 * contradictoires.
 */
export async function demanderLaSuppression(
  userId: string,
  maintenant = new Date(),
): Promise<BilanSuppression> {
  const compte = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true, deletionRequestedAt: true },
  });
  if (!compte || compte.deletedAt) {
    return { dossiers: 0, versions: 0, anonymise: true };
  }

  if (!compte.deletionRequestedAt) {
    await db.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: maintenant },
    });
  }

  // L'accès se ferme avant la purge, et sans attendre son issue : une
  // session encore ouverte pendant la suppression laisserait quelqu'un
  // téléverser une pièce dans un dossier en train d'être vidé.
  await fermerToutesLesSessions(userId);
  await db.authSecret.deleteMany({ where: { userId } });

  return acheverLaSuppression(userId, maintenant);
}

/**
 * Purge des pièces puis anonymisation du compte.
 *
 * Séparée de la demande pour être rejouable : c'est elle que le job reprend
 * quand le stockage était indisponible.
 */
export async function acheverLaSuppression(
  userId: string,
  maintenant = new Date(),
): Promise<BilanSuppression> {
  const bilan = await purgerSurDemande(userId, maintenant);

  const restant = await db.application.count({
    where: { userId, purgedAt: null },
  });
  if (restant > 0) {
    // Une pièce n'a pas pu partir. On n'anonymise pas : le compte reste
    // « suppression demandée », visible en B-03, et la reprise réessaiera.
    // Anonymiser ici rendrait le fichier orphelin et introuvable.
    return { dossiers: bilan.dossiers, versions: bilan.versions, anonymise: false };
  }

  // Lus avant, parce que la transaction va les annuler : après, la
  // condition `status IN (RESERVE, REPORTE)` ne trouverait plus rien, et le
  // traitement financier ne porterait sur aucun rendez-vous.
  const aAnnuler = await db.appointment.findMany({
    where: {
      application: { userId },
      startsAt: { gt: maintenant },
      status: { in: ["RESERVE", "REPORTE"] },
    },
    select: { id: true, startsAt: true, freeUntil: true, transactionId: true },
  });

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        email: adresseAnonymisee(jeton(12)),
        passwordHash: null,
        firstName: null,
        lastName: null,
        phone: null,
        // Le pays de résidence reste une donnée personnelle : sur une base
        // de quelques milliers de comptes, il suffit souvent à restreindre
        // à une poignée de personnes. Ce que la comptabilité demande, la
        // devise de la transaction le porte déjà.
        countryCode: null,
        emailVerified: null,
        failedLogins: 0,
        lockedUntil: null,
        deletedAt: maintenant,
      },
    }),
    // Le profil n'est fait que de données déclarées : diplôme, domaine,
    // langues, budget. Rien à anonymiser, tout à supprimer.
    db.profile.deleteMany({ where: { userId } }),
    // Les alertes nomment le dossier et s'adressent à quelqu'un. Plus
    // personne ne peut les lire ; les garder n'a aucun usage.
    db.notification.deleteMany({ where: { userId } }),
    // Le motif de refus est recopié d'une lettre de consulat : il cite un
    // nom et un numéro de demande. Ce que RG-10.3 veut en retenir — ce qui
    // a bloqué — n'est pas dans le texte brut mais dans la correction de
    // checklist qu'il a déjà produite.
    db.application.updateMany({
      where: { userId },
      data: { issueReason: null },
    }),
    // Le motif de refus d'un paiement part pour la même raison, et c'est le
    // garde-fou que la base ne pouvait pas porter : une contrainte CHECK
    // n'interroge pas une autre table. L'obligation comptable tient au
    // montant, à la date et à la référence — pas au fait qu'une carte a été
    // refusée pour solde un jour de septembre, qui décrit une personne.
    db.transaction.updateMany({
      where: { userId, failureCause: { not: null } },
      data: { failureCause: null },
    }),
    // RG-12.2 : un partage de dossier ne survit pas au compte qui l'a
    // accordé. Révoqué, pas supprimé — la ligne prouve qu'il a existé le
    // jour d'une consultation.
    db.consultantAccess.updateMany({
      where: { application: { userId }, revokedAt: null },
      data: { revokedAt: maintenant },
    }),
    // K.C — le créneau se libère indépendamment du traitement financier.
    // Un consultant qui attend quelqu'un qui ne viendra pas perd son heure ;
    // rien ne justifie de retarder cette libération pour une question
    // d'argent qui se règle ailleurs, et plus tard.
    db.appointment.updateMany({
      where: {
        application: { userId },
        startsAt: { gt: maintenant },
        status: { in: ["RESERVE", "REPORTE"] },
      },
      data: { status: "ANNULE" },
    }),
  ]);

  // Et le traitement financier, qui suit la limite déjà acceptée — jamais
  // la suppression. Après la transaction de base : ouvrir une obligation de
  // remboursement ne doit pas pouvoir faire échouer une anonymisation, qui
  // est la promesse faite au candidat.
  for (const rendezVous of aAnnuler) {
    if (issueDeLAnnulation(rendezVous.freeUntil.toISOString(), maintenant) !== "REMBOURSABLE") {
      continue;
    }
    if (!rendezVous.transactionId) continue;
    const ouverture = await ouvrirUnRemboursement(
      rendezVous.transactionId,
      MOTIF_REMBOURSEMENT_SUPPRESSION,
      maintenant,
    );
    if (!ouverture.ouvert) continue;
    await journaliser({
      acteurId: "systeme:suppression",
      action: "paiement.remboursement",
      cible: `transaction:${rendezVous.transactionId}`,
      motif: MOTIF_REMBOURSEMENT_SUPPRESSION,
      details: { rendezVous: rendezVous.id, creneau: rendezVous.startsAt.toISOString() },
    }).catch(() => undefined);
  }

  await journaliser({
    acteurId: "systeme:suppression",
    action: "compte.suppression",
    cible: `user:${userId}`,
    motif: "Suppression demandée par le candidat, anonymisation (RG-10.4)",
    details: { dossiers: bilan.dossiers, versions: bilan.versions },
  }).catch(() => undefined);

  return { dossiers: bilan.dossiers, versions: bilan.versions, anonymise: true };
}

/**
 * Reprise des suppressions restées à mi-chemin, appelée par le job de purge.
 *
 * Elle n'a rien à faire les jours ordinaires. Elle existe pour le jour où le
 * stockage objet était indisponible au moment de la demande : sans elle, le
 * compte resterait « suppression demandée » indéfiniment, et la promesse
 * faite au candidat ne serait tenue par personne.
 */
export async function acheverLesSuppressionsEnAttente(
  maintenant = new Date(),
): Promise<{ reprises: number; achevees: number }> {
  const enAttente = await db.user.findMany({
    where: { deletionRequestedAt: { not: null }, deletedAt: null },
    select: { id: true },
  });

  let achevees = 0;
  for (const compte of enAttente) {
    const bilan = await acheverLaSuppression(compte.id, maintenant);
    if (bilan.anonymise) achevees += 1;
  }
  return { reprises: enAttente.length, achevees };
}
