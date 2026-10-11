/** S.170 : le banc réel, ses deux processus et ses services locaux. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { setTimeout as patienter } from "node:timers/promises";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
assert(source, "DATABASE_URL manque : utiliser un serveur PostgreSQL de test.");
const admin = new URL(source);
admin.pathname = "/postgres";
admin.searchParams.delete("schema");
const client = new Client({ connectionString: admin.toString() });
const nom = `immipro_recette_s170_${Date.now()}`;
const collision = `${nom}_collision`;
const baseEnEchec = `${nom}_echec`;
const bin = mkdtempSync(join(tmpdir(), "immipro-s170-"));
// Injecter uniquement l'échec de la dernière graine : ni Prisma ni les autres
// graines ne sont remplacés. Le vrai banc doit fermer ce qu'il a déjà ouvert.
writeFileSync(
  join(bin, "npx"),
  `#!${process.execPath}\n` +
    `const {spawnSync} = require('node:child_process');\n` +
    `if (process.argv.includes('prisma/seed/demonstration.ts')) process.exit(17);\n` +
    `const env = {...process.env, PATH: process.env.PATH.split(${JSON.stringify(delimiter)}).filter(p => p !== ${JSON.stringify(bin)}).join(${JSON.stringify(delimiter)})};\n` +
    `process.exit(spawnSync('npx', process.argv.slice(2), {env, stdio:'inherit'}).status ?? 1);\n`,
  { mode: 0o755 },
);
const cible = new URL(source);
cible.pathname = `/${collision}`;
const controles = (texte: string) => console.log(`✓ ${texte}`);
const sorties = new Map<ChildProcess, Promise<number | null>>();
const journaux = new Map<ChildProcess, string>();
const enfants: ChildProcess[] = [];
let appels = 0;
const piege = createServer((req, res) => {
  appels++;
  req.resume();
  res.writeHead(500);
  res.end();
});
await new Promise<void>((ok) => piege.listen(0, "127.0.0.1", ok));
const portPiege = (piege.address() as { port: number }).port;
const temporaire = createServer();
await new Promise<void>((ok) => temporaire.listen(0, "127.0.0.1", ok));
const port = (temporaire.address() as { port: number }).port;
await new Promise<void>((ok) => temporaire.close(() => ok()));
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  ...process.env,
  ANTHROPIC_API_KEY: "cle-synthetique",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${portPiege}`,
  AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
  AI_FOURNISSEUR_REDACTION: "openai_compatible",
  AI_OPENAI_URL: `http://127.0.0.1:${portPiege}/v1`,
  AI_OPENAI_MODEL: "modele-synthetique",
  AI_OPENAI_API_KEY: "cle-synthetique",
  AI_OPENAI_AUTH: "compte_de_service_google",
  AI_OPENAI_COMPTE_DE_SERVICE: JSON.stringify({
    type: "service_account",
    client_email: "banc@essai.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.googleapis.com/token",
  }),
  AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible",
  AI_OPENAI_PDF: "image_url",
  STRIPE_SECRET_KEY: "cle-synthetique",
  FEDAPAY_SECRET_KEY: "cle-synthetique",
};
function lancer(base: string, surcharge: Record<string, string | undefined> = {}) {
  const enfant = spawn(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/recette/banc.mts",
      "--base",
      base,
      "--port",
      String(port),
    ],
    { env: { ...env, ...surcharge }, stdio: ["ignore", "pipe", "pipe"] },
  );
  enfants.push(enfant);
  journaux.set(enfant, "");
  const recevoir = (b: Buffer) => journaux.set(enfant, journaux.get(enfant)! + b.toString());
  enfant.stdout.on("data", recevoir);
  enfant.stderr.on("data", recevoir);
  sorties.set(
    enfant,
    new Promise((ok, non) => {
      enfant.once("exit", ok);
      enfant.once("error", non);
    }),
  );
  return enfant;
}
async function attendre(
  enfant: ChildProcess,
  condition: (log: string) => boolean,
  delai = 120_000,
) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (condition(journaux.get(enfant)!)) return;
    assert(
      enfant.exitCode === null && enfant.signalCode === null,
      "Le banc s'est arrêté avant le contrôle attendu.",
    );
    await patienter(100);
  }
  throw new Error("Le banc n'a pas atteint le contrôle attendu dans le délai.");
}
async function sortie(enfant: ChildProcess) {
  let borne: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sorties.get(enfant)!,
      new Promise<never>((_, non) => {
        borne = setTimeout(
          () => non(new Error("Le banc ne s'arrête pas dans les 10 secondes.")),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(borne);
  }
}
async function portOuvert(p: number): Promise<boolean> {
  return new Promise((ok) => {
    const socket = createConnection({ host: "127.0.0.1", port: p });
    socket.setTimeout(500);
    const fini = (ouvert: boolean) => {
      socket.destroy();
      ok(ouvert);
    };
    socket.once("connect", () => fini(true));
    socket.once("error", () => fini(false));
    socket.once("timeout", () => fini(false));
  });
}

async function verifierServicesFermes(log: string) {
  for (const expression of [
    /stockage S3 : http:\/\/localhost:(\d+)/u,
    /antivirus : http:\/\/127\.0\.0\.1:(\d+)/u,
    /courrier : smtp:\/\/127\.0\.0\.1:(\d+)/u,
  ]) {
    const capture = expression.exec(log);
    assert(capture, "Le journal doit identifier chaque service simulé.");
    assert.equal(await portOuvert(Number(capture[1])), false);
  }
}

try {
  await client.connect();
  await client.query(`CREATE DATABASE ${collision}`);
  const sentinelle = new Client({ connectionString: cible.toString() });
  await sentinelle.connect();
  try {
    await sentinelle.query("CREATE TABLE preuve (valeur int); INSERT INTO preuve VALUES (170)");
    const banc = lancer(nom);
    await attendre(banc, (log) => log.includes("✓ Banc prêt"));
    controles("Le vrai standalone et le vrai worker atteignent la santé authentifiée");
    const log = journaux.get(banc)!;
    const jeton = /Authorization: Bearer ([a-f0-9]+)/u.exec(log)![1];
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    const etat = await response.json();
    assert([200, 503].includes(response.status));
    if (response.status === 503) {
      assert(etat.bloquantes.length > 0);
      assert(
        etat.bloquantes.every((cle: string) =>
          ["paiements", "ouverture_paiement", "remboursement"].includes(cle),
        ),
      );
    }
    assert.equal(etat.db, "up");
    assert(etat.dependances);
    // Le code production connaît les états sous ce nom : ne pas se contenter
    // d'une réponse publique 200 pour prouver l'absence de fournisseur.
    for (const cle of ["extraction", "redaction", "ouverture_paiement"]) {
      assert.equal(etat.dependances[cle].configuree, false, `${cle} doit rester sans fournisseur`);
    }
    assert(!JSON.stringify(etat.dependances).includes("cle-synthetique"));
    controles(
      "État privé propre à cette passe : extraction, rédaction et paiement non configurés malgré le parent complet",
    );
    const autre = lancer(collision);
    assert.equal(await sortie(autre), 1);
    assert(!journaux.get(autre)!.includes("✓ Banc prêt"));
    assert(journaux.get(autre)!.includes("port") && journaux.get(autre)!.includes("indisponible"));
    assert.equal((await sentinelle.query("SELECT valeur FROM preuve")).rows[0].valeur, 170);
    controles("Deux bases sur le même port : le second banc échoue avant de supprimer sa base");
    const worker = Number(/\[worker\] démarré \(pid (\d+)\)/u.exec(log)![1]);
    const app = Number(/\[app\] démarré \(pid (\d+)\)/u.exec(log)![1]);
    process.kill(worker, "SIGTERM");
    assert.equal(await sortie(banc), 1);
    assert(journaux.get(banc)!.includes("worker s'est arrêté"));
    assert.throws(() => process.kill(app, 0));
    assert.throws(() => process.kill(worker, 0));
    assert.equal(await portOuvert(port), false);
    await verifierServicesFermes(log);
    controles(
      "Perte du worker après démarrage : code 1, app/worker arrêtés et ports web/S3/antivirus/SMTP fermés",
    );
    const echec = lancer(baseEnEchec, { PATH: `${bin}${delimiter}${process.env.PATH}` });
    await attendre(echec, (texte) => texte.includes("La graine démonstration a échoué"));
    assert.equal(await sortie(echec), 1);
    assert(journaux.get(echec)!.includes("La graine démonstration a échoué"));
    assert(!journaux.get(echec)!.includes("✓ Banc prêt"));
    await verifierServicesFermes(journaux.get(echec)!);
    controles(
      "Échec d'une graine : code 1, aucun banc prêt et les trois services déjà ouverts sont fermés",
    );
    const reprise = lancer(nom);
    await attendre(reprise, (texte) => texte.includes("✓ Banc prêt"));
    const logReprise = journaux.get(reprise)!;
    const appReprise = Number(/\[app\] démarré \(pid (\d+)\)/u.exec(logReprise)![1]);
    const workerReprise = Number(/\[worker\] démarré \(pid (\d+)\)/u.exec(logReprise)![1]);
    reprise.kill("SIGTERM");
    assert.equal(await sortie(reprise), 0);
    assert.throws(() => process.kill(appReprise, 0));
    assert.throws(() => process.kill(workerReprise, 0));
    assert.equal(await portOuvert(port), false);
    await verifierServicesFermes(logReprise);
    controles("Reprise sur le port libéré puis SIGTERM : code 0, aucun enfant ni service conservé");
    assert.equal(appels, 0);
    controles("Aucun appel au piège HTTP IA pendant la recette du banc");
  } finally {
    await sentinelle.end();
  }
} finally {
  for (const enfant of enfants) {
    if (enfant.exitCode === null && enfant.signalCode === null) {
      enfant.kill("SIGTERM");
      await sortie(enfant).catch(() => enfant.kill("SIGKILL"));
    }
  }
  piege.closeAllConnections();
  await new Promise<void>((ok) => piege.close(() => ok()));
  await client.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
  await client.query(`DROP DATABASE IF EXISTS ${collision} WITH (FORCE)`);
  await client.query(`DROP DATABASE IF EXISTS ${baseEnEchec} WITH (FORCE)`);
  await client.end();
  rmSync(bin, { recursive: true, force: true });
}
