import type { Document, DocumentVersion } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { autorisationAccordee } from "@/server/acces/consentements";
import { presignedGet, presignedPut } from "@/lib/storage";
import { cleObjet } from "@/server/securite/secret";
import { refusDuFichier, TAILLE_MAXI_MO } from "@/domain/dossiers/televersement";
import { consultable, mentionApercu } from "@/domain/dossiers/quarantaine";
import {
  ATTENTE_AU_CONTROLE,
  type CauseDIndisponibilite,
} from "@/domain/securite/balayage";

/**
 * Dépôt et lecture des pièces — WF-06.
 *
 * Le fichier ne transite pas par l'application. Le serveur signe une URL de
 * dépôt valable cinq minutes, le navigateur écrit directement dans le
 * stockage, puis revient confirmer. C'est la règle d'architecture 4 prise au
 * mot : « aucun accès direct à MinIO depuis le client » veut dire aucun
 * identifiant de stockage côté client, pas aucun octet — faire transiter dix
 * mégaoctets par le processus Next pour les réécrire ailleurs coûte deux
 * fois la bande passante et bloque un rendu pendant l'envoi.
 *
 * Le nom de la clé est tiré au hasard (RG-06.4) : la deviner à partir de
 * celle d'un autre candidat ne doit pas être possible, y compris pendant les
 * cinq minutes où l'URL est valable.
 */

export const TTL_PRESIGNE_SECONDES = 300;

export async function pieceDuDossier(
  pieceId: string,
  applicationId: string,
  userId: string,
): Promise<Document> {
  const piece = await db.document.findFirst({
    where: { id: pieceId, applicationId, application: { userId } },
  });
  if (!piece) throw echec("introuvable");
  return piece;
}

/**
 * RG-02.2 : aucune pièce ne peut être téléversée avant le consentement au
 * traitement des pièces d'identité, et ce consentement est révocable.
 *
 * La lecture ne se refait pas ici. Elle vivait en double — `autorisationAccordee`
 * répondait déjà à la même question pour la proposition de partenaire —, et deux
 * lectures d'un même registre de preuve finissent par répondre différemment le
 * jour où l'une apprend quelque chose que l'autre ignore. C'est le défaut
 * qu'avait le rattachement d'une condition à sa pièce (S.42), sur un objet
 * autrement plus sensible.
 */
export async function exigerConsentementPieces(userId: string): Promise<void> {
  if (!(await autorisationAccordee(userId, "pieces_identite"))) {
    throw echec("consentement_manquant");
  }
}

export interface DemandeDeDepot {
  nom: string;
  octets: number;
  typeMime: string;
  /** Empreinte du fichier calculée par le navigateur (RG-06.2). */
  empreinte: string;
}

const MIMES_ACCEPTES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/**
 * Contrôles synchrones, avant que le moindre octet parte (WF-06, étape 2).
 *
 * Le refus reprend le message du domaine, qui dit la mesure constatée et le
 * geste attendu. Le type MIME est vérifié en plus de l'extension : une photo
 * renommée en `.pdf` passerait le premier contrôle et échouerait à la
 * lecture, dix mégaoctets plus tard, avec un message que personne ne
 * comprendrait.
 */
export function refusDeLaDemande(demande: DemandeDeDepot): string | null {
  const refus = refusDuFichier({ nom: demande.nom, octets: demande.octets });
  if (refus) return refus;
  if (!MIMES_ACCEPTES.has(demande.typeMime)) {
    return `Le fichier s'annonce comme « ${demande.typeMime} », un format que l'analyse ne lit pas. Envoie un PDF, un JPG ou un PNG de moins de ${TAILLE_MAXI_MO} Mo.`;
  }
  return null;
}

export interface DepotPrepare {
  /** URL de dépôt direct, valable cinq minutes. */
  url: string;
  cle: string;
  expireDansSecondes: number;
}

