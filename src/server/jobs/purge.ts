import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { removeObject } from "@/lib/storage";
import { journaliser } from "@/server/acces/journal";
import { CONSERVATION_MOIS } from "@/domain/notifications/alerte";
import { CONSERVATION_ANNEES } from "@/domain/backoffice/audit";
import {
  CONSERVATION_MOTIF_JOURS,
  motifEffacable,
  type EtatDuLitige,
} from "@/domain/paiement/conservation";

/**
 * Purge des pièces — INV-5, RG-10.1.
 *
 * « La purge est automatique et indépendante de toute action du candidat. »
 * Elle est donc ici, dans un job, et nulle part ailleurs : aucune route ne
 * supprime de contenu, y compris à la clôture — la clôture se contente
 * d'annoncer la date.
 *
 * Ce qui part et ce qui reste n'est pas la même chose. Le contenu part :
 * l'objet dans le stockage, le texte d'une pièce rédigée. Les métadonnées
 * restent — type, verdict, horodatage — parce qu'elles prouvent que la
 * vérification a eu lieu, sans porter la moindre donnée personnelle.
 *
 * Le contenu ne tient pas dans le seul fichier, et la première version de
 * cette purge l'oubliait : l'analyse garde les champs lus dans la pièce
 * (`fields` : un nom, un numéro de passeport, une date de naissance), son
 * message les cite (« ton passeport expire le 12 avril 2027 »), la relecture
 * critique garde les deux valeurs qui divergeaient, et l'entretien garde les
 * réponses écrites par le candidat. Supprimer le fichier en laissant tout
 * cela n'est pas une purge. `effacerLesDerives` les emporte avec lui.
 *
 * L'échec de suppression d'un objet ne fait pas échouer le lot. Une clé déjà
 * absente est le cas normal d'une reprise après incident, et s'arrêter au
 * premier objet manquant laisserait tous les suivants en place.
 */
export interface Bilan {
  dossiers: number;
  versions: number;
  objetsSupprimes: number;
  objetsManquants: number;
}

/**
 * Ce que l'analyse dit de la pièce une fois la pièce partie.
 *
 * `title` et `body` ne peuvent pas être nuls — l'écran afficherait un vide
 * sans explication, et DOC-12 §16 demande de dire pourquoi rien n'est
 * montré. Ils portent donc une phrase fixe, qui ne cite plus rien.
 */
export const ANALYSE_PURGEE_TITRE = "Analyse supprimée avec la pièce";
export const ANALYSE_PURGEE_CORPS =
  "Le détail de cette analyse a été supprimé en même temps que la pièce. Le verdict et sa date sont conservés.";

/**
 * Les copies du contenu, disséminées hors du fichier.
 *
 * Elles sont faciles à oublier parce qu'aucune ne s'appelle « pièce » :
 * l'analyse porte les champs lus et les cite dans son message, la relecture
 * critique porte les deux valeurs qui divergeaient, l'entretien porte les
 * réponses du candidat. Chacune est une donnée personnelle, et INV-5 ne
 * distingue pas l'original de la copie.
 *
 * Ce qui reste : le verdict, le genre de remarque, les horodatages, les
 * compteurs de jetons. Ce sont eux qui prouvent que la vérification a eu
 * lieu, et ils ne nomment personne.
 */
export function effacerLesDerives(versionIds: string[], documentIds: string[]) {
  return [
    db.documentAnalysis.updateMany({
      where: { versionId: { in: versionIds } },
      data: {
        fields: Prisma.DbNull,
        engineLog: null,
        title: ANALYSE_PURGEE_TITRE,
        body: ANALYSE_PURGEE_CORPS,
      },
    }),
    db.critiqueFinding.updateMany({
      where: { versionId: { in: versionIds } },
      data: {
        gaps: Prisma.DbNull,
        title: ANALYSE_PURGEE_TITRE,
        body: ANALYSE_PURGEE_CORPS,
      },
    }),
    // Les réponses d'entretien sont écrites par le candidat lui-même : elles
    // n'ont aucune valeur de preuve une fois la pièce partie, et rien ne
    // justifie d'en garder la coquille.
    db.interviewAnswer.deleteMany({ where: { documentId: { in: documentIds } } }),
  ];
}

