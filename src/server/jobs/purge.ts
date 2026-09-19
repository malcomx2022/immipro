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

export async function purgerLesPiecesEchues(maintenant = new Date()): Promise<Bilan> {
  const dossiers = await db.application.findMany({
    where: { purgeDueAt: { lte: maintenant }, purgedAt: null },
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
        data: { objectKey: null, body: null, purgedAt: maintenant },
      }),
      db.document.updateMany({
        where: { applicationId: dossier.id },
        data: { status: "PURGEE" },
      }),
      db.application.update({
        where: { id: dossier.id },
        data: { purgedAt: maintenant, status: "ARCHIVE" },
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
  return purgerLesPiecesEchues(maintenant);
}
