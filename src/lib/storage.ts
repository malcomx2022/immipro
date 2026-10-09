import { Client } from "minio";
import {
  MOTIF_ADRESSE,
  REGION_DE_SIGNATURE,
  lireAdressePublique,
} from "@/domain/stockage/adresse-publique";

/**
 * Accès au stockage des pièces. Buckets privés, jamais d'accès direct
 * depuis le client : uniquement des URLs présignées de courte durée (RG-06.4).
 *
 * Le client est construit à la première utilisation, et non au chargement du
 * module. La différence n'est pas cosmétique : construit au chargement, il
 * lève dès qu'une variable manque, et c'est **toute l'application** qui
 * refuse de démarrer — y compris les écrans publics, le simulateur et la
 * connexion, qui ne touchent jamais au stockage. Une erreur de configuration
 * sur une dépendance doit couper ce qui en dépend, pas le reste.
 */
let client: Client | null = null;

function connexion(): Client {
  if (client) return client;
  const manquantes = [
    "MINIO_ENDPOINT",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "MINIO_BUCKET_DOCUMENTS",
    "MINIO_BUCKET_QUARANTAINE",
  ].filter((cle) => !process.env[cle]);
  if (manquantes.length > 0) {
    throw new Error(`Stockage non configuré : ${manquantes.join(", ")}`);
  }
  client = new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    // Fixée plutôt que demandée au serveur avant chaque signature : c'est
    // celle que Garage vérifie, et celle de MinIO par défaut en local.
    region: REGION_DE_SIGNATURE,
    accessKey: process.env.MINIO_ROOT_USER!,
    secretKey: process.env.MINIO_ROOT_PASSWORD!,
  });
  return client;
}

/**
 * Le client qui **signe** les URL que le navigateur ouvre — S.98.
 *
 * Il ne parle jamais au stockage : une signature présignée se calcule sans
 * réseau dès que la région est donnée. Il porte l'adresse publique, parce
 * que la signature SigV4 porte l'hôte et qu'une URL signée pour `minio:9000`
 * ne se réécrit pas. Voir `domain/stockage/adresse-publique.ts`.
 *
 * Sans `MINIO_PUBLIC_URL`, le poste de développement signe avec l'adresse
 * interne, joignable des deux côtés. En production, l'absence est une
 * erreur de configuration : elle coupe le dépôt avec un message qui la
 * nomme, plutôt que de distribuer des liens que personne ne peut ouvrir.
 */
let signataireConstruit: Client | null = null;

function signataire(): Client {
  if (signataireConstruit) return signataireConstruit;
  const lue = lireAdressePublique(process.env.MINIO_PUBLIC_URL);
  if (lue === null) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Stockage non configuré : MINIO_PUBLIC_URL (l'adresse du stockage que joint le navigateur, en https).",
      );
    }
    signataireConstruit = connexion();
    return signataireConstruit;
  }
  if (!lue.valide) throw new Error(`Stockage non configuré : ${MOTIF_ADRESSE[lue.defaut]}`);
  connexion(); // mêmes variables exigées, même message si l'une manque
  signataireConstruit = new Client({
    endPoint: lue.adresse.hote,
    port: lue.adresse.port,
    useSSL: lue.adresse.chiffre,
    region: REGION_DE_SIGNATURE,
    accessKey: process.env.MINIO_ROOT_USER!,
    secretKey: process.env.MINIO_ROOT_PASSWORD!,
  });
  return signataireConstruit;
}

/** Pour les tests : oublie les clients construits. */
export function oublierLesClients(): void {
  client = null;
  signataireConstruit = null;
}

/**
 * Deux zones, et c'est tout l'objet d'I.D.
 *
 * Le navigateur écrit dans la quarantaine, jamais dans la confiance. Aucune
 * URL de lecture n'est signée sur la quarantaine : c'est la raison d'être de
 * deux seaux plutôt que d'un préfixe dans le même — un préfixe se contourne
 * d'une faute de frappe dans une clé, une politique de seau non.
 */
const confiance = () => process.env.MINIO_BUCKET_DOCUMENTS!;
const quarantaine = () => process.env.MINIO_BUCKET_QUARANTAINE!;
/**
 * La durée de validité d'une URL présignée — la règle d'architecture 4,
 * « URLs présignées de 5 minutes, générées à la demande ».
 *
 * ── Elle était réglable, et trois surfaces la disaient fixe ─────────
 *
 * Elle se lisait `Number(process.env.MINIO_PRESIGNED_TTL_SECONDS ?? 300)`,
 * tandis que `TTL_PRESIGNE_SECONDES` valait 300 dans l'accès aux pièces,
 * que l'API rendait ce 300 au client sous le nom `expireDansSecondes`, et
 * que le candidat lisait « un lien valable cinq minutes ». Une valeur dans
 * l'environnement suffisait à les mettre en désaccord :
 *
 *     MINIO_PRESIGNED_TTL_SECONDS=60    → signé 60 s, annoncé 300 s
 *     MINIO_PRESIGNED_TTL_SECONDS=3600  → signé 3600 s, annoncé 300 s
 *
 * Les deux sens coûtent. Plus court, le lien meurt avant le délai annoncé,
 * sur une pièce que le candidat vient de demander. Plus long, la plateforme
 * distribue des adresses de pièces d'identité pendant une heure en
 * affirmant cinq minutes — et la règle d'architecture 4 est fausse sans que
 * rien ne le dise.
 *
 * Ce n'est donc pas un réglage : c'est une règle, avec un nombre dedans.
 * Elle vit ici, où elle est appliquée, et l'accès aux pièces la relit.
 */
