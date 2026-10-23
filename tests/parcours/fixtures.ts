/**
 * Préconditions et lectures de la recette L6, dans la seule base jetable du
 * banc `--parcours`. Les lectures sont en transaction `READ ONLY` ; les
 * préconditions n'écrivent que sur le candidat synthétique de l'exécution
 * (`l6-…@immipro.test`), jamais sur un référentiel. La purge à la main est
 * la commande d'exploitation elle-même, lancée sur le banc.
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const BASE = "immipro_recette_parcours";
export const JOURNAL = ".recette/parcours-banc.log";
const EMAIL_DE_RECETTE = /^l6-.*@immipro\.test$/u;

function cible(): string {
  const u = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    throw Error("PostgreSQL local requis.");
  u.pathname = `/${BASE}`;
  return u.toString();
}

async function avec<T>(travail: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: cible() });
  try {
    await db.connect();
    return await travail(db);
  } finally {
    await db.end();
  }
}

export async function lire<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return avec(async (db) => {
    await db.query("BEGIN READ ONLY");
    try {
      return (await db.query(sql, params)).rows as T[];
    } finally {
      await db.query("ROLLBACK");
    }
  });
}

export const journal = (): string => readFileSync(JOURNAL, "utf8");

export function motDePasseDuBanc(): string {
  const m = /Mot de passe des comptes de démonstration : (\S+)/u.exec(journal());
  if (!m) throw Error("Mot de passe synthétique du banc absent du journal.");
  return m[1]!;
}

export function origineDesFournisseurs(): string {
  const m = /parcours scriptés uniquement locaux : (http:\/\/[^\s]+)/u.exec(journal());
  if (!m) throw Error("Banc lancé sans --parcours : aucun fournisseur scripté.");
  return m[1]!;
}

/**
 * Le dernier code à six chiffres parti pour cette adresse, s'il en est parti
 * un : l'émission d'un nouveau code annule les précédents.
 */
export function codeDeVerification(email: string): string | null {
  const echappe = email.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const codes = [...journal().matchAll(new RegExp(`${echappe}[^\\n]*code (\\d{6})`, "gu"))];
  return codes.length ? codes[codes.length - 1]![1]! : null;
}

export async function controlerLesFournisseurs(
  mode: "lue" | "illisible" | "sans_usage" | "indisponible" | "lente",
  delai?: number,
): Promise<void> {
  const r = await fetch(`${origineDesFournisseurs()}/controle`, {
    method: "POST",
    body: JSON.stringify({ mode, delai }),
  });
  if (!r.ok) throw Error(`Mode ${mode} refusé par le fournisseur scripté.`);
}

/** R-O05 : le faux stockage du banc refuse les suppressions, ou les accepte de nouveau. */
export async function suppressionsDuStockage(etat: "refusees" | "acceptees"): Promise<void> {
  const r = await fetch(`${origineDesFournisseurs()}/stockage`, {
    method: "POST",
    body: JSON.stringify({ suppressions: etat }),
  });
  if (!r.ok) throw Error(`État ${etat} refusé par le stockage du banc.`);
}

export async function statsDesFournisseurs(): Promise<Record<string, number>> {
  return (await fetch(`${origineDesFournisseurs()}/stats`)).json() as Promise<
    Record<string, number>
  >;
}

async function dossierDuCandidat(db: Client, dossier: string, email: string): Promise<void> {
  if (!EMAIL_DE_RECETTE.test(email)) throw Error("Candidat synthétique requis.");
  const r = await db.query(
    'SELECT a.id FROM "Application" a JOIN "User" u ON u.id = a."userId" WHERE a.id = $1 AND u.email = $2',
    [dossier, email],
  );
  if (r.rowCount !== 1) throw Error("Le dossier n'appartient pas au candidat synthétique.");
}

/**
 * Précondition explicite WF-08 (S.178) : aucune lettre du catalogue n'est
 * exigée par la règle NL du banc. Une pièce facultative synthétique est
 * ajoutée seulement au candidat de cette exécution.
 */
