import { afterEach, describe, expect, it } from "vitest";
import { createServer as creerServeurTcp, type Server as ServeurTcp, type Socket } from "node:net";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  COMMANDE_INSTREAM,
  TAILLE_DU_BLOC_OCTETS,
  enteteDeBloc,
  lireLaReponseClamd,
  pingReussi,
} from "@/domain/securite/clamd";
import { EICAR, TAILLE_MAXI_BALAYAGE_OCTETS } from "@/domain/securite/balayage";
import {
  DELAI_PASSERELLE_MS,
  configurationDepuis,
  creerPasserelle,
} from "@/server/securite/passerelle-clamd";
import { balayerDesOctets } from "@/server/securite/antivirus";
import { DELAI_BALAYAGE_MS } from "@/domain/securite/balayage";

/**
 * La passerelle HTTP devant clamd — S.96.
 *
 * **Contre un vrai serveur TCP**, comme `balayage-moteur` l'est contre un
 * vrai serveur HTTP : un faux démon écoute sur la boucle locale, reçoit ce
 * que la passerelle lui envoie réellement, et répond ce qu'un clamd répond
 * — y compris quand il va mal. Le balayeur de l'application est appelé
 * devant, tel qu'il tourne en production.
 *
 * La propriété tenue est celle de `balayage.ts`, une marche plus tôt :
 * **rien de ce que le démon ne déclare pas `OK` ne devient « saine »**.
 *
 * Le vrai clamd n'est pas dans la CI. La chaîne a été éprouvée contre lui
 * le 01/10/2026 (ClamAV 1.5.4) : fichier ordinaire sain, EICAR détecté,
 * motif à cheval sur deux blocs détecté, sonde du worker « reconnu ».
 */

/* ------------------------------------------------------------------ *
 * Le protocole, sans réseau.
 * ------------------------------------------------------------------ */

