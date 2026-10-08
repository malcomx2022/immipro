import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  POLITIQUE_DES_PERMISSIONS,
  origineDuStockage,
  politiqueDeContenu,
} from "@/domain/securite/politique-de-contenu";

/**
 * Pas de CSP ni de `Permissions-Policy` — revue du 07/10/2026, F1 (D-5 :
 * le renommage du cookie en `__Host-` est reporté).
 */
const directive = (politique: string, nom: string) =>
  politique.split("; ").find((d) => d.startsWith(`${nom} `)) ?? "";

describe("en production", () => {
  const STOCKAGE = "https://stockage.immipro.app";
  const p = politiqueDeContenu({ stockage: STOCKAGE, developpement: false });

  it("ni évaluation, ni joker, ni cadre parent", () => {
    expect(p).not.toContain("'unsafe-eval'");
    expect(p).not.toMatch(/(^|\s)\*(\s|;|$)/u);
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("base-uri 'self'");
    expect(p).toContain("form-action 'self'");
    expect(p).toContain("upgrade-insecure-requests");
  });

  it("le stockage, et lui seul, en écriture (dépôt) et en cadre (aperçu B-05)", () => {
    expect(directive(p, "connect-src")).toBe(`connect-src 'self' ${STOCKAGE}`);
    expect(directive(p, "frame-src")).toBe(`frame-src ${STOCKAGE}`);
  });

  it("sans stockage public, aucune origine tierce", () => {
    const sans = politiqueDeContenu({ stockage: null, developpement: false });
    expect(sans).not.toMatch(/https?:\/\//u);
    expect(directive(sans, "frame-src")).toBe("frame-src 'none'");
  });
});

describe("en développement", () => {
  const p = politiqueDeContenu({ stockage: "http://localhost:9000", developpement: true });

  it("Next évalue et recharge par WebSocket ; la page n'est pas en https", () => {
    expect(directive(p, "script-src")).toContain("'unsafe-eval'");
    expect(directive(p, "connect-src")).toContain("ws:");
    expect(p).not.toContain("upgrade-insecure-requests");
  });
});

describe("l'origine du stockage", () => {
  it("omet le port par défaut, garde les autres", () => {
    expect(origineDuStockage({ hote: "stockage.immipro.app", port: 443, chiffre: true })).toBe(
      "https://stockage.immipro.app",
    );
    expect(origineDuStockage({ hote: "localhost", port: 9000, chiffre: false })).toBe("http://localhost:9000");
  });
});

describe("où l'en-tête est posé", () => {
  const MIDDLEWARE = readFileSync("src/middleware.ts", "utf8");

  it("le middleware pose la CSP, et exclut toujours l'API", () => {
    expect(MIDDLEWARE).toMatch(/headers\.set\("Content-Security-Policy", POLITIQUE\)/u);
    expect(MIDDLEWARE).toMatch(/matcher: \["\/\(\(\?!api\//u);
  });

  it("next.config pose la même Permissions-Policy que le domaine", () => {
    const config = readFileSync("next.config.mjs", "utf8");
    expect(config).toContain(`{ key: "Permissions-Policy", value: "${POLITIQUE_DES_PERMISSIONS}" }`);
  });
});
