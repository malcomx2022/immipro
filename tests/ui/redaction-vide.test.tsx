import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AUCUNE_PIECE_A_REDIGER,
  ChoixDeLaPiece,
} from "@/app/(app)/(dossier)/dossiers/[id]/redaction/ChoixDeLaPiece";
import { Checklist } from "@/app/(app)/(dossier)/dossiers/[id]/Checklist";
import { aDesPiecesARediger } from "@/domain/dossiers/piece";
import { PIECES_REDIGEABLES } from "@/lib/contenu/redaction";
import { PIECES_NL, dossierParId } from "@/lib/contenu/dossiers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * S.223 — un dossier dont aucune pièce n'a d'entretien guidé (Suisse
 * études : seul le CV et plan d'études est « à rédiger », sans entretien,
 * S.218) n'offre plus « Rédiger une pièce », et l'écran de choix, ouvert
 * par son adresse, dit qu'il n'y a rien à rédiger au lieu d'un choix vide.
 */
const DOSSIER = dossierParId("nl-4471")!;
const SANS_ENTRETIEN = PIECES_NL.map((piece) => ({ ...piece, redaction: undefined }));

describe("S.223 — rédaction sans pièce rédigeable", () => {
  it("le domaine dit si une pièce a son entretien", () => {
    expect(aDesPiecesARediger(PIECES_NL)).toBe(true);
    expect(aDesPiecesARediger(SANS_ENTRETIEN)).toBe(false);
    expect(aDesPiecesARediger([])).toBe(false);
  });

  it("la checklist n'offre « Rédiger une pièce » que si une pièce a son entretien", () => {
    const { unmount } = render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(screen.getByRole("link", { name: "Rédiger une pièce" }).getAttribute("href")).toBe(
      `/dossiers/${DOSSIER.id}/redaction`,
    );
    unmount();
    render(<Checklist dossier={DOSSIER} pieces={SANS_ENTRETIEN} />);
    expect(screen.queryByRole("link", { name: "Rédiger une pièce" })).toBeNull();
    expect(screen.getByRole("link", { name: "Complétude" })).toBeTruthy();
  });

  it("le choix vide le dit et renvoie à la checklist, sans bouton grisé", () => {
    const { container } = render(<ChoixDeLaPiece dossier={DOSSIER} pieces={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Rien à rédiger dans ce dossier",
    );
    expect(container.textContent).toContain(AUCUNE_PIECE_A_REDIGER);
    expect(
      screen.getByRole("link", { name: "Revenir à la checklist" }).getAttribute("href"),
    ).toBe(`/dossiers/${DOSSIER.id}`);
    expect(screen.queryByRole("button", { name: "Commencer l'entretien" })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("avec des pièces, le choix reste celui de R-01", () => {
    render(<ChoixDeLaPiece dossier={DOSSIER} pieces={PIECES_REDIGEABLES} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Que veux-tu rédiger ?");
    expect(screen.getByRole("button", { name: "Commencer l'entretien" })).toBeTruthy();
  });
});
