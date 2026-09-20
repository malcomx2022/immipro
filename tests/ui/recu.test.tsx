import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Recu } from "@/app/(app)/paiement/recu/[id]/Recu";
import type { Recu as Donnees } from "@/server/lecture/paiements";
import { MENTION_ATTESTATION, RAISON_RENVOI_FERME } from "@/domain/paiement/recu";

const reponse = (corps: unknown, statut = 200) =>
  Promise.resolve({
    ok: statut < 400,
    status: statut,
    json: () => Promise.resolve(corps),
  } as Response);

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "print", { value: vi.fn(), writable: true });
});

const PAYE: Donnees = {
  reference: "IMP-260911-4K7QZA",
  etat: "paye",
  le: "2026-09-11T09:43:00.000Z",
  moyen: "Mobile Money",
  transactionOperateur: "MP260911.0943",
  achat: "Dossier",
  achatCode: "dossier",
  montant: 25_000,
  devise: "XOF",
  dossier: { id: "nl-1", pays: "Pays-Bas", intitule: "Séjour pour études (MVV + VVR)" },
  adresse: "awa@example.bj",
};

/**
 * $-06 — Reçu. Annexe L.B.
 *
 * Les deux boutons ne faisaient rien. Ce qui se vérifie ici, c'est qu'ils
 * font désormais quelque chose, et que le reçu ne s'écrit pas avant que le
 * paiement soit acquis.
 */
describe("$-06 — le reçu d'un paiement acquis", () => {
  it("porte la référence, la date, le moyen et le total", () => {
    const { container } = render(<Recu recu={PAYE} />);
    expect(screen.getByRole("heading", { name: /IMP-260911-4K7QZA/u })).toBeDefined();
    expect(container.textContent).toContain("11 septembre 2026, 9 h 43");
    expect(container.textContent).toContain("Mobile Money");
    expect(container.textContent).toContain("MP260911.0943");
    expect(container.textContent).toContain("Total payé");
  });

  it("dit ce qu'il n'atteste pas (INV-1)", () => {
    const { container } = render(<Recu recu={PAYE} />);
    expect(container.textContent).toContain(MENTION_ATTESTATION);
  });

  it("n'annonce pas de transaction opérateur tant qu'il n'y en a pas", () => {
    // Elle n'arrive qu'avec la notification signée. Une ligne vide sur un
    // reçu se lit comme une donnée perdue.
    const { container } = render(<Recu recu={{ ...PAYE, transactionOperateur: null }} />);
    expect(container.textContent).not.toContain("Transaction opérateur");
  });

  it("« Imprimer » ouvre la fenêtre d'impression", () => {
    render(<Recu recu={PAYE} />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("« Renvoyer par email » nomme l'adresse atteinte", async () => {
    const appel = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => reponse({ adresse: "awa@example.bj" }));

    render(<Recu recu={PAYE} />);
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer par email" }));

    await waitFor(() =>
      expect(screen.getByText("Reçu renvoyé à awa@example.bj.")).toBeDefined(),
    );
    expect(appel.mock.calls[0]?.[0]).toBe("/api/paiements/IMP-260911-4K7QZA/recu");
    expect((appel.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
  });

  it("rend le refus du serveur, sans code technique", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      reponse(
        {
          echec: {
            titre: "Le service n'a pas répondu",
            corps: "L'interruption vient de la plateforme.",
            action: "Réessayer",
            ton: "attente",
          },
        },
        503,
      ),
    );

    const { container } = render(<Recu recu={PAYE} />);
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer par email" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(container.textContent).not.toMatch(/HTTP|\b503\b/u);
  });
});

describe("$-06 — les états où il n'y a pas de reçu", () => {
  it("un paiement en attente ne rend pas un document à en-tête", () => {
    const { container } = render(<Recu recu={{ ...PAYE, etat: "en_cours" }} />);
    expect(container.textContent).not.toContain("Total payé");
    expect(screen.queryByRole("button", { name: "Imprimer" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Ce paiement n'est pas encore confirmé" }),
    ).toBeDefined();
  });

  it("un paiement sans suite dit qu'aucune somme n'a été débitée", () => {
    const { container } = render(<Recu recu={{ ...PAYE, etat: "sans_suite" }} />);
    expect(container.textContent).toContain("Aucune somme n'a été débitée");
    expect(container.textContent).toContain("IMP-260911-4K7QZA");
  });

  it("un remboursement garde son reçu mais ferme le renvoi, avec sa raison", () => {
    const { container } = render(<Recu recu={{ ...PAYE, etat: "rembourse" }} />);
    expect(container.textContent).toContain("Total remboursé");
    const bouton = screen.getByRole("button", { name: "Renvoyer par email" });
    expect(bouton.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain(RAISON_RENVOI_FERME);
  });
});