/**
 * `userId` restreint le lot à un compte. Le job quotidien ne le passe pas —
 * il purge tout ce qui est échu — mais une suppression de compte (RG-10.4)
 * doit pouvoir rendre son propre bilan : « voilà ce qui a été supprimé pour
 * toi », et non le décompte de la nuit.
 */
export async function purgerLesPiecesEchues(
  maintenant = new Date(),
  userId?: string,
): Promise<Bilan> {
  const dossiers = await db.application.findMany({
    where: {
      purgeDueAt: { lte: maintenant },
      purgedAt: null,
      ...(userId ? { userId } : {}),
    },
    include: { documents: { include: { versions: { where: { purgedAt: null } } } } },
  });

  const bilan: Bilan = { dossiers: 0, versions: 0, objetsSupprimes: 0, objetsManquants: 0 };

  for (const dossier of dossiers) {
    const versions = dossier.documents.flatMap((d) => d.versions);

    for (const version of versions) {
      if (!version.objectKey) continue;
      try {
        await removeObject(version.objectKey);
        bilan.objetsSupprimes += 1;
      } catch {
        // Objet déjà absent : c'est l'état visé, pas un incident.
        bilan.objetsManquants += 1;
      }
    }

    await db.$transaction([
      db.documentVersion.updateMany({
        where: { id: { in: versions.map((v) => v.id) } },
        // Le contenu s'en va, la trace reste : `objectKey` et `body` à nul,
        // `purgedAt` daté. Une contrainte de la base refuse une version
        // marquée purgée qui garderait sa clé.
        data: { objectKey: null, body: null, changeNote: null, purgedAt: maintenant },
      }),
      ...effacerLesDerives(
        versions.map((v) => v.id),
        dossier.documents.map((d) => d.id),
      ),
      db.document.updateMany({
        where: { applicationId: dossier.id },
        data: { status: "PURGEE" },
      }),
      db.application.update({
        where: { id: dossier.id },
        // Un brouillon qui n'a jamais figé de version de règle ne peut pas
        // passer en ARCHIVE : INV-3 l'interdit en base, et la contrainte a
        // raison — un dossier au-delà du brouillon sans version figée est
        // une checklist qui n'est adossée à rien. Il reste donc brouillon,
        // purgé. Le chemin n'existait pas tant que seule la clôture
        // déclenchait la purge ; la suppression de compte, elle, purge
        // aussi les brouillons (RG-10.4).
        data: {
          purgedAt: maintenant,
          ...(dossier.visaRuleId ? { status: "ARCHIVE" as const } : {}),
        },
      }),
    ]);

    await journaliser({
      acteurId: "systeme:purge",
      action: "piece.purge",
      cible: `application:${dossier.id}`,
      motif: "Purge automatique à l'échéance de rétention (INV-5)",
      details: { versions: versions.length },
    }).catch(() => undefined);

    bilan.dossiers += 1;
    bilan.versions += versions.length;
  }

  return bilan;
}

/**
 * RG-10.4 : une demande de suppression de compte purge immédiatement, sans
 * attendre l'échéance. Le délai de trente jours est une garantie offerte au
 * candidat, pas une rétention qu'on lui oppose.
 */
export async function purgerSurDemande(userId: string, maintenant = new Date()): Promise<Bilan> {
  await db.application.updateMany({
    where: { userId, purgedAt: null },
    data: { purgeDueAt: maintenant },
  });
  return purgerLesPiecesEchues(maintenant, userId);
}

