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
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const EXTERNES = ["@prisma/client", ".prisma/client"];

const resultat = await build({
  entryPoints: ["src/server/jobs/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  platform: "node",
  target: "node24",
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
  target: "node24",
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
  target: "node24",
  format: "cjs",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsGraine = Object.values(graine.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/graine-regles.js — ${(octetsGraine / 1024).toFixed(0)} Kio`);

/*
  L'essai de bac à sable des paiements, lançable depuis l'image — S.109.

  Il ouvre une vraie session chez le fournisseur avec l'adaptateur de la
  plateforme : c'est la seule vérification qui confronte les champs
  envoyés à un serveur réel. Comme la graine, il ne pouvait pas tourner
  dans l'image (ni `tsx`, ni les sources). Il refuse l'espace de
  production, et s'abstient sans clé :

      docker compose -f docker-compose.prod.yml run --rm app node dist/sandbox-paiement.mjs

  Format ESM : le script attend au premier niveau.
*/
const sandbox = await build({
  entryPoints: ["scripts/sandbox-paiement.mts"],
  outfile: "dist/sandbox-paiement.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsSandbox =
  Object.values(sandbox.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/sandbox-paiement.mjs — ${(octetsSandbox / 1024).toFixed(0)} Kio`);

/*
  Le changement de rôle journalisé (S.115), même image et même méthode.
  Il remplace la requête SQL qu'on lançait à la main, sans motif ni trace :

      docker compose -f docker-compose.prod.yml run --rm app node dist/changer-role.mjs \
        --email <adresse> --role ADMIN --par "<votre nom>" --motif "<pourquoi>"

  Format ESM : le script attend au premier niveau.
*/
const role = await build({
  entryPoints: ["scripts/changer-role.mts"],
  outfile: "dist/changer-role.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsRole = Object.values(role.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/changer-role.mjs — ${(octetsRole / 1024).toFixed(0)} Kio`);

/*
  Le diagnostic d'un paiement (S.116), même image et même méthode. Lecture
  seule — base, journal, fournisseur —, sans donnée du payeur :

      docker compose -f docker-compose.prod.yml run --rm app node dist/diagnostic-paiement.mjs \
        --reference IMP-261005-P98AEE

  Format ESM : le script attend au premier niveau.
*/
const diagnostic = await build({
  entryPoints: ["scripts/diagnostic-paiement.mts"],
  outfile: "dist/diagnostic-paiement.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsDiagnostic =
  Object.values(diagnostic.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/diagnostic-paiement.mjs — ${(octetsDiagnostic / 1024).toFixed(0)} Kio`);

/*
  Le diagnostic des données antérieures (RF-4, S.149), même image et même
  méthode. Lecture seule, identifiants techniques seulement :

      docker compose -f docker-compose.prod.yml run --rm app node dist/diagnostic-donnees.mjs
*/
const diagnosticDonnees = await build({
  entryPoints: ["scripts/diagnostic-donnees.mts"],
  outfile: "dist/diagnostic-donnees.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsDiagnosticDonnees =
  Object.values(diagnosticDonnees.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/diagnostic-donnees.mjs — ${(octetsDiagnosticDonnees / 1024).toFixed(0)} Kio`);

/*
  La graine éditoriale (S.120), même image et même méthode : le guide Pays-Bas
  et l'article de départ, que `npm run seed:editorial` chargeait sans pouvoir
  tourner dans l'image.

      docker compose -f docker-compose.prod.yml run --rm app node dist/graine-editoriale.mjs

  Choix de sécurité : contrairement à la graine de développement, qui remet
  les textes d'origine, ce paquet **ne crée que les documents absents**. Il ne
  réécrit ni un texte retouché en B-08, ni l'état d'un document dépublié :
  on peut le relancer à chaque déploiement sans rien défaire.

  Format ESM : le script attend au premier niveau.
*/
const editoriale = await build({
  entryPoints: ["scripts/graine-editoriale.mts"],
  outfile: "dist/graine-editoriale.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: EXTERNES,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsEditoriale =
  Object.values(editoriale.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/graine-editoriale.mjs — ${(octetsEditoriale / 1024).toFixed(0)} Kio`);

/*
  Les garde-fous SQL depuis l'image (S.120). `scripts/garde-fous.mjs` lance
  `psql`, absent de l'image : ce paquet embarque le fichier SQL (injecté en
  constante à la compilation) et l'exécute avec `pg`, lui aussi empaqueté —
  l'image n'a donc rien de plus à copier.

      docker compose -f docker-compose.prod.yml run --rm app node dist/verifier-garde-fous.mjs

  Code de sortie non nul si un garde-fou manque. `pg-native` est optionnel
  pour `pg` et n'est pas installé : on le déclare externe pour que
  esbuild n'échoue pas dessus.
*/
const gardeFous = await build({
  entryPoints: ["scripts/verifier-garde-fous.mts"],
  outfile: "dist/verifier-garde-fous.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // `pg` est publié en CJS : son `require` de modules Node doit exister en ESM.
  banner: {
    js: 'import { createRequire as __creerRequire } from "node:module"; const require = __creerRequire(import.meta.url);',
  },
  external: [...EXTERNES, "pg-native"],
  define: {
    __SQL_GARDE_FOUS__: JSON.stringify(readFileSync("scripts/verifier-garde-fous.sql", "utf8")),
  },
  tsconfig: "tsconfig.json",
  sourcemap: true,
  logLevel: "info",
  metafile: true,
});

const octetsGardeFous =
  Object.values(gardeFous.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`dist/verifier-garde-fous.mjs — ${(octetsGardeFous / 1024).toFixed(0)} Kio`);
