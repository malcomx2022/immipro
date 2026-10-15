/** HTTPS local : WebKit applique upgrade-insecure-requests même à localhost. */
import { createServer } from "node:https";
import { request } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const serveur = createServer(
  { key: readFileSync(cle), cert: readFileSync(certificat) },
  (entree, sortie) => {
    const amont = request(
      {
        hostname: "127.0.0.1",
        port: 3172,
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
  },
);
process.on("exit", () => rmSync(repertoire, { recursive: true, force: true }));
process.on("SIGTERM", () => {
  serveur.closeAllConnections();
  serveur.close(() => process.exit(0));
});
serveur.listen(3173, "localhost");
