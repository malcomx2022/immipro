/**
 * Garde-fous SQL, depuis l'image — S.120. Même sémantique que
 * `scripts/garde-fous.mjs` (qui lance `psql`), sans `psql` : l'image n'en a
 * pas. Le fichier `verifier-garde-fous.sql` est embarqué dans le paquet par
 * `build-worker.mjs`, et exécuté avec le paquet `pg`.
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/verifier-garde-fous.mjs
 *
 * Le fichier ne laisse rien de durable : ses essais s'exécutent dans une
 * transaction annulée à la fin. Il n'est donc pas « lecture seule » au sens
 * de PostgreSQL — il écrit, puis annule — mais la base est laissée telle
 * quelle. Écart assumé avec `psql` : `ON_ERROR_STOP off` y avale une erreur
 * de syntaxe ; ici une erreur hors d'un essai interrompt la vérification et
 * sort en code 1, ce qui est plus sûr pour une porte de qualité.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

// Injecté à la compilation ; en `tsx`, repli sur le fichier.
declare const __SQL_GARDE_FOUS__: string | undefined;
const brut =
  typeof __SQL_GARDE_FOUS__ === "string"
    ? __SQL_GARDE_FOUS__
    : readFileSync(new URL("./verifier-garde-fous.sql", import.meta.url), "utf8");
// Les méta-commandes `\set`/`\pset` appartiennent à psql, pas au serveur.
const sql = brut
  .split("\n")
  .filter((l) => !l.startsWith("\\"))
  .join("\n");

const source = process.argv[2] ?? process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — rien à vérifier.");
  process.exit(1);
}
// Prisma veut `?schema=public`, le serveur ne le connaît pas.
const url = new URL(source);
url.searchParams.delete("schema");

const client = new pg.Client({ connectionString: url.toString() });
let sortie = "";
try {
  await client.connect();
  const resultats = await client.query(sql);
  const liste = Array.isArray(resultats) ? resultats : [resultats];
  const lignes: string[] = [];
  for (const r of liste) {
    for (const ligne of r.rows ?? []) {
      const valeur = Object.values(ligne)[0];
      if (typeof valeur === "string") lignes.push(valeur);
    }
  }
  sortie = lignes.join("\n");
} catch (erreur) {
  console.error(
    `La vérification n'a pas abouti : ${erreur instanceof Error ? erreur.message : String(erreur)}. ` +
      "Vérifier DATABASE_URL, que les migrations sont appliquées, et que le compte peut créer une fonction.",
  );
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}

console.log(sortie.trim());

const compter = (motif: RegExp) => (sortie.match(motif) ?? []).length;
const refuses = compter(/^\s*refusé\s+·/gmu);
const acceptes = compter(/^\s*ACCEPTÉ\s+·/gmu);
const erreurs = compter(/^\s*ERREUR\s+·/gmu);
const poses = compter(/^\s*posé\s+·/gmu);
const bloques = compter(/^\s*BLOQUÉ\s+·/gmu);

console.log(
  `\n${refuses} écriture(s) refusée(s), ${poses} posée(s), ${acceptes} acceptée(s) à tort, ${erreurs} en erreur, ${bloques} bloquée(s) à tort.`,
);

if (refuses === 0) {
  console.error("Aucune écriture refusée : le fichier n'a pas été appliqué à une base migrée.");
  process.exit(1);
}
if (poses === 0) {
  console.error("Aucune écriture posée : les essais qui doivent passer n'ont pas tourné.");
  process.exit(1);
}
if (acceptes > 0 || erreurs > 0 || bloques > 0) {
  console.error("Un garde-fou manque, bloque de trop, ou ne se prononce pas — voir ci-dessus.");
  process.exit(1);
}
console.log("Tous les garde-fous tiennent.");
