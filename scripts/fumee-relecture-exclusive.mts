/** REV11-L4 : concurrence et interruptions, PostgreSQL jetable. */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL requise : utiliser un PostgreSQL de test.");
const nom = `immipro_exclusive_${process.pid}`;
const admin = new URL(source);
admin.pathname = "/postgres";
admin.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nom}`;
cible.searchParams.delete("schema");
const connexion = new Client({ connectionString: admin.href });
await connexion.connect();
await connexion.query(`CREATE DATABASE ${nom}`);
let db: { $disconnect(): Promise<void> } | undefined;
try {
  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: cible.href },
  });
  if (migration.status !== 0)
    throw new Error(`Migration non aboutie : ${migration.stdout}${migration.stderr}`);
  process.env.DATABASE_URL = cible.href;
  const client = await import("../src/lib/db");
  db = client.db;
  const { recetteRelectureExclusive } = await import("./recette/relecture-exclusive");
  await recetteRelectureExclusive(client.db);
  const { recetteRelectureHttp } = await import("./recette/relecture-http");
  await recetteRelectureHttp(client.db, cible.href);
  console.log("✓ Tous les contrats de réservation exclusive sont satisfaits.");
} finally {
  await db?.$disconnect();
  try {
    await connexion.query(`DROP DATABASE ${nom} WITH (FORCE)`);
  } finally {
    await connexion.end();
  }
}
