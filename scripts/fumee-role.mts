/**
 * Le changement de rôle journalisé, sur une base réelle et par le paquet
 * de production — S.115.
 *
 * La commande lancée est `node dist/changer-role.mjs`, celle de l'image :
 * un paquet qui ne se charge pas en production se voit ici, pas le jour
 * où il faut nommer un administrateur.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:role
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_role_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.set("schema", "public");

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function surLAdministration(texte: string): Promise<void> {
  const client = new Client({ connectionString: administration.toString() });
  await client.connect();
  try {
    await client.query(texte);
  } finally {
    await client.end();
  }
}

console.log(`Changement de rôle sur une base jetable (${nomBase})`);
await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${nomBase}`);
const env = { ...process.env, DATABASE_URL: cible.toString() };

const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env });
const paquet = spawnSync("node", ["scripts/build-worker.mjs"], { encoding: "utf8" });
if (migration.status !== 0 || paquet.status !== 0) {
  console.error(`${migration.stderr ?? ""}${paquet.stderr ?? ""}`);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  process.exit(1);
}

process.env.DATABASE_URL = cible.toString();
const { db } = await import("../src/lib/db");

const lancer = (...args: string[]) => {
  const r = spawnSync("node", ["dist/changer-role.mjs", ...args], { encoding: "utf8", env });
  return { code: r.status, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const MOTIF = "Responsable de la revue manuelle désigné par la direction";

try {
  await db.user.create({ data: { email: `awa-${process.pid}@exemple.test`, emailVerified: new Date() } });
  await db.user.create({ data: { email: `nonverifie-${process.pid}@exemple.test` } });
  const awa = `awa-${process.pid}@exemple.test`;

  console.log("\nLa commande de l'image");
  const sansMotif = lancer("--email", awa, "--role", "ADMIN", "--par", "Fumée");
  verifier(sansMotif.code === 2 && /--motif/u.test(sansMotif.sortie), "sans motif, elle refuse et dit quoi corriger");

  const promotion = lancer("--email", awa, "--role", "ADMIN", "--par", "Opérateur de fumée", "--motif", MOTIF);
  const apres = await db.user.findUniqueOrThrow({ where: { email: awa } });
  verifier(promotion.code === 0 && apres.role === "ADMIN", `le rôle est donné (${promotion.sortie.trim()})`);
  const ligne = await db.auditLog.findFirst({ where: { action: "compte.role", target: `user:${apres.id}` } });
  verifier(
    ligne !== null && ligne.actorId === "console:Opérateur de fumée" && ligne.reason === MOTIF,
    "le journal porte l'auteur déclaré et le motif",
  );
  verifier(JSON.stringify(ligne?.metadata) === JSON.stringify({ de: "CANDIDAT", vers: "ADMIN" }), "et ce qui a changé");

  const rejeu = lancer("--email", awa, "--role", "ADMIN", "--par", "Opérateur de fumée", "--motif", MOTIF);
  const lignes = await db.auditLog.count({ where: { action: "compte.role" } });
  verifier(rejeu.code === 0 && lignes === 1, "relancée à l'identique, elle ne change ni ne journalise rien");

  console.log("\nLes refus");
  const nonVerifie = lancer("--email", `nonverifie-${process.pid}@exemple.test`, "--role", "VEILLEUR", "--par", "Fumée", "--motif", MOTIF);
  verifier(nonVerifie.code === 1 && /pas vérifiée/u.test(nonVerifie.sortie), "pas de rôle élevé sur une adresse non vérifiée");
  const inconnu = lancer("--email", `personne-${process.pid}@exemple.test`, "--role", "ADMIN", "--par", "Fumée", "--motif", MOTIF);
  verifier(inconnu.code === 1 && /inscription/u.test(inconnu.sortie), "un compte inconnu renvoie vers l'inscription");
  const dernier = lancer("--email", awa, "--role", "CANDIDAT", "--par", "Fumée", "--motif", MOTIF);
  verifier(
    dernier.code === 1 && /dernier administrateur/u.test(dernier.sortie) && (await db.user.findUniqueOrThrow({ where: { email: awa } })).role === "ADMIN",
    "le dernier administrateur ne se retire pas",
  );
  verifier((await db.auditLog.count({ where: { action: "compte.role" } })) === 1, "aucun refus n'écrit au journal");
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nUn rôle se change avec un motif et un auteur, et le journal le garde.");