/**
 * Réutilisation du verdict sur empreinte identique — RG-06.2.
 *
 * Elle est décidée ici plutôt qu'au moment de l'analyse : renvoyer une URL
 * de dépôt pour un fichier déjà présent ferait payer l'envoi au candidat,
 * sur une connexion mobile, pour un octet qui existe déjà.
 */
export async function versionDeMemeEmpreinte(
  documentId: string,
  empreinte: string,
): Promise<DocumentVersion | null> {
  return db.documentVersion.findFirst({ where: { documentId, checksum: empreinte } });
}

export async function preparerLeDepot(
  applicationId: string,
  piece: Document,
): Promise<DepotPrepare> {
  const cle = cleObjet(applicationId, piece.code);
  const url = await presignedPut(cle);
  return { url, cle, expireDansSecondes: TTL_PRESIGNE_SECONDES };
}

/**
 * URL de lecture, générée à la demande et jamais stockée (RG-06.4). Une
 * pièce purgée n'en a plus : son contenu n'existe plus, seul le verdict
 * reste.
 *
 * Et une pièce non balayée n'en a pas non plus (I.D). La condition est ici
 * plutôt que dans l'écran : c'est la seule fonction qui signe une URL de
 * lecture, et une décision de sécurité qui vit dans un rendu se contourne
 * en appelant la route directement.
 */
export async function urlDeLecture(version: DocumentVersion): Promise<string | null> {
  if (!version.objectKey || version.purgedAt) return null;
  if (!consultable(version.scanState)) return null;
  return presignedGet(version.objectKey);
}

/**
 * Pourquoi l'aperçu manque, quand il manque. Sans elle, un fichier en
 * quarantaine et un fichier purgé se ressemblent à l'écran : deux absences
 * identiques, dont l'une se résout toute seule en quelques secondes et
 * l'autre jamais.
 *
 * L'attente est **passée** au domaine, et non résumée ici : la version
 * porte depuis quand elle attend et, le cas échéant, la cause de
 * l'incident ouvert. Sans ces deux-là, le message promettait « quelques
 * instants » sur une pièce qui n'aboutirait jamais.
 */
export function raisonSansApercu(version: DocumentVersion, maintenant = new Date()): string | null {
  if (version.purgedAt) return null;
  return mentionApercu(
    version.scanState,
    {
      depuis: version.uploadedAt,
      ...(estUneCause(version.scanIncidentCause)
        ? { cause: version.scanIncidentCause }
        : {}),
    },
    maintenant,
  );
}

/**
 * La cause est une chaîne en base : rien n'empêche une valeur écrite à
 * la main d'y arriver. On ne la traduit que si le domaine la connaît —
 * sinon on retombe sur le message d'attente ordinaire, qui ne promet
 * rien de faux.
 */
const estUneCause = (valeur: string | null): valeur is CauseDIndisponibilite =>
  valeur !== null && valeur in ATTENTE_AU_CONTROLE;

export async function enregistrerLaVersion(
  documentId: string,
  depot: { cle: string; demande: DemandeDeDepot },
): Promise<DocumentVersion> {
  const dernier = await db.documentVersion.findFirst({
    where: { documentId },
    orderBy: { rank: "desc" },
    select: { rank: true },
  });
  return db.documentVersion.create({
    data: {
      documentId,
      rank: (dernier?.rank ?? 0) + 1,
      objectKey: depot.cle,
      checksum: depot.demande.empreinte,
      mimeType: depot.demande.typeMime,
      sizeBytes: depot.demande.octets,
    },
  });
}

/**
 * Péremption — RG-06.6.
 *
 * La date est calculée au dépôt à partir de la durée de validité de la
 * pièce, et non relue à chaque affichage : c'est elle que l'échéancier lit
 * pour dire « ton relevé expire avant la date de dépôt visée ».
 */
export function dateDePeremption(validiteMois: number | null, depose: Date): Date | null {
  if (validiteMois === null) return null;
  const echeance = new Date(depose);
  echeance.setUTCMonth(echeance.getUTCMonth() + validiteMois);
  return echeance;
}
