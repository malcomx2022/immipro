import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FileDeVeille } from "@/app/(admin)/veille/FileDeVeille";
import { finsSansRelais, type VersionPourRelais } from "@/domain/backoffice/veille";

/**
 * B-01 — la fin prévue sans relais se voit en tête de la veille (S.200, C-13).
 *
 * La file ne montre que les fiches dont la relecture approche. Une fiche
 * NL relue le mois dernier n'y est pas, alors que sa fin prévue la
 * retirera du site le 1er janvier : l'encadré la sort, avec le geste.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/veille",
}));
vi.mock("@/lib/api", () => ({ appeler: vi.fn() }));

const AUJOURDHUI = "2026-10-28";
const version = (surcharges: Partial<VersionPourRelais> = {}): VersionPourRelais => ({
  id: "regle-nl-etudes",
  code: "NL",
  procedure: "NL:etudes_mvv_vvr",
  pays: "Pays-Bas",
  libelle: "Séjour pour études (MVV + VVR)",
  version: 1,
  statut: "PUBLISHED",
  publieeLe: "2026-01-02T08:00:00.000Z",
  finPrevue: "2026-12-31",
  ...surcharges,
});

const espaces = (t: string) => t.replace(/[\s  ]/gu, " ");

describe("B-01 : fins prévues sans version suivante", () => {
  it("annonce la procédure, l'écart en jours, la date, l'effet et le geste, avec un lien vers sa fiche", () => {
    const fins = finsSansRelais([version()], AUJOURDHUI);
    render(<FileDeVeille fiches={[]} collecte={null} finsSansRelais={fins} aujourdhui={AUJOURDHUI} />);
    const encadre = screen.getByRole("region", {
      name: "Une procédure arrive à sa fin prévue sans version suivante",
    });
    const texte = espaces(encadre.textContent ?? "");
    expect(texte).toContain("NL Pays-Bas — Séjour pour études (MVV + VVR), version 1");
    expect(texte).toContain("Fin prévue dans 64 j");
    expect(texte).toContain("31 décembre 2026");
    expect(texte).toContain("ne s'affiche plus chez le candidat");
    expect(texte).toContain("ouvre la version 2 depuis la fiche");
    expect(
      within(encadre).getByRole("link", { name: "Ouvrir la fiche NL" }).getAttribute("href"),
    ).toBe("/regles/regle-nl-etudes");
  });

  it("compte les procédures et nomme le brouillon qui attend", () => {
    const fins = finsSansRelais(
      [
        version(),
        version({ id: "nl-2", version: 2, statut: "DRAFT", publieeLe: null, finPrevue: null }),
        version({ id: "regle-nl-emploi", procedure: "NL:kennismigrant", libelle: "Travailleur hautement qualifié" }),
      ],
      AUJOURDHUI,
    );
    render(<FileDeVeille fiches={[]} collecte={null} finsSansRelais={fins} aujourdhui={AUJOURDHUI} />);
    const encadre = screen.getByRole("region", {
      name: "2 procédures arrivent à leur fin prévue sans version suivante",
    });
    expect(within(encadre).getAllByRole("listitem")).toHaveLength(2);
    expect(encadre.textContent).toContain("Le brouillon de la version 2 attend");
  });

  it("ne montre rien quand toutes les fins prévues ont leur relais", () => {
    render(<FileDeVeille fiches={[]} collecte={null} finsSansRelais={[]} aujourdhui={AUJOURDHUI} />);
    expect(screen.queryByRole("region", { name: /fin prévue/u })).toBeNull();
  });
});
