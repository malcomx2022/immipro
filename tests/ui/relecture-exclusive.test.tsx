import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LancerLAnalyse } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/relecture/LancerLAnalyse";

const { appeler, refresh } = vi.hoisted(() => ({ appeler: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api", () => ({ appeler }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => {
  appeler.mockReset();
  refresh.mockReset();
});

describe("R-04 — deux onglets ne lancent pas deux relectures", () => {
  it("une réponse aboutie ne laisse pas la version suivante bloquée en chargement", async () => {
    appeler.mockResolvedValue({ ok: true, donnees: { relue: true, disponible: true } });
    render(<LancerLAnalyse dossierId="d" type="lettre-motivation" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" })));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Lancer l'analyse" })).toBeEnabled();
    expect(appeler).toHaveBeenCalledOnce();
  });
  it("un chargement avec réservation active propose seulement une consultation", () => {
    render(<LancerLAnalyse dossierId="d" type="lettre-motivation" analyseEnCours />);
    expect(screen.getByRole("status")).toHaveTextContent("déjà en cours");
    expect(screen.queryByRole("button", { name: "Lancer l'analyse" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consulter le résultat" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(appeler).not.toHaveBeenCalled();
  });
  it.each([
    [{ enCours: true }, "déjà en cours"],
    [{ motif: "version_remplacee" }, "remplacée"],
    [{ motif: "relecture_interrompue" }, "interrompue"],
  ])("réponse %j : consultation sans nouvelle requête payante", async (issue, texte) => {
    appeler.mockResolvedValue({ ok: true, donnees: { relue: false, disponible: true, ...issue } });
    render(<LancerLAnalyse dossierId="d" type="lettre-motivation" />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" })),
    );
    expect(screen.getByRole("status")).toHaveTextContent(texte);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(appeler).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Consulter le résultat" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(appeler).toHaveBeenCalledOnce();
  });
});
