import { db } from "@/lib/db";
import { envoyerRappelDEcheance } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { COMPTE_JOIGNABLE } from "@/server/acces/suppression";
import {
  HORIZON_HEBDOMADAIRE_JOURS,
  JOURS_APRES_ECHEANCE,
  rappelDuJour,
  type DossierARappeler,
} from "@/domain/dossiers/rappels";
import {
  BAIL_DE_TENTATIVE_MS,
  cleDuRappel,
  etatApresLEnvoi,
  heureDuRappelAtteinte,
  lirePreferences,
  repriseEncorePossible,
  type EtatDuCourrier,
} from "@/domain/dossiers/preferences-rappels";
import { momentDans } from "@/domain/format/fuseau";
import { editorialDe } from "@/lib/contenu/destinations";

/**
 * L'envoi des rappels d'échéance — WF-09 étape 3, RG-09.2, RG-09.4 (S.87).
 *
 * ── Ce que ce job ne décide pas ─────────────────────────────────────
 *
 * Quoi envoyer, et à qui. `rappelDuJour` le dit, sans base ni réseau :
 * la cadence, l'exception d'urgence, l'horizon, le texte. Les
 * préférences — activation, canal, fuseau, délai — se lisent dans
 * `domain/dossiers/preferences-rappels`. Ce fichier lit, réserve, envoie
 * et marque.
 *
 * ── L'ordre, et pourquoi il a changé (S.87) ─────────────────────────
 *
 * Le courrier partait **avant** toute écriture, pour qu'une coupure ne
 * marque rien et que la passe du lendemain reprenne. C'était juste pour
 * une passe quotidienne ; ça ne l'est plus pour une passe horaire, ni
 * devant deux passes concurrentes : les deux envoyaient, puis les deux
 * marquaient. Rien ne pouvait l'empêcher, puisque rien n'était écrit
 * avant l'envoi.
 *
 * Le rappel est maintenant **réservé d'abord**, dans une transaction :
 * la notification porte la clé `echeance:<dossier>:<jour local>`, unique
 * en base, et son courrier naît `EN_ATTENTE`. Une seconde passe bute sur
 * la clé et n'envoie rien. Puis le courrier part, et son état se note :
 * `ENVOYE` seulement si le serveur l'a accepté. Une coupure le laisse
 * `EN_ATTENTE`, et la passe de l'heure suivante le reprend — le même
 * jour, jamais au-delà : son texte dit « dans 4 jours ».
 *
 * La notification, elle, est écrite dans tous les cas : c'est le canal
 * qui reste quand l'email ne part pas, et elle ne prétend pas qu'il est
 * parti.
 *
 * ── Les dossiers qu'il ne réveille pas ──────────────────────────────
 *
 * - un dossier déposé, clôturé, abandonné ou suspendu (`ETATS_RAPPELABLES`) ;
 * - un compte dont la suppression est demandée (`COMPTE_JOIGNABLE`) ;
 * - un candidat qui a coupé ses rappels ;
 * - une échéance faite, et une pièce déjà déposée ou validée — son
 *   échéance « À demander » est derrière lui, même s'il ne l'a pas cochée.
 */

/** Les états où un rappel a encore un sens. */
const ETATS_RAPPELABLES = ["BROUILLON", "ACTIF", "PRET"] as const;

/**
 * Une pièce dans ces états n'est plus « à demander » : le candidat l'a
 * obtenue et déposée. Une pièce à corriger, illisible ou expirée reste à
 * refaire — son échéance continue de courir.
 */
const PIECES_TRAITEES = ["EN_ANALYSE", "CONFORME"] as const;