/**
 * Les autres durées de conservation, celles qui étaient écrites et que rien
 * n'appliquait.
 *
 * Trois durées sont déclarées dans le domaine et affichées à quelqu'un :
 * trente jours pour les pièces d'un dossier clos (INV-5), six mois pour les
 * alertes (T-01), cinq ans pour le journal d'audit (B-06). Seule la
 * première était tenue. Les deux autres étaient des phrases — « elles sont
 * conservées six mois » se lit comme un engagement, et une base qui garde
 * tout ne le tient pas.
 *
 * Les durées viennent des constantes qui composent ces phrases, jamais
 * d'un nombre recopié : une conservation qu'on raccourcit doit changer au
 * même endroit que le texte qui l'annonce, sinon les deux divergent sans
 * que rien ne le signale. Un test refuse désormais qu'une durée déclarée
 * n'ait pas d'exécutant.
 */
export interface BilanConservation {
  alertes: number;
  ecrituresDAudit: number;
  sessions: number;
  /** Motifs d'échec de paiement effacés à l'échéance — O.B. */
  motifsDEchec: number;
}

/** Le point de coupure d'une durée exprimée en mois. */
export function echeanceEnMois(mois: number, maintenant: Date): Date {
  const limite = new Date(maintenant);
  limite.setUTCMonth(limite.getUTCMonth() - mois);
  return limite;
}

/**
 * Et celui d'une durée exprimée en jours.
 *
 * Contrairement aux mois, les jours n'ont pas de longueur variable : en
 * UTC, quatre-vingt-dix jours en arrière se calculent aussi bien par
 * soustraction. Le calendrier est employé quand même, pour que les trois
 * échéances se lisent de la même façon et qu'aucune ne soit l'exception
 * qu'on relit deux fois.
 */
export function echeanceEnJours(jours: number, maintenant: Date): Date {
  const limite = new Date(maintenant);
  limite.setUTCDate(limite.getUTCDate() - jours);
  return limite;
}

export function echeanceEnAnnees(annees: number, maintenant: Date): Date {
  const limite = new Date(maintenant);
  limite.setUTCFullYear(limite.getUTCFullYear() - annees);
  return limite;
}

export async function purgerCeQuiEstEchu(
  maintenant = new Date(),
): Promise<BilanConservation> {
  const alertes = await db.notification.deleteMany({
    where: { createdAt: { lt: echeanceEnMois(CONSERVATION_MOIS, maintenant) } },
  });

  /**
   * Le journal se purge par échéance, jamais depuis l'interface — et sa
   * propre mention le dit ainsi : « aucune entrée ne peut être supprimée ni
   * modifiée depuis l'interface ». Une tâche planifiée n'est pas
   * l'interface ; c'est même la seule façon de tenir les deux moitiés de la
   * phrase, l'immuabilité et la durée.
   */
  const audit = await db.auditLog.deleteMany({
    where: { createdAt: { lt: echeanceEnAnnees(CONSERVATION_ANNEES, maintenant) } },
  });

  /**
   * Une session échue ne sert plus à rien : `lireSession` la refuse déjà.
   * Sa ligne garde pourtant le contexte de connexion, que le schéma dit
   * conservé « pour qu'un candidat reconnaisse une session qui n'est pas la
   * sienne » — une raison qui s'éteint avec la session. Aucune durée n'est
   * annoncée ici : c'est l'échéance de la session elle-même qui fait foi.
   */
  const sessions = await db.session.deleteMany({
    where: { expiresAt: { lt: maintenant } },
  });

  return {
    alertes: alertes.count,
    ecrituresDAudit: audit.count,
    sessions: sessions.count,
    motifsDEchec: await effacerLesMotifsEchus(maintenant),
  };
}

/**
 * Le motif d'un échec de paiement, quatre-vingt-dix jours après — O.B.
 *
 * Seul le motif part. Le montant, la date, le statut et la référence
 * restent : ce sont eux la preuve comptable, et la colonne séparée est
 * précisément ce qui permet de n'effacer que l'un.
 *
 * **Deux étapes plutôt qu'un `updateMany` conditionnel.** La règle n'est
 * pas une simple date — un dossier ouvert la suspend, une clôture ouvre un
 * sursis — et l'écrire en SQL l'aurait mise hors de portée des tests, dans
 * un `where` que rien n'exerce sans base. La requête ne fait donc que
 * réduire grossièrement : rien de plus récent que quatre-vingt-dix jours
 * ne peut être échu, quelle que soit la suite. Le domaine tranche le
 * reste, et c'est lui qu'on teste.
 */
