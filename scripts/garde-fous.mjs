/**
 * Garde-fous SQL : exécute `scripts/verifier-garde-fous.sql` et **échoue**
 * si l'un d'eux manque.
 *
 * Le fichier SQL, seul, ne peut pas échouer : il tourne avec
 * `ON_ERROR_STOP off` — c'est nécessaire, chaque bloc provoque exprès une
 * violation — et rend `0` quoi qu'il arrive. Une contrainte disparue
 * s'annonce donc par une ligne « ACCEPTÉ » au milieu de soixante autres,
 * dans un journal que personne ne relit. En porte de qualité, une
 * vérification qui ne peut pas être rouge n'en est pas une.
 *
 *     npm run db:garde-fous                 sur $DATABASE_URL
 *     node scripts/garde-fous.mjs <url>     sur une base précise
 */
import { spawnSync } from "node:child_process";

const brute = process.argv[2] ?? process.env.DATABASE_URL;
if (!brute) {
  console.error("DATABASE_URL absente — rien à vérifier.");
  process.exit(1);
}

/*
  Prisma veut `?schema=public`, psql refuse ce paramètre. La même URL doit
  pouvoir servir aux deux, sans quoi chaque appelant recopie deux variantes
  et l'une des deux finit par désigner une autre base.
*/
const url = new URL(brute);
url.searchParams.delete("schema");

const resultat = spawnSync("psql", [url.toString(), "-f", "scripts/verifier-garde-fous.sql"], {
  encoding: "utf8",
});

if (resultat.error) {
  console.error(`psql injoignable : ${resultat.error.message}`);
  process.exit(1);
}

const sortie = `${resultat.stdout ?? ""}${resultat.stderr ?? ""}`;
console.log(sortie.trim());

const compter = (motif) => (sortie.match(motif) ?? []).length;
const refuses = compter(/^\s*refusé\s+·/gmu);
const acceptes = compter(/^\s*ACCEPTÉ\s+·/gmu);
const erreurs = compter(/^\s*ERREUR\s+·/gmu);

console.log(
  `\n${refuses} écriture(s) refusée(s), ${acceptes} acceptée(s), ${erreurs} en erreur.`,
);

if (resultat.status !== 0) {
  console.error("psql a rendu un code non nul : la vérification n'a pas abouti.");
  process.exit(1);
}
if (refuses === 0) {
  // Une base sans aucune table rend soixante « ERREUR » ou rien du tout ;
  // dans les deux cas le fichier n'a pas fait son office.
  console.error("Aucune écriture refusée : le fichier n'a pas été appliqué à une base migrée.");
  process.exit(1);
}
if (acceptes > 0 || erreurs > 0) {
  console.error("Un garde-fou manque ou ne se prononce pas — voir les lignes ci-dessus.");
  process.exit(1);
}
console.log("Tous les garde-fous tiennent.");
