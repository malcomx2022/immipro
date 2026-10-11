import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Relecture } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/relecture/Relecture";
import { AUCUN_RECOUPEMENT } from "@/domain/redaction/coherence";
import { dossierParId } from "@/lib/contenu/dossiers";

const { appeler, refresh } = vi.hoisted(() => ({ appeler: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api", () => ({ appeler }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const rendre = () =>
  render(
    <Relecture
      dossier={dossierParId("nl-4471")!}
      type="lettre-motivation"
      remarques={null}
      recoupements={AUCUN_RECOUPEMENT}
      texteExistant
      analysePossible
      redactionAssistee
      relectureLe="2026-10-11"
    />,
  );

describe("L3 — le candidat ne reçoit aucun avis favorable après refus", () => {
  it.each([
    ["avis_mal_forme", "L'analyse n'a pas pu être utilisée"],
    ["formulation_refusee", "L'analyse n'a pas été gardée"],
  ])("refus %s : message, quota, texte intact et aucune relance", async (motif, titre) => {
    appeler.mockReset();
    refresh.mockReset();
    appeler.mockResolvedValue({
      ok: true,
      donnees: { relue: false, disponible: true, remarques: null, motif },
    });
    const { container } = rendre();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(titre);
    expect(container.textContent).toContain("Aucune analyse n'a été décomptée");
    expect(container.textContent).toContain("ta version est intacte");
    expect(container.textContent).not.toContain("Rien à reprendre sur cette version");
    expect(container.textContent).not.toContain("relecture automatique ImmiPro");
    expect(appeler).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Éditeur" })).toHaveAttribute(
      "href",
      "/dossiers/nl-4471/redaction/lettre-motivation",
    );
  });

  it("attend la réponse avant de proposer un nouveau geste", async () => {
    appeler.mockReset();
    refresh.mockReset();
    let repondre: ((v: unknown) => void) | undefined;
    appeler.mockImplementation(
      () =>
        new Promise((ok) => {
          repondre = ok;
        }),
    );
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" }));
    expect(screen.getByRole("button", { name: "Analyse en cours…" })).toBeDisabled();
    await act(async () =>
      repondre?.({
        ok: true,
        donnees: { relue: false, disponible: true, motif: "avis_mal_forme" },
      }),
    );
    expect(screen.getByRole("button", { name: "Lancer l'analyse" })).toBeEnabled();
    expect(appeler).toHaveBeenCalledTimes(1);
  });

  it("rafraîchit l'avis réel après une vraie liste vide", async () => {
    appeler.mockReset();
    refresh.mockReset();
    appeler.mockResolvedValue({
      ok: true,
      donnees: { relue: true, disponible: true, remarques: 0 },
    });
    rendre();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" })),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
