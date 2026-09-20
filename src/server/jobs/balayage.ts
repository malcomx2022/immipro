import { db } from "@/lib/db";
import { promouvoir, removeQuarantaine } from "@/lib/storage";
import { NON_BRANCHE, type Balayeur } from "@/server/securite/antivirus";
import { refusAuControle } from "@/domain/dossiers/quarantaine";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { solde } from "@/server/acces/quota";

/**
 * Balayage d'une pièce déposée — WF-06 étape 2, I.D.
 *
 * Le job sépare le dépôt de l'admission. Le navigateur a écrit dans la
 * quarantaine ; ici on lit, on décide, et on promeut — ou pas. Rien
 * d'autre ne franchit cette frontière.
 *
 * Trois issues, et une seule promeut :
 *
 * - **saine** → l'objet passe dans le stockage de confiance, la version
 *   porte sa date de balayage, et l'analyse peut partir ;
 * - **infectée** → les octets sont détruits, la pièce redevient à
 *   déposer, et le candidat lit pourquoi sans lire le nom de la menace ;
 * - **pas de réponse** → rien ne change, et la fonction lève. C'est pg-boss
 *   qui réessaie, avec son délai croissant. Un fichier en attente vaut
 *   mieux qu'un fichier accepté par défaut, et une exception est la seule
 *   façon de le dire à une file de jobs.
 *
 * La fonction est idempotente : une version déjà décidée ressort sans rien
 * écrire. C'est ce qui permet de rejouer la file après une reprise.
 */

export interface Tache {
  applicationId: string;
  documentId: string;
  versionId: string;
}

export type Suite =
  /** Promue et analysable : le quota couvre une analyse. */
  | "ANALYSE"
  /** Promue, mais le quota est épuisé (RG-06.5) — le fichier reste conservé. */
  | "CONSERVEE"
  /** Écartée au contrôle. */
  | "REFUSEE"
  /** Rien à faire : version inconnue, sans octet, ou déjà décidée. */
  | "SANS_OBJET";

export class BalayageIndisponible extends Error {
  constructor(objectKey: string) {
    super(`Balayeur sans réponse pour ${objectKey} — la pièce reste en quarantaine.`);
    this.name = "BalayageIndisponible";
  }
}

export async function balayerUnePiece(
  tache: Tache,
  balayer: Balayeur = NON_BRANCHE,
): Promise<Suite> {
  const version = await db.documentVersion.findUnique({
    where: { id: tache.versionId },
    include: { document: { include: { application: { select: { userId: true } } } } },
  });
  if (!version || !version.objectKey) return "SANS_OBJET";
  const cle = version.objectKey;
  // Déjà décidée : une reprise de file ne rebalaie pas, et surtout ne
  // redescend pas une version saine en quarantaine.
  if (version.scanState !== "EN_QUARANTAINE") return "SANS_OBJET";

  const verdict = await balayer(cle);
  if (!verdict) throw new BalayageIndisponible(cle);

  if (verdict.etat === "INFECTEE") {
    await removeQuarantaine(cle);
    // L'ordre compte : les octets partent d'abord. La contrainte
    // `document_version_infectee_sans_octets` refuserait la ligne si la clé
    // survivait, ce qui évite qu'une suppression manquée passe inaperçue.
    await db.documentVersion.update({
      where: { id: version.id },
      data: {
        scanState: "INFECTEE",
        scannedAt: new Date(),
        scanFinding: verdict.menace,
        objectKey: null,
      },
    });

    const refus = refusAuControle(version.document.label);
    await db.document.update({
      where: { id: version.documentId },
      data: {
        status: "A_CORRIGER",
        feedback: refus.corps,
        // La pièce est de nouveau à déposer, et rien n'en tient lieu : le
        // remède redevient « téléverser », pas « remplacer ».
        remedy: "TELEVERSER",
      },
    });
    await db.notification.create({
      data: {
        userId: version.document.application.userId,
        applicationId: tache.applicationId,
        kind: "ANALYSE",
        title: refus.titre,
        body: refus.corps,
      },
    });
    await recalculerCompletude(tache.applicationId);
    return "REFUSEE";
  }

  await promouvoir(cle);
  await db.documentVersion.update({
    where: { id: version.id },
    data: { scanState: "SAINE", scannedAt: new Date() },
  });

  // RG-06.5 — le quota n'interdit pas le dépôt, il n'interdit que l'analyse.
  // Il se relit ici et non au dépôt : entre les deux, une autre pièce a pu
  // consommer la dernière analyse.
  if ((await solde(tache.applicationId)) > 0) return "ANALYSE";

  await db.document.update({
    where: { id: version.documentId },
    data: { status: "ATTENDUE" },
  });
  await recalculerCompletude(tache.applicationId);
  return "CONSERVEE";
}
