/** REV11-L2 : migration d'une base existante, mesures et diagnostic en lecture seule. */
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL requise : cette fumée utilise une base jetable.");
const nom = `immipro_usages_${process.pid}`;
const admin = new URL(source); admin.pathname = "/postgres"; admin.searchParams.delete("schema");
const cible = new URL(source); cible.pathname = `/${nom}`; cible.searchParams.delete("schema");
const temp = await mkdtemp(join(tmpdir(), "immipro-usages-"));
const migrationL2 = "20261011160000_mesure_des_usages_ia";
let echecs = 0;
const verifier = (v: boolean, message: string) => { console.log(`${v ? "✓" : "✗"} ${message}`); if (!v) echecs++; };
async function sql(url: URL, requete: string) {
  const c = new Client({ connectionString: url.href }); await c.connect();
  try { return await c.query(requete); } finally { await c.end(); }
}
const deploie = (args: string[]) => {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy", ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: cible.href } });
  if (r.status !== 0) throw new Error(`Migration non aboutie : ${r.stdout}${r.stderr}`);
};
await sql(admin, `CREATE DATABASE ${nom}`);
let db: { $disconnect(): Promise<void> } | undefined;
try {
  await cp("prisma/schema.prisma", join(temp, "schema.prisma"));
  for (const fichier of await readdir("prisma/migrations")) {
    // Une base d'avant L2 ne porte aucune migration postérieure (S.213 dépend de L2).
    if (fichier === "migration_lock.toml" || fichier < migrationL2) await cp(join("prisma/migrations", fichier), join(temp, "migrations", fichier), { recursive: true });
  }
  const config = join(temp, "prisma.config.mjs");
  await writeFile(config, `export default {schema:${JSON.stringify(join(temp, "schema.prisma"))},migrations:{path:${JSON.stringify(join(temp, "migrations"))}},datasource:{url:process.env.DATABASE_URL}};`);
  deploie(["--config", config]);
  await sql(cible, `INSERT INTO "User" (id,email) VALUES ('u-l2','synthetique-l2@exemple.test');
    INSERT INTO "Application" (id,"userId",status,"updatedAt") VALUES ('d-l2','u-l2','BROUILLON',now());
    INSERT INTO "AiUsage" (id,"userId","applicationId",operation,"inputTokens","outputTokens","costMicros") VALUES
      ('historique-zero','u-l2','d-l2','synthétique',0,0,0),
      ('historique-positif','u-l2','d-l2','synthétique',120,30,0),
      ('historique-invalide','u-l2','d-l2','synthétique',-1,30,0);`);
  const selection = `SELECT id,"inputTokens","outputTokens","costMicros",provider,model,"createdAt" FROM "AiUsage" ORDER BY id`;
  const avant = JSON.stringify((await sql(cible, selection)).rows);
  deploie([]);
  verifier(JSON.stringify((await sql(cible, selection)).rows) === avant,
    "migration avant/après : les trois usages historiques, zéros, nombres invalides et dates sont inchangés");
  verifier((await sql(cible, 'SELECT count(*)::int AS n FROM "AiUsage" WHERE "usageState" IS NULL')).rows[0].n === 3,
    "aucune qualification historique inventée par la migration");
  process.env.DATABASE_URL = cible.href;
  process.env.AI_TARIF_ENTREE_PAR_MILLION = "3";
  process.env.AI_TARIF_SORTIE_PAR_MILLION = "15";
  process.env.AI_TARIF_DEVISE = "EUR";
  const { db: client } = await import("../src/lib/db"); db = client;
  const { noterLesJetons } = await import("../src/server/ia/appel");
  const appel = { fournisseur: "anthropic" as const, modele: "synthetique" };
  await noterLesJetons("u-l2", "d-l2", "zero-observe", 0, 0, appel);
  await noterLesJetons("u-l2", "d-l2", "absente", null, null, appel);
  await noterLesJetons("u-l2", "d-l2", "partielle", 120, null, appel);
  await noterLesJetons("u-l2", "d-l2", "invalide", -12, 1.5, appel);
  await noterLesJetons("u-l2", "d-l2", "connue", 120, 30, appel);
  const lignes = await client.aiUsage.findMany({ where: { usageState: { not: null } } });
  verifier(lignes.length === 5 && lignes.find(l => l.operation === "zero-observe")?.costMicros === 0,
    "un vrai zéro observé laisse une ligne CONNUE, à coût nul");
  verifier(lignes.find(l => l.operation === "absente")?.inputTokens === null && lignes.find(l => l.operation === "absente")?.costMicros === null,
    "absence et coût inconnu persistent des NULL");
  verifier(lignes.find(l => l.operation === "partielle")?.inputTokens === 120 && lignes.find(l => l.operation === "partielle")?.outputTokens === null,
    "le côté connu d'une mesure partielle reste conservé");
  verifier(lignes.find(l => l.operation === "invalide")?.usageState === "INVALIDE" && lignes.find(l => l.operation === "invalide")?.inputTokens === null,
    "les compteurs invalides ne font pas échouer l'écriture après appel");
  verifier(lignes.find(l => l.operation === "connue")?.costMicros === 810,
    "le coût connu est conservé, même indépendamment de tout verdict publié");
  // S.213 : la part de raisonnement, comprise dans la sortie facturée et tarifée avec elle.
  process.env.AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION = "0.825";
  process.env.AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION = "4.125";
  process.env.AI_TARIF_OPENAI_COMPATIBLE_DEVISE = "USD";
  const { mesurerLUsageCompatible } = await import("../src/domain/ia/usage");
  const compatible = { fournisseur: "openai_compatible" as const, modele: "google/gemini-3.8-flash" };
  const pensee = mesurerLUsageCompatible({ prompt_tokens: 1000, completion_tokens: 30, thoughtsTokenCount: 70 });
  await noterLesJetons("u-l2", "d-l2", "raisonnement", pensee.jetonsEntree, pensee.jetonsSortie, { ...compatible, mesure: pensee });
  await noterLesJetons("u-l2", "d-l2", "raisonnement-absent", 1000, 30, { ...compatible, mesure: mesurerLUsageCompatible({ prompt_tokens: 1000, completion_tokens: 30 }) });
  const r1 = await client.aiUsage.findFirstOrThrow({ where: { operation: "raisonnement" } });
  verifier(r1.outputTokens === 100 && r1.reasoningTokens === 70 && r1.usageState === "CONNUE" && r1.costMicros === 1238,
    "raisonnement : 30 visibles + 70 de réflexion persistés en sortie facturée 100, part 70, coût 1 000 × 0,825 + 100 × 4,125");
  const r2 = await client.aiUsage.findFirstOrThrow({ where: { operation: "raisonnement-absent" } });
  verifier(r2.reasoningTokens === null && r2.usageState === "CONNUE" && r2.outputTokens === 30,
    "raisonnement non rapporté : NULL, mesure CONNUE, sortie inchangée (décision du 04/11)");
  // S.219 : le raisonnement rendu en sus de la sortie par Vertex le 06/11 se persiste, jamais INVALIDE.
  const enSus = mesurerLUsageCompatible({ prompt_tokens: 1556, completion_tokens: 30, total_tokens: 1986, completion_tokens_details: { reasoning_tokens: 400 } });
  await noterLesJetons("u-l2", "d-l2", "raisonnement-en-sus", enSus.jetonsEntree, enSus.jetonsSortie, { ...compatible, mesure: enSus });
  const r3 = await client.aiUsage.findFirstOrThrow({ where: { operation: "raisonnement-en-sus" } });
  verifier(r3.usageState === "CONNUE" && r3.outputTokens === 430 && r3.reasoningTokens === 400,
    "raisonnement en sus (Vertex) : CONNUE, sortie facturée 30 + 400, part 400 acceptée par la base");
  const refus = await sql(cible, `INSERT INTO "AiUsage" (id,"userId","applicationId",operation,"inputTokens","outputTokens","reasoningTokens","usageState")
    VALUES ('raisonnement-trop','u-l2','d-l2','synthétique',10,5,6,'CONNUE')`).then(() => false, () => true);
  verifier(refus, "la base refuse une part de raisonnement supérieure à la sortie facturée");
  const refusEtat = await sql(cible, `INSERT INTO "AiUsage" (id,"userId","applicationId",operation,"inputTokens","outputTokens","reasoningTokens","usageState")
    VALUES ('raisonnement-partiel','u-l2','d-l2','synthétique',10,NULL,3,'PARTIELLE')`).then(() => false, () => true);
  verifier(refusEtat, "la base refuse un raisonnement sur une mesure qui n'est pas CONNUE");
  process.env.AI_TARIF_ENTREE_PAR_MILLION = "1000000000";
  await noterLesJetons("u-l2", "d-l2", "cout-hors-integer", 100, 30, appel);
  verifier((await client.aiUsage.findFirstOrThrow({ where: { operation: "cout-hors-integer" } })).costMicros === null,
    "tarif excessif : aucun dépassement INTEGER ni rejeu induit par costMicros");
  const { diagnostiquerLesDonnees } = await import("../src/server/exploitation/diagnostic-donnees");
  const snapshot = JSON.stringify(await client.aiUsage.findMany({ orderBy: { id: "asc" } }));
  const constats = await diagnostiquerLesDonnees({ limite: 20 });
  verifier(constats.find(c => c.code === "IA_USAGE_HISTORIQUE")?.nombre === 3 && constats.find(c => c.code === "IA_USAGE_A_RAPPROCHER")?.nombre === 4,
    "diagnostic : historiques non qualifiés et consommations à rapprocher comptés séparément");
  verifier(JSON.stringify(await client.aiUsage.findMany({ orderBy: { id: "asc" } })) === snapshot,
    "diagnostic en lecture seule, aucun jeton, coût ou état réécrit");
  const { recetteHttpDesUsages } = await import("./recette/usages-http");
  await recetteHttpDesUsages(client, cible.href);
} finally {
  await db?.$disconnect();
  await sql(admin, `DROP DATABASE ${nom} WITH (FORCE)`);
  await rm(temp, { recursive: true, force: true });
}
process.exitCode = echecs ? 1 : 0;
