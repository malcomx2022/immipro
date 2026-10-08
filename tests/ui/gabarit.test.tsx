import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
// Composant serveur asynchrone depuis la revue M14 (D-19) : jsdom ne le
// rend pas. Il est éprouvé seul, dans `tests/liens-juridiques.test.tsx`.
vi.mock("@/components/juridique/LiensJuridiques", () => ({ LiensJuridiques: () => null }));
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
        /n'est pas un cabinet de conseil en immigration et ne dépose aucun dossier à ta place/,
      ),
    ).toBeDefined();
  });

  it("classe ses liens en colonnes nommées, et n'en promet aucune vide", () => {
    // Le nombre de colonnes n'est pas la propriété : c'est qu'aucune ne
    // soit anonyme, et qu'aucune ne soit là sans lien. Le pied de page a
    // perdu « Société » et « Légal » le jour où l'on a vu que leurs six
    // adresses répondaient 404 (annexe Q) ; figer « quatre » aurait fait
    // échouer la correction plutôt que le défaut.
    const { container } = render(<Footer />);
    const colonnes = [...container.querySelectorAll("nav[aria-label]")];
    expect(colonnes.length).toBeGreaterThan(0);
    for (const colonne of colonnes) {
      expect(colonne.getAttribute("aria-label")).toBeTruthy();
      expect(colonne.querySelectorAll("a").length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("navigation", { name: "Destinations" })).toBeDefined();
  });
});

/**
 * La navigation publique sous 768 px — revue du 07/10/2026, M13 (D-18).
 * Elle était masquée : il fallait descendre au pied de page.
 */
describe("Header — le menu mobile", () => {
  it("un bouton « Menu », fermé, qui annonce un dialogue", () => {
    render(<Header />);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu).toHaveAttribute("aria-haspopup", "dialog");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu.className).toContain("md:hidden");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ouvre une feuille avec les trois entrées, l'inscription et une sortie", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const feuille = screen.getByRole("dialog", { name: "Menu" });
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "true");
    const liens = within(within(feuille).getByRole("navigation")).getAllByRole("link");
    expect(liens.map((l) => l.textContent)).toEqual(["Destinations", "Tarifs", "Guides pays"]);
    expect(within(feuille).getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/inscription");
    expect(within(feuille).getByRole("button", { name: "Fermer le menu" })).toBeDefined();
  });

  it("Échap ferme et rend le focus au bouton", () => {
    render(<Header />);
    const menu = screen.getByRole("button", { name: "Menu" });
    menu.focus();
    fireEvent.click(menu);
    expect(screen.getByRole("dialog")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it("« Fermer le menu » et le choix d'un lien ferment la feuille", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer le menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Créer un compte" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
