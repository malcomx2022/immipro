// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import {
  COMPTEUR_MAXIMUM,
  etatDeMesure,
  jetonsDeLaLigne,
  lireLesJetons,
  lireUnCompteur,
  mesureARapprocher,
  partConnue,
} from "@/domain/ia/usage";
import {
  critiqueCompatible,
  lireDesOctetsCompatible,
  redacteurCompatible,
  type ConfigurationCompatible,
} from "@/server/ia/openai-compatible";
import { lireDesOctets } from "@/server/dossiers/extracteur";
import { critiqueClaude, redacteurClaude } from "@/server/redaction/adaptateur";
import { OPTIONS_DU_CLIENT, poserLeClient } from "@/lib/ai";
import type { MatiereDeLaPiece } from "@/domain/redaction/commande";

/**
 * La mesure des usages IA — REV11-L2, S.173, INV-6/D1, WF-06/08/16.
 *
 * Reproduits sur main `47b39b0` par le diagnostic du 11/10 :
 * - DIA-01 : une réponse sans mesure rendait une lecture à 0/0 ;
 * - DIA-02 : des compteurs négatifs ou fractionnaires partaient tels quels
 *   vers des colonnes entières ;
 * - DIA-03 : une enveloppe sans choix perdait les 120/30 jetons annoncés.
 *
 * Ces essais tiennent le résultat voulu, sur la boucle locale, sans
 * fournisseur externe ; l'écriture en base est éprouvée par les fumées
 * d'extraction et de rédaction sur PostgreSQL.
 */

describe("un compteur est connu, absent ou invalide — jamais deviné", () => {
  it.each([
    [0, { etat: "connu", valeur: 0 }],
    [120, { etat: "connu", valeur: 120 }],
    [COMPTEUR_MAXIMUM, { etat: "connu", valeur: COMPTEUR_MAXIMUM }],
    [undefined, { etat: "absent" }],
    [null, { etat: "absent" }],
    [-12, { etat: "invalide" }],
    [1.5, { etat: "invalide" }],
    [Number.NaN, { etat: "invalide" }],
    [Number.POSITIVE_INFINITY, { etat: "invalide" }],
    [COMPTEUR_MAXIMUM + 1, { etat: "invalide" }],
    [1e12, { etat: "invalide" }],
    ["120", { etat: "invalide" }],
    [true, { etat: "invalide" }],
    [{}, { etat: "invalide" }],
  ])("%s", (valeur, attendu) => {
    expect(lireUnCompteur(valeur)).toEqual(attendu);
  });

  it("deux compteurs : la part connue est gardée, l'invalidité signalée", () => {
    expect(lireLesJetons(120, 30)).toEqual({ entree: 120, sortie: 30, invalide: false });
    expect(lireLesJetons(undefined, undefined)).toEqual({ entree: null, sortie: null, invalide: false });
    expect(lireLesJetons(120, undefined)).toEqual({ entree: 120, sortie: null, invalide: false });
    expect(lireLesJetons(120, -1)).toEqual({ entree: 120, sortie: null, invalide: true });
  });

  it("l'état inscrit dit quelle part est connue, et un zéro mesuré reste une mesure", () => {
    expect(etatDeMesure(0, 0)).toBe("MESUREE");
    expect(etatDeMesure(120, null)).toBe("ENTREE_SEULE");
    expect(etatDeMesure(null, 30)).toBe("SORTIE_SEULE");
    expect(etatDeMesure(null, null)).toBe("INCONNUE");
    expect(partConnue(null)).toBe(0);
    expect(mesureARapprocher("MESUREE")).toBe(false);
    expect(mesureARapprocher(null)).toBe(false);
    expect(mesureARapprocher("INCONNUE")).toBe(true);
    expect(mesureARapprocher("SORTIE_SEULE")).toBe(true);
  });

  it("une ligne relue rend `null` pour sa part inconnue, et une ligne antérieure telle quelle", () => {
    expect(jetonsDeLaLigne("INCONNUE", 0, 0)).toEqual({ entree: null, sortie: null });
    expect(jetonsDeLaLigne("ENTREE_SEULE", 120, 0)).toEqual({ entree: 120, sortie: null });
    expect(jetonsDeLaLigne("SORTIE_SEULE", 0, 30)).toEqual({ entree: null, sortie: 30 });
    expect(jetonsDeLaLigne("MESUREE", 0, 0)).toEqual({ entree: 0, sortie: 0 });
    expect(jetonsDeLaLigne(null, 7, 3)).toEqual({ entree: 7, sortie: 3 });
  });
});

