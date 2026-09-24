import type { Application } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { miseEnEtat } from "@/domain/dossiers/etat";
import { PURGE_JOURS, type IssueDemarche } from "@/domain/dossiers/cloture";
import { MENTION_EN_PAUSE } from "@/domain/dossiers/dossier";
import { dateDePurge } from "@/server/acces/dossiers";
import {
  confirmationOuverte,
  debutDeLInvitation,
  echeanceProlongee,
} from "@/domain/dossiers/conservation";
import { echeanceDuDepot, echeanceDuDossierSoumis } from "@/server/dossiers/conservation";
import { jourCivil } from "@/domain/format/fuseau";
import { jourEnFrancais } from "@/domain/format/moment";

/**
 * Les deux passages déclarés d'un dossier — WF-10.
 *
 * ── Pourquoi ce module existe ───────────────────────────────────────
 *
 * Les deux écritures vivaient dans leurs routes, et ne s'exécutaient donc
 * que derrière `next/headers` : hors d'un serveur Next, rien ne pouvait
 * les appeler. La conséquence n'est pas théorique — **la déclaration de
 * dépôt était refusée par la base depuis le premier jour**, et aucune
 * fumée ne pouvait le voir parce qu'aucune fumée ne pouvait l'appeler.
 *
 * C'est la leçon de `vueDeLaRelecture` (21/09), reprise telle quelle :
 * une fumée qui réécrit la décision de l'écran n'éprouve pas l'écran,
 * elle éprouve sa copie. La décision descend donc ici, la route la
 * compose, et `scripts/fumee-transitions.mts` appelle la même.
 *
 * ── Ce qu'elles déclarent, et ce qu'elles ne font pas ───────────────
 *
 * Rien n'est transmis à une autorité (INV-1). Le dépôt enregistre une
 * déclaration du candidat ; la clôture enregistre l'issue qu'il rapporte.
 */

/**
 * Déclaration de dépôt — WF-10 étape 1.
 *
 * « Le passage `PRET → SOUMIS` est déclaré, jamais calculé — la plateforme
 * ne dépose rien à la place du candidat » (DOC-11 §2.1, INV-1).
 *
 * Le dossier doit être `PRET`, c'est-à-dire que le déterministe est
 * complet. Ce n'est pas une permission mais une cohérence : déclarer un
 * dépôt alors qu'une pièce obligatoire manque signifie soit que la
 * checklist est fausse, soit que la déclaration l'est, et les deux
 * méritent d'être vues.
 *
 * Et c'est ce qui rendait le défaut total : `PRET` étant le seul état
 * accepté, et `PRET` impliquant `readyAt` non nulle, l'écriture qui
 * suivait — `status` sans sa date — était refusée **à tous les coups**.
 * Le candidat qui avait tout réuni recevait une erreur de service sur le
 * dernier geste du parcours.
 */
export async function declarerLeDepot(
  dossier: Application,
  maintenant: Date = new Date(),
): Promise<Application> {
  /*
    Deux refus, parce qu'il y a deux raisons et qu'elles n'appellent pas le
    même geste. Le message unique envoyait chercher des pièces manquantes
    un candidat dont le dossier était complet et seulement mis en pause :
    il relisait une checklist entière sans y trouver quoi que ce soit.
  */
  if (dossier.status === "SUSPENDU") {
    throw echec("etat_incompatible", { corps: MENTION_EN_PAUSE });
  }
  if (dossier.status !== "PRET") {
    throw echec("etat_incompatible", {
      corps:
        "Ton dossier n'est pas encore complet : il reste des pièces obligatoires à réunir. La checklist dit lesquelles.",
    });
  }
  return db.application.update({
    where: { id: dossier.id },
    data: {
      ...miseEnEtat("SOUMIS", dossier, maintenant),
      submittedAt: maintenant,
      /*
        Arbitrage S.78 : les pièces d'un dossier soumis sont conservées
        douze mois après le dépôt déclaré. L'inactivité ne vaut plus
        abandon — le candidat attend un tiers —, et c'est cette échéance
        qui borne la conservation à sa place.
      */
      retentionUntil: echeanceDuDepot(maintenant),
    },
  });
}

