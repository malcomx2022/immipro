/**
 * HTTPS local : WebKit applique upgrade-insecure-requests même à localhost.
 *
 * Deux écoutes, à certificat éphémère, jamais en production :
 * - l'application (`PORT_HTTPS`, 3173 par défaut) relayée vers le banc
 *   (`PORT_AMONT`, 3172 par défaut) — S.179 ;
 * - le stockage présigné du banc (`PORT_STOCKAGE_HTTPS`), si demandé, relayé
 *   vers le port que le banc annonce dans son journal (`BANC_LOG`) — L6. Sans
 *   lui, WebKit relève le PUT présigné vers https et le dépôt échoue, alors que
 *   la production sert le stockage en https.
 */
import { createServer } from "node:https";
import { request } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT_HTTPS = Number(process.env.PORT_HTTPS ?? 3173);
const PORT_AMONT = Number(process.env.PORT_AMONT ?? 3172);
const PORT_STOCKAGE_HTTPS = process.env.PORT_STOCKAGE_HTTPS
  ? Number(process.env.PORT_STOCKAGE_HTTPS)
  : null;
const BANC_LOG = process.env.BANC_LOG ?? null;

const repertoire = mkdtempSync(join(tmpdir(), "immipro-photos-tls-"));
const cle = join(repertoire, "cle.pem");
const certificat = join(repertoire, "certificat.pem");
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    cle,
    "-out",
    certificat,
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);
const tls = { key: readFileSync(cle), cert: readFileSync(certificat) };

/** Le port du faux stockage, lu dans le journal du banc à la demande. */
function portDuStockage() {
  if (!BANC_LOG) return null;
  try {
    const trouve = /stockage S3 : http:\/\/localhost:(\d+)/u.exec(readFileSync(BANC_LOG, "utf8"));
    return trouve ? Number(trouve[1]) : null;
  } catch {
    return null;
  }
}

const relais = (portAmont) => (entree, sortie) => {
  const port = typeof portAmont === "function" ? portAmont() : portAmont;
  if (port === null) {
    sortie.writeHead(503);
    sortie.end();
    return;
  }
  const amont = request(
    {
      hostname: "127.0.0.1",
      port,
      method: entree.method,
      path: entree.url,
      headers: { ...entree.headers, "x-forwarded-proto": "https" },
    },
    (reponse) => {
      sortie.writeHead(reponse.statusCode ?? 502, reponse.headers);
      reponse.pipe(sortie);
    },
  );
  amont.on("error", () => {
    sortie.writeHead(502);
    sortie.end();
  });
  entree.pipe(amont);
};

const serveurs = [createServer(tls, relais(PORT_AMONT)).listen(PORT_HTTPS, "localhost")];
if (PORT_STOCKAGE_HTTPS !== null) {
  serveurs.push(
    createServer(tls, (entree, sortie) => {
      if (entree.url === "/__sante") {
        sortie.writeHead(200);
        sortie.end("ok");
        return;
      }
      relais(portDuStockage)(entree, sortie);
    }).listen(PORT_STOCKAGE_HTTPS, "localhost"),
  );
}
process.on("exit", () => rmSync(repertoire, { recursive: true, force: true }));
process.on("SIGTERM", () => {
  for (const serveur of serveurs) serveur.closeAllConnections();
  Promise.all(serveurs.map((serveur) => new Promise((ok) => serveur.close(ok)))).then(() =>
    process.exit(0),
  );
});
