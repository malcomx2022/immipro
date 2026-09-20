import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { removeObject } from "@/lib/storage";
import { journaliser } from "@/server/acces/journal";

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
