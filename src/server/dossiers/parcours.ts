import { Prisma, type Application } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { estFige, miseEnEtat } from "@/domain/dossiers/etat";
import { PURGE_JOURS, type IssueDemarche } from "@/domain/dossiers/cloture";
import { MENTION_EN_PAUSE } from "@/domain/dossiers/dossier";
import { dateDePurge } from "@/server/acces/dossiers";
import {
  confirmationOuverte,
  debutDeLInvitation,
  echeanceProlongee,
} from "@/domain/dossiers/conservation";
import { echeanceDuDossierSoumis } from "@/server/dossiers/conservation";
import {
  correctionAppliquee,
  correctionDuDepot,
  correctionRefusee,
  depuisDateCivile,
  echeanceNormale,
  refusDeLExplication,
  refusDeLaCorrection,
  refusDeLaDateDeDepot,
  versDateCivile,
} from "@/domain/dossiers/depot";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import { lirePreferences } from "@/domain/dossiers/preferences-rappels";
import { journaliser } from "@/server/acces/journal";
import { FUSEAU_AFFICHAGE, jourCivil, momentDans } from "@/domain/format/fuseau";
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
export interface DeclarationDeDepot {
  /** La date réelle du dépôt, `AAAA-MM-JJ`, telle que le candidat la déclare. */
  deposeLe: string;
  /** Le fuseau du candidat : « aujourd'hui » et l'ouverture s'y lisent. */
  fuseau?: string;
  maintenant?: Date;
}

export async function declarerLeDepot(
  dossier: Application,
  { deposeLe, fuseau = FUSEAU_AFFICHAGE, maintenant = new Date() }: DeclarationDeDepot,
): Promise<Application> {
  refuserUnDepotHorsPret(dossier.status);

  /*
    Arbitrage S.89 — la date réelle du dépôt, lue dans le fuseau du
    candidat : « aujourd'hui » est son jour, pas celui du serveur. Elle ne
    peut ni venir après aujourd'hui, ni précéder l'ouverture du dossier.
    Elle n'est pas comparée à `readyAt`, et aucun retard n'est refusé.
  */
  const refus = refusDeLaDateDeDepot(
    deposeLe,
    momentDans(maintenant, fuseau).jour,
    momentDans(dossier.createdAt, fuseau).jour,
  );
  if (refus) throw echec("champs_invalides", { champs: { deposeLe: refus } });

  /*
    Conditionnelle — RF-1, FON-04, 09/10/2026. L'état est relu par la base
    au moment d'écrire : une migration arbitrée depuis la lecture a remis
    le dossier `ACTIF` sur une autre version, avec une checklist que
    personne n'a encore relue. L'écriture inconditionnelle déposait ce
    dossier-là — exécuté avant correction, dépôt et migration simultanés
    réussissaient tous deux.
  */
  return db.application
    .update({
      where: { id: dossier.id, status: "PRET" },
      data: {
        ...miseEnEtat("SOUMIS", dossier, maintenant),
        // Deux faits, et aucun ne remplace l'autre : le jour où la demande
        // est partie, et l'instant où le candidat nous l'a dit.
        depositedOn: versDateCivile(deposeLe),
        submittedAt: maintenant,
        /*
          Arbitrage S.78, précisé par S.89 : les pièces d'un dossier soumis
          sont conservées douze mois après **la date réelle** du dépôt. Une
          déclaration tardive peut donc poser une échéance proche, voire
          passée : la passe de conservation ne purge alors qu'après un
          préavis de trente jours (`echeanceAnnoncee`), jamais sur-le-champ.
        */
        retentionUntil: echeanceNormale(deposeLe),
      },
    })
    .catch(async (e: unknown) => {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) throw e;
      const relu = await db.application.findUnique({
        where: { id: dossier.id },
        select: { status: true },
      });
      refuserUnDepotHorsPret(relu?.status ?? dossier.status);
      throw e;
    });
}

/**
 * Deux refus, parce qu'il y a deux raisons et qu'elles n'appellent pas le
 * même geste. Le message unique envoyait chercher des pièces manquantes
 * un candidat dont le dossier était complet et seulement mis en pause :
 * il relisait une checklist entière sans y trouver quoi que ce soit.
 *
 * Un troisième pour le dossier déjà déposé : le lui redemander sur la
 * checklist l'enverrait chercher une pièce qui ne manque pas.
 */
