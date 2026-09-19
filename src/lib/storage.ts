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

const bucket = () => process.env.MINIO_BUCKET_DOCUMENTS!;
const ttl = () => Number(process.env.MINIO_PRESIGNED_TTL_SECONDS ?? 300);

export const presignedGet = (key: string) => connexion().presignedGetObject(bucket(), key, ttl());
export const presignedPut = (key: string) => connexion().presignedPutObject(bucket(), key, ttl());

/** Suppression définitive — appelée par la purge de rétention (INV-5). */
export const removeObject = (key: string) => connexion().removeObject(bucket(), key);
