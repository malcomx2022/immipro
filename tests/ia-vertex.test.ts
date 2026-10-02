import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  MARGE_DE_RENOUVELLEMENT_SECONDES,
  MOTIF_DU_COMPTE,
  PORTEE_VERTEX,
  adresseDeJetonAdmise,
  lireCompteDeService,
  type CompteDeService,
} from "@/domain/ia/compte-de-service";
import { manqueDuFournisseur, modeDAuthentification, variablesExigees } from "@/domain/ia/fournisseurs";
import { configurationCompatible } from "@/server/dossiers/extracteur";
import { affirmationSignee, jetonGoogle, oublierLeJetonGoogle } from "@/server/ia/jeton-google";
import { lireDesOctetsCompatible, type ConfigurationCompatible } from "@/server/ia/openai-compatible";

/**
 * S.99 — Gemini sur Vertex AI, par l'adaptateur compatible OpenAI.
 *
 * Vertex n'accepte pas de clé d'API fixe : un compte de service signe une
 * affirmation, Google la change en jeton d'une heure, et ce jeton porte
 * l'appel. Ces tests éprouvent la chaîne entière face à un vrai serveur
 * HTTP local, qui joue à la fois le service de jetons de Google et le
 * point d'accès de Vertex. Rien ne sort de la machine.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const CLE_PRIVEE = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const FICHIER = {
  type: "service_account",
  project_id: "projet-essai",
  private_key_id: "abc",
  private_key: CLE_PRIVEE,
  client_email: "banc@projet-essai.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token",
};

const VERTEX = {
  AI_OPENAI_URL:
    "https://europe-west4-aiplatform.googleapis.com/v1/projects/projet-essai/locations/europe-west4/endpoints/openapi",
  AI_OPENAI_MODEL: "google/gemini-3.8-flash",
  AI_OPENAI_AUTH: "compte_de_service_google",
  AI_OPENAI_COMPTE_DE_SERVICE: JSON.stringify(FICHIER),
  AI_OPENAI_PDF: "image_url",
};

describe("le compte de service se lit tel que Google le livre", () => {
  it("collé tel quel, ou encodé en base64", () => {
    const attendu = {
      ok: true,
      compte: { email: FICHIER.client_email, clePrivee: CLE_PRIVEE, adresseJeton: FICHIER.token_uri },
    };
    expect(lireCompteDeService(JSON.stringify(FICHIER))).toEqual(attendu);
    expect(lireCompteDeService(Buffer.from(JSON.stringify(FICHIER)).toString("base64"))).toEqual(attendu);
  });

  it.each([
    ["absent", "", "absent"],
    ["ni JSON ni base64", "pas un fichier", "illisible"],
    ["une clé OAuth d'utilisateur", JSON.stringify({ ...FICHIER, type: "authorized_user" }), "pas_un_compte_de_service"],
    ["sans clé privée", JSON.stringify({ ...FICHIER, private_key: "" }), "champ_manquant"],
    ["avec un token_uri hors de Google", JSON.stringify({ ...FICHIER, token_uri: "https://jetons.exemple.test/token" }), "adresse_hors_google"],
  ])("refuse un fichier %s", (_cas, brut, defaut) => {
    expect(lireCompteDeService(brut)).toEqual({ ok: false, defaut });
  });

  it("l'adresse d'échange est https et chez Google, sans exception", () => {
    expect(adresseDeJetonAdmise("https://oauth2.googleapis.com/token")).toBe(true);
    expect(adresseDeJetonAdmise("http://oauth2.googleapis.com/token")).toBe(false);
    expect(adresseDeJetonAdmise("https://googleapis.com.exemple.test/token")).toBe(false);
  });

  it("chaque refus dit quoi faire et nomme la variable", () => {
    for (const motif of Object.values(MOTIF_DU_COMPTE)) expect(motif).toMatch(/AI_OPENAI_COMPTE_DE_SERVICE/u);
  });
});

describe("la configuration de Vertex dans le registre", () => {
  it("le compte de service remplace la clé d'API, qui n'est plus exigée", () => {
    expect(variablesExigees(VERTEX, "openai_compatible")).toEqual(["AI_OPENAI_URL", "AI_OPENAI_MODEL"]);
    expect(manqueDuFournisseur(VERTEX, "openai_compatible")).toBeNull();
    expect(variablesExigees({}, "openai_compatible")).toContain("AI_OPENAI_API_KEY");
  });

  it("sans compte de service, le motif dit quoi renseigner", () => {
    expect(manqueDuFournisseur({ ...VERTEX, AI_OPENAI_COMPTE_DE_SERVICE: "" }, "openai_compatible")).toBe(
      MOTIF_DU_COMPTE.absent,
    );
  });

  it("un mode d'authentification inconnu est dit, jamais remplacé par la clé", () => {
    expect(modeDAuthentification({ AI_OPENAI_AUTH: "google" })).toEqual({ connu: false, valeur: "google" });
    expect(manqueDuFournisseur({ ...VERTEX, AI_OPENAI_AUTH: "google" }, "openai_compatible")).toMatch(
      /AI_OPENAI_AUTH vaut « google »/u,
    );
  });

  it("la configuration porte le compte, la forme du PDF et le modèle", () => {
    expect(configurationCompatible(VERTEX)).toMatchObject({
      authentification: { mode: "compte_de_service_google", compte: { email: FICHIER.client_email } },
      modele: "google/gemini-3.8-flash",
      pdf: "image_url",
    });
    expect(configurationCompatible({ ...VERTEX, AI_OPENAI_COMPTE_DE_SERVICE: "x" })).toBeNull();
  });
});

describe("l'affirmation signée", () => {
  it("est un JWT RS256 que la clé publique du compte vérifie", () => {
    const compte = { email: FICHIER.client_email, clePrivee: CLE_PRIVEE, adresseJeton: FICHIER.token_uri };
    const jwt = affirmationSignee(compte, 1_800_000_000);
    const [entete, charge, signature] = jwt.split(".");
    const verif = createVerify("RSA-SHA256").update(`${entete}.${charge}`);
    expect(verif.verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(entete!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(charge!, "base64url").toString())).toEqual({
      iss: FICHIER.client_email,
      scope: PORTEE_VERTEX,
      aud: FICHIER.token_uri,
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
  });
});

// ── Face à un vrai serveur : le service de jetons et Vertex ─────────────

let serveur: Server;
let adresse: string;
let jetonsDelivres = 0;
let reponseJeton: { statut: number; corps: unknown } | null = null;
let refusDuProchainAppel = false;
const recus: { chemin: string; autorisation: string | undefined; corps: string }[] = [];

beforeAll(async () => {
  serveur = createServer((req, res) => {
    let corps = "";
    req.on("data", (m) => (corps += m));
    req.on("end", () => {
      recus.push({ chemin: req.url ?? "", autorisation: req.headers.authorization, corps });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/token") {
        if (reponseJeton) {
          res.writeHead(reponseJeton.statut);
          res.end(JSON.stringify(reponseJeton.corps));
          return;
        }
        jetonsDelivres += 1;
        res.end(JSON.stringify({ access_token: `jeton-${jetonsDelivres}`, expires_in: 3599, token_type: "Bearer" }));
        return;
      }
      if (refusDuProchainAppel) {
        refusDuProchainAppel = false;
        res.writeHead(401);
        res.end(JSON.stringify({ error: "jeton expiré" }));
        return;
      }
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({ piece_identifiee: "passeport", obstacle: null, champs: { date_expiration: "2031-04-30" } }),
              },
            },
          ],
          usage: { prompt_tokens: 900, completion_tokens: 40 },
        }),
      );
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  adresse = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => serveur.close(() => ok())));

beforeEach(() => {
  oublierLeJetonGoogle();
  jetonsDelivres = 0;
  reponseJeton = null;
  refusDuProchainAppel = false;
  recus.length = 0;
});

// L'adresse d'échange locale n'est admise que parce que le compte est
// construit ici, sans passer par `lireCompteDeService`, qui la refuserait.
const compte = (): CompteDeService => ({
  email: FICHIER.client_email,
  clePrivee: CLE_PRIVEE,
  adresseJeton: `${adresse}/token`,
});

const DEMANDE = {
  codeAttendu: "passeport",
  intituleAttendu: "Passeport",
  codesDeLaChecklist: ["passeport"],
  champs: [{ code: "date_expiration", nature: "date" as const, exigence: "valide six mois" }],
};

describe("le jeton de Vertex", () => {
  it("s'obtient par l'échange d'une affirmation, et se garde jusqu'à sa marge", async () => {
    const t0 = 1_800_000_000_000;
    expect(await jetonGoogle(compte(), t0)).toEqual({ ok: true, jeton: "jeton-1" });
    const echange = new URLSearchParams(recus[0]!.corps);
    expect(echange.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(echange.get("assertion")!.split(".")).toHaveLength(3);

    // Une demi-heure plus tard : le même jeton, sans nouvel échange.
    expect(await jetonGoogle(compte(), t0 + 1_800_000)).toEqual({ ok: true, jeton: "jeton-1" });
    expect(jetonsDelivres).toBe(1);

    // Dans la marge de renouvellement : un nouveau jeton, avant l'expiration.
    const presqueExpire = t0 + (3599 - MARGE_DE_RENOUVELLEMENT_SECONDES + 1) * 1000;
    expect(await jetonGoogle(compte(), presqueExpire)).toEqual({ ok: true, jeton: "jeton-2" });
  });

  it("un compte refusé par Google se dit à l'exploitant, sans écho de la réponse", async () => {
    reponseJeton = { statut: 400, corps: { error: "invalid_grant", error_description: "écho" } };
    const r = await jetonGoogle(compte());
    expect(r).toMatchObject({ ok: false, cause: "non_configure" });
    expect(JSON.stringify(r)).not.toContain("écho");
    expect(!r.ok && r.detail).toMatch(/Utilisateur Vertex AI/u);
  });

  it("une réponse sans jeton n'est pas un jeton", async () => {
    reponseJeton = { statut: 200, corps: { token_type: "Bearer" } };
    expect(await jetonGoogle(compte())).toMatchObject({ ok: false, cause: "reponse_illisible" });
  });

  it("une clé privée inutilisable est dite avant tout envoi", async () => {
    expect(await jetonGoogle({ ...compte(), clePrivee: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" })).toMatchObject({
      ok: false,
      cause: "non_configure",
    });
    expect(recus).toHaveLength(0);
  });
});

describe("la lecture d'une pièce chez Vertex", () => {
  const config = (): ConfigurationCompatible => ({
    base: new URL(`${adresse}/v1/projects/projet-essai/locations/europe-west4/endpoints/openapi`),
    authentification: { mode: "compte_de_service_google", compte: compte() },
    modele: "google/gemini-3.8-flash",
    pdf: "image_url",
  });

  it("part avec le jeton en en-tête, le PDF en image_url, et rend une lecture", async () => {
    const lue = await lireDesOctetsCompatible(config(), "application/pdf", Buffer.from("%PDF"), DEMANDE);
    expect(lue).toMatchObject({ etat: "LUE", bruts: { date_expiration: "2031-04-30" }, jetonsEntree: 900 });
    const appel = recus.find((r) => r.chemin.endsWith("/chat/completions"))!;
    expect(appel.chemin).toBe("/v1/projects/projet-essai/locations/europe-west4/endpoints/openapi/chat/completions");
    expect(appel.autorisation).toBe("Bearer jeton-1");
    expect(appel.corps).toContain('"type":"image_url"');
    expect(appel.corps).toContain("data:application/pdf;base64,");
    // Ni la clé privée ni le jeton ne ressortent dans ce que l'adaptateur rend.
    expect(JSON.stringify(lue)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(lue)).not.toContain("jeton-1");
  });

  it("un jeton refusé en cours de route se redemande une fois", async () => {
    await jetonGoogle(compte());
    refusDuProchainAppel = true;
    const lue = await lireDesOctetsCompatible(config(), "image/png", Buffer.from("x"), DEMANDE);
    expect(lue).toMatchObject({ etat: "LUE" });
    const appels = recus.filter((r) => r.chemin.endsWith("/chat/completions"));
    expect(appels.map((a) => a.autorisation)).toEqual(["Bearer jeton-1", "Bearer jeton-2"]);
  });

  it("sans jeton, aucun appel ne part vers Vertex", async () => {
    reponseJeton = { statut: 403, corps: {} };
    const lue = await lireDesOctetsCompatible(config(), "image/png", Buffer.from("x"), DEMANDE);
    expect(lue).toMatchObject({ etat: "NON_LUE", cause: "non_configure", jetonsEntree: 0 });
    expect(recus.filter((r) => r.chemin.endsWith("/chat/completions"))).toHaveLength(0);
  });
});
