import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LienNouvelOnglet, MENTION_NOUVEL_ONGLET } from "@/components/ui/LienNouvelOnglet";

/**
 * Un lien qui ouvre un nouvel onglet le dit — revue du 07/10/2026, F8
 * (D-21 : la mention est réservée aux lecteurs d'écran).
 */
describe("LienNouvelOnglet", () => {
  it("son nom accessible annonce le nouvel onglet, sans changer ce qu'on voit", () => {
    render(<LienNouvelOnglet href="/conditions">Conditions générales</LienNouvelOnglet>);
    const lien = screen.getByRole("link", { name: "Conditions générales (s'ouvre dans un nouvel onglet)" });
    expect(lien).toHaveAttribute("target", "_blank");
    expect(lien).toHaveAttribute("rel", "noopener");
    expect(lien.querySelector(".sr-only")?.textContent).toBe(MENTION_NOUVEL_ONGLET);
  });

  it("un rel plus fort se passe en propriété", () => {
    render(
      <LienNouvelOnglet href="https://exemple.invalid" rel="noopener noreferrer sponsored">
        Partenaire
      </LienNouvelOnglet>,
    );
    expect(screen.getByRole("link", { name: /Partenaire/u })).toHaveAttribute("rel", "noopener noreferrer sponsored");
  });
});

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (nom.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

describe("aucun nouvel onglet muet", () => {
  it("tout target=\"_blank\" de l'interface passe par LienNouvelOnglet ou porte la mention", () => {
    const muets = fichiers("src")
      .filter((f) => !f.endsWith("LienNouvelOnglet.tsx"))
      .filter((f) => {
        const source = readFileSync(f, "utf8");
        return /target="_blank"/u.test(source) && !/MENTION_NOUVEL_ONGLET/u.test(source);
      });
    expect(muets).toEqual([]);
  });

  it("et a un rel", () => {
    for (const f of fichiers("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/target="_blank"[\s\S]{0,200}?>/gu)) {
        if (f.endsWith("LienNouvelOnglet.tsx")) continue;
        expect(m[0], f).toMatch(/rel=/u);
      }
    }
  });
});
