/**
 * Porte des migrations : reconstruit la base **depuis zéro**, uniquement
 * avec ce que le dépôt embarque, puis vérifie ce que la reconstruction a
 * produit.
 *
 * Pourquoi partir d'une base vierge. En développement, la base a été
 * façonnée par des mois de `migrate dev`, d'essais et de corrections à la
 * main : elle porte des colonnes qu'aucune migration ne crée plus, et elle
 * masque celles qu'une migration oubliée ne crée pas encore. La seule base
 * qui ressemble à la production est celle qu'on vient de créer.
 *
 * Trois questions, dans cet ordre :
 *
 *  1. les migrations s'appliquent-elles, toutes, sur une base vide ;
 *  2. `schema.prisma` décrit-il exactement ce qu'elles produisent — une
 *     modification de modèle sans migration se voit ici, et nulle part
 *     ailleurs avant le déploiement ;
 *  3. les garde-fous sont-ils portés par les migrations, et non posés à la
 *     main sur une base de développement.
 *
 * La base jetable est créée et supprimée par ce script. Aucune base
 * existante n'est touchée.
 *
 *     npm run smoke:migrations        DATABASE_URL désigne le serveur
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_migrations_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.set("schema", "public");

const echecs = [];
const verifier = (condition, message) => {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    console.log(`  ✗ ${message}`);
    echecs.push(message);
  }
};

async function executer(url, texte) {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await client.query(texte);
  } finally {
    await client.end();
  }
}

const lancer = (commande, args, env = {}) =>
  spawnSync(commande, args, {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: cible.toString(), ...env },
  });

console.log(`Reconstruction complète sur une base vierge (${nomBase})`);
await executer(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await executer(administration, `CREATE DATABASE ${nomBase}`);

try {
  // ── 1. Toutes les migrations, sur une base vide ────────────────────
  const deploiement = lancer("npx", ["prisma", "migrate", "deploy"]);
  const journal = `${deploiement.stdout ?? ""}${deploiement.stderr ?? ""}`;
  verifier(deploiement.status === 0, "les migrations s'appliquent sur une base vide");
  if (deploiement.status !== 0) console.log(`\n${journal.trim()}\n`);

  const appliquees = (await executer(cible, 'select count(*)::int as n from "_prisma_migrations"'))
    .rows[0].n;
  verifier(appliquees > 0, `${appliquees} migration(s) enregistrée(s)`);

  const etat = lancer("npx", ["prisma", "migrate", "status"]);
  verifier(etat.status === 0, "aucune migration en attente après le déploiement");

  // ── 2. Le schéma décrit ce que les migrations produisent ───────────
  /*
    `--exit-code` rend 2 quand la différence n'est pas vide. C'est le cas
    d'un modèle modifié sans migration correspondante : tout passe au vert
    en développement, où la base a été façonnée par `migrate dev`, et la
    production reçoit un schéma qui n'a pas la colonne.
  */
  const derive = spawnSync(
    "npx",
    [
      "prisma", "migrate", "diff",
      "--from-url", cible.toString(),
      "--to-schema-datamodel", "prisma/schema.prisma",
      "--exit-code",
    ],
    { encoding: "utf8" },
  );
  const ecart = `${derive.stdout ?? ""}${derive.stderr ?? ""}`;
  verifier(
    derive.status === 0,
    "`schema.prisma` décrit exactement la base que les migrations construisent",
  );
  if (derive.status !== 0) console.log(`\n${ecart.trim()}\n`);

  // ── 3. Les garde-fous viennent bien des migrations ─────────────────
  console.log("\nGarde-fous portés par les migrations");
  const gardes = spawnSync("node", ["scripts/garde-fous.mjs", cible.toString()], {
    encoding: "utf8",
  });
  const compte = `${gardes.stdout ?? ""}`.match(
    /^(\d+) écriture\(s\) refusée\(s\), (\d+) posée\(s\)/mu,
  );
  verifier(
    gardes.status === 0,
    `les garde-fous tiennent sur la base reconstruite (${compte?.[1] ?? "0"} refusée(s), ${compte?.[2] ?? "0"} posée(s))`,
  );
  if (gardes.status !== 0) {
    console.log(`\n${`${gardes.stdout ?? ""}${gardes.stderr ?? ""}`.trim()}\n`);
  }
} finally {
  await executer(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

console.log(
  echecs.length === 0
    ? "\nLa base se reconstruit depuis le dépôt, et rien n'y manque."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