export interface ConservationProlongee {
  dossier: Application;
  /** La nouvelle fin de conservation. */
  jusquAu: Date;
}

/**
 * « L'instruction continue » — arbitrage S.78.
 *
 * Une confirmation explicite prolonge la conservation des pièces de six
 * mois, et se renouvelle. Elle annule une purge déjà annoncée : le préavis
 * sert à laisser le temps de répondre, et répondre doit suffire.
 *
 * Rien n'est demandé de plus que le geste. Le candidat n'a pas à prouver
 * que l'autorité instruit : la plateforme ne le sait pas mieux que lui,
 * et exiger une preuve ferait purger le dossier de quelqu'un qui attend.
 */
export async function confirmerLInstruction(
  dossier: Application,
  maintenant: Date = new Date(),
): Promise<ConservationProlongee> {
  if (dossier.status !== "SOUMIS") {
    throw echec("etat_incompatible", {
      corps:
        "Seul un dossier déposé attend une instruction. Tant que tu n'as pas déclaré ton dépôt, tes pièces suivent la règle d'un dossier en cours.",
    });
  }
  if (dossier.purgedAt) {
    throw echec("etat_incompatible", {
      corps: `Tes pièces ont déjà été supprimées, le ${jourEnFrancais(jourCivil(dossier.purgedAt))} : il n'y a plus rien à conserver. Ton dossier reste consultable.`,
    });
  }
  const echeance = echeanceDuDossierSoumis(dossier);
  if (!confirmationOuverte(echeance, maintenant)) {
    throw echec("etat_incompatible", {
      corps: `Tes pièces sont conservées jusqu'au ${jourEnFrancais(jourCivil(echeance))}. Tu pourras confirmer que l'instruction continue à partir du ${jourEnFrancais(jourCivil(debutDeLInvitation(echeance)))} : nous t'écrirons à ce moment-là.`,
    });
  }
  const jusquAu = echeanceProlongee(echeance, maintenant);
  const maj = await db.application.update({
    where: { id: dossier.id },
    data: { retentionUntil: jusquAu, purgeDueAt: null },
  });
  return { dossier: maj, jusquAu };
}

export interface ClotureEnregistree {
  dossier: Application;
  purgeLe: Date;
  purgeDansJours: number;
}

/**
 * Clôture et issue déclarée — C-11, WF-10.
 *
 * La date de purge est écrite maintenant et rendue à l'écran : elle est
 * annoncée à l'avance et présentée comme une garantie, pas subie comme
 * une perte (RG-10.2). La purge elle-même est faite par un job,
 * indépendamment de toute action du candidat (RG-10.1).
 *
 * Le motif déclaré alimente la correction des checklists, jamais un
 * modèle prédictif (RG-10.3) : il est stocké en texte, rattaché au
 * dossier, et rien ne l'agrège par taux.
 *
 * Un dossier prêt se clôture aussi — quelqu'un qui renonce avant de
 * déposer a tout réuni —, et c'est le cas que la base refusait.
 */
export async function cloturerLeDossier(
  dossier: Application,
  issue: "ACCEPTE" | "REFUSE" | "RENONCE" | "SANS_REPONSE",
  detail: string | null,
  maintenant: Date = new Date(),
): Promise<ClotureEnregistree> {
  const purgeLe = dateDePurge(maintenant);
  const maj = await db.application.update({
    where: { id: dossier.id },
    data: {
      ...miseEnEtat("ISSUE_DECLAREE", dossier, maintenant),
      issue,
      issueReason: detail,
      purgeDueAt: purgeLe,
    },
  });
  return { dossier: maj, purgeLe, purgeDansJours: PURGE_JOURS };
}

/** Les issues de DOC-12 vers celles de la base. */
export const ISSUE_STOCKEE: Record<
  IssueDemarche,
  "ACCEPTE" | "REFUSE" | "RENONCE" | "SANS_REPONSE"
> = {
  OBTENU: "ACCEPTE",
  REFUS: "REFUSE",
  ABANDON: "RENONCE",
  AUTRE: "SANS_REPONSE",
};
