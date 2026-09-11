import { Client } from "minio";

/**
 * Accès au stockage des pièces. Buckets privés, jamais d'accès direct
 * depuis le client : uniquement des URLs présignées de courte durée (RG-06.4).
 */
export const storage = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ROOT_USER!,
  secretKey: process.env.MINIO_ROOT_PASSWORD!,
});

const BUCKET = process.env.MINIO_BUCKET_DOCUMENTS!;
const TTL = Number(process.env.MINIO_PRESIGNED_TTL_SECONDS ?? 300);

export const presignedGet = (key: string) => storage.presignedGetObject(BUCKET, key, TTL);
export const presignedPut = (key: string) => storage.presignedPutObject(BUCKET, key, TTL);

/** Suppression définitive — appelée par la purge de rétention (INV-5). */
export const removeObject = (key: string) => storage.removeObject(BUCKET, key);
