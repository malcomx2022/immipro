import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Simulateur } from "@/app/(public)/simulateur/Simulateur";
import { Resultats } from "@/app/(public)/resultats/Resultats";
import { Tarifs } from "@/app/(public)/tarifs/Tarifs";
import { AccueilSimulateur } from "@/app/(public)/AccueilSimulateur";
import { PACKS, RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

const pousser = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pousser(url) }),
}));

beforeEach(() => {
  pousser.mockClear();
  window.sessionStorage.clear();
});

describe("P-02 — Simulateur", () => {
  it("pose la première question et son aide", () => {
    render(<Simulateur />);
    expect(
      screen.getByRole("heading", { name: "Quel est ton objectif ?" }),
    ).toBeDefined();
    expect(screen.getByText(/Tu pourras changer de destination/)).toBeDefined();
    expect(screen.getByText("1 / 6")).toBeDefined();
  });

  it("n'autorise pas de continuer sans réponse, et dit pourquoi", () => {
    render(<Simulateur />);
    const continuer = screen.getByRole("button", { name: "Continuer" });
    expect(continuer).toBeDisabled();
    expect(continuer).toHaveAccessibleDescription(
      "Choisissez une réponse pour continuer.",
    );
  });

  it("marque la réponse retenue par aria-checked", () => {
    render(<Simulateur />);
    fireEvent.click(screen.getByRole("radio", { name: /Étudier/ }));
    expect(screen.getByRole("radio", { name: /Étudier/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });

  it("déplace le focus sur le titre à chaque étape (règle clavier 7)", async () => {
    render(<Simulateur />);
    // Au premier rendu le focus ne bouge pas (règle clavier 6).
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(screen.getByRole("radio", { name: /Étudier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => {
      const titre = screen.getByRole("heading", {
        name: "Quel est ton plus haut diplôme obtenu ?",
      });
      expect(document.activeElement).toBe(titre);
      expect(titre).toHaveAttribute("tabindex", "-1");
    });
  });

  it("garde les réponses le temps de la session, et pas au-delà", () => {
    const { unmount } = render(<Simulateur />);
    fireEvent.click(screen.getByRole("radio", { name: /Travailler/ }));
    unmount();

    render(<Simulateur />);
    expect(screen.getByRole("radio", { name: /Travailler/ })).toBeChecked();

    window.sessionStorage.clear();
    unmount();
  });

  it("mène aux résultats depuis la dernière question", async () => {
    render(<Simulateur />);
    for (let i = 0; i < 6; i++) {
      const choix = screen.getAllByRole("radio")[0];
      fireEvent.click(choix as HTMLElement);
      const suite = screen.getByRole("button", {
        name: i === 5 ? "Voir mes destinations" : "Continuer",
      });
      fireEvent.click(suite);
    }
    await waitFor(() => expect(pousser).toHaveBeenCalledWith("/resultats"));
  });
});

describe("P-01 — bloc de départ du simulateur", () => {
  it("ouvre une feuille du bas par champ et enregistre la réponse", async () => {
    render(<AccueilSimulateur />);
    const champ = screen.getByRole("button", { name: /Objectif/ });
    fireEvent.click(champ);

    const feuille = await screen.findByRole("dialog");
    expect(feuille).toHaveAccessibleName("Quel est ton objectif ?");

    fireEvent.click(screen.getByRole("button", { name: "Étudier" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Étudier/ })).toBeDefined();
  });
});

describe("P-03 — Résultats", () => {
  it("montre son état vide quand rien n'a été répondu, avec la reprise", async () => {
    render(<Resultats />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Aucune réponse à classer pour le moment" }),
      ).toBeDefined(),
    );
    expect(screen.getByRole("link", { name: "Lancer le simulateur" })).toHaveAttribute(
      "href",
      "/simulateur",
    );
  });

  it("classe les destinations et nomme le motif de chaque écartée", async () => {
    window.sessionStorage.setItem(
      "immipro.simulation",
      JSON.stringify({ objectif: "Étudier", budget: "8 à 12 millions F" }),
    );
    render(<Resultats />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Trois destinations correspondent à ton profil",
        }),
      ).toBeDefined(),
    );
    expect(screen.getByText("Étudier, 8 à 12 millions F")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Pays-Bas" })).toBeDefined();
    expect(screen.getByText(/Campagne Campus France close/)).toBeDefined();
    expect(screen.getByText(/il ne prédit aucune décision/)).toBeDefined();
  });

  it("n'annonce aucune décision de l'administration", async () => {
    window.sessionStorage.setItem(
      "immipro.simulation",
      JSON.stringify({ objectif: "Étudier" }),
    );
    const { container } = render(<Resultats />);
    await waitFor(() => expect(screen.queryAllByRole("heading").length).toBeGreaterThan(0));
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/probabilit/i);
    expect(texte).not.toMatch(/garanti/i);
  });
});

describe("P-06 — Tarifs", () => {
  it("affiche les montants du domaine, dans la grille en francs CFA", () => {
    const { container } = render(<Tarifs />);
    expect(screen.getByRole("radio", { name: "Francs CFA" })).toBeChecked();
    // Les prix de l'écran sont ceux de pricing.ts, pas une copie.
    for (const pack of PACKS) {
      expect(container.textContent).toContain(formatMontant(pack.prix.XOF, "XOF"));
    }
    expect(container.textContent).toContain(
      formatMontant(RECHARGE_ANALYSES.prix.XOF, "XOF"),
    );
  });

  it("bascule sur la grille en euros sans annoncer de taux de change", () => {
    const { container } = render(<Tarifs />);
    fireEvent.click(screen.getByRole("radio", { name: "Euros" }));
    expect(screen.getByRole("radio", { name: "Euros" })).toBeChecked();
    const texte = container.textContent ?? "";
    expect(texte).toContain("aucun montant n'est la conversion de l'autre");
    expect(texte).not.toMatch(/taux de change/i);
  });

  it("met en avant le seul pack que le domaine désigne", () => {
    render(<Tarifs />);
    expect(screen.getAllByText("Le plus choisi")).toHaveLength(1);
  });

  it("dit que les frais versés à l'administration ne passent pas par ImmiPro", () => {
    const { container } = render(<Tarifs />);
    expect(container.textContent).toContain(
      "ne sont pas inclus et ne passent jamais par ImmiPro",
    );
  });
});
