import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { origineAdmise, type DemandeDOrigine } from "@/server/http/origine";

const lireSession = vi.fn().mockResolvedValue(null);
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("@/server/securite/session", async (original) => ({
  ...(await original<typeof import("@/server/securite/session")>()),
  lireSession: (...a: unknown[]) => lireSession(...a),
}));

import { route } from "@/server/http/route";
import { reinitialiser } from "@/server/http/limites";

/**
 * CSRF : aucune vérification d'`Origin` — revue du 07/10/2026, F2.
 */
const demande = (partiel: Partial<DemandeDOrigine>): DemandeDOrigine => ({
  methode: "POST",
  origine: null,
  secFetchSite: null,
  hote: "immipro.app",
  appUrl: "https://immipro.app",
  ...partiel,
});

describe("origineAdmise", () => {
  it.each([
    ["une origine étrangère", { origine: "https://evil.example" }, false],
    ["le sous-domaine du stockage", { origine: "https://stockage.immipro.app" }, false],
    ["Origin: null", { origine: "null" }, false],
    ["cross-site sans Origin", { secFetchSite: "cross-site" }, false],
    ["same-site sans Origin", { secFetchSite: "same-site" }, false],
    ["une origine illisible", { origine: "pas une adresse" }, false],
    ["la plateforme elle-même", { origine: "https://immipro.app" }, true],
    ["localhost en développement", { origine: "http://localhost:3000", hote: "localhost:3000", appUrl: "http://localhost:3000" }, true],
    ["le réseau local en développement", { origine: "http://192.168.1.20:3000", hote: "192.168.1.20:3000", appUrl: "http://localhost:3000" }, true],
    ["APP_URL derrière un Host interne", { origine: "https://immipro.app", hote: "app:3000" }, true],
    ["ni Origin ni Sec-Fetch-Site (client hors navigateur)", {}, true],
    ["same-origin sans Origin", { secFetchSite: "same-origin" }, true],
    ["une navigation directe sans Origin", { secFetchSite: "none" }, true],
  ] as const)("%s → %s", (_cas, partiel, admise) => {
    expect(origineAdmise(demande(partiel))).toBe(admise);
  });

  it("GET et HEAD sont toujours admis : ils ne modifient rien", () => {
    for (const methode of ["GET", "HEAD", "get"]) {
      expect(origineAdmise(demande({ methode, origine: "https://evil.example" }))).toBe(true);
    }
  });
});

describe("le composeur refuse avant de lire la session", () => {
  beforeEach(() => {
    lireSession.mockClear();
    reinitialiser();
  });

  const gestionnaire = route({
    nom: "essai.origine",
    acces: "public",
    limite: "lecture",
    traiter: async () => ({ fait: true }),
  });
  const appeler = (entetes: Record<string, string>, methode = "POST") =>
    gestionnaire(
      new Request("https://immipro.app/api/essai", {
        method: methode,
        headers: { host: "immipro.app", ...entetes },
        ...(methode === "POST" ? { body: "{}" } : {}),
      }),
      { params: Promise.resolve({}) },
    );

  it("un POST d'une autre origine répond 403, sans session lue", async () => {
    const reponse = await appeler({ origin: "https://evil.example" });
    expect(reponse.status).toBe(403);
    expect(((await reponse.json()) as { echec: { titre: string } }).echec.titre).toBe("Cette demande ne vient pas d'ImmiPro");
    expect(lireSession).not.toHaveBeenCalled();
  });

  it("le même POST depuis la plateforme passe", async () => {
    const reponse = await appeler({ origin: "https://immipro.app" });
    expect(reponse.status).toBe(200);
  });

  it("un GET d'une autre origine passe : il ne modifie rien", async () => {
    expect((await appeler({ origin: "https://evil.example" }, "GET")).status).toBe(200);
  });
});

describe("la place de la vérification", () => {
  const SOURCE = readFileSync("src/server/http/route.ts", "utf8");

  it("après le bloc webhook, avant toute lecture de session, webhooks exemptés", () => {
    const verification = SOURCE.indexOf("origineAdmise({");
    expect(verification).toBeGreaterThan(SOURCE.indexOf("definition.signature(requeteBrute"));
    expect(verification).toBeLessThan(SOURCE.indexOf("lireSession("));
    expect(SOURCE.slice(verification - 120, verification)).toContain('definition.limite !== "webhook"');
  });
});
