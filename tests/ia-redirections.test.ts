// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  autorisationDesPieces,
  etatDesFonctions,
  origineDeclaree,
  piecesAutoriseesChez,
} from "@/domain/ia/fournisseurs";
import { lireDesOctetsCompatible, type ConfigurationCompatible } from "@/server/ia/openai-compatible";
import { jetonGoogle } from "@/server/ia/jeton-google";
import { causeDeLErreur } from "@/server/ia/appel";
import { OPTIONS_DU_CLIENT, leClient, poserLeClient } from "@/lib/ai";

/**
 * La destination des documents — REV11-L1, S.171, WF-06 (REV-IA-02).
 *
 * `fetch` suivait une redirection et retransmettait le corps — la pièce —
 * à l'adresse que le serveur désignait. Le diagnostic DIA-04 l'a
 * reproduit : un appel, octets reçus par une autre origine. Ces essais
 * tiennent le résultat voulu, sur la boucle locale, sans fournisseur
 * externe : aucune redirection n'est suivie, quelle que soit sa forme, et
 * le serveur de destination ne reçoit rien.
 */

const STATUTS = [301, 302, 303, 307, 308] as const;
const PIECE = Buffer.from("piece-synthetique-l1");

let destination: Server;
let portDestination = 0;
let recusALaDestination = 0;
let octetsALaDestination = false;

let source: Server;
let portSource = 0;
/** Ce que la source rend à la prochaine requête : un statut et une adresse. */
let renvoi: { statut: number; vers: "meme_origine" | "autre_origine" | "http_externe" } = {
  statut: 307,
  vers: "autre_origine",
};
let recusALaSource = 0;
let recusSurLeChemin = 0;

const ecouter = (s: Server) =>
  new Promise<number>((ok) => s.listen(0, "127.0.0.1", () => ok((s.address() as AddressInfo).port)));

beforeAll(async () => {
  destination = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on("data", (b: Buffer) => morceaux.push(b));
    req.on("end", () => {
      recusALaDestination++;
      octetsALaDestination = Buffer.concat(morceaux).toString().includes(PIECE.toString("base64"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  portDestination = await ecouter(destination);

  source = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.url?.startsWith("/ailleurs")) {
        recusSurLeChemin++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        return;
      }
      recusALaSource++;
      const cible =
        renvoi.vers === "meme_origine"
          ? `http://127.0.0.1:${portSource}/ailleurs/chat/completions`
          : renvoi.vers === "autre_origine"
            ? `http://127.0.0.1:${portDestination}/v1/chat/completions`
            : "http://destination-non-autorisee.invalid/v1/chat/completions";
      res.writeHead(renvoi.statut, { Location: cible });
      res.end();
    });
  });
  portSource = await ecouter(source);
});

afterAll(async () => {
  await new Promise((ok) => destination.close(ok));
  await new Promise((ok) => source.close(ok));
  poserLeClient(null);
});

const remettre = () => {
  recusALaDestination = 0;
  octetsALaDestination = false;
  recusALaSource = 0;
  recusSurLeChemin = 0;
};

const configuration = (): ConfigurationCompatible => ({
  base: new URL(`http://127.0.0.1:${portSource}/v1`),
  authentification: { mode: "cle", cle: "cle-synthetique-l1" },
  modele: "modele-synthetique",
  pdf: null,
});

const demande = {
  codeAttendu: "passeport",
  intituleAttendu: "Passeport",
  codesDeLaChecklist: ["passeport"],
  champs: [],
};

describe("la pièce ne suit aucune redirection — fournisseur compatible", () => {
  describe.each(["autre_origine", "meme_origine", "http_externe"] as const)("vers %s", (vers) => {
    it.each(STATUTS)("réponse %i : la pièce n'est pas retransmise, la cause dit quoi faire", async (statut) => {
      remettre();
      renvoi = { statut, vers };
      const lue = await lireDesOctetsCompatible(configuration(), "image/png", PIECE, demande);

      expect(recusALaSource).toBe(1);
      expect(recusALaDestination).toBe(0);
      expect(octetsALaDestination).toBe(false);
      expect(recusSurLeChemin).toBe(0);
      expect(lue).toMatchObject({ etat: "NON_LUE", cause: "non_configure", jetonsEntree: 0, jetonsSortie: 0 });
      // La cause est actionnable et ne recopie ni l'adresse de renvoi ni la clé.
      const detail = lue.etat === "NON_LUE" ? lue.detail : "";
      expect(detail).toMatch(new RegExp(`renvoie vers une autre adresse \\(réponse ${statut}\\).*AI_OPENAI_URL`, "u"));
      expect(detail).not.toMatch(/127\.0\.0\.1|invalid|cle-synthetique/u);
    });
  });
});

describe("l'assertion signée ne suit aucune redirection — jeton Google", () => {
  it.each(STATUTS)("réponse %i : rien n'arrive à la destination, la cause dit quoi vérifier", async (statut) => {
    remettre();
    renvoi = { statut, vers: "autre_origine" };
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jeton = await jetonGoogle({
      email: `l1-${statut}@essai.iam.gserviceaccount.com`,
      clePrivee: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      adresseJeton: `http://127.0.0.1:${portSource}/token`,
    });
    expect(recusALaSource).toBe(1);
    expect(recusALaDestination).toBe(0);
    expect(jeton).toMatchObject({ ok: false, cause: "non_configure" });
    expect(jeton.ok ? "" : jeton.detail).toMatch(/renvoie vers une autre adresse.*token_uri/u);
  });
});

