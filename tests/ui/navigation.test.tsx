import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let chemin = "/";
vi.mock("next/navigation", () => ({ usePathname: () => chemin }));

import { Header } from "@/components/layout/Header";
import { BarreAdmin } from "@/components/admin/BarreAdmin";
import { LienDeNavigation } from "@/components/layout/LienDeNavigation";

/**
 * Les barres disent où l'on est — règle clavier 11 ; revue du 07/10/2026,
 * M12. Aucune ne portait `aria-current`.
 */
describe("LienDeNavigation", () => {
  beforeEach(() => {
    chemin = "/";
  });

  it("aria-current=page et le style actif sur la page même", () => {
    chemin = "/profil";
    render(
      <LienDeNavigation href="/profil" className="text-ink-700">
        Profil
      </LienDeNavigation>,
    );
    const lien = screen.getByRole("link", { name: "Profil" });
    expect(lien).toHaveAttribute("aria-current", "page");
    expect(lien.className).toContain("text-accent-700");
    expect(lien.className).not.toContain("text-ink-700");
  });

  it("aria-current=true dans une section rattachée (D-17)", () => {
    chemin = "/services";
    render(
      <LienDeNavigation href="/tableau-de-bord" sections={["/services"]}>
        Dossiers
      </LienDeNavigation>,
    );
    expect(screen.getByRole("link", { name: "Dossiers" })).toHaveAttribute("aria-current", "true");
  });

  it("rien ailleurs", () => {
    chemin = "/comparateur";
    render(<LienDeNavigation href="/profil">Profil</LienDeNavigation>);
    expect(screen.getByRole("link", { name: "Profil" })).not.toHaveAttribute("aria-current");
  });
});

describe("les barres de navigation", () => {
  it("la barre publique allume l'entrée de la page", () => {
    chemin = "/guides/canada";
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    const courants = [...nav.querySelectorAll("[aria-current]")].map((l) => l.textContent);
    expect(courants).toEqual(["Guides pays"]);
  });

  it("le back-office allume la veille sur la fiche d'une règle", () => {
    chemin = "/regles/r-1";
    render(
      <BarreAdmin nom="Awa Koffi" role="Administration" initialesAffichees="AK">
        <p>contenu</p>
      </BarreAdmin>,
    );
    expect(screen.getByRole("link", { name: "Veille réglementaire" })).toHaveAttribute("aria-current", "true");
  });

  it("le gabarit dossier passe ses deux navigations par LienDeNavigation", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/(app)/(dossier)/layout.tsx", "utf8");
    expect(src.match(/<LienDeNavigation/gu)).toHaveLength(2);
    expect(src).toContain("NAVIGATION_CANDIDAT");
  });
});
