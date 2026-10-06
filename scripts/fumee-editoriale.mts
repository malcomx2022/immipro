/**
 * La graine éditoriale et les garde-fous SQL, par les paquets de
 * production — S.120.
 *
 * Les commandes lancées sont `node dist/graine-editoriale.mjs` et
 * `node dist/verifier-garde-fous.mjs`, celles de l'image. Ce que la fumée
 * tient :
 *
 * - la graine crée le guide et l'article, deux fois de suite, sans doublon ;
 * - elle n'écrase jamais une retouche de B-08 ni un document retiré ;
 * - le paquet des garde-fous rend 0 sur une base migrée, et non nul sur
 *   une base sans tables.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:editoriale
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_editoriale_${process.pid}`;
const nomVide = `immipro_editoriale_vide_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const adresse = (nom: string) => {
  const u = new URL(source);
  u.pathname = `/${nom}`;
  u.searchParams.set("schema", "public");
  return u.toString();
};

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function requete(url: string, texte: string, valeurs: unknown[] = []) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(texte, valeurs)).rows;
  } finally {
    await client.end();
  }
}

const nettoyer = async () => {
  for (const nom of [nomBase, nomVide]) {
    await requete(administration.toString(), `DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
  }
};

console.log(`Graine éditoriale et garde-fous sur des bases jetables (${nomBase})`);
await nettoyer();
await requete(administration.toString(), `CREATE DATABASE ${nomBase}`);
await requete(administration.toString(), `CREATE DATABASE ${nomVide}`);
const env = { ...process.env, DATABASE_URL: adresse(nomBase) };

try {
  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env });
  const paquet = spawnSync("node", ["scripts/build-worker.mjs"], { encoding: "utf8" });
  if (migration.status !== 0 || paquet.status !== 0) {
    throw new Error(`${migration.stderr ?? ""}${paquet.stderr ?? ""}`);
  }
  const lancer = (fichier: string, base = env) => {
    const r = spawnSync("node", [fichier], { encoding: "utf8", env: base });
    return { code: r.status, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  };
  const lire = () =>
    requete(
      adresse(nomBase),
      `SELECT slug, title, status FROM "EditorialDoc" ORDER BY slug`,
    );

  console.log("\nLa graine, deux fois");
  const premier = lancer("dist/graine-editoriale.mjs");
  const apresPremier = await lire();
  verifier(premier.code === 0 && apresPremier.length === 2, `deux documents créés (${premier.sortie.trim().split("\n").join(" | ")})`);
  verifier(apresPremier.every((d) => d.status === "PUBLIE"), "publiés");
  const second = lancer("dist/graine-editoriale.mjs");
  verifier(second.code === 0 && (await lire()).length === 2 && /laissé tel quel/u.test(second.sortie), "relancée, elle ne double rien");

  console.log("\nCe que l'administrateur a changé");
  await requete(adresse(nomBase), `UPDATE "EditorialDoc" SET title = 'Titre retouché en B-08' WHERE slug = 'pays-bas'`);
  await requete(adresse(nomBase), `UPDATE "EditorialDoc" SET status = 'RETIRE' WHERE slug = 'releve-bancaire-quatre-mois'`);
  const troisieme = lancer("dist/graine-editoriale.mjs");
  const apres = await lire();
  verifier(
    troisieme.code === 0 && apres.find((d) => d.slug === "pays-bas")?.title === "Titre retouché en B-08",
    "un texte retouché n'est pas réécrit",
  );
  verifier(
    apres.find((d) => d.slug === "releve-bancaire-quatre-mois")?.status === "RETIRE",
    "un document retiré n'est pas republié",
  );

  console.log("\nLes garde-fous, par le paquet");
  const gardes = lancer("dist/verifier-garde-fous.mjs");
  verifier(gardes.code === 0 && /Tous les garde-fous tiennent/u.test(gardes.sortie), "base migrée : tous tiennent, sortie 0");
  verifier(
    (await requete(adresse(nomBase), `SELECT count(*)::int AS n FROM "User"`))[0].n === 0,
    "et la base reste telle qu'elle était",
  );
  const vide = lancer("dist/verifier-garde-fous.mjs", { ...process.env, DATABASE_URL: adresse(nomVide) });
  verifier(vide.code === 1 && /migrations/u.test(vide.sortie), "base sans tables : sortie non nulle, et le message dit quoi faire");
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  await nettoyer();
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa graine ne crée que ce qui manque, et le paquet des garde-fous peut être rouge.");
