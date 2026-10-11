/**
 * Diagnostic de concurrence WF-08 — revue du 11/10/2026.
 * PostgreSQL local obligatoire, base créée puis supprimée par ce script.
 * Le vrai traitement de la route est exécuté ; seul le composeur HTTP est
 * remplacé pour fournir l'acteur. Ce test ne prouve pas les gardes HTTP.
 * Aucun fournisseur externe, aucune lettre réelle, aucun paiement réel.
 * DATABASE_URL=postgresql://…@127.0.0.1:…/postgres npx tsx scripts/recette/diagnostic-relecture.mts
 * Code 1 : anomalie encore reproduite ; code 0 : attentes satisfaites.
 */
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Client } from "pg";
import { build } from "esbuild";

const source = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(source.hostname)) {
  throw new Error("Diagnostic limité à un PostgreSQL local.");
}
const nom = `immipro_diag_relecture_${process.pid}`;
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`CREATE DATABASE ${nom}`);
source.pathname = `/${nom}`;
source.searchParams.set("schema", "public");
process.env.DATABASE_URL = source.toString();
const fichier = resolve(`.recette/diagnostic-relecture-${process.pid}.mjs`);
let db: typeof import("../../src/lib/db").db | undefined;
let appels = 0;
let liberer: (() => void) | undefined;
const rendezVous = new Promise<void>((ok) => {
  liberer = ok;
});
const service = createServer((req, res) => {
  req.resume();
  req.on("end", async () => {
    appels++;
    if (appels === 1) setTimeout(() => liberer?.(), 1500).unref();
    if (appels >= 2) liberer?.();
    await rendezVous;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          { finish_reason: "stop", message: { content: JSON.stringify({ remarques: [] }) } },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      }),
    );
  });
});
try {
  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: process.env,
    encoding: "utf8",
  });
  if (migration.status !== 0) throw new Error(migration.stderr || migration.stdout);
  await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
  const port = (service.address() as { port: number }).port;
  process.env.AI_FOURNISSEUR_REDACTION = "openai_compatible";
  process.env.AI_OPENAI_AUTH = "cle";
  process.env.AI_OPENAI_API_KEY = "cle-synthetique";
  process.env.AI_OPENAI_MODEL = "modele-synthetique";
  process.env.AI_OPENAI_URL = `http://127.0.0.1:${port}/v1`;
  mkdirSync(".recette", { recursive: true });
  await build({
    stdin: {
      contents:
        'export { POST } from "./src/app/api/dossiers/[id]/redaction/[type]/relecture/route"; export { db } from "./src/lib/db";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    outfile: fichier,
    plugins: [
      {
        name: "acteur-de-recette",
        setup(b) {
          b.onResolve({ filter: /^@\/server\/http\/route$/ }, () => ({
            path: "route",
            namespace: "recette",
          }));
          b.onLoad({ filter: /.*/, namespace: "recette" }, () => ({
            contents: "export const route = definition => definition;",
            loader: "js",
          }));
        },
      },
    ],
  });
  const module = await import(pathToFileURL(fichier).href);
  db = module.db;
  if (!db) throw new Error("Client Prisma absent du traitement compilé.");
  const user = await db.user.create({ data: { email: "diagnostic@exemple.test" } });
  const rule = await db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: "ETUDES",
      category: "ETUDES",
      version: 1,
      effectiveFrom: new Date("2026-01-01"),
      rules: {},
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date("2026-01-01"),
      verifiedBy: "diagnostic",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
  const app = await db.application.create({
    data: { userId: user.id, visaRuleId: rule.id, status: "ACTIF" },
  });
  const paiement = await db.transaction.create({
    data: {
      reference: `IMP-DIAG-${process.pid}`,
      userId: user.id,
      applicationId: app.id,
      packCode: "dossier",
      amountMajor: 29,
      currency: "EUR",
      provider: "STRIPE",
      providerTxId: `stripe:diag_${process.pid}`,
      status: "CONFIRMEE",
      confirmedAt: new Date(),
    },
  });
  await db.analysisCredit.create({
    data: { applicationId: app.id, delta: 30, reason: "ACHAT_PACK", transactionId: paiement.id },
  });
  const doc = await db.document.create({
    data: {
      applicationId: app.id,
      code: "lettre_motivation",
      label: "Lettre de motivation",
      remedy: "REDIGER",
    },
  });
  const version = await db.documentVersion.create({
    data: {
      documentId: doc.id,
      rank: 1,
      body: "Lettre synthétique réservée au diagnostic de concurrence.",
      wordCount: 8,
    },
  });
  const contexte = { params: { id: app.id, type: "lettre-motivation" }, acteur: { id: user.id } };
  const reponses = await Promise.allSettled([
    module.POST.traiter(contexte),
    module.POST.traiter(contexte),
  ]);
  const solde = (
    await db.analysisCredit.aggregate({ where: { applicationId: app.id }, _sum: { delta: true } })
  )._sum.delta;
  const relue = Boolean(
    (await db.documentVersion.findUnique({ where: { id: version.id } }))?.critiquedAt,
  );
  const conforme = appels === 1 && solde === 29 && relue;
  console.log(
    JSON.stringify(
      {
        id: "DIA-07",
        simulation: true,
        attendu: { appels: 1, debit: 1, relue: true },
        observe: {
          appels,
          debit: 30 - (solde ?? 0),
          relue,
          reponses: reponses.map((r) => r.status),
        },
        conforme,
      },
      null,
      2,
    ),
  );
  if (!conforme) process.exitCode = 1;
} finally {
  await db?.$disconnect();
  if (service.listening) await new Promise<void>((ok) => service.close(() => ok()));
  rmSync(fichier, { force: true });
  await admin.query(`DROP DATABASE ${nom} WITH (FORCE)`);
  await admin.end();
}
