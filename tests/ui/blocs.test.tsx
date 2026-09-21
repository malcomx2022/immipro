import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";
import { ChecklistRow } from "@/components/ui/ChecklistRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LIBELLE_CONSERVEE_NON_VERIFIEE } from "@/domain/dossiers/piece";
import { SourceNote } from "@/components/ui/SourceNote";
import { CompletenessTier, libelleDenombrement } from "@/components/ui/CompletenessTier";
import type { CompletenessPublic } from "@/domain/completeness/score";

describe("Card", () => {
  it("rend son contenu sans dépasser le rayon du référentiel", () => {
    render(<Card>Pays-Bas — séjour études</Card>);
    const carte = screen.getByText("Pays-Bas — séjour études");
    expect(carte.className).toContain("rounded-lg");
    expect(carte.className).not.toContain("rounded-xl");
  });
});

describe("StatusBadge", () => {
  it("écrit toujours le mot à côté de la couleur", () => {
    render(<StatusBadge etat="A_CORRIGER" />);
    expect(screen.getByText("À corriger")).toBeDefined();
  });

  /**
   * Le libellé passé remplace celui de l'état, et la couleur reste celle de
   * l'état — c'est lui qui décide de la place de la pièce dans la
   * checklist. Un seul cas l'emploie : une pièce déposée que le quota a
   * empêché d'analyser revient à `ATTENDUE`, et « Attendue » sur une pièce
   * dont le fichier est arrivé fait la renvoyer.
   */
  it("porte le libellé passé plutôt que celui de l'état", () => {
    const { container } = render(
      <StatusBadge etat="ATTENDUE" libelle={LIBELLE_CONSERVEE_NON_VERIFIEE} />,
    );
    expect(screen.getByText("Conservée, non vérifiée")).toBeDefined();
    expect(container.textContent).not.toContain("Attendue");
    // La couleur suit l'état, pas le libellé.
    expect(container.querySelector(".bg-ink-500")).not.toBeNull();
  });

  it("garde le libellé de l'état quand rien n'est passé", () => {
    render(<StatusBadge etat="ATTENDUE" />);
    expect(screen.getByText("Attendue")).toBeDefined();
  });
});

describe("ChecklistRow", () => {
  const ligne = (onClick: () => void) => (
    <ChecklistRow
      code="ID"
      libelle="Passeport"
      etat="A_CORRIGER"
      message="Validité restante après retour : 4 mois. Minimum exigé : 6 mois."
      action="Voir"
      onClick={onClick}
    />
  );

  it("est un bouton, pas un div cliquable (règle clavier 9)", () => {
    const clic = vi.fn();
    render(ligne(clic));
    const bouton = screen.getByRole("button");
    expect(bouton.tagName).toBe("BUTTON");
    bouton.click();
    expect(clic).toHaveBeenCalledOnce();
  });

  it("porte l'état et le constat actionnable", () => {
    render(ligne(() => {}));
    expect(screen.getByText("À corriger")).toBeDefined();
    expect(screen.getByText(/Minimum exigé : 6 mois/)).toBeDefined();
  });

  it("prend le focus au clavier", () => {
    render(ligne(() => {}));
    const bouton = screen.getByRole("button");
    bouton.focus();
    expect(document.activeElement).toBe(bouton);
  });
});

describe("SourceNote", () => {
  it("affiche la source et la date de vérification (INV-8)", () => {
    render(<SourceNote source="ind.nl" verifieeLe="2026-09-11" />);
    expect(screen.getByText(/11\/09\/2026/)).toBeDefined();
    expect(screen.getByText(/ind\.nl/)).toBeDefined();
  });
});

describe("CompletenessTier", () => {
  const completude = (
    obligatoiresManquantes: number,
    facultativesManquantes: number,
    conformes: number,
  ): CompletenessPublic => ({
    palier:
      obligatoiresManquantes > 0
        ? "INCOMPLET"
        : facultativesManquantes > 0
          ? "PRESQUE_COMPLET"
          : "COMPLET",
    ready: obligatoiresManquantes === 0,
    missing: [],
    compteurs: { obligatoiresManquantes, facultativesManquantes, conformes },
  });

  it("dénombre les manques et nomme le palier", () => {
    render(<CompletenessTier completude={completude(2, 2, 4)} />);
    expect(screen.getByText("Dossier incomplet")).toBeDefined();
    expect(
      screen.getByText("2 pièces obligatoires manquent, 2 complémentaires restent à traiter"),
    ).toBeDefined();
    expect(screen.getByText("4 pièces déjà conformes")).toBeDefined();
  });

  it("accorde le dénombrement au singulier", () => {
    expect(libelleDenombrement({ obligatoiresManquantes: 1, facultativesManquantes: 0, conformes: 3 }))
      .toBe("1 pièce obligatoire manque");
    expect(libelleDenombrement({ obligatoiresManquantes: 0, facultativesManquantes: 1, conformes: 3 }))
      .toBe("1 pièce complémentaire reste à traiter");
    expect(libelleDenombrement({ obligatoiresManquantes: 0, facultativesManquantes: 0, conformes: 5 }))
      .toBe("Toutes les pièces demandées sont conformes");
  });

  it("n'affiche aucune note chiffrée d'ensemble (arbitrage C-09)", () => {
    const { container } = render(<CompletenessTier completude={completude(2, 2, 4)} />);
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/sur 100/i);
    expect(texte).not.toMatch(/\d\s?%/);
  });
});