describe("clamd — lecture de la réponse", () => {
  it("OK est sain, et seulement lui", () => {
    expect(lireLaReponseClamd("stream: OK\0")).toEqual({ issue: "verdict", reponse: { status: "clean" } });
  });

  it("FOUND est une infection, avec le nom de la menace", () => {
    expect(lireLaReponseClamd("stream: Eicar-Test-Signature FOUND\0")).toEqual({
      issue: "verdict",
      reponse: { status: "infected", signature: "Eicar-Test-Signature" },
    });
  });

  it.each([
    ["une erreur du démon", "INSTREAM size limit exceeded. ERROR\0"],
    ["une erreur sur le flux", "stream: Can't allocate memory ERROR\0"],
    ["une réponse vide", "\0"],
    ["rien du tout", ""],
    ["un OK sans le préfixe de la commande", "OK\0"],
    ["une forme inconnue", "stream: PEUT-ÊTRE\0"],
  ])("%s n'est jamais un verdict", (_cas, brute) => {
    expect(lireLaReponseClamd(brute).issue).toBe("erreur");
  });

  it("le détail d'une erreur ne recopie pas la ligne du démon", () => {
    const lue = lireLaReponseClamd("stream: /var/lib/clamav/chemin-interne ERROR\0");
    expect(lue).toEqual({ issue: "erreur", detail: "le démon signale une erreur" });
  });

  it("PONG, et rien d'autre, dit que le démon est debout", () => {
    expect(pingReussi("PONG\0")).toBe(true);
    expect(pingReussi("PONG")).toBe(true);
    expect(pingReussi("")).toBe(false);
    expect(pingReussi("ERROR\0")).toBe(false);
  });

  it("l'entête d'un bloc est sa longueur sur quatre octets, gros-boutiste", () => {
    expect([...enteteDeBloc(0)]).toEqual([0, 0, 0, 0]);
    expect([...enteteDeBloc(65536)]).toEqual([0, 1, 0, 0]);
    expect([...enteteDeBloc(0x01020304)]).toEqual([1, 2, 3, 4]);
    expect(() => enteteDeBloc(-1)).toThrow();
    expect(() => enteteDeBloc(1.5)).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Le faux démon : il parle le protocole, et on lui dicte sa réponse.
 * ------------------------------------------------------------------ */

type Conduite =
  | { reponse: (octets: Buffer) => string }
  | { muet: true }
  | { raccroche: true };

interface FauxDemon {
  port: number;
  /** Les octets reçus, réassemblés depuis les blocs — ce que clamd aurait balayé. */
  recus: Buffer[];
  commandes: string[];
  serveur: ServeurTcp;
}

const ouverts: { fermer: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(ouverts.splice(0).map((o) => o.fermer()));
});

/** Lit la trame INSTREAM : entêtes de longueur, blocs, bloc nul final. */
function reassembler(tampon: Buffer): Buffer | null {
  const blocs: Buffer[] = [];
  let curseur = 0;
  for (;;) {
    if (tampon.length < curseur + 4) return null;
    const longueur = tampon.readUInt32BE(curseur);
    curseur += 4;
    if (longueur === 0) return Buffer.concat(blocs);
    if (tampon.length < curseur + longueur) return null;
    blocs.push(tampon.subarray(curseur, curseur + longueur));
    curseur += longueur;
  }
}

async function fauxDemon(conduite: Conduite): Promise<FauxDemon> {
  const etat = { recus: [] as Buffer[], commandes: [] as string[] };
  const sockets = new Set<Socket>();
  const serveur = creerServeurTcp((socket) => {
    sockets.add(socket);
    let tampon = Buffer.alloc(0);
    socket.on("data", (morceau: Buffer) => {
      tampon = Buffer.concat([tampon, morceau]);
      const fin = tampon.indexOf(0);
      if (fin < 0) return;
      const commande = tampon.subarray(0, fin + 1).toString("latin1");
      if (commande === "zPING\0") {
        etat.commandes.push(commande);
        socket.end("PONG\0");
        return;
      }
      if (commande !== COMMANDE_INSTREAM) return;
      const octets = reassembler(tampon.subarray(fin + 1));
      if (octets === null) return;
      etat.commandes.push(commande);
      etat.recus.push(octets);
      if ("muet" in conduite) return;
      if ("raccroche" in conduite) {
        socket.destroy();
        return;
      }
      socket.end(conduite.reponse(octets));
    });
  });
  await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", () => r()));
  ouverts.push({
    fermer: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        serveur.close(() => r());
      }),
  });
  return { port: (serveur.address() as AddressInfo).port, serveur, ...etat };
}

async function passerelle(port: number, delaiMs = 2_000): Promise<string> {
  const serveur: Server = creerPasserelle({ hote: "127.0.0.1", port, delaiMs });
  await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", () => r()));
  ouverts.push({ fermer: () => new Promise<void>((r) => serveur.close(() => r())) });
  return `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/balayer`;
}

/** Un démon qui répond comme clamd : FOUND si EICAR est dans les octets. */
const commeClamd: Conduite = {
  reponse: (octets) =>
    octets.includes(Buffer.from(EICAR, "ascii")) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0",
};

describe("passerelle — devant un démon qui répond", () => {
  it("un fichier ordinaire ressort sain", async () => {
    const demon = await fauxDemon(commeClamd);
    const verdict = await balayerDesOctets(await passerelle(demon.port), Buffer.from("%PDF-1.4 passeport"));
    expect(verdict).toEqual({ etat: "SAINE" });
  });

  it("EICAR ressort infecté, avec la signature du démon", async () => {
    const demon = await fauxDemon(commeClamd);
    const verdict = await balayerDesOctets(await passerelle(demon.port), Buffer.from(EICAR, "ascii"));
    expect(verdict).toEqual({ etat: "INFECTEE", menace: "Eicar-Test-Signature" });
  });

  it("le démon reçoit exactement les octets, découpés en blocs et réassemblés", async () => {
    const demon = await fauxDemon(commeClamd);
    const octets = Buffer.alloc(3 * TAILLE_DU_BLOC_OCTETS + 123);
    for (let i = 0; i < octets.length; i += 1) octets[i] = (i * 31) % 251;
    await balayerDesOctets(await passerelle(demon.port), octets);
    expect(demon.recus).toHaveLength(1);
    expect(demon.recus[0]!.equals(octets)).toBe(true);
  });

  it("EICAR placé à cheval sur deux blocs est vu", async () => {
    const demon = await fauxDemon(commeClamd);
    const octets = Buffer.alloc(2 * TAILLE_DU_BLOC_OCTETS, 0x41);
    octets.write(EICAR, TAILLE_DU_BLOC_OCTETS - 20, "ascii");
    const verdict = await balayerDesOctets(await passerelle(demon.port), octets);
    expect(verdict.etat).toBe("INFECTEE");
  });

  it("GET /sante répond 200 quand le démon répond PONG", async () => {
    const demon = await fauxDemon(commeClamd);
    const url = (await passerelle(demon.port)).replace("/balayer", "/sante");
    const reponse = await fetch(url);
    expect(reponse.status).toBe(200);
    expect(demon.commandes).toContain("zPING\0");
  });
});

describe("passerelle — rien de ce qui n'est pas OK ne devient sain", () => {
  it("une erreur du démon", async () => {
    const demon = await fauxDemon({ reponse: () => "INSTREAM size limit exceeded. ERROR\0" });
    const verdict = await balayerDesOctets(await passerelle(demon.port), Buffer.from(EICAR, "ascii"));
    expect(verdict.etat).toBe("INDISPONIBLE");
  });

  it("une réponse hors protocole", async () => {
    const demon = await fauxDemon({ reponse: () => "bonjour\0" });
    const verdict = await balayerDesOctets(await passerelle(demon.port), Buffer.from("x"));
    expect(verdict.etat).toBe("INDISPONIBLE");
  });

  it("un démon qui raccroche sans répondre", async () => {
    const demon = await fauxDemon({ raccroche: true });
    const verdict = await balayerDesOctets(await passerelle(demon.port), Buffer.from("x"));
    expect(verdict.etat).toBe("INDISPONIBLE");
  });

  it("un démon muet, au-delà du délai", async () => {
    const demon = await fauxDemon({ muet: true });
    const debut = Date.now();
    const verdict = await balayerDesOctets(await passerelle(demon.port, 300), Buffer.from("x"));
    expect(verdict).toMatchObject({ etat: "INDISPONIBLE", detail: "réponse 504" });
    expect(Date.now() - debut).toBeLessThan(5_000);
  });

  it("un démon absent", async () => {
    const demon = await fauxDemon(commeClamd);
    const port = demon.port;
    await new Promise<void>((r) => demon.serveur.close(() => r()));
    const verdict = await balayerDesOctets(await passerelle(port), Buffer.from(EICAR, "ascii"));
    expect(verdict).toMatchObject({ etat: "INDISPONIBLE", detail: "réponse 503" });
  });

  it("GET /sante répond 503 quand le démon est absent", async () => {
    const demon = await fauxDemon(commeClamd);
    const port = demon.port;
    await new Promise<void>((r) => demon.serveur.close(() => r()));
    const reponse = await fetch((await passerelle(port)).replace("/balayer", "/sante"));
    expect(reponse.status).toBe(503);
  });
});

describe("passerelle — ce qu'elle refuse avant le démon", () => {
  it("un corps vide n'est pas « rien à signaler »", async () => {
    const demon = await fauxDemon(commeClamd);
    const reponse = await fetch(await passerelle(demon.port), { method: "POST", body: new Uint8Array(0) });
    expect(reponse.status).toBe(400);
    expect(demon.commandes).toEqual([]);
  });

  it("au-delà de la limite de balayage, 413, et le démon ne reçoit rien", async () => {
    const demon = await fauxDemon(commeClamd);
    const reponse = await fetch(await passerelle(demon.port), {
      method: "POST",
      body: new Uint8Array(TAILLE_MAXI_BALAYAGE_OCTETS + 1),
    });
    expect(reponse.status).toBe(413);
    expect(demon.commandes).toEqual([]);
  });

  it("une autre méthode que POST", async () => {
    const demon = await fauxDemon(commeClamd);
    const reponse = await fetch(await passerelle(demon.port));
    expect(reponse.status).toBe(405);
  });
});

describe("passerelle — configuration", () => {
  it("répond avant que le balayeur n'abandonne", () => {
    expect(DELAI_PASSERELLE_MS).toBeLessThan(DELAI_BALAYAGE_MS);
  });

  it("prend les valeurs de docker-compose.prod.yml par défaut", () => {
    expect(configurationDepuis({})).toMatchObject({ hote: "clamav", port: 3310 });
    expect(configurationDepuis({ CLAMD_HOST: "moteur", CLAMD_PORT: "3311" })).toMatchObject({
      hote: "moteur",
      port: 3311,
    });
    expect(configurationDepuis({ CLAMD_PORT: "n'importe quoi" }).port).toBe(3310);
  });
});
