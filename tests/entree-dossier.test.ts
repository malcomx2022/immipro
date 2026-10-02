import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lienOuvrirUnDossier } from "@/domain/comptes/entree-dossier";

/**
 * « Ouvrir un dossier » menait à `/inscription` même pour un candidat
 * connecté — relevé en test le 02/10/2026.
 */
describe("Entrée dans un dossier depuis les pages publiques", () => {
  it("un visiteur va à l'inscription", () => {
    expect(lienOuvrirUnDossier(false, "pays-bas-etudes")).toBe("/inscription");
  });

  it("un candidat connecté va à l'ouverture, sur la destination choisie", () => {
    expect(lienOuvrirUnDossier(true, "pays-bas-etudes")).toBe(
      "/dossiers/nouveau?destination=pays-bas-etudes",
    );
    expect(lienOuvrirUnDossier(true)).toBe("/dossiers/nouveau");
    expect(lienOuvrirUnDossier(true, "a b&c")).toBe("/dossiers/nouveau?destination=a%20b%26c");
  });

  it.each([
    "src/app/(public)/resultats/Resultats.tsx",
    "src/app/(public)/destinations/[slug]/page.tsx",
  ])("%s ne code plus l'inscription en dur", (chemin) => {
    const source = readFileSync(chemin, "utf8");
    expect(source).not.toMatch(/href="\/inscription"/);
    expect(source).toContain("lienOuvrirUnDossier(");
  });

  it("les deux pages lisent la session côté serveur", () => {
    for (const chemin of [
      "src/app/(public)/resultats/page.tsx",
      "src/app/(public)/destinations/[slug]/page.tsx",
    ]) {
      expect(readFileSync(chemin, "utf8")).toContain("acteurCourant()");
    }
  });
});

describe("Correction de l'adresse — A-03", () => {
  const route = readFileSync("src/app/api/comptes/adresse/route.ts", "utf8");
  const acces = readFileSync("src/server/acces/comptes.ts", "utf8");

  it("la route est réservée au candidat connecté et limitée comme un geste sensible", () => {
    expect(route).toMatch(/acces: "candidat"/);
    expect(route).toMatch(/limite: "sensible"/);
  });

  it("la même réponse sort que l'adresse soit libre ou prise", () => {
    const retours = route.match(/return [^;]+;/g) ?? [];
    expect(retours).toEqual(["return { email: issue.email };"]);
  });

  it("le mot de passe est vérifié, et une adresse vérifiée ne se change pas ici", () => {
    const corps = acces.slice(acces.indexOf("export async function corrigerLAdresse"));
    const fin = corps.indexOf("\n}\n");
    const fonction = corps.slice(0, fin);
    expect(fonction).toContain("correspond(motDePasse");
    expect(fonction).toContain("user.emailVerified");
    // Le mot de passe est vérifié avant toute autre réponse.
    expect(fonction.indexOf("correspond(motDePasse")).toBeLessThan(fonction.indexOf("user.emailVerified"));
    expect(fonction).toContain('emettreUnCode(userId, "VERIFICATION_EMAIL")');
  });
});