export interface BilanDesRappels {
  /** Dossiers examinés. */
  examines: number;
  /** Rappels réservés par cette passe, par motif. */
  urgences: number;
  hebdomadaires: number;
  /** Courriers acceptés par le serveur, reprises comprises. */
  envoyes: number;
  /** Courriers laissés `EN_ATTENTE` : l'heure suivante les reprend. */
  aReprendre: number;
  /**
   * Courriers qui ne partiront pas — transport absent, adresse refusée,
   * reprises épuisées. La notification est à l'écran ; rien ne dit
   * qu'ils sont partis.
   */
  sansCourrier: number;
  /** Rappels sans courrier demandé : le candidat a coupé l'email. */
  alertesSeules: number;
  /** Rappels déjà réservés aujourd'hui par une autre passe. */
  doublons: number;
  /** Dossiers dont le candidat n'a pas encore atteint huit heures. */
  avantLHeure: number;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Violation d'unicité Prisma, reconnue sans importer le client. */
const estUnDoublon = (erreur: unknown): boolean =>
  typeof erreur === "object" &&
  erreur !== null &&
  "code" in erreur &&
  (erreur as { code?: unknown }).code === "P2002";

const bilanVide = (): BilanDesRappels => ({
  examines: 0,
  urgences: 0,
  hebdomadaires: 0,
  envoyes: 0,
  aReprendre: 0,
  sansCourrier: 0,
  alertesSeules: 0,
  doublons: 0,
  avantLHeure: 0,
});

const compter = (bilan: BilanDesRappels, etat: EtatDuCourrier | null): void => {
  if (etat === "ENVOYE") bilan.envoyes += 1;
  else if (etat === "EN_ATTENTE") bilan.aReprendre += 1;
  else if (etat === "NON_ENVOYE") bilan.sansCourrier += 1;
};

/**
 * Tente le courrier d'une notification réservée, et note ce qui s'est
 * passé.
 *
 * La tentative se **prend** avant l'envoi : `emailAttempts` ne s'incrémente
 * que s'il vaut encore ce qu'on a lu, et qu'aucune tentative n'est en vol
 * (`BAIL_DE_TENTATIVE_MS`). Deux passes qui reprennent le même courrier
 * ne l'envoient pas deux fois. Rend `null` quand une autre passe l'a pris.
 */
async function tenterLeCourrier(
  notification: { id: string; title: string; body: string; emailAttempts: number },
  destinataire: string,
  jourDuRappel: string,
  jourCourant: string,
  maintenant: Date,
): Promise<EtatDuCourrier | null> {
  const tentative = notification.emailAttempts + 1;
  const prise = await db.notification.updateMany({
    where: {
      id: notification.id,
      emailStatus: "EN_ATTENTE",
      emailAttempts: notification.emailAttempts,
      // Une tentative en vol n'est pas une tentative à reprendre.
      OR: [
        { emailAttemptAt: null },
        { emailAttemptAt: { lt: new Date(maintenant.getTime() - BAIL_DE_TENTATIVE_MS) } },
      ],
    },
    data: { emailAttempts: tentative, emailAttemptAt: maintenant },
  });
  if (prise.count === 0) return null;

  const envoi = await envoyerRappelDEcheance(
    destinataire,
    notification.title,
    notification.body,
  ).catch(() => null);
  /*
    La suite se lit dans le domaine, qui arbitre les cinq issues d'un
    envoi. Une exception — réseau coupé en plein appel — vaut coupure :
    on ne sait pas, on reprendra.
  */
  const suite = envoi ? suiteDeLEnvoi(envoi.issue) : { parti: false, renvoyable: true };
  const etat = etatApresLEnvoi(suite, tentative, jourDuRappel, jourCourant);

  await db.notification.update({
    where: { id: notification.id },
    data: {
      emailStatus: etat,
      ...(etat === "ENVOYE" ? { emailSentAt: maintenant } : {}),
    },
  });
  return etat;
}

/**
 * Les courriers restés en attente — reprise de l'heure précédente.
 *
 * Chacun est relu contre ce qui a pu changer depuis : un candidat qui a
 * coupé l'email ou ses rappels, demandé la suppression de son compte,
 * déposé son dossier. Dans ces cas, et quand le jour du rappel est
 * passé, le courrier devient `NON_ENVOYE` : il ne partira plus, et la
 * notification reste là où elle était.
 */
async function reprendreLesCourriers(
  maintenant: Date,
  bilan: BilanDesRappels,
): Promise<void> {
  const enAttente = await db.notification.findMany({
    where: { kind: "ECHEANCE", emailStatus: "EN_ATTENTE", dedupKey: { not: null } },
    select: {
      id: true,
      title: true,
      body: true,
      dedupKey: true,
      emailAttempts: true,
      application: { select: { status: true } },
      user: {
        select: {
          email: true,
          deletionRequestedAt: true,
          remindersEnabled: true,
          reminderEmail: true,
          reminderTimeZone: true,
          reminderLeadDays: true,
        },
      },
    },
  });

  for (const n of enAttente) {
    const prefs = lirePreferences(n.user);
    const jourDuRappel = n.dedupKey!.split(":").at(-1)!;
    const jourCourant = momentDans(maintenant, prefs.fuseau).jour;
    const toujoursVoulu =
      prefs.actifs &&
      prefs.email &&
      n.user.deletionRequestedAt === null &&
      n.application !== null &&
      (ETATS_RAPPELABLES as readonly string[]).includes(n.application.status);

    if (!toujoursVoulu || !repriseEncorePossible(n.emailAttempts, jourDuRappel, jourCourant)) {
      const abandon = await db.notification.updateMany({
        where: { id: n.id, emailStatus: "EN_ATTENTE" },
        data: { emailStatus: "NON_ENVOYE" },
      });
      if (abandon.count > 0) bilan.sansCourrier += 1;
      continue;
    }
    compter(bilan, await tenterLeCourrier(n, n.user.email, jourDuRappel, jourCourant, maintenant));
  }
}

export async function envoyerLesRappels(
  maintenant = new Date(),
): Promise<BilanDesRappels> {
  const bilan = bilanVide();

  // D'abord ce qui attend depuis l'heure précédente : un courrier en
  // retard passe avant un courrier nouveau.
  await reprendreLesCourriers(maintenant, bilan);

  /*
    La fenêtre lue est celle que le domaine peut retenir : trente jours en
    arrière, trente en avant — plus un jour de chaque côté, parce que le
    jour du candidat peut différer d'un jour de celui du serveur.
  */
  const debut = new Date(maintenant);
  debut.setUTCDate(debut.getUTCDate() - JOURS_APRES_ECHEANCE - 1);
  const fin = new Date(maintenant);
  fin.setUTCDate(fin.getUTCDate() + HORIZON_HEBDOMADAIRE_JOURS + 1);

  const dossiers = await db.application.findMany({
    where: {
      status: { in: [...ETATS_RAPPELABLES] },
      /*
        La **demande** de suppression, et non son achèvement : entre les
        deux, `deletedAt` est nul et le compte recevait ses rappels.
        Et le réglage du candidat, lu dans la requête : un compte qui a
        coupé ses rappels n'est pas même examiné.
      */
      user: { ...COMPTE_JOIGNABLE, remindersEnabled: true },
      deadlines: { some: { doneAt: null, dueAt: { gte: debut, lte: fin } } },
    },
    select: {
      id: true,
      userId: true,
      lastReminderAt: true,
      user: {
        select: {
          email: true,
          remindersEnabled: true,
          reminderEmail: true,
          reminderTimeZone: true,
          reminderLeadDays: true,
        },
      },
      visaRule: { select: { countryCode: true, visaType: true } },
      deadlines: {
        where: { dueAt: { gte: debut, lte: fin } },
        select: { code: true, label: true, dueAt: true, doneAt: true, remindedAt: true },
        orderBy: { dueAt: "asc" },
      },
      documents: {
        where: { status: { in: [...PIECES_TRAITEES] } },
        select: { code: true },
      },
    },
  });
  bilan.examines = dossiers.length;

  for (const dossier of dossiers) {
    const prefs = lirePreferences(dossier.user);
    const { jour, heure } = momentDans(maintenant, prefs.fuseau);
    if (!heureDuRappelAtteinte(heure)) {
      bilan.avantLHeure += 1;
      continue;
    }

    const traitees = new Set(dossier.documents.map((d) => d.code));
    const jourLocal = (instant: Date) => momentDans(instant, prefs.fuseau).jour;
    const matiere: DossierARappeler = {
      intitule: intitule(dossier.visaRule),
      dernierRappelLe: dossier.lastReminderAt ? jourLocal(dossier.lastReminderAt) : null,
      echeances: dossier.deadlines
        .filter((e) => !traitees.has(e.code))
        .map((e) => ({
          code: e.code,
          libelle: e.label,
          date: iso(e.dueAt),
          faite: e.doneAt !== null,
          rappeleeLe: e.remindedAt ? jourLocal(e.remindedAt) : null,
        })),
    };

    const rappel = rappelDuJour(matiere, jour, prefs.joursAvant);
    if (!rappel) continue;

    /*
      La réservation : la notification, la marque des échéances portées et
      celle du dossier, d'un seul geste. La clé unique fait échouer la
      seconde passe du jour, quelle qu'elle soit — et rien de ce qu'elle
      aurait marqué ne l'est.
    */
    const portees = rappel.echeances.map((e) => e.code);
    let notification: { id: string; title: string; body: string; emailAttempts: number };
    try {
      [notification] = await db.$transaction([
        db.notification.create({
          data: {
            userId: dossier.userId,
            applicationId: dossier.id,
            kind: "ECHEANCE",
            title: rappel.objet,
            body: rappel.corps,
            dedupKey: cleDuRappel(dossier.id, jour),
            emailStatus: prefs.email ? "EN_ATTENTE" : null,
          },
          select: { id: true, title: true, body: true, emailAttempts: true },
        }),
        db.deadline.updateMany({
          where: { applicationId: dossier.id, code: { in: portees }, doneAt: null },
          data: { remindedAt: maintenant },
        }),
        db.application.update({
          where: { id: dossier.id },
          data: { lastReminderAt: maintenant },
        }),
      ]);
    } catch (erreur) {
      if (estUnDoublon(erreur)) {
        bilan.doublons += 1;
        continue;
      }
      throw erreur;
    }

    if (rappel.motif === "urgence") bilan.urgences += 1;
    else bilan.hebdomadaires += 1;

    if (!prefs.email) {
      bilan.alertesSeules += 1;
      continue;
    }
    compter(
      bilan,
      await tenterLeCourrier(notification, dossier.user.email, jour, jour, maintenant),
    );
  }

  return bilan;
}

/**
 * Ce que le candidat lit dans l'objet : le pays de la règle figée du
 * dossier (INV-3), et non ses codes internes — « NL — etudes_mvv_vvr »
 * ne disait rien à personne.
 */
const intitule = (regle: { countryCode: string; visaType: string } | null): string => {
  if (!regle) return "Ton dossier";
  return `Ton dossier ${editorialDe(regle.countryCode, regle.visaType)?.pays ?? regle.countryCode}`;
};
