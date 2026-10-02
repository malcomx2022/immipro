import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * L'ouverture d'un dossier échouait en production sur « Identifiant
 * attendu » (test du 02/10/2026). La route reçoit désormais la destination
 * et retrouve elle-même la règle publiée.
 */
const route = readFileSync("src/app/api/dossiers/route.ts", "utf8");
const ecran = readFileSync("src/app/(app)/(dossier)/dossiers/nouveau/OuvertureDossier.tsx", "utf8");

describe("Ouverture d'un dossier par la destination", () => {
  it("la route n'exige plus un UUID pour la règle", () => {
    expect(route).not.toMatch(/visaRuleId:\s*z\.string\(\)\.uuid\(\)/u);
  });

  it("la route retrouve la règle publiée depuis la destination", () => {
    expect(route).toContain("reglePubliieParSlug(corps.destination)");
    expect(route).toMatch(/Cette destination n'est pas ouverte en ce moment/u);
  });

  it("l'écran envoie la destination et plus l'identifiant", () => {
    expect(ecran).toMatch(/corps: \{ destination,/u);
    expect(ecran).not.toMatch(/visaRuleId/u);
  });
});
