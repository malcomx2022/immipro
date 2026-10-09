/**
 * Un faux stockage S3 pour les fumées qui passent par la purge — S.152.
 *
 * Depuis S.152, la purge d'un dossier liste son préfixe dans les deux
 * zones (E4, étape 3) : un dossier ne se déclare purgé qu'une fois prouvé
 * qu'aucun octet ne reste sous `dossiers/<dossier>/`. Une fumée sans
 * stockage verrait donc, à juste titre, chaque dossier laissé échu.
 *
 * Ce serveur répond comme S3 et MinIO sur ce que la purge emploie : PUT,
 * DELETE (204 sur une clé absente), et la liste `list-type=2` filtrée par
 * préfixe, en une page. Il n'apprend rien au code : il lui laisse faire
 * ce qu'il fait en production.
 *
 * Le banc de recette (RF-5, S.156) le sert aussi au navigateur : le dépôt
 * présigné (préflight CORS, PUT), l'aperçu (GET), et au worker : la taille
 * (HEAD), la lecture et la promotion (copie par `x-amz-copy-source`).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const SEAU_CONFIANCE = "immipro-documents";
export const SEAU_QUARANTAINE = "immipro-quarantaine";

const echapperXml = (texte: string) =>
  texte.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

export async function demarrerUnFauxStockage(options: { port?: number; journal?: (ligne: string) => void } = {}) {
  const seaux = new Map<string, Map<string, Buffer>>([
    [SEAU_CONFIANCE, new Map()],
    [SEAU_QUARANTAINE, new Map()],
  ]);
  const seau = (nom: string) => {
    if (!seaux.has(nom)) seaux.set(nom, new Map());
    return seaux.get(nom)!;
  };

  const serveur = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
    const morceaux: Buffer[] = [];
    requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
    requete.on("end", () => {
      const [brut, requeteDUrl] = (requete.url ?? "/").split("?");
      const chemin = decodeURIComponent(brut!).replace(/^\//u, "");
      const separation = chemin.indexOf("/");
      const nomDuSeau = separation === -1 ? chemin : chemin.slice(0, separation);
      const cle = separation === -1 ? "" : chemin.slice(separation + 1);
      const objets = seau(nomDuSeau);
      const parametres = new URLSearchParams(requeteDUrl ?? "");
      // Le navigateur dépose et lit par des URL présignées : il faut l'y autoriser.
      reponse.setHeader("Access-Control-Allow-Origin", requete.headers.origin ?? "*");
      reponse.setHeader("Access-Control-Allow-Methods", "GET, PUT, HEAD");
      reponse.setHeader("Access-Control-Allow-Headers", requete.headers["access-control-request-headers"] ?? "*");
      reponse.setHeader("Access-Control-Expose-Headers", "ETag");
      if (requete.method === "OPTIONS") {
        reponse.writeHead(204);
        return reponse.end();
      }
      if (requeteDUrl === "location") {
        reponse.writeHead(200, { "Content-Type": "application/xml" });
        return reponse.end(
          '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>',
        );
      }
      const absent = () => {
        reponse.writeHead(404, { "Content-Type": "application/xml" });
        reponse.end("<Error><Code>NoSuchKey</Code></Error>");
      };
      options.journal?.(`${requete.method} ${nomDuSeau}/${cle}`);

      if (requete.method === "GET" && cle === "" && parametres.get("list-type") === "2") {
        const prefixe = parametres.get("prefix") ?? "";
        const contenus = [...objets.entries()]
          .filter(([k]) => k.startsWith(prefixe))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([k, octets]) =>
              `<Contents><Key>${echapperXml(k)}</Key><LastModified>${new Date().toISOString()}</LastModified><ETag>"essai"</ETag><Size>${octets.length}</Size></Contents>`,
          )
          .join("");
        reponse.writeHead(200, { "Content-Type": "application/xml" });
        return reponse.end(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${nomDuSeau}</Name><IsTruncated>false</IsTruncated>${contenus}</ListBucketResult>`,
        );
      }
      if (requete.method === "HEAD" && cle !== "") {
        const objet = objets.get(cle);
        if (!objet) return absent();
        reponse.writeHead(200, {
          "Content-Length": String(objet.length),
          ETag: '"essai"',
          "Last-Modified": new Date().toUTCString(),
        });
        return reponse.end();
      }
      if (requete.method === "GET" && cle !== "") {
        const objet = objets.get(cle);
        if (!objet) return absent();
        reponse.writeHead(200, { "Content-Length": String(objet.length) });
        return reponse.end(objet);
      }
      const copieDe = requete.headers["x-amz-copy-source"] as string | undefined;
      if (requete.method === "PUT" && copieDe) {
        const depuis = decodeURIComponent(copieDe).replace(/^\//u, "");
        const coupure = depuis.indexOf("/");
        const objet = seau(depuis.slice(0, coupure)).get(depuis.slice(coupure + 1));
        if (!objet) return absent();
        objets.set(cle, objet);
        reponse.writeHead(200, { "Content-Type": "application/xml" });
        return reponse.end(
          `<CopyObjectResult><ETag>"essai"</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
        );
      }
      if (requete.method === "PUT") {
        objets.set(cle, Buffer.concat(morceaux));
        reponse.writeHead(200, { ETag: '"essai"' });
        return reponse.end();
      }
      if (requete.method === "DELETE") {
        objets.delete(cle);
        reponse.writeHead(204);
        return reponse.end();
      }
      reponse.writeHead(405);
      return reponse.end();
    });
  });
  await new Promise<void>((ok) => serveur.listen(options.port ?? 0, "127.0.0.1", ok));
  const port = (serveur.address() as AddressInfo).port;

  process.env.MINIO_ENDPOINT = "127.0.0.1";
  process.env.MINIO_PORT = String(port);
  process.env.MINIO_USE_SSL = "false";
  process.env.MINIO_ROOT_USER = "essai";
  process.env.MINIO_ROOT_PASSWORD = "essai-mot-de-passe";
  process.env.MINIO_BUCKET_DOCUMENTS = SEAU_CONFIANCE;
  process.env.MINIO_BUCKET_QUARANTAINE = SEAU_QUARANTAINE;

  return {
    port,
    seau,
    arreter: () =>
      new Promise<void>((ok) => {
        serveur.closeAllConnections();
        serveur.close(() => ok());
      }),
  };
}
