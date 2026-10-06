import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ExportDesAppels } from "@/app/(admin)/couts-ia/ExportDesAppels";

const telechargements: { url: string; nom: string }[] = [];
let refuse = false;
vi.mock("@/lib/telechargement", () => ({
  telechargerFichier: (url: string, nom: string) => {
    telechargements.push({ url, nom });
    return Promise.resolve(
      refuse
        ? {
            ok: false,
            echec: {
              titre: "Le fichier n'a pas pu être préparé",
              corps: "Motif de test.",
              conserve: "Rien n'a changé.",
              action: "Réessayer",
              ton: "echec",
            },
          }
        : { ok: true, donnees: undefined },
    );
  },
}));

/** S.122 — B-07, l'export du détail des appels, sur ses trois états. */
describe("B-07 — Exporter le détail des appels", () => {
  const rendre = (du = "2026-09-01", au = "2026-09-14") =>
    render(<ExportDesAppels duParDefaut={du} auParDefaut={au} />);

  it("demande le fichier de la période affichée", async () => {
    telechargements.length = 0;
    refuse = false;
    rendre();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exporter le détail des appels" }));
    });
    expect(telechargements).toEqual([
      {
        url: "/api/admin/couts-ia/export?du=2026-09-01&au=2026-09-14",
        nom: "immipro-appels-ia-2026-09-01_2026-09-14.csv",
      },
    ]);
  });

  it("grise le bouton et dit quoi faire quand la période est inversée", () => {
    telechargements.length = 0;
    rendre("2026-09-14", "2026-09-01");
    const bouton = screen.getByRole("button", { name: "Exporter le détail des appels" });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("inversez les deux dates");
    expect(telechargements).toHaveLength(0);
  });

  it("affiche le refus du serveur", async () => {
    refuse = true;
    const { container } = rendre();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exporter le détail des appels" }));
    });
    refuse = false;
    expect(container.textContent).toContain("Le fichier n'a pas pu être préparé");
  });

  it("dit que le fichier ne porte aucune donnée de candidat", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Aucune donnée de candidat dans ce fichier");
  });
});