/* ------------------------------------------------------------------ *
 * Un fournisseur compatible, sur la boucle locale.
 * ------------------------------------------------------------------ */

let serveur: Server;
let port = 0;
let reponse: { statut: number; corps: string } = { statut: 200, corps: "{}" };
let appels = 0;

const ecouter = (s: Server) =>
  new Promise<number>((ok) => s.listen(0, "127.0.0.1", () => ok((s.address() as AddressInfo).port)));

beforeAll(async () => {
  serveur = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on("data", (b: Buffer) => morceaux.push(b));
    req.on("end", () => {
      appels++;
      /*
        La mise en forme Anthropic est diffusée (`stream: true`) : le SDK
        attend des événements, que l'on tire du même message — comme la
        fumée de rédaction. La mesure de sortie arrive par `message_delta`.
      */
      if (reponse.statut === 200 && Buffer.concat(morceaux).toString().includes('"stream":true')) {
        const m = JSON.parse(reponse.corps) as {
          content: { text: string }[];
          usage?: { input_tokens?: unknown; output_tokens?: unknown };
          stop_reason: string;
        };
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const evenement = (type: string, charge: object) =>
          res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...charge })}\n\n`);
        evenement("message_start", {
          message: { ...m, content: [], usage: { input_tokens: m.usage?.input_tokens, output_tokens: 0 } },
        });
        evenement("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
        evenement("content_block_delta", { index: 0, delta: { type: "text_delta", text: m.content[0]?.text ?? "" } });
        evenement("content_block_stop", { index: 0 });
        evenement("message_delta", {
          delta: { stop_reason: m.stop_reason, stop_sequence: null },
          usage: { output_tokens: m.usage?.output_tokens },
        });
        evenement("message_stop", {});
        res.end();
        return;
      }
      res.writeHead(reponse.statut, { "Content-Type": "application/json" });
      res.end(reponse.corps);
    });
  });
  port = await ecouter(serveur);
});

afterAll(async () => {
  await new Promise((ok) => serveur.close(ok));
  poserLeClient(null);
});

const configuration = (): ConfigurationCompatible => ({
  base: new URL(`http://127.0.0.1:${port}/v1`),
  authentification: { mode: "cle", cle: "cle-synthetique-l2" },
  modele: "modele-synthetique",
  pdf: null,
});

const LU = JSON.stringify({ piece_identifiee: "passeport", obstacle: null, champs: { expiration: "2031-04-30" } });
const DEMANDE = {
  codeAttendu: "passeport",
  intituleAttendu: "Passeport",
  codesDeLaChecklist: ["passeport"],
  champs: [{ code: "expiration", nature: "date" as const, exigence: "validité" }],
};
const completion = (contenu: string, usage?: unknown) =>
  JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: contenu } }],
    ...(usage === undefined ? {} : { usage }),
  });
const repondre = (corps: string, statut = 200) => {
  reponse = { statut, corps };
  appels = 0;
};
const lire = () => lireDesOctetsCompatible(configuration(), "image/png", Buffer.from("piece-l2"), DEMANDE);
const APPEL = { fournisseur: "openai_compatible", modele: "modele-synthetique" };

