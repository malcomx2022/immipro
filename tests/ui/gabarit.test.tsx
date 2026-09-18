import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkipLink } from "@/components/layout/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

describe("SkipLink", () => {
  it("pointe la cible et reste masqué jusqu'au focus (règle clavier 2)", () => {
    render(<SkipLink cible="contenu" />);
    const lien = screen.getByRole("link", { name: "Aller au contenu" });
    expect(lien).toHaveAttribute("href", "#contenu");
    expect(lien.className).toContain("sr-only");
    expect(lien.className).toContain("focus:not-sr-only");
  });

  it("sert aussi le second saut vers l'action (règle clavier 12)", () => {
    render(<SkipLink cible="action-c06">Aller à l&apos;action</SkipLink>);
    expect(screen.getByRole("link", { name: "Aller à l'action" })).toHaveAttribute(
      "href",
      "#action-c06",
    );
  });

  it("prend le focus au clavier", () => {
    render(<SkipLink cible="contenu" />);
    const lien = screen.getByRole("link", { name: "Aller au contenu" });
    lien.focus();
    expect(document.activeElement).toBe(lien);
  });
});

describe("Header", () => {
  it("rend la navigation principale et les accès au compte", () => {
    render(<Header />);
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Tarifs" })).toHaveAttribute("href", "/tarifs");
    expect(screen.getByRole("link", { name: "Connexion" })).toBeDefined();
  });
});

describe("Footer", () => {
  it("porte la mention de périmètre sur tous les écrans publics (INV-1, INV-2)", () => {
    render(<Footer />);
    expect(
      screen.getByText(
        /n'est pas un cabinet de conseil en immigration et ne dépose aucun dossier à votre place/,
      ),
    ).toBeDefined();
  });

  it("classe ses liens en quatre colonnes nommées", () => {
    render(<Footer />);
    for (const titre of ["Destinations", "Produit", "Société", "Légal"]) {
      expect(screen.getByRole("navigation", { name: titre })).toBeDefined();
    }
  });
});
