// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PHOTOS, photoDuPays, photoEditoriale } from "@/lib/photographies";

describe("Bibliothèque photographique validée S.179", () => {
  it.each([
    ["NL", PHOTOS.paysBas],
    ["CH", PHOTOS.suisse],
  ] as const)("associe explicitement %s", (code, attendu) => {
    expect(photoDuPays(code)).toBe(attendu);
  });
  it.each(["FR", "AE", "", "__proto__", "constructor"])(
    "ne fabrique pas d'image pour %s",
    (code) => {
      expect(photoDuPays(code)).toBeUndefined();
      expect(photoEditoriale("ARTICLE", code)).toBeUndefined();
    },
  );
  it("distingue un guide pays d'un article et ne devine pas un nouveau sujet", () => {
    expect(photoEditoriale("GUIDE", "suisse")).toBe(PHOTOS.suisse);
    expect(photoEditoriale("GUIDE", "pays-bas")).toBe(PHOTOS.paysBas);
    expect(photoEditoriale("ARTICLE", "pays-bas")).toBeUndefined();
    expect(photoEditoriale("ARTICLE", "releve-bancaire-quatre-mois")).toBe(PHOTOS.preparation);
    expect(photoEditoriale("ARTICLE", "relire-ses-documents")).toBe(PHOTOS.accompagnement);
    expect(photoEditoriale("ARTICLE", "nouvelle-actualite")).toBeUndefined();
  });
  it("toutes les variantes sont locales, livrées en WebP et respectent leur budget", () => {
    for (const photo of Object.values(PHOTOS)) {
      expect(photo.alt.trim().length).toBeGreaterThan(20);
      for (const format of ["bureau", "mobile", "vignette"] as const) {
        const url = photo[format];
        expect(url).toMatch(/^\/photos\/[a-z-]+\.webp$/u);
        const fichier = `public${url}`;
        const contenu = readFileSync(fichier);
        expect(contenu.subarray(0, 4).toString()).toBe("RIFF");
        expect(contenu.subarray(8, 12).toString()).toBe("WEBP");
        expect(statSync(fichier).size).toBeLessThan(format === "vignette" ? 24_000 : 120_000);
      }
    }
  });
});

describe("Protection du serveur de recette", () => {
  it.each(["", "postgresql://recette:recette@serveur-distant.test/immipro"])(
    "refuse la configuration non locale avant le lancement du banc : %s",
    (url) => {
      const r = spawnSync(process.execPath, ["--import", "tsx", resolve("playwright.config.ts")], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: url },
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("serveur PostgreSQL de recette sur la boucle locale");
    },
  );
});
