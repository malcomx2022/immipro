import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Checkbox } from "@/components/ui/Checkbox";
import { BasculeDeDevise } from "@/components/ui/BasculeDeDevise";
import { useState } from "react";
import type { Devise } from "@/domain/payments/pricing";

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

/**
 * La bascule de devise des tarifs et du choix du pack — revue du
 * 07/10/2026, M12. Deux copies déclarées `radiogroup`, sans le clavier :
 * deux arrêts de tabulation, aucune flèche.
 */
describe("BasculeDeDevise", () => {
  function Bascule({ devises = ["XOF", "EUR"] as Devise[] }) {
    const [devise, setDevise] = useState<Devise>("XOF");
    return <BasculeDeDevise devises={devises} devise={devise} onChangement={setDevise} />;
  }

  it("un seul arrêt de tabulation, sur la devise retenue", () => {
    render(<Bascule />);
    const groupe = screen.getByRole("radiogroup", { name: "Devise d'affichage" });
    expect(groupe).toBeDefined();
    const tabulables = screen.getAllByRole("radio").filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabulables).toHaveLength(1);
    expect(tabulables[0]).toHaveAccessibleName("Francs CFA");
  });

  it("les flèches, Origine et Fin changent la devise et suivent le focus", () => {
    render(<Bascule />);
    const cfa = screen.getByRole("radio", { name: "Francs CFA" });
    const euros = screen.getByRole("radio", { name: "Euros" });
    fireEvent.keyDown(cfa, { key: "ArrowRight" });
    expect(euros).toBeChecked();
    expect(euros).toHaveFocus();
    expect(euros).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(euros, { key: "Home" });
    expect(cfa).toBeChecked();
    fireEvent.keyDown(cfa, { key: "End" });
    expect(euros).toBeChecked();
    fireEvent.keyDown(euros, { key: "ArrowRight" });
    expect(cfa).toBeChecked();
  });

  it("une seule devise ouverte : une seule option", () => {
    render(<Bascule devises={["XOF"]} />);
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });
});