export async function preparerLettre(dossier: string, email: string): Promise<void> {
  await avec(async (db) => {
    await dossierDuCandidat(db, dossier, email);
    await db.query(
      'INSERT INTO "Document" (id,"applicationId",code,label,required,remedy) VALUES ($1,$2,$3,$4,false,$5)',
      [randomUUID(), dossier, "lettre_motivation", "Lettre synthétique de recette — facultative", "REDIGER"],
    );
  });
}

/**
 * Précondition explicite WF-10 : un dossier prêt à déposer. Les pièces
 * obligatoires du candidat synthétique sont marquées conformes et l'état
 * « prêt » est posé avec sa date, comme la garde SQL l'exige. Ce n'est pas
 * une lecture de pièces : la recette de la déclaration, de la conservation
 * et de la clôture commence là où WF-06 s'arrête.
 */
export async function preparerDossierPret(dossier: string, email: string): Promise<void> {
  await avec(async (db) => {
    await dossierDuCandidat(db, dossier, email);
    await db.query(
      `UPDATE "Document" SET status = 'CONFORME', "analyzedAt" = now()
       WHERE "applicationId" = $1 AND required = true`,
      [dossier],
    );
    await db.query(
      `UPDATE "Application" SET status = 'PRET', "readyAt" = now()
       WHERE id = $1 AND status IN ('ACTIF', 'BROUILLON')`,
      [dossier],
    );
  });
}

/**
 * Précondition explicite RG-06.6 (S.188) : le temps a passé sur une pièce
 * périssable. Sa date de péremption, posée au dépôt depuis la durée de
 * validité, est ramenée à la veille ; seulement pour une pièce conforme du
 * candidat synthétique. Le déclassement à l'affichage, l'écran et le
 * remède restent ceux de l'application.
 */
export async function perimerLaPiece(dossier: string, email: string, code: string): Promise<void> {
  await avec(async (db) => {
    await dossierDuCandidat(db, dossier, email);
    const r = await db.query(
      `UPDATE "Document" SET "expiresAt" = current_date - 1
       WHERE "applicationId" = $1 AND code = $2 AND status = 'CONFORME' AND "validityMonths" IS NOT NULL`,
      [dossier, code],
    );
    if (r.rowCount !== 1) throw Error(`Aucune pièce périssable conforme « ${code} » à vieillir.`);
  });
}

/**
 * Précondition explicite RG-10.9 (S.188) : l'échéance de purge annoncée à
 * la clôture est atteinte. Seulement sur un dossier clôturé du candidat
 * synthétique, dont la purge est annoncée et pas encore faite.
 */
export async function echoirLaPurge(dossier: string, email: string): Promise<void> {
  await avec(async (db) => {
    await dossierDuCandidat(db, dossier, email);
    const r = await db.query(
      `UPDATE "Application" SET "purgeDueAt" = now() - interval '1 minute'
       WHERE id = $1 AND "purgeDueAt" IS NOT NULL AND "purgedAt" IS NULL
         AND status IN ('ISSUE_DECLAREE', 'CLOTURE', 'ABANDONNE')`,
      [dossier],
    );
    if (r.rowCount !== 1) throw Error("Aucune purge annoncée à faire échoir sur ce dossier.");
  });
}

/**
 * La purge de rétention lancée à la main par un opérateur nommé (S.152) :
 * la commande d'exploitation elle-même, sur la base et le stockage du banc.
 */
export function purgerALaMain(par: string): { code: number | null; sortie: string } {
  const port = /stockage S3 : http:\/\/localhost:(\d+)/u.exec(journal())?.[1];
  if (!port) throw Error("Port du stockage du banc absent du journal.");
  const r = spawnSync("npx", ["tsx", "scripts/purge-retention.mts", "--par", par], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      DATABASE_URL: cible(),
      MINIO_ENDPOINT: "127.0.0.1",
      MINIO_PORT: port,
      MINIO_USE_SSL: "false",
      MINIO_ROOT_USER: "essai",
      MINIO_ROOT_PASSWORD: "essai-mot-de-passe",
      MINIO_BUCKET_DOCUMENTS: "immipro-documents",
      MINIO_BUCKET_QUARANTAINE: "immipro-quarantaine",
      MINIO_PUBLIC_URL: `http://localhost:${port}`,
    },
  });
  return { code: r.status, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
