// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { CAS_AVIS_IA } from "./fixtures/avis-ia";
import { lireLaCritique } from "@/domain/redaction/commande";
import { critiqueCompatible, type ConfigurationCompatible } from "@/server/ia/openai-compatible";
import { critiqueClaude } from "@/server/redaction/adaptateur";
import { poserLeClient } from "@/lib/ai";

let service: Server;
let config: ConfigurationCompatible;
let charge: unknown;
let appels = 0;
const ancienneBase = process.env.ANTHROPIC_BASE_URL;
const matiere = {
  piece: "Lettre de motivation",
  objet: "Présenter le parcours",
  pays: "Pays-Bas",
  reponses: {},
  questions: [],
};

beforeAll(async () => {
  service = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      appels++;
      const texte = JSON.stringify(charge);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/v1/messages"
            ? {
                id: "msg_avis_synthetique",
                type: "message",
                role: "assistant",
                model: "synthetique",
                content: [{ type: "text", text: texte }],
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: { input_tokens: 120, output_tokens: 30 },
              }
            : {
                choices: [{ finish_reason: "stop", message: { content: texte } }],
                usage: { prompt_tokens: 120, completion_tokens: 30 },
              },
        ),
      );
    });
  });
  await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
  const origine = `http://127.0.0.1:${(service.address() as AddressInfo).port}`;
  config = {
    base: new URL(`${origine}/v1`),
    authentification: { mode: "cle", cle: "synthetique" },
    modele: "synthetique",
    pdf: null,
  };
  process.env.ANTHROPIC_BASE_URL = origine;
  poserLeClient(null);
});
afterAll(async () => {
  if (ancienneBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = ancienneBase;
  poserLeClient(null);
  await new Promise<void>((ok) => service.close(() => ok()));
});

describe("L3 — un avis complet ou aucun avis", () => {
  it.each(CAS_AVIS_IA)("domaine : $nom", (cas) => {
    const avis = lireLaCritique(cas.charge);
    if (cas.valide) expect(avis).toHaveLength(cas.nombre!);
    else
      expect(avis).toMatchObject({
        cause: "reponse_illisible",
        motif: cas.motif ?? "avis_mal_forme",
      });
  });
  for (const fournisseur of ["anthropic", "openai_compatible"] as const) {
    it.each(CAS_AVIS_IA)(`${fournisseur} : $nom`, async (cas) => {
      charge = cas.charge;
      const avant = appels;
      const critique =
        fournisseur === "anthropic"
          ? critiqueClaude("synthetique", "synthetique")
          : critiqueCompatible(config);
      const avis = await critique("Texte réservé au test.", matiere);
      expect(appels - avant).toBe(1);
      expect(avis).toMatchObject({
        jetonsEntree: 120,
        jetonsSortie: 30,
        appel: { fournisseur, modele: "synthetique", mesure: { etat: "CONNUE" } },
      });
      if (cas.valide) {
        expect(avis.etat).toBe("RELUE");
        expect(avis.etat === "RELUE" && avis.remarques).toHaveLength(cas.nombre!);
      } else {
        expect(avis).toMatchObject({
          etat: "SANS_AVIS",
          cause: "reponse_illisible",
          motif: cas.motif ?? "avis_mal_forme",
        });
        expect("remarques" in avis).toBe(false);
      }
    });
  }
});
