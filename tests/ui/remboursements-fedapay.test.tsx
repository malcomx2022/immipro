import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RemboursementsFedaPay } from "@/app/(admin)/paiements/RemboursementsFedaPay";
import type { DetteFedaPay } from "@/domain/paiement/remboursement";

/**
 * B-04 — les remboursements FedaPay faits à la main (S.91).
 *
 * États vide, en cours et en erreur, et la règle qui compte : une dette
 * déclarée reste affichée, sans formulaire, jusqu'à la notification signée.
 */
const rafraichir = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: rafraichir }),
}));

const appels: { url: string; corps: unknown }[] = [];
let issue: "ok" | "refus" = "ok";
vi.mock("@/lib/api", () => ({
  appeler: (url: string, options: { corps?: unknown } = {}) => {
    appels.push({ url, corps: options.corps });
    return Promise.resolve(
      issue === "ok"
        ? { ok: true, donnees: { issue: "declaree" } }
        : {
            ok: false,
            echec: {
              titre: "Cette étape n'est pas encore ouverte",
              corps:
                "La référence fedapay:8841 est déjà déclarée sur un autre paiement. Vérifie au tableau de bord FedaPay la transaction que ce remboursement concerne.",
              action: "Revenir au dossier",
              ton: "echec",
            },
          },
    );
  },
}));

afterEach(() => {
  appels.length = 0;
  rafraichir.mockReset();
  issue = "ok";
});

const dette = (autre: Partial<DetteFedaPay> = {}): DetteFedaPay => ({
  reference: "IMP-260918-FEDAPA",
  compte: "awa@example.bj",
  montant: 25_000,
  montantARendre: 25_000,
  devise: "XOF",
  etape: "DECIDE",
  motif: "Suppression du compte avant la limite d'annulation",
  initiee: true,
  decideeLe: "2026-09-18T09:00:00.000Z",
  demandeeLe: null,
  referenceFournisseur: null,
  ...autre,
});

describe("B-04 — remboursements FedaPay", () => {
  it("vide, il le dit", () => {
    render(<RemboursementsFedaPay dettes={[]} />);
    expect(screen.getByText(/Aucun remboursement FedaPay en attente/u)).toBeTruthy();
  });

  it("une dette initiée se déclare avec la référence du fournisseur", async () => {
    render(<RemboursementsFedaPay dettes={[dette()]} />);
    expect(screen.getByText(/FedaPay n'a pas d'API de remboursement/u)).toBeTruthy();

    const bouton = screen.getByRole("button", { name: /Déclarer le remboursement fait/u });
    expect(bouton.hasAttribute("disabled") || bouton.getAttribute("aria-disabled") === "true").toBe(
      true,
    );

    fireEvent.change(screen.getByLabelText(/Référence du remboursement chez FedaPay/u), {
      target: { value: "8841" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Déclarer le remboursement fait/u }));
    });
    expect(appels).toEqual([
      {
        url: "/api/admin/paiements/IMP-260918-FEDAPA/remboursement/manuel",
        corps: { referenceFournisseur: "8841" },
      },
    ]);
    expect(rafraichir).toHaveBeenCalledOnce();
  });

  it("un refus s'affiche avec ce qu'il faut faire, et rien n'est rafraîchi", async () => {
    issue = "refus";
    render(<RemboursementsFedaPay dettes={[dette()]} />);
    fireEvent.change(screen.getByLabelText(/Référence du remboursement chez FedaPay/u), {
      target: { value: "8841" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Déclarer le remboursement fait/u }));
    });
    expect(screen.getByText(/déjà déclarée sur un autre paiement/u)).toBeTruthy();
    expect(rafraichir).not.toHaveBeenCalled();
  });

  it("déclarée, la dette reste visible, sans second formulaire", () => {
    render(
      <RemboursementsFedaPay
        dettes={[
          dette({
            etape: "DEMANDE",
            referenceFournisseur: "fedapay:8841",
            demandeeLe: "2026-09-20T10:00:00.000Z",
          }),
        ]}
      />,
    );
    expect(screen.getByText(/en attente de confirmation/u)).toBeTruthy();
    expect(screen.getByText(/référence fedapay:8841/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Déclarer/u })).toBeNull();
  });

  it("non initiée, elle ne se déclare pas : les droits du pack ne sont pas retirés", () => {
    render(<RemboursementsFedaPay dettes={[dette({ initiee: false })]} />);
    expect(screen.getByText(/pas encore initié/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Déclarer/u })).toBeNull();
  });

  /**
   * RG-15.2 — un pack entamé se rembourse au prorata des analyses
   * restantes. Le geste par défaut du tableau de bord rend le prix payé :
   * la ligne doit dire la somme exacte, et quoi faire si elle ne se saisit
   * pas.
   */
  it("partielle, elle dit la somme exacte à rembourser, et non le prix payé", () => {
    const { container } = render(
      <RemboursementsFedaPay dettes={[dette({ montant: 5000, montantARendre: 3000 })]} />,
    );
    const texte = (container.textContent ?? "").replace(/\s/gu, " ");
    expect(texte).toContain("5 000 F payés");
    expect(texte).toContain("À rembourser : 3 000 F — remboursement partiel");
    expect(texte).toContain("rembourse exactement 3 000 F CFA, et non les 5 000 F CFA payés");
    expect(texte).toMatch(/ne rembourse rien et signale la dette à la direction/u);
  });
});
