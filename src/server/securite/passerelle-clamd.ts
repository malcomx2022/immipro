/**
 * La passerelle HTTP devant clamd — S.96.
 *
 * `ANTIVIRUS_URL` désigne le moteur que l'exploitant met en face, et le
 * contrat (`domain/securite/balayage.ts`) a été écrit pour se satisfaire
 * « avec une trentaine de lignes de colle devant n'importe quel moteur ».
 * Voici la colle, pour ClamAV : elle reçoit les octets en POST, les passe
 * au démon par `zINSTREAM`, et rend `{"status":"clean"}` ou
 * `{"status":"infected","signature":…}`.
 *
 * ── Ce qu'elle ne fait jamais ───────────────────────────────────────
 *
 * Répondre 200 sans verdict du démon. Démon injoignable, muet, en erreur,
 * réponse hors protocole, corps trop gros : chaque cas rend un statut
 * d'échec, que le balayeur lit comme `INDISPONIBLE` — et la pièce reste
 * en quarantaine. La passerelle n'a pas d'avis propre ; elle transmet
 * celui du démon ou dit qu'elle n'en a pas.
 *
 * Elle n'écrit rien sur disque, ne journalise ni les octets, ni leur
 * taille exacte, ni la signature trouvée : le balayeur la reçoit et la
 * consigne lui-même là où le back-office la lit.
 *
 * ── Où elle tourne ──────────────────────────────────────────────────
 *
 * Dans l'image de l'application, comme le worker, avec sa propre commande
 * (`node dist/passerelle-antivirus.js`) et sur le seul réseau interne de
 * `docker-compose.prod.yml`. Rien ne l'expose : seul le worker l'appelle.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect } from "node:net";
import {
  COMMANDE_INSTREAM,
  COMMANDE_PING,
  TAILLE_DU_BLOC_OCTETS,
  enteteDeBloc,
  lireLaReponseClamd,
  pingReussi,
  type ReponseDuContrat,
} from "@/domain/securite/clamd";
import { DELAI_BALAYAGE_MS, TAILLE_MAXI_BALAYAGE_OCTETS } from "@/domain/securite/balayage";

export interface ConfigurationPasserelle {
  hote: string;
  port: number;
  /** Au-delà, le démon est tenu pour muet. Sous le délai du balayeur. */
  delaiMs: number;
}

/** Le délai du balayeur, moins une marge : c'est nous qui devons répondre les premiers. */
export const DELAI_PASSERELLE_MS = DELAI_BALAYAGE_MS - 5_000;

export class EchecDuDemon extends Error {
  constructor(
    readonly statut: 502 | 503 | 504,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Une conversation avec le démon : une commande, une réponse, la
 * connexion fermée. `envoyer` écrit ce qui suit la commande.
 */
function converser(
  config: ConfigurationPasserelle,
  commande: string,
  envoyer: (ecrire: (bloc: Uint8Array) => void) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: config.hote, port: config.port });
    const recus: Buffer[] = [];
    let fini = false;
    const conclure = (erreur: EchecDuDemon | null) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      socket.destroy();
      if (erreur) reject(erreur);
      else resolve(Buffer.concat(recus).toString("utf8"));
    };
    const minuterie = setTimeout(
      () => conclure(new EchecDuDemon(504, "le démon n'a pas répondu dans le délai")),
      config.delaiMs,
    );

    socket.on("connect", () => {
      socket.write(commande);
      envoyer((bloc) => socket.write(bloc));
    });
    socket.on("data", (morceau: Buffer) => {
      recus.push(morceau);
      // Le préfixe `z` termine la réponse par un octet nul.
      if (morceau.includes(0)) conclure(null);
    });
    socket.on("end", () => conclure(null));
    socket.on("error", () => conclure(new EchecDuDemon(503, "le démon est injoignable")));
  });
}