async function effacerLesMotifsEchus(maintenant: Date): Promise<number> {
  const candidats = await db.transaction.findMany({
    /**
     * Le plancher, et rien d'autre : l'échéance vaut au moins échec + 90 j,
     * donc rien en deçà n'est effaçable. Ce qui reste est peu nombreux.
     *
     * `lte`, et la borne compte. Avec `lt`, un motif échu du jour même
     * était écarté avant même d'être soumis à la règle : le domaine le
     * disait effaçable — la borne est incluse — et la requête ne le
     * présentait pas. Il partait le lendemain. Vu en exécutant la purge
     * contre PostgreSQL, invisible aux tests du domaine, qui ont raison
     * chacun de leur côté. Une réduction grossière n'a le droit d'écarter
     * que ce que la règle écarterait aussi.
     */
    where: { failureCauseAt: { lte: echeanceEnJours(CONSERVATION_MOTIF_JOURS, maintenant) } },
    select: { id: true, failureCauseAt: true, discrepancy: true },
  });

  const echus = candidats
    .filter((t) => t.failureCauseAt && motifEffacable(t.failureCauseAt, litigeDe(t), maintenant))
    .map((t) => t.id);
  if (echus.length === 0) return 0;

  const efface = await db.transaction.updateMany({
    where: { id: { in: echus } },
    // Les deux ensemble : la base refuse une date d'échec orpheline, et
    // une transaction sans motif ne se représente plus à la purge.
    data: { failureCause: null, failureCauseAt: null },
  });

  await journaliser({
    acteurId: "systeme:purge",
    action: "paiement.reconciliation",
    cible: "transaction:*",
    motif: `Effacement des motifs d'échec à l'échéance de ${CONSERVATION_MOTIF_JOURS} jours (O.B)`,
    details: { motifs: efface.count },
  }).catch(() => undefined);

  return efface.count;
}

/**
 * Ce que la plateforme sait d'un dossier ouvert sur un paiement.
 *
 * **Un seul état le dit, et ce n'est pas celui qu'on croit.** La première
 * version en lisait deux — l'écart de réconciliation non résolu, et le
 * remboursement décidé que personne n'a versé (K.C). Le second est
 * impossible : `transaction_remboursement_du_suppose_un_encaissement`
 * exige `CONFIRMEE` ou `REMBOURSEE`, quand
 * `transaction_motif_seulement_sur_un_echec` exige `ECHOUEE` ou
 * `EXPIREE`. Les deux ensembles sont disjoints — une transaction qui porte
 * un motif ne peut pas porter d'obligation de remboursement. La branche
 * était morte, et une règle qui ne peut pas s'appliquer est pire qu'une
 * règle absente : elle se relit comme une protection.
 *
 * Reste l'écart, qui lui coexiste bel et bien avec un motif : la
 * réconciliation ouvre l'écart à vingt-quatre heures puis prononce
 * l'expiration, et son propre commentaire le dit — « l'expiration ne ferme
 * pas le dossier de la réclamation : l'écart reste ouvert ».
 *
 * **Et sa clôture n'est pas datée.** Rien n'enregistre la résolution d'un
 * écart aujourd'hui : le sursis de trente jours n'a donc aucun déclencheur,
 * et `closLe` reste nul. Un écart suspend tant qu'il est là, ce qui est
 * exactement ce que la décision demande d'un dossier ouvert. Le jour où
 * B-04 saura fermer un écart, il devra le dater, et cette fonction rendra
 * la date sans que la règle change.
 */
function litigeDe(t: { discrepancy: string | null }): EtatDuLitige {
  return { ouvert: t.discrepancy !== null, closLe: null };
}
