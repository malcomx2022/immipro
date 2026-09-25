import { db } from "@/lib/db";
import { envoyerRelanceDeSuivi } from "@/server/courrier";
import { COMPTE_JOIGNABLE } from "@/server/acces/suppression";
import { editorialDe } from "@/lib/contenu/destinations";
import { tenterUnCourrierReserve } from "./courrier-reserve";
import {
  TENTATIVES_MAX,
  heureDuRappelAtteinte,
  lirePreferences,
  type EtatDuCourrier,
} from "@/domain/dossiers/preferences-rappels";
import { relanceDeSuivi, relanceDuJour } from "@/domain/dossiers/suivi-depot";
import { depuisDateCivile } from "@/domain/dossiers/depot";
import { momentDans } from "@/domain/format/fuseau";

/**
 * Les relances après dépôt — WF-10 étape 2, arbitrage S.89.
 *
 * J+30 puis J+60 depuis **la date réelle du dépôt**, pour demander si
 * l'autorité a répondu. La décision — quel jalon, lequel est dépassé,
 * aucun rattrapage en rafale — est celle du domaine (`relanceDuJour`).
 * Ce fichier lit, réserve, envoie.
 *
 * Même ordre que les rappels d'échéance (S.87) : la notification est
 * réservée d'abord, sous la clé `suivi-depot:<dossier>:<jalon>`, unique
 * en base ; le courrier part ensuite, et son état se note. Une passe
 * rejouée bute sur la clé. Un courrier non parti reste `EN_ATTENTE` et se
 * reprend aux passes suivantes, quelques fois ; il n'est jamais dit parti.
 *
 * Il ne relance pas :
 *
 * - un dossier qui n'est plus `SOUMIS` — l'issue est déclarée, ou le
 *   dossier a changé d'état ;
 * - un compte dont la suppression est demandée ;
 * - avant huit heures dans le fuseau du candidat.
 */

export interface BilanDuSuivi {
  examines: number;
  relances: number;
  envoyes: number;
  aReprendre: number;
  sansCourrier: number;
  doublons: number;
}

const cleDuSuivi = (applicationId: string, jalon: number) =>
  `suivi-depot:${applicationId}:${jalon}`;

/** Le jalon d'une clé déjà posée. */
const jalonDeLaCle = (cle: string | null): number | null => {
  const jalon = Number(cle?.split(":").at(-1));
  return Number.isFinite(jalon) ? jalon : null;
};

const estUnDoublon = (erreur: unknown): boolean =>
  typeof erreur === "object" &&
  erreur !== null &&
  "code" in erreur &&
  (erreur as { code?: unknown }).code === "P2002";

/** Un courrier de suivi se reprend quelques fois, sans limite de jour : son texte est daté. */
const decider = (
  suite: { parti: boolean; renvoyable: boolean },
  tentative: number,
): EtatDuCourrier => {
  if (suite.parti) return "ENVOYE";
  if (!suite.renvoyable || tentative >= TENTATIVES_MAX) return "NON_ENVOYE";
  return "EN_ATTENTE";
};

const compter = (bilan: BilanDuSuivi, etat: EtatDuCourrier | null) => {
  if (etat === "ENVOYE") bilan.envoyes += 1;
  else if (etat === "EN_ATTENTE") bilan.aReprendre += 1;
  else if (etat === "NON_ENVOYE") bilan.sansCourrier += 1;
};

const SELECTION_DU_COMPTE = {
  email: true,
  deletionRequestedAt: true,
  remindersEnabled: true,
  reminderEmail: true,
  reminderTimeZone: true,
  reminderLeadDays: true,
} as const;

export async function relancerLesDepots(maintenant = new Date()): Promise<BilanDuSuivi> {
  const bilan: BilanDuSuivi = {
    examines: 0,
    relances: 0,
    envoyes: 0,
    aReprendre: 0,
    sansCourrier: 0,
    doublons: 0,
  };

  // D'abord les courriers restés en attente.
  const enAttente = await db.notification.findMany({
    where: { kind: "SUIVI_DEPOT", emailStatus: "EN_ATTENTE" },
    select: {
      id: true,
      title: true,
      body: true,
      emailAttempts: true,
      application: { select: { status: true } },
      user: { select: SELECTION_DU_COMPTE },
    },
  });
  for (const n of enAttente) {
    if (n.user.deletionRequestedAt !== null || n.application?.status !== "SOUMIS") {
      const abandon = await db.notification.updateMany({
        where: { id: n.id, emailStatus: "EN_ATTENTE" },
        data: { emailStatus: "NON_ENVOYE" },
      });
      if (abandon.count > 0) bilan.sansCourrier += 1;
      continue;
    }
    compter(
      bilan,
      await tenterUnCourrierReserve(
        n,
        () => envoyerRelanceDeSuivi(n.user.email, n.title, n.body),
        decider,
        maintenant,
      ),
    );
  }

  const dossiers = await db.application.findMany({
    where: {
      status: "SOUMIS",
      depositedOn: { not: null },
      submittedAt: { not: null },
      user: COMPTE_JOIGNABLE,
    },
    select: {
      id: true,
      userId: true,
      depositedOn: true,
      submittedAt: true,
      visaRule: { select: { countryCode: true, visaType: true } },
      user: { select: SELECTION_DU_COMPTE },
      notifications: {
        where: { kind: "SUIVI_DEPOT", dedupKey: { not: null } },
        select: { dedupKey: true },
      },
    },
  });
  bilan.examines = dossiers.length;

  for (const dossier of dossiers) {
    const { fuseau } = lirePreferences(dossier.user);
    const { jour: aujourdhui, heure } = momentDans(maintenant, fuseau);
    if (!heureDuRappelAtteinte(heure)) continue;

    const deposeLe = depuisDateCivile(dossier.depositedOn!);
    const jalon = relanceDuJour({
      deposeLe,
      declareLe: momentDans(dossier.submittedAt!, fuseau).jour,
      envoyes: dossier.notifications.flatMap((n) => {
        const j = jalonDeLaCle(n.dedupKey);
        return j === null ? [] : [j];
      }),
      aujourdhui,
    });
    if (jalon === null) continue;

    const edito = dossier.visaRule
      ? editorialDe(dossier.visaRule.countryCode, dossier.visaRule.visaType)
      : undefined;
    const texte = relanceDeSuivi(jalon, edito?.pays ?? dossier.visaRule?.countryCode ?? "Ton dossier", deposeLe);

    let notification: { id: string; emailAttempts: number };
    try {
      notification = await db.notification.create({
        data: {
          userId: dossier.userId,
          applicationId: dossier.id,
          kind: "SUIVI_DEPOT",
          title: texte.titre,
          body: texte.corps,
          dedupKey: cleDuSuivi(dossier.id, jalon),
          emailStatus: "EN_ATTENTE",
        },
        select: { id: true, emailAttempts: true },
      });
    } catch (erreur) {
      if (estUnDoublon(erreur)) {
        bilan.doublons += 1;
        continue;
      }
      throw erreur;
    }
    bilan.relances += 1;
    compter(
      bilan,
      await tenterUnCourrierReserve(
        notification,
        () => envoyerRelanceDeSuivi(dossier.user.email, texte.objet, texte.corps),
        decider,
        maintenant,
      ),
    );
  }

  return bilan;
}