describe("le client Anthropic ne suit aucune redirection", () => {
  it("le client de l'application porte l'option, une seule fois définie", () => {
    poserLeClient(null);
    const client = leClient("cle-synthetique-l1") as unknown as { maxRetries: number; fetchOptions?: RequestInit };
    expect(client.maxRetries).toBe(0);
    expect(client.fetchOptions?.redirect).toBe("manual");
    poserLeClient(null);
  });

  it.each(STATUTS)("réponse %i : rien n'arrive à la destination, la cause n'est pas rejouée", async (statut) => {
    remettre();
    renvoi = { statut, vers: "autre_origine" };
    const client = new Anthropic({ apiKey: "cle-synthetique-l1", baseURL: `http://127.0.0.1:${portSource}`, ...OPTIONS_DU_CLIENT });
    const erreur = await client.messages
      .create({
        model: "modele-synthetique",
        max_tokens: 1,
        messages: [{ role: "user", content: PIECE.toString("base64") }],
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(recusALaSource).toBe(1);
    expect(recusALaDestination).toBe(0);
    const cause = causeDeLErreur(erreur, { cle: "la clé d'extraction", service: "le service de lecture", delaiMs: 1000 });
    expect(cause.cause).toBe("non_configure");
    expect(cause.detail).toMatch(new RegExp(`renvoie vers une autre adresse \\(réponse ${statut}\\).*ANTHROPIC_BASE_URL`, "u"));
  });
});

describe("l'autorisation des pièces désigne une société, pas un protocole", () => {
  const base = {
    AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
    AI_OPENAI_URL: "https://api.mistral.ai/v1",
    AI_OPENAI_API_KEY: "cle",
    AI_OPENAI_MODEL: "modele",
    AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible",
  };

  it("une origine se déclare sans chemin, sans paramètre ni identifiant", () => {
    expect(origineDeclaree("https://api.mistral.ai")).toBe("https://api.mistral.ai");
    expect(origineDeclaree("https://api.mistral.ai/")).toBe("https://api.mistral.ai");
    expect(origineDeclaree("https://hote.test:8443")).toBe("https://hote.test:8443");
    expect(origineDeclaree("http://127.0.0.1:9000")).toBe("http://127.0.0.1:9000");
    expect(origineDeclaree("https://api.mistral.ai/v1")).toBeNull();
    expect(origineDeclaree("https://api.mistral.ai?x=1")).toBeNull();
    expect(origineDeclaree("https://moi:secret@api.mistral.ai")).toBeNull();
    expect(origineDeclaree("http://api.mistral.ai")).toBeNull();
    expect(origineDeclaree("api.mistral.ai")).toBeNull();
  });

  it("Anthropic, sous-traitant par défaut, n'en demande pas", () => {
    expect(autorisationDesPieces({}, "anthropic")).toEqual({ autorisee: true });
  });

  it("l'origine validée doit être celle de l'adresse appelée", () => {
    expect(autorisationDesPieces({ ...base, AI_OPENAI_ORIGINE_AUTORISEE: "https://api.mistral.ai" }, "openai_compatible")).toEqual({
      autorisee: true,
    });
    const absente = autorisationDesPieces(base, "openai_compatible");
    expect(absente.autorisee).toBe(false);
    expect(absente.autorisee ? "" : absente.raison).toMatch(/AI_OPENAI_ORIGINE_AUTORISEE=https:\/\/api\.mistral\.ai/u);

    const illisible = autorisationDesPieces({ ...base, AI_OPENAI_ORIGINE_AUTORISEE: "https://api.mistral.ai/v1" }, "openai_compatible");
    expect(illisible.autorisee ? "" : illisible.raison).toMatch(/n'est pas une origine : écrire https:\/\/hôte, sans chemin/u);
  });

  it("changer d'adresse sans revoir l'autorisation arrête l'envoi des pièces, sans changer de sous-traitant", () => {
    const env = {
      ...base,
      AI_OPENAI_URL: "https://autre-prestataire.example/v1",
      AI_OPENAI_ORIGINE_AUTORISEE: "https://api.mistral.ai",
    };
    expect(piecesAutoriseesChez(env, "openai_compatible")).toBe(false);
    const [lecture] = etatDesFonctions(env);
    expect(lecture).toMatchObject({ fonction: "extraction", fournisseur: "openai_compatible", branche: false });
    expect(lecture!.raison).toMatch(
      /AI_OPENAI_URL désigne https:\/\/autre-prestataire\.example, mais la sous-traitance a été validée pour https:\/\/api\.mistral\.ai/u,
    );
  });

  it("la rédaction ne reçoit aucune pièce et n'a pas cette garde", () => {
    const env = { ...base, AI_FOURNISSEUR_EXTRACTION: "anthropic", AI_FOURNISSEUR_REDACTION: "openai_compatible" };
    const [, redaction] = etatDesFonctions(env);
    expect(redaction).toMatchObject({ fonction: "redaction", branche: true, raison: null });
  });
});
