import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

describe("Input", () => {
  it("expose toujours un libellé visible relié au champ", () => {
    render(<Input libelle="Numéro de passeport" aide="Tel qu'il figure sur la page photo." />);
    const champ = screen.getByLabelText("Numéro de passeport");
    expect(champ).toBeDefined();
    expect(screen.getByText("Tel qu'il figure sur la page photo.")).toBeDefined();
  });

  it("remplace l'aide par l'erreur, il ne l'ajoute pas", () => {
    render(
      <Input
        libelle="Numéro de passeport"
        aide="Tel qu'il figure sur la page photo."
        erreur="Il manque 4 caractères. Format attendu : 2 lettres puis 7 chiffres."
      />,
    );
    expect(screen.queryByText("Tel qu'il figure sur la page photo.")).toBeNull();
    const champ = screen.getByLabelText("Numéro de passeport");
    expect(champ).toHaveAttribute("aria-invalid", "true");
    const idDescription = champ.getAttribute("aria-describedby");
    expect(document.getElementById(idDescription as string)?.textContent).toContain(
      "Format attendu",
    );
  });

  it("reste lisible et porte sa valeur une fois désactivé", () => {
    render(<Input libelle="Numéro de passeport" value="AB1234567" readOnly disabled />);
    const champ = screen.getByLabelText("Numéro de passeport");
    expect(champ).toBeDisabled();
    expect(champ).toHaveValue("AB1234567");
  });

  it("prend le focus au clavier", () => {
    render(<Input libelle="Numéro de passeport" />);
    const champ = screen.getByLabelText("Numéro de passeport");
    champ.focus();
    expect(document.activeElement).toBe(champ);
  });
});

describe("Select", () => {
  const OPTIONS = [
    { valeur: "nl", libelle: "Pays-Bas" },
    { valeur: "ca", libelle: "Canada" },
    { valeur: "de", libelle: "Allemagne", desactivee: true },
  ];

  it("rend ses options et son libellé", () => {
    render(<Select libelle="Pays de destination" options={OPTIONS} defaultValue="nl" />);
    expect(screen.getByLabelText("Pays de destination")).toBeDefined();
    expect(screen.getByRole("option", { name: "Canada" })).toBeDefined();
  });

  it("désactive l'option indisponible et le champ entier", () => {
    render(<Select libelle="Pays de destination" options={OPTIONS} disabled />);
    expect(screen.getByLabelText("Pays de destination")).toBeDisabled();
    expect(screen.getByRole("option", { name: "Allemagne" })).toBeDisabled();
  });

  it("prend le focus au clavier", () => {
    render(<Select libelle="Pays de destination" options={OPTIONS} />);
    const champ = screen.getByLabelText("Pays de destination");
    champ.focus();
    expect(document.activeElement).toBe(champ);
  });
});
