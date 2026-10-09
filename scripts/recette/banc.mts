/**
 * Le banc de recette locale — RF-5, S.156.
 *
 * L'application telle que l'image la lance (le serveur `standalone` de
 * Next, avec ses fichiers statiques à côté, et le worker de `dist/`), sur
 * une base jetable, avec des services simulés sur la boucle
 * locale : stockage S3 (dépôt présigné du navigateur compris), antivirus
 * (EICAR reconnue, le reste sain), courrier capturé. Un testeur — humain ou
 * navigateur piloté — y déroule les parcours de la matrice
 * (`docs/recette/matrice-v1.md`) sans toucher à un service réel.
 *
 *     npm run build                        # une fois, ou après un changement
 *     npm run recette:banc                 # http://localhost:3100
 *     npm run recette:banc -- --port 3200 --base immipro_recette2
 *
 * Ce que le banc **ne simule pas** : la lecture par le modèle (aucune clé :
 * la pièce part en revue humaine, comme en production sans fournisseur),
 * le paiement (aucun rail : l'achat le dit), nginx et ses certificats. Les
 * lignes de la matrice qui en dépendent restent « non vérifié » ici.
 *
 * Les courriers sont écrits dans `.recette/courriers/` et leur code éventuel
 * est affiché : c'est ainsi que se lit le code de vérification d'un compte.
 * Ctrl-C arrête tout ; la base est gardée pour relire après coup, et
 * supprimée au lancement suivant.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { SMTPServer } from "smtp-server";
import { demarrerUnFauxStockage } from "../faux-stockage";

const arg = (nom: string, defaut: string) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : defaut;
};
const PORT = Number(arg("port", "3100"));
const BASE = arg("base", "immipro_recette");
if (!/^immipro_recette\w*$/u.test(BASE)) {
  console.error("✗ --base doit commencer par immipro_recette : le banc supprime cette base à chaque lancement.");
  process.exit(2);
}
if (!existsSync(".next/standalone/server.js") || !existsSync("dist/worker.js")) {
  console.error("✗ L'application n'est pas construite : lancer d'abord « npm run build ».");
  process.exit(2);
}
const source = process.env.DATABASE_URL;
if (!source) {
  console.error("✗ DATABASE_URL manque : le banc crée sa base à côté de celle-ci.");
  process.exit(2);
}

const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${BASE}`;
cible.searchParams.set("schema", "public");

async function surLAdministration(texte: string): Promise<void> {
  const client = new Client({ connectionString: administration.toString() });
  await client.connect();
  try {
    await client.query(texte);
  } finally {
    await client.end();
  }
}

const etape = (texte: string) => console.log(`\n▸ ${texte}`);

/* ── La base ─────────────────────────────────────────────────────── */
etape(`Base jetable ${BASE}`);
await surLAdministration(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${BASE}`);
const envBase = { ...process.env, DATABASE_URL: cible.toString() };
const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env: envBase });
if (migration.status !== 0) {
  console.error(`${migration.stdout ?? ""}${migration.stderr ?? ""}`);
  process.exit(1);
}
console.log("  ✓ migrations appliquées");

/* ── Les services simulés ────────────────────────────────────────── */
etape("Services simulés");
const stockage = await demarrerUnFauxStockage();
console.log(`  ✓ stockage S3 : http://localhost:${stockage.port}`);

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const antivirus = createServer((requete, reponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (b: Buffer) => morceaux.push(b));
  requete.on("end", () => {
    const infecte = Buffer.concat(morceaux).toString("latin1").includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
    reponse.writeHead(200, { "Content-Type": "application/json" });
    reponse.end(infecte ? '{"status":"infected","signature":"Eicar-Test-Signature"}' : '{"status":"clean"}');
  });
});
await new Promise<void>((ok) => antivirus.listen(0, "127.0.0.1", ok));
const portAntivirus = (antivirus.address() as { port: number }).port;
console.log(`  ✓ antivirus : EICAR reconnue, le reste sain (${EICAR.length} octets d'EICAR pour l'essayer)`);

mkdirSync(".recette/courriers", { recursive: true });
let numero = 0;
const smtp = new SMTPServer({
  disabledCommands: ["AUTH", "STARTTLS"],
  authOptional: true,
  onData(flux, session, fini) {
    let contenu = "";
    flux.on("data", (bloc: Buffer) => (contenu += bloc.toString("utf8")));
    flux.on("end", () => {
      numero += 1;
      const vers = session.envelope.rcptTo.map((r) => r.address).join(", ");
      const fichier = `.recette/courriers/${String(numero).padStart(3, "0")}.eml`;
      writeFileSync(fichier, contenu);
      const code = /code[^\n]{0,60}?(\d{6})/iu.exec(contenu.replace(/=\r?\n/gu, ""))?.[1];
      console.log(`  ✉ ${vers} — ${fichier}${code ? ` — code ${code}` : ""}`);
      fini();
    });
  },
});
await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", () => ok()));
const portSmtp = (smtp.server.address() as { port: number }).port;
console.log(`  ✓ courrier capturé dans .recette/courriers/`);

