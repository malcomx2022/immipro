import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const lire = vi.fn();
vi.mock("@/server/juridique/cache", () => ({
  liensJuridiquesPublies: () => lire(),
  ETIQUETTE_TEXTES_JURIDIQUES: "textes-juridiques",
}));

import { LiensJuridiques } from "@/components/juridique/LiensJuridiques";

/**
 * Liens juridiques chargés côté client — revue du 07/10/2026, M14 (D-19 :
 * servis dans le HTML, revalidés toutes les cinq minutes).
 */
describe("LiensJuridiques, rendu serveur", () => {
  afterEach(() => lire.mockReset());

  it("rend les pages publiées, dans le HTML, sans attendre le navigateur", async () => {
    lire.mockResolvedValue([
      { adresse: "/conditions", titre: "Conditions générales d'utilisation" },
      { adresse: "/donnees-personnelles", titre: "Politique de confidentialité" },
    ]);
    render((await LiensJuridiques())!);
    const nav = screen.getByRole("navigation", { name: "Informations légales" });
    expect(nav.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Conditions générales d'utilisation" })).toHaveAttribute("href", "/conditions");
  });

  it("aucune page publiée : rien n'est promis", async () => {
    lire.mockResolvedValue([]);
    expect(await LiensJuridiques()).toBeNull();
  });

  it("une lecture qui échoue ne casse pas la page : rien n'est rendu, la cause va au journal", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    lire.mockRejectedValue(new Error("base injoignable"));
    expect(await LiensJuridiques()).toBeNull();
    expect(journal).toHaveBeenCalledWith("[juridique] liens du pied de page non lus", "base injoignable");
    journal.mockRestore();
  });
});

describe("le mécanisme", () => {
  it("le composant n'est plus client et ne demande plus rien au navigateur", () => {
    const src = readFileSync("src/components/juridique/LiensJuridiques.tsx", "utf8");
    expect(src).not.toContain('"use client"');
    expect(src).not.toMatch(/fetch\(|useEffect/u);
  });

  it("le cache est étiqueté et revalidé à cinq minutes, et la validation l'invalide", () => {
    const cache = readFileSync("src/server/juridique/cache.ts", "utf8");
    expect(cache).toMatch(/unstable_cache\(/u);
    expect(cache).toMatch(/tags: \[ETIQUETTE_TEXTES_JURIDIQUES\], revalidate: REVALIDATION_LIENS_JURIDIQUES_S/u);
    expect(cache).toMatch(/REVALIDATION_LIENS_JURIDIQUES_S = 300/u);
    for (const route of [
      "src/app/api/admin/textes-juridiques/[page]/validation/route.ts",
      "src/app/api/admin/textes-juridiques/variables/route.ts",
    ]) {
      expect(readFileSync(route, "utf8"), route).toContain("revalidateTag(ETIQUETTE_TEXTES_JURIDIQUES)");
    }
    // Hors de Next, l'invalidation n'a pas de sens : l'écriture ne la fait pas.
    expect(readFileSync("src/server/juridique/ecriture.ts", "utf8")).not.toContain("revalidateTag");
  });

  it("ce qui enregistre une version acceptée lit la base en direct, pas le cache", () => {
    for (const f of ["src/app/(auth)/inscription/page.tsx", "src/app/sitemap.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toContain("liensJuridiquesPublies");
    }
  });
});
