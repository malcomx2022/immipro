import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

function Hote() {
  const [ouverte, setOuverte] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOuverte(true)}>
        Objectif
      </button>
      <BottomSheet ouverte={ouverte} titre="Objectif" onFermer={() => setOuverte(false)}>
        <button type="button">Étudier</button>
        <button type="button">Travailler</button>
      </BottomSheet>
    </div>
  );
}

describe("BottomSheet", () => {
  it("est une boîte de dialogue modale titrée", () => {
    render(
      <BottomSheet ouverte titre="Objectif" onFermer={() => {}}>
        <button type="button">Étudier</button>
      </BottomSheet>,
    );
    const feuille = screen.getByRole("dialog");
    expect(feuille).toHaveAttribute("aria-modal", "true");
    expect(feuille).toHaveAccessibleName("Objectif");
  });

  it("ne rend rien tant qu'elle est fermée", () => {
    render(
      <BottomSheet ouverte={false} titre="Objectif" onFermer={() => {}}>
        <button type="button">Étudier</button>
      </BottomSheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ferme sur Échap, sans rien valider (règle clavier 5)", () => {
    const fermer = vi.fn();
    render(
      <BottomSheet ouverte titre="Objectif" onFermer={fermer}>
        <button type="button">Étudier</button>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(fermer).toHaveBeenCalledOnce();
  });

  it("prend le focus à l'ouverture et le rend au déclencheur (règle clavier 8)", () => {
    render(<Hote />);
    const declencheur = screen.getByRole("button", { name: "Objectif" });
    declencheur.focus();
    fireEvent.click(declencheur);

    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(declencheur);
  });

  it("enferme la tabulation dans la feuille", () => {
    render(
      <BottomSheet ouverte titre="Objectif" onFermer={() => {}}>
        <button type="button">Étudier</button>
        <button type="button">Travailler</button>
      </BottomSheet>,
    );
    const premier = screen.getByRole("button", { name: "Étudier" });
    const dernier = screen.getByRole("button", { name: "Travailler" });

    dernier.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(premier);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dernier);
  });
});
