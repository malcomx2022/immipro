import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

describe("Button", () => {
  it("rend son libellé et déclenche l'action", () => {
    const clic = vi.fn();
    render(<Button onClick={clic}>Continuer</Button>);
    const bouton = screen.getByRole("button", { name: "Continuer" });
    bouton.click();
    expect(clic).toHaveBeenCalledOnce();
  });

  it("désactive réellement le bouton, pas seulement à l'œil", () => {
    const clic = vi.fn();
    render(
      <Button disabled onClick={clic}>
        Continuer
      </Button>,
    );
    const bouton = screen.getByRole("button", { name: "Continuer" });
    expect(bouton).toBeDisabled();
    bouton.click();
    expect(clic).not.toHaveBeenCalled();
  });

  it("accompagne le désactivé de sa raison, reliée au bouton", () => {
    render(
      <Button disabled raisonDesactivation="Choisissez une destination d'abord.">
        Continuer
      </Button>,
    );
    const bouton = screen.getByRole("button", { name: "Continuer" });
    const idRaison = bouton.getAttribute("aria-describedby");
    expect(idRaison).toBeTruthy();
    expect(document.getElementById(idRaison as string)?.textContent).toBe(
      "Choisissez une destination d'abord.",
    );
  });

  it("garde le libellé écrit pendant le chargement", () => {
    render(<Button chargement>Continuer</Button>);
    const bouton = screen.getByRole("button", { name: "Continuer" });
    expect(bouton).toHaveAttribute("aria-busy", "true");
    expect(bouton).toBeDisabled();
  });

  it("prend le focus au clavier", () => {
    render(<Button>Continuer</Button>);
    const bouton = screen.getByRole("button", { name: "Continuer" });
    bouton.focus();
    expect(document.activeElement).toBe(bouton);
  });
});

describe("cn et l'échelle de tailles fermée", () => {
  it("garde la taille du bouton quand une couleur de texte suit", () => {
    // `tailwind-merge` prenait `text-16` pour une couleur et le supprimait :
    // le bouton primaire perdait sa taille au profit de `text-white`.
    expect(cn("text-16", "text-white")).toContain("text-16");
    expect(cn("text-16", "text-white")).toContain("text-white");
  });

  it("remplace bien une taille par une autre", () => {
    expect(cn("text-16", "text-14")).toBe("text-14");
  });

  it("le bouton primaire rendu porte sa taille et sa couleur", () => {
    render(<Button>Continuer</Button>);
    const classes = screen.getByRole("button", { name: "Continuer" }).className;
    expect(classes).toContain("text-16");
    expect(classes).toContain("text-white");
  });
});
