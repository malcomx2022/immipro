/**
 * Préconditions et lectures de la recette L6, dans la seule base jetable du
 * banc `--parcours`. Les lectures sont en transaction `READ ONLY` ; les deux
 * préconditions n'écrivent que sur le candidat synthétique de l'exécution
 * (`l6-…@immipro.test`), jamais sur un référentiel.
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";
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
