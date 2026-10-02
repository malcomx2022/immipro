/**
 * Compilation du worker de production.
 *
 * ── Pourquoi ce script existe ─────────────────────────────────────────
 *
 * `docker-compose.prod.yml` lançait `node dist/worker.js`, et rien ne
 * produisait ce fichier : `npm run build` n'appelle que `next build`, le
 * `tsconfig.json` du projet porte `noEmit`, et l'image finale ne copie que
 * la sortie `standalone` de Next. Le service `worker` ne pouvait donc que
 * boucler sur `Cannot find module`, indéfiniment — `restart:
 * unless-stopped` masquant la panne. Avec lui tombaient la purge (INV-5),
 * la réconciliation des paiements (INV-7, RG-05.4), la veille (RG-14.1),
 * la chaîne balayage → analyse et la péremption des pièces (RG-07.4).
 *
 * ── Pourquoi un paquet plutôt qu'une compilation `tsc` ────────────────
 *
 * Le dépôt utilise l'alias `@/` partout. `tsc` ne le réécrit pas : le
 * JavaScript émis garderait `require("@/lib/db")`, que Node ne sait pas
 * résoudre, et il faudrait un chargeur supplémentaire au démarrage.
 * esbuild résout l'alias **à la compilation**, depuis le `tsconfig`, et ne
 * laisse aucun résolveur à installer en production.
 *
 * Il rend aussi visible ce qu'on ne voit pas autrement : si un module du
 * worker importait `next/headers` ou tout autre code réservé à la requête
 * HTTP, la compilation échouerait ici plutôt qu'au premier job en
 * production.
 *
 * ── Ce qui reste hors du paquet, et pourquoi ──────────────────────────
 *
 * `@prisma/client` et le client généré `.prisma/client` : ils chargent
 * leurs moteurs par chemin de fichier à l'exécution, et les empaqueter
 * casse cette résolution. Ce sont les deux seules dépendances que l'image
 * finale doit copier — tout le reste est dans le paquet.
 *
 * CommonJS et non ESM : `@prisma/client` et `pg-boss` sont publiés en CJS,
 * et le paquet est l'unique point d'entrée d'un conteneur, pas une
 * bibliothèque. Le dépôt n'a pas de `"type": "module"`, donc `.js` est
 * déjà du CJS — la commande du conteneur reste `node dist/worker.js`.
 */
import { build } from "esbuild";

const EXTERNES = ["@prisma/client", ".prisma/client"];

const resultat = await build({
  entryPoints: ["src/server/jobs/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  // Les avertissements ne doivent pas se perdre dans la sortie de build.
  logLevel: "info",
  metafile: true,
});

const octets = Object.values(resultat.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/worker.js — ${(octets / 1024).toFixed(0)} Kio, externes : ${EXTERNES.join(", ")}`);

/*
  La passerelle antivirus (S.96), même image et même méthode : un seul
  fichier, aucun module à résoudre à l'exécution. Elle n'importe ni Prisma
  ni rien du worker — `node:http`, `node:net` et le domaine —, et ce
  paquet le vérifie : un import de trop la ferait grossir, ou échouer ici.
*/
const passerelle = await build({
  entryPoints: ["src/server/securite/passerelle-antivirus.ts"],
  outfile: "dist/passerelle-antivirus.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsPasserelle =
  Object.values(passerelle.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/passerelle-antivirus.js — ${(octetsPasserelle / 1024).toFixed(0)} Kio`);

/*
  Le chargement du référentiel de règles (`npm run seed:rules`), même
  image et même méthode — relevé en test le 02/10/2026.

  La production n'avait aucune fiche publiée, et rien ne pouvait en
  publier une : B-02 édite et publie une règle **existante**, il n'en
  crée pas, et la graine ne tournait pas dans l'image — ni `tsx` ni les
  sources TypeScript n'y sont. Le paquet se lance comme une migration :

      docker compose -f docker-compose.prod.yml run --rm app node dist/graine-regles.js

  Il n'est **pas** appelé par le déploiement : la graine remet chaque
  fiche dans l'état du fichier, et un déploiement ne doit pas republier
  une fiche que la veille a dépubliée ni réécrire ce que B-02 a changé.
*/
const graine = await build({
  entryPoints: ["prisma/seed/visa-rules.ts"],
  outfile: "dist/graine-regles.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsGraine = Object.values(graine.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/graine-regles.js — ${(octetsGraine / 1024).toFixed(0)} Kio`);
