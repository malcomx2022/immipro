import { Client } from "minio";

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
    accessKey: process.env.MINIO_ROOT_USER!,
    secretKey: process.env.MINIO_ROOT_PASSWORD!,
  });
  return client;
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
const ttl = () => Number(process.env.MINIO_PRESIGNED_TTL_SECONDS ?? 300);

export const presignedGet = (key: string) =>
  connexion().presignedGetObject(confiance(), key, ttl());

/** Le dépôt du navigateur, toujours en quarantaine (I.D). */
export const presignedPut = (key: string) =>
  connexion().presignedPutObject(quarantaine(), key, ttl());

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

/** Suppression définitive — appelée par la purge de rétention (INV-5). */
export const removeObject = (key: string) => connexion().removeObject(confiance(), key);
