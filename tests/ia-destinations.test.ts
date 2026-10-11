// @vitest-environment node
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import {
  appelerCompatible,
  critiqueCompatible,
  redacteurCompatible,
  type ConfigurationCompatible,
} from "@/server/ia/openai-compatible";
import { jetonGoogle, oublierLeJetonGoogle } from "@/server/ia/jeton-google";
import { leClient, poserLeClient } from "@/lib/ai";
import { causeDeLErreur } from "@/server/ia/appel";
import { autorisationDesPieces } from "@/domain/ia/fournisseurs";

// Vrais transports HTTP et SDK ; aucune destination externe n'est appelée.
const statuts = [301, 302, 303, 307, 308];
const ecouter = (s: Server) =>
  new Promise<string>((ok) =>
    s.listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)),
  );
const fermer = (s: Server) => new Promise<void>((ok, non) => s.close((e) => (e ? non(e) : ok())));
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const clePrivee = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
let origine: Server;
let destination: Server;
let base: string;
let ailleurs: string;
let statut = 307;
let renvoi = "";
let appels = 0;
let appelsDestination = 0;
let appelsIntermediaire = 0;
let corpsInitial = "";
let oauthDirect = false;

beforeAll(async () => {
  destination = createServer((req, res) => {
    appelsDestination++;
    req.resume();
    res.end("destination qui ne doit recevoir ni requête, ni corps, ni autorisation");
  });
  ailleurs = await ecouter(destination);
  origine = createServer((req, res) => {
    if (req.url === "/intermediaire") {
      appelsIntermediaire++;
      req.resume();
      res.writeHead(307, { Location: `${ailleurs}/final` }).end();
      return;
    }
    if (req.url === "/final") {
      appelsDestination++;
      req.resume();
      res.end("destination sur la même origine");
      return;
    }
    appels++;
    const morceaux: Buffer[] = [];
    req.on("data", (b) => morceaux.push(b));
    req.on("end", () => {
      corpsInitial = Buffer.concat(morceaux).toString();
      if (statut === 200 || (oauthDirect && req.url === "/token")) {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/token") {
          res.end(JSON.stringify({ access_token: "JETON_SYNTHETIQUE", expires_in: 3600 }));
          return;
        }
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "réponse" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
        );
      } else {
        // Le service peut renvoyer un écho sensible dans son erreur.
        res.writeHead(statut, { Location: renvoi }).end("ECHO_SENSIBLE");
      }
    });
  });
  base = await ecouter(origine);
});
beforeEach(() => {
  statut = 307;
  renvoi = `${ailleurs}/final?secret=SECRET_LOCATION`;
  appels = appelsDestination = appelsIntermediaire = 0;
  corpsInitial = "";
  oauthDirect = false;
  oublierLeJetonGoogle();
  poserLeClient(null);
});
afterEach(() => {
  poserLeClient(null);
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await fermer(origine);
  await fermer(destination);
});
const config = (): ConfigurationCompatible => ({
  base: new URL(`${base}/v1`),
  authentification: { mode: "cle", cle: "CLE_SYNTHETIQUE" },
  modele: "modele-essai",
  pdf: "file",
});
const chaine = { cle: "la clé d'appel", service: "le service", delaiMs: 2000 };