describe("lecture chez un fournisseur compatible", () => {
  it("une mesure complète est rendue telle quelle", async () => {
    repondre(completion(LU, { prompt_tokens: 120, completion_tokens: 30 }));
    expect(await lire()).toMatchObject({ etat: "LUE", jetonsEntree: 120, jetonsSortie: 30, appel: APPEL });
  });

  it("DIA-01 : sans mesure, la lecture est publiée avec un usage inconnu, et l'appel reste inscriptible", async () => {
    repondre(completion(LU));
    const lue = await lire();
    expect(lue).toMatchObject({ etat: "LUE", jetonsEntree: null, jetonsSortie: null, appel: APPEL });
    expect(appels).toBe(1);
  });

  it("une mesure partielle garde sa part connue", async () => {
    repondre(completion(LU, { prompt_tokens: 120 }));
    expect(await lire()).toMatchObject({ etat: "LUE", jetonsEntree: 120, jetonsSortie: null });
    repondre(completion(LU, { prompt_tokens: null, completion_tokens: 30 }));
    expect(await lire()).toMatchObject({ etat: "LUE", jetonsEntree: null, jetonsSortie: 30 });
  });

  it.each([
    ["négatifs et fractionnaires (DIA-02)", { prompt_tokens: -12, completion_tokens: 1.5 }, null, null],
    ["hors entier SQL", { prompt_tokens: 1e12, completion_tokens: 30 }, null, 30],
    ["en chaîne", { prompt_tokens: "120", completion_tokens: 30 }, null, 30],
    ["un seul invalide", { prompt_tokens: 120, completion_tokens: -1 }, 120, null],
  ])(
    "une mesure invalide (%s) rend l'enveloppe non conforme, sans rejeu, et garde sa part connue",
    async (_cas, usage, entree, sortie) => {
      repondre(completion(LU, usage));
      const lue = await lire();
      expect(lue).toMatchObject({
        etat: "NON_LUE",
        cause: "reponse_illisible",
        jetonsEntree: entree,
        jetonsSortie: sortie,
        appel: APPEL,
      });
      expect(lue.etat === "NON_LUE" ? lue.detail : "").toMatch(/n'est pas un nombre entier de jetons/u);
      expect(appels).toBe(1);
    },
  );

  it("DIA-03 : une enveloppe sans choix garde les jetons qu'elle annonce", async () => {
    repondre(JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } }));
    expect(await lire()).toMatchObject({
      etat: "NON_LUE",
      cause: "reponse_illisible",
      jetonsEntree: 120,
      jetonsSortie: 30,
      appel: APPEL,
    });
  });

  it("une réponse qui n'est pas du JSON a eu lieu : usage inconnu, appel inscriptible", async () => {
    repondre("<html>passerelle</html>");
    expect(await lire()).toMatchObject({
      etat: "NON_LUE",
      cause: "reponse_illisible",
      jetonsEntree: null,
      jetonsSortie: null,
      appel: APPEL,
    });
    repondre("42");
    expect(await lire()).toMatchObject({ etat: "NON_LUE", jetonsEntree: null, appel: APPEL });
  });

  it("un refus HTTP n'a rien consommé : aucune mesure, aucun appel inscrit", async () => {
    repondre(JSON.stringify({ usage: { prompt_tokens: 120, completion_tokens: 30 } }), 500);
    const lue = await lire();
    expect(lue).toMatchObject({ etat: "NON_LUE", cause: "injoignable", jetonsEntree: 0, jetonsSortie: 0 });
    expect(lue.appel).toBeUndefined();
  });

  it("un PDF non déclaré ne part pas : aucun appel inscrit", async () => {
    repondre(completion(LU, { prompt_tokens: 1, completion_tokens: 1 }));
    const lue = await lireDesOctetsCompatible(configuration(), "application/pdf", Buffer.from("%PDF"), DEMANDE);
    expect(lue).toMatchObject({ etat: "NON_LUE", cause: "type_non_lisible" });
    expect(lue.appel).toBeUndefined();
    expect(appels).toBe(0);
  });
});

const MATIERE: MatiereDeLaPiece = {
  piece: "Lettre de motivation",
  objet: "Motiver la candidature auprès de l'établissement",
  pays: "la France",
  reponses: { 0: "Je souhaite étudier l'agronomie à Montpellier depuis le lycée." },
  questions: [{ rang: 0, section: "PARCOURS", intitule: "Pourquoi cette formation ?" }],
};
const TEXTE = "Madame, Monsieur,\n\n".concat("Je souhaite poursuivre mes études. ".repeat(20));

