import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Verification } from "@/app/(auth)/verification/Verification";
import { Connexion } from "@/app/(auth)/connexion/Connexion";

const pousser = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pousser }),
  useSearchParams: () => new URLSearchParams(),
}));

const allerA = (adresse: string) => window.history.replaceState(null, "", adresse);

afterEach(() => {
  pousser.mockClear();
  allerA("/");
});

describe("La suite traverse la connexion et la vérification — 02/10/2026", () => {
  it("un compte non vérifié passe par la vérification en gardant la suite", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ compte: { emailVerifie: false } }),
    } as Response);
    allerA("/connexion?suite=%2Fdossiers%2Fnouveau%3Fdestination%3Dsuisse");
    render(<Connexion />);
    fireEvent.change(screen.getByLabelText("Adresse email"), { target: { value: "a@exemple.test" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "un mot de passe long" } });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    await waitFor(() => expect(pousser).toHaveBeenCalled());
    expect(pousser).toHaveBeenCalledWith(
      "/verification?suite=%2Fdossiers%2Fnouveau%3Fdestination%3Dsuisse",
    );
  });

  it("« Plus tard » mène à la page demandée, pas au tableau de bord", () => {
    allerA("/verification?suite=%2Fdossiers%2Fnouveau%3Fdestination%3Dsuisse");
    render(<Verification />);
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(pousser).toHaveBeenCalledWith("/dossiers/nouveau?destination=suisse");
  });

  it("une suite externe est ignorée : retour au tableau de bord", () => {
    allerA("/verification?suite=https%3A%2F%2Failleurs.test");
    render(<Verification />);
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(pousser).toHaveBeenCalledWith("/tableau-de-bord");
  });
});
