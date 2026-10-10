// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Reponses } from "@/domain/simulateur/questions";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

const { lireRegles, gerer } = vi.hoisted(() => ({ lireRegles: vi.fn(), gerer: vi.fn() }));
vi.mock("@/server/http/route", () => ({
  route: (options: { traiter: unknown }) => {
    gerer.mockImplementation(options.traiter as never);
    return options.traiter;
  },
}));
vi.mock("@/server/acces/regles", async (original) => ({
  ...(await original<typeof import("@/server/acces/regles")>()),
  reglesPubliees: lireRegles,
}));
import "@/app/api/simulations/route";

describe("le simulateur nomme les procédures du référentiel", () => {
  const regles = REGLES_DE_REFERENCE.filter((r) => r.countryCode === "NL").map((r) => ({
    ...r,
    verifiedAt: new Date("2026-09-11"),
    nextReviewAt: new Date("2026-12-11"),
  }));
  const simuler = async (corps: Reponses) => {
    lireRegles.mockResolvedValue(regles);
    return gerer({ corps });
  };

  it("rend deux liens distincts, avec les libellés officiels et leurs mentions", async () => {
    const resultat = await simuler({ langue: "C1 et plus", budget: "Plus de 12 millions F" });
    expect(resultat.retenues).toHaveLength(2);
    expect(new Set(resultat.retenues.map((r: { slug: string }) => r.slug)).size).toBe(2);
    for (const r of resultat.retenues) {
      expect(regles.some((source) => source.rules.libelle === r.procedure)).toBe(true);
      expect(r.mention).toMatchObject({ verifieeLe: "2026-09-11" });
      expect(r).not.toHaveProperty("interne");
    }
  });

  it("distingue aussi les procédures écartées pour le même motif", async () => {
    const resultat = await simuler({ objectif: "Rejoindre ma famille" });
    expect(resultat.ecartees).toHaveLength(2);
    expect(new Set(resultat.ecartees.map((r: { slug: string }) => r.slug)).size).toBe(2);
    expect(new Set(resultat.ecartees.map((r: { procedure: string }) => r.procedure)).size).toBe(2);
  });
});
