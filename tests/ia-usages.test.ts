// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { lireDesOctetsCompatible, redacteurCompatible, critiqueCompatible, type ConfigurationCompatible } from "@/server/ia/openai-compatible";
import { lireDesOctets } from "@/server/dossiers/extracteur";
import { redacteurClaude } from "@/server/redaction/adaptateur";
import { poserLeClient } from "@/lib/ai";

let service: Server;
let config: ConfigurationCompatible;
let charge: unknown;
let appels = 0;
const demande = { codeAttendu: "passeport", intituleAttendu: "Passeport", champs: [{ code: "date_expiration", nature: "date" as const, exigence: "valide six mois" }], codesDeLaChecklist: ["passeport"] };
const lecture = JSON.stringify({ champs: { date_expiration: "2031-04-30" }, piece_identifiee: "passeport", obstacle: null });
const enveloppe = (usage: unknown, texte = lecture) => ({ choices: [{ message: { content: texte }, finish_reason: "stop" }], usage });
const matiere = { piece: "Lettre de motivation", objet: "Visite familiale", pays: "France", reponses: { 0: "Visite familiale située et datée" }, questions: [{ rang: 0, section: "Voyage", intitule: "Motif du voyage" }] };

beforeAll(async () => {
  service = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      appels++;
      if (typeof charge === "string") { res.setHeader("Content-Type", "text/event-stream"); res.end(charge); }
      else { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(charge)); }
    });
  });
  await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
  config = { base: new URL(`http://127.0.0.1:${(service.address() as AddressInfo).port}/v1`), authentification: { mode: "cle", cle: "synthetique" }, modele: "synthetique", pdf: null };
});
afterAll(async () => { poserLeClient(null); await new Promise<void>((ok) => service.close(() => ok())); });

describe("L2 — mesure d'un vrai échange HTTP", () => {
  it.each([false, true])("conserve l'usage d'un flux Anthropic interrompu (sortie finale %j)", async (finale) => {
    const ancienne = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = config.base.origin;
    poserLeClient(null);
    const evenement = (type: string, corps: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...corps })}\n\n`;
    charge = evenement("message_start", { message: { id: "msg_synthetique", type: "message", role: "assistant", model: "synthetique", content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 0 } } })
      + (finale ? evenement("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }) : "")
      + evenement("error", { error: { type: "api_error", message: "erreur synthetique du flux" } });
    try {
      expect(await redacteurClaude("synthetique", "synthetique")(matiere)).toMatchObject({
        etat: "SANS_TEXTE", jetonsEntree: 12, jetonsSortie: finale ? 3 : null,
        appel: { mesure: { etat: finale ? "CONNUE" : "PARTIELLE" } },
      });
    } finally { if (ancienne === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = ancienne; poserLeClient(null); }
  });
  it.each([
    [undefined, "INCONNUE", null, null],
    [{ prompt_tokens: 120 }, "PARTIELLE", 120, null],
    [{ completion_tokens: 30 }, "PARTIELLE", null, 30],
    [{ prompt_tokens: -12, completion_tokens: 30 }, "INVALIDE", null, 30],
    [{ prompt_tokens: 120, completion_tokens: 1.5 }, "INVALIDE", 120, null],
    [{ prompt_tokens: "120", completion_tokens: 30 }, "INVALIDE", null, 30],
    [{ prompt_tokens: 2 ** 31, completion_tokens: 30 }, "INVALIDE", null, 30],
    [{ prompt_tokens: null, completion_tokens: null }, "INCONNUE", null, null],
  ])("lecture sans publication avec usage %j", async (usage, etat, entree, sortie) => {
    charge = enveloppe(usage);
    const avant = appels;
    const lue = await lireDesOctetsCompatible(config, "image/png", Buffer.from("piece synthetique"), demande);
    expect(lue).toMatchObject({ etat: "NON_LUE", cause: "reponse_illisible", jetonsEntree: entree, jetonsSortie: sortie, appel: { mesure: { etat } } });
    expect(appels - avant).toBe(1);
  });

  it.each([[], null])("garde le coût d'une enveloppe inutilisable %j", async (choices) => {
    charge = { choices, usage: { prompt_tokens: 120, completion_tokens: 30 } };
    expect(await lireDesOctetsCompatible(config, "image/png", Buffer.from("x"), demande)).toMatchObject({ etat: "NON_LUE", jetonsEntree: 120, jetonsSortie: 30, appel: { mesure: { etat: "CONNUE" } } });
  });

  it("distingue le vrai zéro de l'absence", async () => {
    charge = enveloppe({ prompt_tokens: 0, completion_tokens: 0 });
    expect(await lireDesOctetsCompatible(config, "image/png", Buffer.from("x"), demande)).toMatchObject({ etat: "LUE", jetonsEntree: 0, jetonsSortie: 0, appel: { mesure: { etat: "CONNUE" } } });
  });

  it("ne publie ni texte ni avis sans mesure", async () => {
    charge = enveloppe(undefined, "Un texte suffisamment long pour être exploitable. ".repeat(8));
    expect(await redacteurCompatible(config)(matiere)).toMatchObject({ etat: "SANS_TEXTE", jetonsEntree: null, appel: { mesure: { etat: "INCONNUE" } } });
    charge = enveloppe(undefined, JSON.stringify({ remarques: [] }));
    expect(await critiqueCompatible(config)("texte", matiere)).toMatchObject({ etat: "SANS_AVIS", jetonsEntree: null, appel: { mesure: { etat: "INCONNUE" } } });
  });

  it("Anthropic : une usage manquante n'échappe pas au traitement métier", async () => {
    const ancienne = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = config.base.origin;
    poserLeClient(null);
    try {
      charge = { id: "msg_synthetique", type: "message", role: "assistant", model: "synthetique", content: [{ type: "text", text: lecture }], stop_reason: "end_turn" };
      expect(await lireDesOctets("synthetique", "synthetique", "image/png", Buffer.from("x"), demande)).toMatchObject({ etat: "NON_LUE", jetonsEntree: null, appel: { mesure: { etat: "INCONNUE" } } });
    } finally { if (ancienne === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = ancienne; poserLeClient(null); }
  });
});
