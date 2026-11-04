// @vitest-environment node
/**
 * S.213 — le raisonnement mesuré, persisté et tarifé (F-3 de la revue du 31/10).
 *
 * Le 28/10, Google a facturé 3 201 jetons de sortie pour 1 631 mesurés :
 * l'adaptateur compatible ne lisait que `completion_tokens`. Ces tests
 * tiennent la lecture du raisonnement, sa place dans la sortie facturée,
 * son coût, sa persistance et l'indépendance du quota d'analyses.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mesurerLUsageCompatible, sortieVisible, MAXIMUM_JETONS } from "@/domain/ia/usage";
import { coutMicrosDesJetons } from "@/domain/backoffice/couts";

const m = vi.hoisted(() => ({ aiUsageCreate: vi.fn(), credit: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    aiUsage: { create: m.aiUsageCreate },
    analysisCredit: { create: m.credit, createMany: m.credit, updateMany: m.credit },
  },
}));

const { noterLesJetons } = await import("@/server/ia/appel");
const { lireDesOctetsCompatible, redacteurCompatible } = await import("@/server/ia/openai-compatible");

describe("mesurerLUsageCompatible — où le raisonnement se range", () => {
  it("sans compteur de raisonnement : mesure CONNUE, raisonnement non rapporté (jamais 0)", () => {
    expect(mesurerLUsageCompatible({ prompt_tokens: 990, completion_tokens: 32, total_tokens: 1022 })).toEqual({
      etat: "CONNUE", jetonsEntree: 990, jetonsSortie: 32, jetonsRaisonnement: null,
    });
  });
  it("forme OpenAI : reasoning_tokens est déjà compris dans completion_tokens", () => {
    expect(mesurerLUsageCompatible({
      prompt_tokens: 1000, completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 70 },
    })).toMatchObject({ etat: "CONNUE", jetonsSortie: 100, jetonsRaisonnement: 70, sourceDuRaisonnement: "DETAIL_DE_SORTIE" });
  });
  it.each(["thoughtsTokenCount", "thoughts_token_count"])("forme Gemini (%s) : la réflexion s'ajoute à la sortie facturée", (cle) => {
    expect(mesurerLUsageCompatible({ prompt_tokens: 1136, completion_tokens: 29, [cle]: 202 })).toMatchObject({
      etat: "CONNUE", jetonsEntree: 1136, jetonsSortie: 231, jetonsRaisonnement: 202, sourceDuRaisonnement: "GEMINI_THOUGHTS",
    });
  });
  it("sans champ nommé, un total supérieur à entrée + sortie compte l'écart comme raisonnement", () => {
    expect(mesurerLUsageCompatible({ prompt_tokens: 1000, completion_tokens: 29, total_tokens: 1250 })).toMatchObject({
      etat: "CONNUE", jetonsSortie: 250, jetonsRaisonnement: 221, sourceDuRaisonnement: "ECART_DU_TOTAL",
    });
  });
  it("un total inférieur à la somme ne prouve rien et n'invalide pas la mesure", () => {
    expect(mesurerLUsageCompatible({ prompt_tokens: 1000, completion_tokens: 29, total_tokens: 900 })).toEqual({
      etat: "CONNUE", jetonsEntree: 1000, jetonsSortie: 29, jetonsRaisonnement: null,
    });
  });
  it("un champ nommé l'emporte sur l'écart du total", () => {
    expect(mesurerLUsageCompatible({ prompt_tokens: 10, completion_tokens: 5, thoughtsTokenCount: 3, total_tokens: 100 }))
      .toMatchObject({ jetonsSortie: 8, jetonsRaisonnement: 3, sourceDuRaisonnement: "GEMINI_THOUGHTS" });
  });
  it.each([
    [{ completion_tokens_details: { reasoning_tokens: 101 } }, "raisonnement supérieur à la sortie qui le contient"],
    [{ completion_tokens_details: { reasoning_tokens: -1 } }, "raisonnement négatif"],
    [{ thoughtsTokenCount: 1.5 }, "réflexion fractionnaire"],
    [{ thoughtsTokenCount: "70" }, "réflexion en texte"],
    [{ thoughtsTokenCount: MAXIMUM_JETONS }, "somme hors INTEGER"],
  ])("un compteur présent mais invalide rend la mesure INVALIDE : %j (%s)", (extra: object, _motif: string) => {
    const r = mesurerLUsageCompatible({ prompt_tokens: 10, completion_tokens: 100, ...extra });
    expect(r).toMatchObject({ etat: "INVALIDE", jetonsEntree: 10, jetonsSortie: null, jetonsRaisonnement: null });
  });
  it.each([
    [undefined, "INCONNUE"],
    [{ prompt_tokens: 12 }, "PARTIELLE"],
    [{ prompt_tokens: -1, completion_tokens: 3, thoughtsTokenCount: 4 }, "INVALIDE"],
  ])("une base non connue reste ce qu'elle est, sans raisonnement : %j", (usage, etat) => {
    expect(mesurerLUsageCompatible(usage)).toMatchObject({ etat, jetonsRaisonnement: null });
  });
  it("sortieVisible retire le raisonnement quand il est connu, et seulement alors", () => {
    expect(sortieVisible({ jetonsSortie: 231, jetonsRaisonnement: 202 })).toBe(29);
    expect(sortieVisible({ jetonsSortie: 32, jetonsRaisonnement: null })).toBe(32);
    expect(sortieVisible({ jetonsSortie: null, jetonsRaisonnement: null })).toBeNull();
  });
});

describe("le coût suit la sortie facturée, raisonnement compris", () => {
  const tarif = { entreeParMillion: 0.825, sortieParMillion: 4.125, devise: "USD" };
  it("L07 du 28/10 : 29 visibles + 202 de réflexion se paient au prix de la sortie", () => {
    const mesure = mesurerLUsageCompatible({ prompt_tokens: 1136, completion_tokens: 29, thoughtsTokenCount: 202 });
    const avec = coutMicrosDesJetons(tarif, mesure.jetonsEntree, mesure.jetonsSortie);
    const sans = coutMicrosDesJetons(tarif, 1136, 29);
    expect(avec).toBe(Math.round(1136 * 0.825 + 231 * 4.125));
    expect(avec! - sans!).toBe(Math.round(202 * 4.125));
  });
  it("sans raisonnement rapporté, le coût est celui d'avant S.213", () => {
    const mesure = mesurerLUsageCompatible({ prompt_tokens: 990, completion_tokens: 32 });
    expect(coutMicrosDesJetons(tarif, mesure.jetonsEntree, mesure.jetonsSortie)).toBe(coutMicrosDesJetons(tarif, 990, 32));
  });
});

describe("noterLesJetons — la part de raisonnement persistée à part", () => {
  beforeEach(() => {
    m.aiUsageCreate.mockReset().mockResolvedValue({});
    m.credit.mockReset();
    process.env.AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION = "0.825";
    process.env.AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION = "4.125";
    process.env.AI_TARIF_OPENAI_COMPATIBLE_DEVISE = "USD";
  });
  const appel = (usage: unknown) => ({
    fournisseur: "openai_compatible" as const, modele: "google/gemini-3.8-flash", mesure: mesurerLUsageCompatible(usage),
  });

  it("écrit la sortie facturée, sa part de raisonnement et le coût qui l'inclut", async () => {
    const a = appel({ prompt_tokens: 1000, completion_tokens: 30, thoughtsTokenCount: 70 });
    await noterLesJetons("u", "d", "extraction", a.mesure.jetonsEntree, a.mesure.jetonsSortie, a);
    expect(m.aiUsageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      inputTokens: 1000, outputTokens: 100, reasoningTokens: 70, usageState: "CONNUE", costMicros: 1238,
    }) });
  });
  it("écrit NULL quand le fournisseur ne rapporte rien, sans changer l'état ni le coût", async () => {
    const a = appel({ prompt_tokens: 1000, completion_tokens: 30, total_tokens: 1030 });
    await noterLesJetons("u", "d", "extraction", 1000, 30, a);
    expect(m.aiUsageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      outputTokens: 30, reasoningTokens: null, usageState: "CONNUE", costMicros: Math.round(1000 * 0.825 + 30 * 4.125),
    }) });
  });
  it("n'écrit aucun raisonnement sur une mesure incomplète ou invalide", async () => {
    const a = appel({ prompt_tokens: 10, completion_tokens: 5, thoughtsTokenCount: -3 });
    await noterLesJetons("u", "d", "extraction", null, null, a);
    expect(m.aiUsageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      usageState: "INVALIDE", reasoningTokens: null, costMicros: null,
    }) });
  });
  it("Anthropic et l'historique gardent un raisonnement NULL", async () => {
    await noterLesJetons("u", "d", "redaction", 120, 30, { fournisseur: "anthropic", modele: "claude" });
    expect(m.aiUsageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ reasoningTokens: null, outputTokens: 30 }) });
  });
  it("non-régression du quota : noter des jetons, même de raisonnement, ne touche jamais le grand livre des analyses (D1)", async () => {
    const a = appel({ prompt_tokens: 1000, completion_tokens: 30, thoughtsTokenCount: 5000 });
    await noterLesJetons("u", "d", "extraction", a.mesure.jetonsEntree, a.mesure.jetonsSortie, a);
    expect(m.credit).not.toHaveBeenCalled();
    expect(m.aiUsageCreate).toHaveBeenCalledTimes(1);
  });
});

describe("adaptateur compatible simulé — un vrai échange HTTP local", () => {
  let service: Server;
  let charge: unknown;
  let config: Parameters<typeof lireDesOctetsCompatible>[0];
  const demande = { codeAttendu: "passeport", intituleAttendu: "Passeport", champs: [{ code: "date_expiration", nature: "date" as const, exigence: "valide six mois" }], codesDeLaChecklist: ["passeport"] };
  const lecture = JSON.stringify({ champs: { date_expiration: "2031-04-30" }, piece_identifiee: "passeport", obstacle: null });
  beforeAll(async () => {
    service = createServer((req, res) => { req.resume(); req.on("end", () => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(charge)); }); });
    await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
    config = { base: new URL(`http://127.0.0.1:${(service.address() as AddressInfo).port}/v1`), authentification: { mode: "cle", cle: "synthetique" }, modele: "synthetique", pdf: null };
  });
  afterAll(async () => { await new Promise<void>((ok) => service.close(() => ok())); });

  it("une lecture rend la sortie facturée et porte la part de raisonnement jusqu'à la mesure de l'appel", async () => {
    charge = { choices: [{ message: { content: lecture }, finish_reason: "stop" }], usage: { prompt_tokens: 1668, completion_tokens: 36, thoughtsTokenCount: 120 } };
    const lu = await lireDesOctetsCompatible(config, "image/png", Buffer.from("png"), demande);
    expect(lu).toMatchObject({ etat: "LUE", jetonsEntree: 1668, jetonsSortie: 156,
      appel: { fournisseur: "openai_compatible", mesure: { etat: "CONNUE", jetonsSortie: 156, jetonsRaisonnement: 120 } } });
  });
  it("la forme Vertex d'aujourd'hui (sans compteur) reste publiable, raisonnement NULL", async () => {
    charge = { choices: [{ message: { content: lecture }, finish_reason: "stop" }], usage: { prompt_tokens: 990, completion_tokens: 32, total_tokens: 1022 } };
    const lu = await lireDesOctetsCompatible(config, "image/png", Buffer.from("png"), demande);
    expect(lu).toMatchObject({ etat: "LUE", jetonsSortie: 32, appel: { mesure: { etat: "CONNUE", jetonsRaisonnement: null } } });
  });
  it("un compteur de raisonnement invalide empêche la publication, comme tout compteur invalide (L2)", async () => {
    charge = { choices: [{ message: { content: lecture }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 9 } } };
    const lu = await lireDesOctetsCompatible(config, "image/png", Buffer.from("png"), demande);
    expect(lu).toMatchObject({ etat: "NON_LUE", cause: "reponse_illisible", appel: { mesure: { etat: "INVALIDE" } } });
  });
  it("une rédaction compte aussi son raisonnement dans la sortie", async () => {
    charge = { choices: [{ message: { content: "Madame, Monsieur, je sollicite un visa de visite familiale pour un séjour de deux semaines en famille, aux dates indiquées dans le dossier, avec un retour prévu." }, finish_reason: "stop" }], usage: { prompt_tokens: 522, completion_tokens: 158, completion_tokens_details: { reasoning_tokens: 40 } } };
    const matiere = { piece: "Lettre de motivation", objet: "Visite familiale", pays: "France", reponses: { 0: "Visite familiale située et datée" }, questions: [{ rang: 0, section: "Voyage", intitule: "Motif du voyage" }] };
    const ecrit = await redacteurCompatible(config)(matiere as never);
    expect(ecrit).toMatchObject({ jetonsSortie: 158, appel: { mesure: { jetonsRaisonnement: 40, sourceDuRaisonnement: "DETAIL_DE_SORTIE" } } });
  });
});
