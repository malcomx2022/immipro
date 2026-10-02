/**
 * Chargement du référentiel de règles en production — relevé du 02/10/2026.
 *
 * La production n'avait aucune fiche : B-02 publie une règle existante et
 * n'en crée pas, et `npm run seed:rules` ne pouvait pas tourner dans
 * l'image (ni `tsx` ni les sources TypeScript). Le paquet
 * `dist/graine-regles.js` comble ce manque.
 *
 * Ce script l'exécute comme l'image le ferait : dans une arborescence qui
 * ne contient que le paquet et les deux dépendances que l'image embarque,
 * sur une base jetable migrée, **deux fois** — la seconde prouve qu'une
 * reprise ne double ni n'archive rien.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:graine
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const RACINE = process.cwd();
const ARTEFACT = "dist/graine-regles.js";
const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_graine_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.set("schema", "public");

const echecs = [];
const verifier = (condition, message) => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function requete(url, texte) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(texte)).rows;
  } finally {
    await client.end();
  }
}

console.log(`Compilation → ${ARTEFACT}`);
rmSync(join(RACINE, ARTEFACT), { force: true });
execFileSync("node", ["scripts/build-worker.mjs"], { cwd: RACINE, stdio: "ignore" });
verifier(existsSync(join(RACINE, ARTEFACT)), `${ARTEFACT} existe après le build`);

console.log(`\nBase jetable (${nomBase})`);
await requete(administration.toString(), `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await requete(administration.toString(), `CREATE DATABASE ${nomBase}`);
const bac = mkdtempSync(join(tmpdir(), "fumee-graine-"));
try {
  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: cible.toString() },
  });
  if (migration.status !== 0) throw new Error(`${migration.stdout}${migration.stderr}`);

  mkdirSync(join(bac, "dist"), { recursive: true });
  cpSync(join(RACINE, ARTEFACT), join(bac, ARTEFACT));
  for (const paquet of ["@prisma", ".prisma"]) {
    cpSync(join(RACINE, "node_modules", paquet), join(bac, "node_modules", paquet), { recursive: true });
  }

  const lancer = () =>
    spawnSync("node", [ARTEFACT], {
      cwd: bac,
      env: { ...process.env, DATABASE_URL: cible.toString(), NODE_ENV: "production" },
      encoding: "utf8",
      timeout: 120_000,
    });

  let premieresBornes = null;
  for (const passage of ["premier", "second"]) {
    console.log(`\n${passage[0].toUpperCase()}${passage.slice(1)} passage`);
    const r = lancer();
    const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    verifier(r.status === 0, `sortie 0 (obtenu ${r.status})`);
    verifier(!/Cannot find module|MODULE_NOT_FOUND/u.test(sortie), "aucun module manquant");
    if (r.status !== 0) console.log(sortie);

    const lignes = await requete(
      cible.toString(),
      `SELECT "countryCode", status, "effectiveTo" FROM "VisaRule" ORDER BY "countryCode", "visaType"`,
    );
    const publiees = lignes.filter((l) => l.status === "PUBLISHED");
    verifier(publiees.length === 3, `trois fiches publiées (obtenu ${publiees.length})`);
    verifier(
      lignes.some((l) => l.countryCode === "AE" && l.status === "DRAFT"),
      "la fiche Émirats reste en brouillon, à relire en B-02",
    );
    verifier(lignes.length === 4, `quatre lignes, aucun doublon (obtenu ${lignes.length})`);
    /*
      Les bornes de validité viennent du fichier (les Pays-Bas finissent au
      31/12, quand les montants IND changent) : la reprise doit les laisser
      telles quelles, et non clore la version qu'elle réécrit.
    */
    const bornes = JSON.stringify(lignes.map((l) => [l.countryCode, l.status, l.effectiveTo]));
    if (premieresBornes === null) premieresBornes = bornes;
    else verifier(bornes === premieresBornes, "la reprise laisse statuts et bornes de validité inchangés");
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  echecs.push("exception");
} finally {
  rmSync(bac, { recursive: true, force: true });
  await requete(administration.toString(), `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLe référentiel se charge depuis l'image, et une reprise n'y change rien.");
