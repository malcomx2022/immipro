// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * ESLint en configuration plate — revue du 07/10/2026, M19 étape 2.
 *
 * La migration ne change aucune règle : elle change le format. Ce test
 * garde les trois choses qui le prouvent sur un fichier du code — les
 * préréglages de Next sont chargés, la règle propre au dépôt l'est aussi,
 * et l'ancien format a disparu pour qu'aucun des deux ne masque l'autre.
 */
describe("configuration ESLint plate", () => {
  it("l'ancien format a disparu, le script n'appelle plus next lint", () => {
    expect(existsSync(".eslintrc.json")).toBe(false);
    expect(existsSync("eslint.config.mjs")).toBe(true);
    const paquet = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(paquet.scripts.lint).toBe("eslint src");
  });

  it("les préréglages de Next et la règle du dépôt s'appliquent au code", async () => {
    const config = (await new ESLint().calculateConfigForFile("src/app/layout.tsx")) as {
      rules: Record<string, unknown[]>;
    };
    const severite = (r: string) => config.rules[r]?.[0];
    // next/core-web-vitals
    expect(severite("@next/next/no-html-link-for-pages")).toBe(2);
    expect(severite("react-hooks/rules-of-hooks")).toBe(2);
    // next/typescript
    expect(severite("@typescript-eslint/no-explicit-any")).toBe(2);
    // La règle du dépôt, avec son option.
    expect(config.rules["@typescript-eslint/no-unused-vars"]).toEqual([2, { argsIgnorePattern: "^_" }]);
  }, 60_000);
});