function refuserUnDepotHorsPret(status: Application["status"]): void {
  if (status === "PRET") return;
  if (status === "SUSPENDU") throw echec("etat_incompatible", { corps: MENTION_EN_PAUSE });
  if (status === "SOUMIS") {
    throw echec("etat_incompatible", {
      corps: "Ton dépôt est déjà déclaré. Sa date se corrige depuis le dossier, s'il le faut.",
    });
  }
  if (estFige(status)) throw echec("dossier_fige");
  throw echec("etat_incompatible", {
    corps:
      "Ton dossier n'est pas encore complet : il reste des pièces obligatoires à réunir. La checklist dit lesquelles.",
  });
}

export interface CorrectionDuDepotEnregistree {
  dossier: Application;
  ancienne: string;
  nouvelle: string;
}

/**
 * Corriger la date réelle d'un dépôt déjà déclaré — arbitrage S.89.
 *
 * Après confirmation, la date ne se modifie pas librement depuis le
 * dossier : le candidat qui s'est trompé le signale, et la correction est
 * une action du back-office, **auditée** — motif, ancienne et nouvelle
 * valeur, échéances avant et après. Le journal s'écrit avant la
 * modification : une correction sans trace ne doit pas pouvoir exister.
 *
 * Elle recalcule ce que la date commande (`correctionDuDepot`) : la fin
 * de conservation, sans raccourcir une prolongation obtenue, et l'annonce
 * de purge, sans jamais la rapprocher d'un préavis déjà donné. Les
 * relances J+30 et J+60 se déduisent de la date à chaque passe ; celles
 * déjà envoyées le restent.
 */
export async function corrigerLeDepot(
  dossierId: string,
  {
    deposeLe,
    motif,
    acteurId,
    maintenant = new Date(),
  }: { deposeLe: string; motif: string; acteurId: string; maintenant?: Date },
): Promise<CorrectionDuDepotEnregistree> {
  const dossier = await db.application.findUnique({
    where: { id: dossierId },
    include: {
      user: {
        select: {
          remindersEnabled: true,
          reminderEmail: true,
          reminderTimeZone: true,
          reminderLeadDays: true,
        },
      },
    },
  });
  if (!dossier) throw echec("introuvable");
  if (!dossier.depositedOn || !dossier.submittedAt) {
    throw echec("etat_incompatible", {
      corps: "Ce dossier n'a pas de dépôt déclaré : il n'y a pas de date à corriger.",
    });
  }

  // Les jours se lisent dans le fuseau du candidat, comme à la déclaration.
  const fuseau = lirePreferences(dossier.user).fuseau;
  const ancienne = depuisDateCivile(dossier.depositedOn);
  const declareLe = momentDans(dossier.submittedAt, fuseau).jour;
  const refus = refusDeLaCorrection({
    nouvelle: deposeLe,
    actuelle: ancienne,
    declareLe,
    aujourdhui: momentDans(maintenant, fuseau).jour,
    ouvertLe: momentDans(dossier.createdAt, fuseau).jour,
  });
  if (refus) throw echec("champs_invalides", { champs: { deposeLe: refus } });

  const correction = correctionDuDepot({
    deposeLe: ancienne,
    retentionUntil: dossier.retentionUntil,
    purgeDueAt: dossier.purgeDueAt,
    nouvelle: deposeLe,
  });

  await journaliser({
    acteurId,
    action: "dossier.depot.correction",
    cible: `application:${dossier.id}`,
    motif,
    details: {
      ancienne,
      nouvelle: deposeLe,
      declareLe: dossier.submittedAt.toISOString(),
      conservationAvant: dossier.retentionUntil?.toISOString() ?? null,
      conservationApres: correction.retentionUntil.toISOString(),
      purgeAvant: dossier.purgeDueAt?.toISOString() ?? null,
      purgeApres: correction.purgeDueAt?.toISOString() ?? null,
    },
  });

  const avis = correctionAppliquee(deposeLe, correction.retentionUntil);
  const [maj] = await db.$transaction([
    db.application.update({
      where: { id: dossier.id },
      data: {
        depositedOn: versDateCivile(deposeLe),
        retentionUntil: correction.retentionUntil,
        purgeDueAt: correction.purgeDueAt,
      },
    }),
    /*
      S.90 — la demande du candidat, s'il en a fait une, est tranchée par
      la correction elle-même : quelle que soit la date retenue, la
      question qu'il avait posée a reçu sa réponse.
    */
    db.depositCorrectionRequest.updateMany({
      where: { applicationId: dossier.id, status: "EN_ATTENTE" },
      data: { status: "APPLIQUEE", resolvedAt: maintenant, resolvedBy: acteurId },
    }),
    // Le candidat apprend la nouvelle date là où il suit son dossier.
    db.notification.create({
      data: {
        userId: dossier.userId,
        applicationId: dossier.id,
        kind: "SUIVI_DEPOT",
        title: avis.titre,
        body: avis.corps,
      },
    }),
  ]);
  return { dossier: maj, ancienne, nouvelle: deposeLe };
}