/** Balaie des octets. Rend la réponse du contrat, ou lève `EchecDuDemon`. */
export async function balayerAuDemon(
  config: ConfigurationPasserelle,
  octets: Uint8Array,
): Promise<ReponseDuContrat> {
  const brute = await converser(config, COMMANDE_INSTREAM, (ecrire) => {
    for (let debut = 0; debut < octets.length; debut += TAILLE_DU_BLOC_OCTETS) {
      const bloc = octets.subarray(debut, debut + TAILLE_DU_BLOC_OCTETS);
      ecrire(enteteDeBloc(bloc.length));
      ecrire(bloc);
    }
    ecrire(enteteDeBloc(0));
  });
  const lue = lireLaReponseClamd(brute);
  if (lue.issue === "erreur") throw new EchecDuDemon(502, lue.detail);
  return lue.reponse;
}

/** `zPING` → `PONG`. Ne lève pas : une santé se lit, elle ne casse rien. */
export async function demonDebout(config: ConfigurationPasserelle): Promise<boolean> {
  try {
    return pingReussi(await converser(config, COMMANDE_PING, () => {}));
  } catch {
    return false;
  }
}

/** Lit le corps sous plafond. `null` s'il le dépasse : on cesse de lire. */
function lireLeCorps(requete: IncomingMessage): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    let total = 0;
    let depasse = false;
    requete.on("data", (morceau: Buffer) => {
      if (depasse) return;
      total += morceau.length;
      if (total > TAILLE_MAXI_BALAYAGE_OCTETS) {
        depasse = true;
        morceaux.length = 0;
        return;
      }
      morceaux.push(morceau);
    });
    requete.on("end", () => resolve(depasse ? null : Buffer.concat(morceaux)));
    requete.on("error", reject);
  });
}

const repondre = (reponse: ServerResponse, statut: number, corps: unknown): void => {
  reponse.writeHead(statut, { "Content-Type": "application/json; charset=utf-8" });
  reponse.end(JSON.stringify(corps));
};

/**
 * La passerelle elle-même.
 *
 * - `GET /sante` : 200 si le démon répond `PONG`, 503 sinon ;
 * - `POST` sur tout autre chemin : un balayage, selon le contrat.
 */
export function creerPasserelle(config: ConfigurationPasserelle): Server {
  return createServer(async (requete, reponse) => {
    if (requete.method === "GET" && requete.url === "/sante") {
      const debout = await demonDebout(config);
      return repondre(reponse, debout ? 200 : 503, { demon: debout ? "debout" : "injoignable" });
    }
    if (requete.method !== "POST") {
      return repondre(reponse, 405, { erreur: "POST attendu, avec les octets du fichier dans le corps" });
    }

    let octets: Uint8Array | null;
    try {
      octets = await lireLeCorps(requete);
    } catch {
      return repondre(reponse, 400, { erreur: "corps illisible" });
    }
    if (octets === null) {
      return repondre(reponse, 413, { erreur: "fichier trop volumineux pour le balayage" });
    }
    if (octets.length === 0) {
      return repondre(reponse, 400, { erreur: "corps vide : aucun octet à balayer" });
    }

    try {
      return repondre(reponse, 200, await balayerAuDemon(config, octets));
    } catch (erreur) {
      const echec = erreur instanceof EchecDuDemon ? erreur : new EchecDuDemon(502, "échec inattendu");
      console.warn(`[passerelle-antivirus] ${echec.statut} — ${echec.message}`);
      return repondre(reponse, echec.statut, { erreur: echec.message });
    }
  });
}

/** La configuration lue sur l'environnement, avec les valeurs de `docker-compose.prod.yml`. */
export function configurationDepuis(
  environnement: Readonly<Record<string, string | undefined>>,
): ConfigurationPasserelle {
  const port = Number.parseInt(environnement.CLAMD_PORT ?? "", 10);
  return {
    hote: (environnement.CLAMD_HOST ?? "").trim() || "clamav",
    port: Number.isInteger(port) && port > 0 ? port : 3310,
    delaiMs: DELAI_PASSERELLE_MS,
  };
}
