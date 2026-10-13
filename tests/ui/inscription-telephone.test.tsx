import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Inscription } from "@/app/(auth)/inscription/Inscription";
const mocks = vi.hoisted(() => ({ appeler: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api", () => ({ appeler: mocks.appeler }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.appeler.mockResolvedValue({ ok: true, donnees: { etape: "verification" } });
});
function remplir(telephone: string) {
  render(<Inscription publiees={{}} />);
  fireEvent.change(screen.getByLabelText("Prénom et nom"), {
    target: { value: "Recette Telephone" },
  });
  fireEvent.change(screen.getByLabelText("Adresse email"), {
    target: { value: "telephone@immipro.test" },
  });
  fireEvent.change(screen.getByLabelText("Mot de passe", { exact: true }), {
    target: { value: "RecetteL6Synthetique" },
  });
  fireEvent.change(screen.getByLabelText("Numéro Mobile Money"), { target: { value: telephone } });
  fireEvent.click(screen.getByRole("checkbox"));
}
describe("L6 — numéro de l'inscription", () => {
  it("transmet le numéro normalisé, sans deviner l'indicatif", async () => {
    remplir("00 229 01 97 00 00 42");
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
    await waitFor(() =>
      expect(mocks.appeler).toHaveBeenCalledWith(
        "/api/comptes",
        expect.objectContaining({
          corps: expect.objectContaining({ telephone: "+2290197000042" }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/verification");
  });
  it("un numéro local mal formé empêche le POST et explique l'indicatif", () => {
    remplir("97000042");
    expect(screen.getByRole("button", { name: "Créer mon compte" })).toBeDisabled();
    expect(screen.getByLabelText("Numéro Mobile Money")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.appeler).not.toHaveBeenCalled();
  });
  it("le téléphone reste facultatif à l'inscription", async () => {
    remplir("");
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
    await waitFor(() => expect(mocks.appeler).toHaveBeenCalled());
    expect(mocks.appeler.mock.calls[0]![1].corps).not.toHaveProperty("telephone");
  });
});
