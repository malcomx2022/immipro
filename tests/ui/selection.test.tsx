import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Checkbox } from "@/components/ui/Checkbox";

const PACKS = [
  { valeur: "essentiel", libelle: "Pack Essentiel" },
  { valeur: "dossier", libelle: "Pack Dossier" },
  {
    valeur: "premium",
    libelle: "Pack Premium",
    description: "Indisponible pour cette destination.",
    desactivee: true,
  },
];

describe("RadioGroup", () => {
  it("rend un seul arrêt de tabulation pour tout le groupe (règle clavier 4)", () => {
    render(
      <RadioGroup
        libelle="Choix du pack"
        options={PACKS}
        valeur="essentiel"
        onChangement={() => {}}
      />,
    );
    const tabulables = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabulables).toHaveLength(1);
    expect(tabulables[0]).toHaveAccessibleName("Pack Essentiel");
  });

  it("porte aria-checked sur l'option retenue", () => {
    render(
      <RadioGroup
        libelle="Choix du pack"
        options={PACKS}
        valeur="dossier"
        onChangement={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: "Pack Dossier" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pack Essentiel" })).not.toBeChecked();
  });

  it("change la sélection aux flèches et saute l'option indisponible", () => {
    const change = vi.fn();
    render(
      <RadioGroup
        libelle="Choix du pack"
        options={PACKS}
        valeur="dossier"
        onChangement={change}
      />,
    );
    const groupe = screen.getByRole("radiogroup");
    fireEvent.keyDown(groupe, { key: "ArrowDown" });
    // Après « Pack Dossier », « Pack Premium » est indisponible : on revient au premier.
    expect(change).toHaveBeenCalledWith("essentiel");

    change.mockClear();
    fireEvent.keyDown(groupe, { key: "End" });
    expect(change).toHaveBeenCalledWith("dossier");
  });

  it("désactive vraiment l'option indisponible, sans masquer sa raison", () => {
    render(
      <RadioGroup
        libelle="Choix du pack"
        options={PACKS}
        valeur="essentiel"
        onChangement={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: /Pack Premium/ })).toBeDisabled();
    expect(screen.getByText("Indisponible pour cette destination.")).toBeDefined();
  });

  it("prend le focus au clavier sur l'option retenue", () => {
    render(
      <RadioGroup
        libelle="Choix du pack"
        options={PACKS}
        valeur="essentiel"
        onChangement={() => {}}
      />,
    );
    const retenue = screen.getByRole("radio", { name: "Pack Essentiel" });
    retenue.focus();
    expect(document.activeElement).toBe(retenue);
  });
});

describe("Checkbox", () => {
  it("n'est jamais pré-cochée : l'état vient de l'appelant", () => {
    render(
      <Checkbox
        libelle="J'accepte le traitement de mes pièces d'identité"
        checked={false}
        onChangement={() => {}}
      />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("remonte la coche", () => {
    const change = vi.fn();
    render(<Checkbox libelle="Rappels par courriel" checked={false} onChangement={change} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(change).toHaveBeenCalledWith(true);
  });

  it("désactive réellement et relie son erreur", () => {
    const { rerender } = render(
      <Checkbox libelle="Rappels par SMS" checked={false} onChangement={() => {}} disabled />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();

    rerender(
      <Checkbox
        libelle="Consentement requis"
        checked={false}
        onChangement={() => {}}
        erreur="À accepter pour transmettre le dossier."
      />,
    );
    const case_ = screen.getByRole("checkbox");
    expect(case_).toHaveAttribute("aria-invalid", "true");
    expect(case_).toHaveAccessibleDescription("À accepter pour transmettre le dossier.");
  });

  it("prend le focus au clavier", () => {
    render(<Checkbox libelle="Rappels par courriel" checked={false} onChangement={() => {}} />);
    const case_ = screen.getByRole("checkbox");
    case_.focus();
    expect(document.activeElement).toBe(case_);
  });
});