/* ── L'environnement de l'application ────────────────────────────── */
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  APP_URL: `http://localhost:${PORT}`,
  DATABASE_URL: cible.toString(),
  MINIO_ENDPOINT: "127.0.0.1",
  MINIO_PORT: String(stockage.port),
  MINIO_USE_SSL: "false",
  MINIO_ROOT_USER: "essai",
  MINIO_ROOT_PASSWORD: "essai-mot-de-passe",
  MINIO_BUCKET_DOCUMENTS: "immipro-documents",
  MINIO_BUCKET_QUARANTAINE: "immipro-quarantaine",
  MINIO_PUBLIC_URL: `http://localhost:${stockage.port}`,
  ANTIVIRUS_URL: `http://127.0.0.1:${portAntivirus}/scan`,
  SMTP_URL: `smtp://127.0.0.1:${portSmtp}`,
  SMTP_FROM: "recette@immipro.test",
  ETAT_DE_SERVICE_JETON: randomBytes(16).toString("hex"),
};
// Aucun fournisseur réel n'est joignable depuis le banc.
for (const cle of ["ANTHROPIC_API_KEY", "AI_OPENAI_API_KEY", "FEDAPAY_API_KEY", "STRIPE_API_KEY", "PAIEMENT_FOURNISSEURS"]) {
  delete env[cle];
}

/* ── Le référentiel et le jeu de démonstration ───────────────────── */
etape("Référentiel et jeu de démonstration");
const motDePasse = randomBytes(9).toString("base64url");
for (const [nom, commande] of [
  ["règles", ["npx", "tsx", "prisma/seed/visa-rules.ts"]],
  ["éditorial", ["npx", "tsx", "prisma/seed/editorial.ts"]],
  ["démonstration", ["npx", "tsx", "prisma/seed/demonstration.ts"]],
] as const) {
  const r = spawnSync(commande[0], commande.slice(1), {
    encoding: "utf8",
    env: { ...env, NODE_ENV: "development", SEED_DEMO_BASE: BASE, DEMO_MOT_DE_PASSE: motDePasse },
  });
  if (r.status !== 0) {
    console.error(`✗ graine ${nom} :\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    process.exit(1);
  }
  const comptes = (r.stdout ?? "").split("\n").filter((l) => l.startsWith("✓"));
  console.log(`  ✓ ${nom}${comptes.length ? `\n${comptes.map((l) => `      ${l}`).join("\n")}` : ""}`);
}
console.log(`  Mot de passe des comptes de démonstration : ${motDePasse}`);

/* ── L'application et le worker ──────────────────────────────────── */
etape("Application et worker");
const enfants: ChildProcess[] = [];
const lancer = (nom: string, commande: string, args: string[]) => {
  const enfant = spawn(commande, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  enfant.stdout!.on("data", (b: Buffer) => process.stdout.write(`  [${nom}] ${b}`));
  enfant.stderr!.on("data", (b: Buffer) => process.stdout.write(`  [${nom}] ${b}`));
  enfant.on("exit", (code) => console.log(`  [${nom}] arrêté (${code})`));
  enfants.push(enfant);
};
// Comme le Dockerfile : le `standalone` n'embarque ni `public/` ni `.next/static/`.
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
env.HOSTNAME = "127.0.0.1";
lancer("app", "node", [".next/standalone/server.js"]);
lancer("worker", "node", ["dist/worker.js"]);

for (let i = 0; i < 120; i++) {
  const pret = await fetch(`http://localhost:${PORT}/api/health`).then((r) => r.ok).catch(() => false);
  if (pret) break;
  await new Promise((ok) => setTimeout(ok, 500));
}
console.log(`\n✓ Banc prêt : http://localhost:${PORT}`);
console.log(`  Détail de l'état de service : /api/health avec l'en-tête « Authorization: Bearer ${env.ETAT_DE_SERVICE_JETON} »`);
console.log("  Ctrl-C pour arrêter.");

const arreter = async () => {
  for (const enfant of enfants) enfant.kill("SIGTERM");
  await stockage.arreter();
  antivirus.close();
  smtp.close(() => undefined);
  process.exit(0);
};
process.on("SIGINT", arreter);
process.on("SIGTERM", arreter);