describe("rédaction et relecture chez un fournisseur compatible", () => {
  it("un texte sans mesure est rendu, usage inconnu", async () => {
    repondre(completion(TEXTE));
    const ecrit = await redacteurCompatible(configuration())(MATIERE);
    expect(ecrit).toMatchObject({ jetonsEntree: null, jetonsSortie: null, appel: APPEL });
  });

  it("une mesure invalide n'écrit pas de version", async () => {
    repondre(completion(TEXTE, { prompt_tokens: 10, completion_tokens: -3 }));
    expect(await redacteurCompatible(configuration())(MATIERE)).toMatchObject({
      etat: "SANS_TEXTE",
      cause: "reponse_illisible",
      jetonsEntree: 10,
      jetonsSortie: null,
      appel: APPEL,
    });
  });

  it("une relecture à mesure invalide ne date rien", async () => {
    repondre(completion(JSON.stringify({ remarques: [] }), { prompt_tokens: 2.5, completion_tokens: 3 }));
    expect(await critiqueCompatible(configuration())(TEXTE, MATIERE)).toMatchObject({
      etat: "SANS_AVIS",
      cause: "reponse_illisible",
      jetonsEntree: null,
      jetonsSortie: 3,
    });
  });

  it("une relecture sans choix garde ses jetons", async () => {
    repondre(JSON.stringify({ choices: [], usage: { prompt_tokens: 40, completion_tokens: 5 } }));
    expect(await critiqueCompatible(configuration())(TEXTE, MATIERE)).toMatchObject({
      etat: "SANS_AVIS",
      jetonsEntree: 40,
      jetonsSortie: 5,
      appel: APPEL,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Anthropic : une adresse déclarée dans ANTHROPIC_BASE_URL peut rendre
 * n'importe quoi à la place de la mesure.
 * ------------------------------------------------------------------ */

const message = (texte: string, usage: unknown) =>
  JSON.stringify({
    id: "msg_l2",
    type: "message",
    role: "assistant",
    model: "modele-synthetique",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: texte }],
    ...(usage === undefined ? {} : { usage }),
  });

const clientLocal = () =>
  poserLeClient(
    new Anthropic({ apiKey: "cle-synthetique-l2", baseURL: `http://127.0.0.1:${port}`, ...OPTIONS_DU_CLIENT }),
  );

describe("chez Anthropic", () => {
  it("une mesure absente donne un usage inconnu, pas une lecture gratuite", async () => {
    clientLocal();
    repondre(message(LU, undefined));
    expect(await lireDesOctets("cle", "modele-synthetique", "image/png", Buffer.from("piece"), DEMANDE)).toMatchObject({
      etat: "LUE",
      jetonsEntree: null,
      jetonsSortie: null,
      appel: { fournisseur: "anthropic" },
    });
  });

  it("une mesure invalide rend la lecture non conforme", async () => {
    clientLocal();
    repondre(message(LU, { input_tokens: -1, output_tokens: 30 }));
    expect(await lireDesOctets("cle", "modele-synthetique", "image/png", Buffer.from("piece"), DEMANDE)).toMatchObject({
      etat: "NON_LUE",
      cause: "reponse_illisible",
      jetonsEntree: null,
      jetonsSortie: 30,
    });
  });

  it("la rédaction et la relecture suivent la même règle", async () => {
    clientLocal();
    repondre(message(TEXTE, { input_tokens: 10, output_tokens: 0.5 }));
    expect(await redacteurClaude("cle", "modele-synthetique")(MATIERE)).toMatchObject({
      etat: "SANS_TEXTE",
      cause: "reponse_illisible",
      jetonsEntree: 10,
      jetonsSortie: null,
    });
    repondre(message(JSON.stringify({ remarques: [] }), { input_tokens: 10 }));
    expect(await critiqueClaude("cle", "modele-synthetique")(TEXTE, MATIERE)).toMatchObject({
      etat: "RELUE",
      jetonsEntree: 10,
      jetonsSortie: null,
    });
  });
});