export const TTL_PRESIGNE_SECONDES = 5 * 60;

export const presignedGet = (key: string) =>
  signataire().presignedGetObject(confiance(), key, TTL_PRESIGNE_SECONDES);

/** Le dépôt du navigateur, toujours en quarantaine (I.D). */
export const presignedPut = (key: string) =>
  signataire().presignedPutObject(quarantaine(), key, TTL_PRESIGNE_SECONDES);

/** Le flux lu par le balayeur. Seul appelant légitime de la quarantaine. */
export const lireEnQuarantaine = (key: string) => connexion().getObject(quarantaine(), key);

/**
 * Le flux d'une pièce promue. Seul appelant légitime : l'extraction.
 *
 * Lire le seau de confiance depuis le serveur n'ouvre rien — c'est déjà
 * ce que fait une URL présignée, en moins durable. Ce qui compte est ce
 * qui **ne se fait pas** : aucune URL, présignée ou non, n'est transmise
 * au service de lecture. Ce sont les octets qui partent, une fois, dans
 * le corps de l'appel. Confier une adresse à un tiers, c'est lui laisser
 * la possibilité de la rappeler demain, et la rétention (INV-5) ne
 * saurait rien en effacer.
 */
export const lireUnePiece = (key: string) => connexion().getObject(confiance(), key);

/**
 * La taille d'une pièce promue, sans la lire.
 *
 * Rend `null` quand l'objet n'existe pas — ce qui arrive pour de bon,
 * quand une reprise de file suit une purge de rétention.
 */
export async function tailleDUnePiece(key: string): Promise<number | null> {
  try {
    const etat = await connexion().statObject(confiance(), key);
    return etat.size;
  } catch {
    return null;
  }
}

/**
 * La taille d'un objet en quarantaine, sans le lire.
 *
 * Demandée avant le flux : un objet trop volumineux se refuse sans qu'un
 * seul octet soit chargé en mémoire. Rend `null` quand l'objet n'existe
 * pas — ce qui arrive pour de bon, quand une reprise de file suit une
 * promotion déjà faite.
 */
export async function tailleEnQuarantaine(key: string): Promise<number | null> {
  try {
    const etat = await connexion().statObject(quarantaine(), key);
    return etat.size;
  } catch {
    return null;
  }
}

/**
 * Promotion — la frontière de sécurité, franchie une fois le balayage fait.
 *
 * Copie puis suppression, dans cet ordre : interrompue entre les deux, elle
 * laisse l'objet dans les deux zones, ce qu'une reprise corrige sans rien
 * perdre. L'ordre inverse perdrait le fichier.
 */
export async function promouvoir(key: string): Promise<void> {
  const client = connexion();
  await client.copyObject(confiance(), key, `/${quarantaine()}/${key}`);
  await client.removeObject(quarantaine(), key);
}

/** Destruction d'un fichier écarté au contrôle. */
export const removeQuarantaine = (key: string) => connexion().removeObject(quarantaine(), key);

/**
 * Tous les objets d'une zone, par pages — l'inventaire E4 (RF-4, S.151).
 *
 * Lecture seule : la liste ne touche à aucun objet. Seul appelant :
 * `server/exploitation/inventaire-stockage.ts`.
 */
export async function* listerLaZone(
  zone: "CONFIANCE" | "QUARANTAINE",
): AsyncGenerator<{ cle: string; taille: number; modifieLe: Date }> {
  const seau = zone === "CONFIANCE" ? confiance() : quarantaine();
  for await (const objet of connexion().listObjectsV2(seau, "", true)) {
    if (!objet.name) continue; // un préfixe commun, pas un objet
    yield { cle: objet.name, taille: Number(objet.size ?? 0), modifieLe: objet.lastModified ?? new Date(0) };
  }
}

/**
 * Suppression définitive, dans les deux zones — la purge de rétention (INV-5).
 *
 * ── Elle ne visait que la zone de confiance ─────────────────────────
 *
 * Une pièce dont le balayage n'a jamais conclu — moteur en panne, fichier
 * hors limites, réponse hors contrat — a ses octets **en quarantaine**. La
 * purge supprimait la clé dans la zone de confiance, où elle n'était pas :
 * `DELETE` rend 204 sur une clé absente, la version se déclarait purgée et
 * perdait sa clé, et la pièce d'identité restait dans le stockage, orpheline
 * et introuvable depuis la base (revue du 07/10/2026, E4). Une promotion
 * interrompue entre sa copie et sa suppression laisse aussi un double.
 *
 * Les deux zones sont donc vidées, sans regarder l'état du balayage : une
 * clé absente n'est pas un échec, et c'est la seule lecture qui ne dépend
 * pas d'une colonne qu'un incident a pu laisser fausse. Le premier refus
 * lève, et la version garde sa clé pour la passe suivante.
 */
export async function supprimerPartout(key: string): Promise<void> {
  const client = connexion();
  await client.removeObject(confiance(), key);
  await client.removeObject(quarantaine(), key);
}
