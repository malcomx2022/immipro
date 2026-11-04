import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Se déconnecter — S.212. La route existait, aucun écran ne l'appelait.
 */
const m = vi.hoisted(() => ({ appeler: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  appeler: m.appeler,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/veille" }));

import { HORS_LIGNE } from "@/lib/api";
import { BoutonDeconnexion } from "@/components/layout/BoutonDeconnexion";
import { BarreAdmin } from "@/components/admin/BarreAdmin";

const locationOrigine = window.location;
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...locationOrigine, replace: m.replace },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: locationOrigine });
});

const cliquer = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  });
};

describe("le bouton « Se déconnecter »", () => {
  it("ferme la session en base, puis recharge la connexion en entier", async () => {
    m.appeler.mockResolvedValue({ ok: true, donnees: undefined });
    render(<BoutonDeconnexion />);
    await cliquer();
    expect(m.appeler).toHaveBeenCalledWith("/api/comptes/session", { methode: "DELETE" });
    expect(m.replace).toHaveBeenCalledWith("/connexion");
  });

  it("une session déjà échue (401) mène aussi à la connexion : on est déjà dehors", async () => {
    m.appeler.mockResolvedValue({ ok: false, echec: { titre: "Connexion requise", corps: "", action: "", ton: "echec" } });
    render(<BoutonDeconnexion />);
    await cliquer();
    expect(m.replace).toHaveBeenCalledWith("/connexion");
  });

  it("hors ligne, l'écran reste et dit quoi faire", async () => {
    m.appeler.mockResolvedValue({ ok: false, echec: HORS_LIGNE });
    render(<BoutonDeconnexion />);
    await cliquer();
    expect(m.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/vérifie ta connexion internet, puis réessaie/u);
    expect((screen.getByRole("button", { name: "Se déconnecter" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("le bouton est dans les deux espaces", () => {
  it("au back-office, sous la carte de l'opérateur", () => {
    render(
      <BarreAdmin nom="Awa Koffi" role="Super-administration" initialesAffichees="AK">
        <p>contenu</p>
      </BarreAdmin>,
    );
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeDefined();
  });

  it("dans l'espace candidat, au bureau et sur mobile", () => {
    const gabarit = readFileSync("src/app/(app)/(dossier)/layout.tsx", "utf8");
    expect(gabarit.match(/<BoutonDeconnexion/gu)).toHaveLength(2);
  });
});