describe("Complément REV11-L1 : le corps reste à la destination configurée", () => {
  it("une origine refusée ne recopie pas des identifiants dans le diagnostic B-07", () => {
    const retour = autorisationDesPieces({ AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible",
      AI_OPENAI_URL: "https://api.exemple.test/v1", AI_OPENAI_ORIGINE_AUTORISEE:
        "https://utilisateur:SECRET_SYNTHETIQUE@api.exemple.test" }, "openai_compatible");
    expect(retour).toMatchObject({ autorisee: false, raison: expect.stringContaining("AI_OPENAI_ORIGINE_AUTORISEE") });
    expect(JSON.stringify(retour)).not.toMatch(/SECRET_SYNTHETIQUE|utilisateur:/u);
  });

  it.each(
    statuts.flatMap((code) => ["chaîne", "sans Location"].map((cas) => [code, cas] as const)),
  )("compatible : HTTP %s, %s", async (code, cas) => {
    statut = code;
    renvoi = cas === "chaîne" ? "/intermediaire" : "";
    const retour = await appelerCompatible(
      config(),
      { messages: [{ content: "OCTETS_SYNTHETIQUES" }] },
      2000,
    );
    expect(retour).toMatchObject({
      ok: false,
      cause: "non_configure",
      detail: expect.stringMatching(/AI_OPENAI_URL|token_uri|ANTHROPIC_BASE_URL/u),
    });
    expect(corpsInitial).toContain("OCTETS_SYNTHETIQUES");
    expect([appels, appelsIntermediaire, appelsDestination]).toEqual([1, 0, 0]);
  });

  it.each(statuts)("OAuth : HTTP %s ne retransmet pas l'affirmation signée", async (code) => {
    statut = code;
    const retour = await jetonGoogle({
      email: "banc@exemple.test",
      clePrivee,
      adresseJeton: `${base}/token`,
    });
    expect(retour).toMatchObject({
      ok: false,
      cause: "non_configure",
      detail: expect.stringMatching(/AI_OPENAI_URL|token_uri|ANTHROPIC_BASE_URL/u),
    });
    expect(corpsInitial).toContain("assertion=");
    expect([appels, appelsDestination]).toEqual([1, 0]);
    expect(JSON.stringify(retour)).not.toMatch(/ECHO_SENSIBLE|SECRET_LOCATION|assertion=/u);
  });

  it.each(statuts)("SDK Anthropic : HTTP %s ne retransmet pas la pièce", async (code) => {
    statut = code;
    vi.stubEnv("ANTHROPIC_BASE_URL", base);
    let erreur: unknown;
    try {
      await leClient("CLE_SYNTHETIQUE").messages.create({
        model: "modele-essai",
        max_tokens: 10,
        messages: [{ role: "user", content: "OCTETS_SYNTHETIQUES" }],
      });
    } catch (e) {
      erreur = e;
    }
    expect(causeDeLErreur(erreur, chaine)).toMatchObject({
      cause: "non_configure",
      detail: expect.stringMatching(/AI_OPENAI_URL|token_uri|ANTHROPIC_BASE_URL/u),
    });
    expect([appels, appelsDestination]).toEqual([1, 0]);
    expect(corpsInitial).toContain("OCTETS_SYNTHETIQUES");
    expect(String(erreur)).not.toMatch(/ECHO_SENSIBLE|SECRET_LOCATION/u);
  });

  it("compatible : une réponse directe continue à fonctionner", async () => {
    statut = 200;
    expect(await appelerCompatible(config(), { messages: [] }, 2000)).toMatchObject({
      ok: true,
      texte: "réponse",
      jetonsEntree: 12,
      jetonsSortie: 3,
    });
    expect([appels, appelsDestination]).toEqual([1, 0]);
  });

  it.each(statuts)("WF-08 : HTTP %s ne publie ni texte ni avis", async (code) => {
    statut = code;
    const matiere = {
      piece: "Lettre",
      objet: "Présenter le parcours",
      pays: "Pays-Bas",
      reponses: { "1": "Un parcours synthétique." },
      questions: [{ rang: 1, section: "Parcours", intitule: "Quel parcours ?" }],
    };
    expect(await redacteurCompatible(config())(matiere)).toMatchObject({
      etat: "SANS_TEXTE",
      cause: "non_configure",
    });
    expect(await critiqueCompatible(config())("Un texte synthétique.", matiere)).toMatchObject({
      etat: "SANS_AVIS",
      cause: "non_configure",
    });
    expect([appels, appelsDestination]).toEqual([2, 0]);
  });

  it("Vertex : un 307 ne déclenche pas le renouvellement réservé au 401", async () => {
    oauthDirect = true;
    const retour = await appelerCompatible(
      {
        ...config(),
        authentification: {
          mode: "compte_de_service_google",
          compte: { email: "banc@exemple.test", clePrivee, adresseJeton: `${base}/token` },
        },
      },
      {},
      2000,
    );
    expect(retour).toMatchObject({ ok: false, cause: "non_configure" });
    expect([appels, appelsDestination]).toEqual([2, 0]);
  });

  it("SDK : un environnement demandant des logs détaillés ne révèle pas les échanges", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", base);
    vi.stubEnv("ANTHROPIC_LOG", "debug");
    const journaux = (["debug", "info", "warn", "error", "log"] as const).map((methode) =>
      vi.spyOn(console, methode).mockImplementation(() => undefined),
    );
    try {
      await expect(
        leClient("CLE_SYNTHETIQUE").messages.create({
          model: "modele-essai",
          max_tokens: 10,
          messages: [{ role: "user", content: "OCTETS_SYNTHETIQUES" }],
        }),
      ).rejects.toThrow();
      for (const journal of journaux) expect(journal).not.toHaveBeenCalled();
      expect([appels, appelsDestination]).toEqual([1, 0]);
    } finally {
      for (const journal of journaux) journal.mockRestore();
    }
  });
});