/**
 * Le candidat signale une date de dépôt erronée — arbitrage S.90.
 *
 * Il ne la modifie pas : la date commande la conservation et les
 * relances, et c'est l'action auditée de S.89 qui la change. Il **demande**,
 * avec la date qu'il pense juste et d'où vient l'erreur ; la demande
 * attend un opérateur, et la date enregistrée reste celle qu'il a
 * déclarée d'ici là.
 *
 * La date proposée suit exactement les règles de la correction : pas dans
 * le futur, pas avant l'ouverture, pas après la déclaration, pas la même.
 * Une seule demande en attente par dossier ; la base le garantit.
 */
export async function demanderUneCorrectionDuDepot(
  dossier: Application,
  {
    deposeLe,
    explication,
    fuseau = FUSEAU_AFFICHAGE,
    maintenant = new Date(),
  }: { deposeLe: string; explication: string; fuseau?: string; maintenant?: Date },
) {
  if (!dossier.depositedOn || !dossier.submittedAt) {
    throw echec("etat_incompatible", {
      corps: "Tu n'as pas encore déclaré ton dépôt : la date se choisit au moment de la déclaration.",
    });
  }
  const champs: Record<string, string> = {};
  const refusDate = refusDeLaCorrection({
    nouvelle: deposeLe,
    actuelle: depuisDateCivile(dossier.depositedOn),
    declareLe: momentDans(dossier.submittedAt, fuseau).jour,
    aujourdhui: momentDans(maintenant, fuseau).jour,
    ouvertLe: momentDans(dossier.createdAt, fuseau).jour,
  });
  if (refusDate) champs.deposeLe = refusDate;
  const refusTexte = refusDeLExplication(explication);
  if (refusTexte) champs.explication = refusTexte;
  if (Object.keys(champs).length > 0) throw echec("champs_invalides", { champs });

  try {
    return await db.depositCorrectionRequest.create({
      data: {
        applicationId: dossier.id,
        requestedDate: versDateCivile(deposeLe),
        explanation: explication.trim(),
        createdAt: maintenant,
      },
    });
  } catch (erreur) {
    if ((erreur as { code?: unknown } | null)?.code === "P2002") {
      throw echec("etat_incompatible", {
        corps:
          "Une demande de correction est déjà en cours pour ce dossier : un membre de l'équipe la vérifie. Tu seras prévenu dans tes alertes.",
      });
    }
    throw erreur;
  }
}

/**
 * Une demande de correction non retenue — S.90.
 *
 * La réponse est **pour le candidat** : elle part dans ses alertes, et au
 * journal comme motif. Elle passe donc par le vocabulaire interdit, comme
 * tout texte qu'un opérateur adresse à un candidat (B-05) : une réponse
 * qui promettrait quelque chose ne part pas.
 */
export async function refuserLaCorrectionDuDepot(
  demandeId: string,
  { reponse, acteurId, maintenant = new Date() }: { reponse: string; acteurId: string; maintenant?: Date },
) {
  const demande = await db.depositCorrectionRequest.findUnique({
    where: { id: demandeId },
    include: { application: { select: { id: true, userId: true } } },
  });
  if (!demande) throw echec("introuvable");
  if (demande.status !== "EN_ATTENTE") {
    throw echec("etat_incompatible", { corps: "Cette demande a déjà été tranchée." });
  }
  const fautes = verifierTexte(reponse, INTERDITS_PARTOUT);
  if (fautes.length > 0) {
    throw echec("champs_invalides", {
      champs: { reponse: `Reformule sans « ${fautes[0]!.extrait} » : cette réponse est lue par le candidat.` },
    });
  }

  const demandee = depuisDateCivile(demande.requestedDate);
  await journaliser({
    acteurId,
    action: "dossier.depot.correction.refus",
    cible: `application:${demande.applicationId}`,
    motif: reponse,
    details: { demandeId, dateDemandee: demandee },
  });
  const avis = correctionRefusee(demandee, reponse);
  const [maj] = await db.$transaction([
    db.depositCorrectionRequest.update({
      where: { id: demandeId },
      data: { status: "REFUSEE", resolvedAt: maintenant, resolvedBy: acteurId, answer: reponse.trim() },
    }),
    db.notification.create({
      data: {
        userId: demande.application.userId,
        applicationId: demande.applicationId,
        kind: "SUIVI_DEPOT",
        title: avis.titre,
        body: avis.corps,
      },
    }),
  ]);
  return maj;
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
