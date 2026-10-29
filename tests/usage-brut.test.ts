// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { usageNumerique, type UsageNumerique } from "@/domain/ia/usage";
import {
  lireDesOctetsCompatible,
  observerLUsage,
  type ConfigurationCompatible,
} from "@/server/ia/openai-compatible";

/**
 * S.204 — le banc relève la forme exacte de l'usage, sans rien d'autre.
 *
 * La facture du 28/10 compte deux fois la sortie que le banc a mesurée :
 * la réflexion est facturée, mais l'adaptateur ne lit que
 * `completion_tokens`. Avant de corriger la mesure, il faut savoir où le
 * fournisseur range les jetons de réflexion. L'observateur ne reçoit que
 * des nombres : un texte du bloc `usage` pourrait porter un extrait.
 */
describe("usageNumerique", () => {
  it("garde les compteurs, imbriqués compris", () => {
    expect(
      usageNumerique({
        prompt_tokens: 1136,
        completion_tokens: 29,
        total_tokens: 1400,
        completion_tokens_details: { reasoning_tokens: 235 },
      }),
    ).toEqual({
      prompt_tokens: 1136,
      completion_tokens: 29,
      total_tokens: 1400,
      completion_tokens_details: { reasoning_tokens: 235 },
    });
  });

  it("écarte les textes, les tableaux, les non-nombres et les blocs vides", () => {
    expect(
      usageNumerique({
        prompt_tokens: 10,
        modele: "extrait de la piece",
        liste: [1, 2],
        infini: Number.POSITIVE_INFINITY,
        vide: { note: "texte" },
        details: { reasoning_tokens: 3, raison: "texte" },
      }),
    ).toEqual({ prompt_tokens: 10, details: { reasoning_tokens: 3 } });
  });

  it("rend nul ce qui n'est pas un objet", () => {
    for (const v of [undefined, null, 3, "usage", [1]]) expect(usageNumerique(v)).toBeNull();
  });
});

describe("observerLUsage — un vrai échange HTTP local", () => {
  let service: Server;
  let config: ConfigurationCompatible;
  let charge: unknown;
  const lecture = JSON.stringify({
    champs: { date_expiration: "2031-04-30" },
    piece_identifiee: "passeport",
    obstacle: null,
  });
  const demande = {
    codeAttendu: "passeport",
    intituleAttendu: "Passeport",
    champs: [{ code: "date_expiration", nature: "date" as const, exigence: "valide six mois" }],
    codesDeLaChecklist: ["passeport"],
  };

  beforeAll(async () => {
    service = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(charge));
      });
    });
    await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
    config = {
      base: new URL(`http://127.0.0.1:${(service.address() as AddressInfo).port}/v1`),
      authentification: { mode: "cle", cle: "synthetique" },
      modele: "synthetique",
      pdf: null,
    };
  });
  afterAll(async () => {
    observerLUsage(null);
    await new Promise<void>((ok) => service.close(() => ok()));
  });

  it("transmet les seuls compteurs de la réponse reçue", async () => {
    const vus: (UsageNumerique | null)[] = [];
    observerLUsage((u) => vus.push(u));
    charge = {
      choices: [{ message: { content: lecture }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 64 },
        fournisseur: "texte qui ne doit pas passer",
      },
    };
    await lireDesOctetsCompatible(config, "image/png", Buffer.from("png"), demande);
    expect(vus).toEqual([
      { prompt_tokens: 120, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 64 } },
    ]);
  });

  it("ne transmet rien quand aucun observateur n'est inscrit", async () => {
    const vus: unknown[] = [];
    observerLUsage((u) => vus.push(u));
    observerLUsage(null);
    charge = {
      choices: [{ message: { content: lecture }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
    await lireDesOctetsCompatible(config, "image/png", Buffer.from("png"), demande);
    expect(vus).toEqual([]);
  });
});
