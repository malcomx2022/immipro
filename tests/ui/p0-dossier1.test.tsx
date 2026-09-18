import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PageTableauDeBord from "@/app/(app)/(dossier)/tableau-de-bord/page";
import PageComparateur from "@/app/(app)/(dossier)/comparateur/page";
import { Profil } from "@/app/(app)/(dossier)/profil/Profil";
import { FicheDetaillee } from "@/app/(app)/(dossier)/fiches/[slug]/FicheDetaillee";
import { OuvertureDossier } from "@/app/(app)/(dossier)/dossiers/nouveau/OuvertureDossier";
import { PAYS_BAS } from "@/lib/contenu/destinations";
import { DOSSIERS } from "@/lib/contenu/dossiers";
import { LIBELLE_PALIER } from "@/domain/completeness/score";

const parametres = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => parametres,
  notFound: () => {
    throw new Error("notFound");
  },
}));

beforeEach(() => {
  for (const cle of [...parametres.keys()]) parametres.delete(cle);
});

describe("C-01 — Tableau de bord", () => {
  it("affiche un palier nommé par dossier, jamais une note", () => {
    const { container } = render(<PageTableauDeBord />);
    for (const d of DOSSIERS) {
      expect(screen.getAllByText(LIBELLE_PALIER[d.completude.palier]).length).toBeGreaterThan(0);
    }
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/\d\s?\/\s?100/);
    expect(texte).not.toMatch(/\d\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
  });

  it("donne une seule prochaine action par dossier", () => {
    render(<PageTableauDeBord />);
    for (const d of DOSSIERS) {
      expect(screen.getByText(`Prochaine action : ${d.prochaineAction}`)).toBeDefined();
    }
  });

  it("résume la journée en comptant ce qu'il reste à reprendre", () => {
    render(<PageTableauDeBord />);
    expect(screen.getByText(/dossiers ouverts, .* à réunir/)).toBeDefined();
  });

  it("porte l'alerte de changement de règle avec ce qu'elle implique", () => {
    const { container } = render(<PageTableauDeBord />);
    expect(container.textContent).toContain("Ton dossier n'est pas encore concerné");
  });
});

describe("C-02 — Profil", () => {
  it("compte les champs restants au lieu d'afficher une part", () => {
    const { container } = render(<Profil />);
    expect(screen.getByText(/Il manque \d champ/)).toBeDefined();
    expect(container.textContent).not.toMatch(/\d\s?%/);
  });

  it("met le décompte à jour à la frappe, dans une région vivante", () => {
    render(<Profil />);
    const avant = screen.getByText(/Il manque 3 champs/);
    expect(avant.closest("[aria-live='polite']")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Niveau d'anglais attesté"), {
      target: { value: "B2" },
    });
    expect(screen.getByText(/Il manque 2 champs/)).toBeDefined();
  });

  it("dit que rien n'est transmis à une administration", () => {
    const { container } = render(<Profil />);
    expect(container.textContent).toContain(
      "jamais transmises à une administration par ImmiPro",
    );
  });
});

describe("C-03 — Comparateur", () => {
  it("rend un vrai tableau, avec ses en-têtes de ligne et de colonne", () => {
    render(<PageComparateur />);
    const tableau = screen.getByRole("table");
    expect(tableau).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /Pays-Bas/ })).toBeDefined();
    expect(screen.getByRole("rowheader", { name: "Coût 1re année" })).toBeDefined();
  });

  it("ne classe pas les destinations et le dit", () => {
    const { container } = render(<PageComparateur />);
    expect(container.textContent).toContain("il ne prédit aucune décision");
  });

  it("explique le critère qui se lit de travers", () => {
    render(<PageComparateur />);
    expect(screen.getByText(/c'est l'employeur qui demande le permis/)).toBeDefined();
  });
});

describe("C-04 — Fiche détaillée", () => {
  it("expose ses sections en onglets, un seul arrêt de tabulation", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    const onglets = screen.getAllByRole("tab");
    expect(onglets).toHaveLength(4);
    expect(onglets.filter((o) => o.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("change d'onglet aux flèches", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Coûts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("relie le panneau visible à son onglet", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    const panneau = screen.getByRole("tabpanel");
    const onglet = screen.getByRole("tab", { name: "Conditions" });
    expect(panneau.getAttribute("aria-labelledby")).toBe(onglet.id);
  });

  it("donne les réserves une section à elles, pas un pied de page", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Réserves" }));
    expect(screen.getByText(/réévalué chaque année en janvier/)).toBeDefined();
  });
});

describe("C-05 — Ouverture de dossier", () => {
  it("n'ouvre rien tant que la date de dépôt n'est pas choisie", () => {
    render(<OuvertureDossier />);
    const creer = screen.getByRole("button", { name: "Créer mon dossier" });
    expect(creer).toBeDisabled();
    expect(creer).toHaveAccessibleDescription(
      "Choisissez une date de dépôt visée, même approximative.",
    );
  });

  it("accepte « Je ne sais pas encore » comme réponse", () => {
    render(<OuvertureDossier />);
    fireEvent.click(screen.getByRole("radio", { name: /Je ne sais pas encore/ }));
    expect(screen.getByRole("button", { name: "Créer mon dossier" })).toBeEnabled();
  });

  it("suit la destination passée dans l'adresse", () => {
    parametres.set("destination", "canada");
    render(<OuvertureDossier />);
    expect(screen.getByRole("heading", { name: /Ouvre ton dossier Canada/ })).toBeDefined();
  });

  it("dit qu'ouvrir un dossier n'engage aucune démarche administrative", () => {
    const { container } = render(<OuvertureDossier />);
    expect(container.textContent).toContain(
      "ne constitue aucune démarche auprès de l'administration",
    );
  });
});
