// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DELAI_EXTRACTION_MS,
  DELAI_EXTRACTION_PDF_MS,
  delaiDeLecture,
} from "@/domain/dossiers/extraction";
import { MARGE_DE_RENOUVELLEMENT_SECONDES } from "@/domain/ia/compte-de-service";
import { lireDesOctetsCompatible, type ConfigurationCompatible } from "@/server/ia/openai-compatible";
import { lireDesOctets } from "@/server/dossiers/extracteur";
import { poserLeClient } from "@/lib/ai";

/*
  S.201 : sur Vertex, la lecture d'un PDF (L06) a épuisé les 120 s du
  client alors que les images rendaient en moins de 12 s. Le PDF a son
  propre délai ; l'image garde le sien.
*/

const demande = {
  codeAttendu: "passeport",
  intituleAttendu: "Passeport",
  champs: [{ code: "date_expiration", nature: "date" as const, exigence: "valide six mois" }],
  codesDeLaChecklist: ["passeport"],
};
const lecture = JSON.stringify({
  champs: { date_expiration: "2031-04-30" },
  piece_identifiee: "passeport",
  obstacle: null,
});

let service: Server;
let config: ConfigurationCompatible;

beforeAll(async () => {
  service = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content: lecture }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
      );
    });
  });
  await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
  config = {
    base: new URL(`http://127.0.0.1:${(service.address() as AddressInfo).port}/v1`),
    authentification: { mode: "cle", cle: "synthetique" },
    modele: "synthetique",
    pdf: "image_url",
  };
});
afterAll(async () => {
  poserLeClient(null);
  await new Promise<void>((ok) => service.close(() => ok()));
});
afterEach(() => {
  vi.restoreAllMocks();
  poserLeClient(null);
});

describe("délai de lecture selon le format", () => {
  it("un PDF attend trois minutes, une image deux", () => {
    expect(DELAI_EXTRACTION_MS).toBe(120_000);
    expect(DELAI_EXTRACTION_PDF_MS).toBe(180_000);
    expect(delaiDeLecture("application/pdf")).toBe(DELAI_EXTRACTION_PDF_MS);
    expect(delaiDeLecture("image/jpeg")).toBe(DELAI_EXTRACTION_MS);
    expect(delaiDeLecture("image/png")).toBe(DELAI_EXTRACTION_MS);
  });

  it("aucun délai ne survit au jeton Google renouvelé avant l'appel", () => {
    expect(DELAI_EXTRACTION_PDF_MS).toBeLessThan(MARGE_DE_RENOUVELLEMENT_SECONDES * 1000);
  });

  it.each([
    ["application/pdf", 180_000],
    ["image/png", 120_000],
  ] as const)("compatible : %s part avec %i ms", async (type, attendu) => {
    const delai = vi.spyOn(AbortSignal, "timeout");
    const lue = await lireDesOctetsCompatible(config, type, Buffer.from("piece synthetique"), demande);
    expect(lue).toMatchObject({ etat: "LUE" });
    expect(delai).toHaveBeenCalledWith(attendu);
  });

  it.each([
    ["application/pdf", 180_000],
    ["image/jpeg", 120_000],
  ] as const)("Anthropic : %s part avec %i ms, et l'échec le dit", async (type, attendu) => {
    let options: { timeout?: number } | undefined;
    const horsDelai = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    poserLeClient({
      messages: {
        create: async (_corps: unknown, o: { timeout?: number }) => {
          options = o;
          throw horsDelai;
        },
      },
    } as unknown as Anthropic);
    const lue = await lireDesOctets("synthetique", "synthetique", type, Buffer.from("x"), demande);
    expect(options?.timeout).toBe(attendu);
    expect(lue).toMatchObject({
      etat: "NON_LUE",
      cause: "delai_depasse",
      detail: `sans réponse après ${attendu} ms`,
    });
  });
});
