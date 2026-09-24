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
import { jourCivil } from "@/domain/format/fuseau";

/**
 * L'envoi des rappels d'échéance — WF-09 étape 3, RG-09.2.
 *
 * ── Ce qui manquait ─────────────────────────────────────────────────
 *
 * La file `echeancier.rappel` existait, déclarée avec ce motif :
 * « personne n'y poste encore, l'envoi attend la messagerie ». Le
 * transport SMTP est branché depuis le 22/09 au matin, et la phrase est
 * devenue fausse sans que rien ne bouge. Un candidat dont une échéance
 * était dépassée depuis trois jours ne recevait rien.
 *
 * ── Ce que ce job ne décide pas ─────────────────────────────────────
 *
 * Quoi envoyer, et à qui. `rappelDuJour` le dit, sans base ni réseau :
 * la cadence, l'exception d'urgence, l'horizon, le texte. Ce fichier
 * lit, appelle, envoie et marque — et c'est tout ce qui demande une
 * base.
 *
 * ── Les dossiers qu'il ne réveille pas ──────────────────────────────
 *
 * Un dossier déposé, clôturé ou abandonné n'a plus d'échéance à tenir :
 * lui rappeler une date le renverrait à un travail qu'il a fini. Un
 * dossier suspendu non plus — il attend un arbitrage réglementaire, et
 * ses dates sont précisément ce qui est en cause.
 */

/** Les états où un rappel a encore un sens. */
const ETATS_RAPPELABLES = ["BROUILLON", "ACTIF", "PRET"] as const;

export interface BilanDesRappels {
  /** Dossiers examinés. */
  examines: number;
  /** Rappels produits, par motif. */
  urgences: number;
  hebdomadaires: number;
  /**
   * Rappels dont le **courrier** n'a pas quitté la plateforme — transport
   * non branché, adresse refusée. La notification, elle, est écrite : le
   * candidat la lira en revenant. Compté à part pour ne pas faire dire au
   * bilan qu'un courrier est parti quand il ne l'est pas.
   */
  sansCourrier: number;
  /** Envois repris demain : la coupure se dissipe, marquer la perdrait. */
  aReprendre: number;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export async function envoyerLesRappels(
  maintenant = new Date(),
): Promise<BilanDesRappels> {
  /*
    Aujourd'hui, et le jour d'un rappel déjà envoyé, sont des jours de
    Cotonou : un rappel parti à 0 h 30 est du jour même, pas de la veille
    UTC. Les échéances (`dueAt`) sont des dates calendaires et restent
    lues telles qu'elles sont posées.
  */
  const aujourdhui = jourCivil(maintenant);

  /*
    La fenêtre lue est celle que le domaine peut retenir : de trente jours
    en arrière — au-delà, une échéance dépassée n'est plus un rappel — à
    trente jours en avant, l'horizon de la passe hebdomadaire. La borner
    ici épargne de charger des années d'échéancier pour n'en garder que
    quelques lignes.
  */
  const debut = new Date(maintenant);
  debut.setUTCDate(debut.getUTCDate() - JOURS_APRES_ECHEANCE);
  const fin = new Date(maintenant);
  fin.setUTCDate(fin.getUTCDate() + HORIZON_HEBDOMADAIRE_JOURS);

  const dossiers = await db.application.findMany({
    where: {
      status: { in: [...ETATS_RAPPELABLES] },
      /*
        La **demande** de suppression, et non son achèvement : entre les
        deux, `deletedAt` est nul et le compte recevait ses rappels. Le
        filtre couvre les deux états — rien n'efface `deletionRequestedAt`.
      */
      user: COMPTE_JOIGNABLE,
      deadlines: { some: { doneAt: null, dueAt: { gte: debut, lte: fin } } },
    },
    select: {
      id: true,
      userId: true,
      lastReminderAt: true,
      user: { select: { email: true } },
      visaRule: { select: { countryCode: true, visaType: true } },
      deadlines: {
        where: { dueAt: { gte: debut, lte: fin } },
        select: { id: true, code: true, label: true, dueAt: true, doneAt: true, remindedAt: true },
        orderBy: { dueAt: "asc" },
      },
    },
  });

  const bilan: BilanDesRappels = {
    examines: dossiers.length,
    urgences: 0,
    hebdomadaires: 0,
    sansCourrier: 0,
    aReprendre: 0,
  };

  for (const dossier of dossiers) {
    const matiere: DossierARappeler = {
      intitule: intitule(dossier.visaRule),
      dernierRappelLe: dossier.lastReminderAt ? jourCivil(dossier.lastReminderAt) : null,
      echeances: dossier.deadlines.map((e) => ({
        code: e.code,
        libelle: e.label,
        date: iso(e.dueAt),
        faite: e.doneAt !== null,
        rappeleeLe: e.remindedAt ? jourCivil(e.remindedAt) : null,
      })),
    };

    const rappel = rappelDuJour(matiere, aujourdhui);
    if (!rappel) continue;

    const envoi = await envoyerRappelDEcheance(
      dossier.user.email,
      rappel.objet,
      rappel.corps,
    ).catch(() => null);

    /*
      La suite se lit dans le domaine, qui arbitre déjà les cinq issues
      d'un envoi — et un `switch` exhaustif y refusera une sixième tant
      que personne n'aura répondu à « est-il parti ? » et « peut-on le
      redemander ? ».

      Une coupure se reprend : rien n'est marqué, le dossier repasse
      demain. Marquer d'abord ferait d'une panne de réseau un rappel
      perdu, et c'est la panne la plus banale de la chaîne.

      Le reste — transport non branché, adresse refusée — ne partira pas
      davantage demain. La notification est écrite quand même : elle est
      le canal qui reste, et elle attend le candidat à l'écran.
    */
    const suite = envoi ? suiteDeLEnvoi(envoi.issue) : { parti: false, renvoyable: true };
    if (!suite.parti && suite.renvoyable) {
      bilan.aReprendre += 1;
      continue;
    }
    if (!suite.parti) bilan.sansCourrier += 1;

    const portees = new Set(rappel.echeances.map((e) => e.code));
    await db.$transaction([
      db.deadline.updateMany({
        where: { applicationId: dossier.id, code: { in: [...portees] } },
        data: { remindedAt: maintenant },
      }),
      db.application.update({
        where: { id: dossier.id },
        data: { lastReminderAt: maintenant },
      }),
      /*
        La notification double le courrier, et ne le remplace pas : un
        email se perd, se filtre, ou part sur une adresse que le candidat
        ne relève plus. L'écran d'alertes, lui, est là quand il revient.
      */
      db.notification.create({
        data: {
          userId: dossier.userId,
          applicationId: dossier.id,
          kind: "ECHEANCE",
          title: rappel.objet,
          body: rappel.corps,
        },
      }),
    ]);

    if (rappel.motif === "urgence") bilan.urgences += 1;
    else bilan.hebdomadaires += 1;
  }

  return bilan;
}

/** « NL — etudes_mvv_vvr », ou le repli quand aucune règle n'est figée. */
const intitule = (
  regle: { countryCode: string; visaType: string } | null,
): string => (regle ? `${regle.countryCode} — ${regle.visaType}` : "Ton dossier");
