/** REV11-L3 : vrai POST Next, deux fournisseurs locaux, PostgreSQL jetable. */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL requise : utiliser un PostgreSQL de test.");
const nom = `immipro_avis_${process.pid}`;
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
  const { recetteHttpDesAvis } = await import("./recette/avis-http");
  await recetteHttpDesAvis(client.db, cible.href);
  console.log("✓ Tous les contrats HTTP d'avis IA sont satisfaits.");
} finally {
  await db?.$disconnect();
  try {
    await connexion.query(`DROP DATABASE ${nom} WITH (FORCE)`);
  } finally {
    await connexion.end();
  }
}
