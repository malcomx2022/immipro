import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Recu } from "@/app/(app)/paiement/recu/[id]/Recu";
import type { Recu as Donnees } from "@/server/lecture/paiements";
import { EMETTEUR_NON_RENSEIGNE, MENTION_ATTESTATION, RAISON_RENVOI_FERME } from "@/domain/paiement/recu";

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
  rembourseLe: null,
  montantRembourse: null,
  achat: "Dossier",
  achatCode: "dossier",
  montant: 25_000,
  devise: "XOF",
  dossier: { id: "nl-1", pays: "Pays-Bas", intitule: "Séjour pour études (MVV + VVR)" },
  adresse: "awa@example.bj",
  emetteur: ["Société Fictive de Test, SARL", "Cotonou, Bénin", "RCCM RB/COT/00 B 00000 · IFU 0000000000000", "contact@exemple.test"],
  pieces: [],
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
    expect(container.textContent).toContain("11 septembre 2026, 10 h 43");
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
    const { container } = render(
      <Recu recu={{ ...PAYE, etat: "rembourse", rembourseLe: "2026-09-14T10:12:00.000Z" }} />,
    );
    expect(container.textContent).toContain("Total remboursé");
    const bouton = screen.getByRole("button", { name: "Renvoyer par email" });
    expect(bouton.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain(RAISON_RENVOI_FERME);
  });

  /**
   * M.B — un reçu est une pièce comptable, et une pièce comptable est
   * datée. La mention disait qu'un remboursement avait eu lieu sans dire
   * quand, faute d'une date que rien n'écrivait.
   */
  it("le remboursement porte sa date, distincte de celle du paiement", () => {
    const { container } = render(
      <Recu recu={{ ...PAYE, etat: "rembourse", rembourseLe: "2026-09-14T10:12:00.000Z" }} />,
    );
    expect(container.textContent).toContain("remboursé le 14 septembre 2026, 11 h 12");
    // La date du paiement reste celle du paiement : les deux se lisent.
    expect(container.textContent).toContain("11 septembre 2026, 10 h 43");
  });

  /**
   * RG-15.2 — un pack entamé se rembourse au prorata des analyses
   * restantes. Le total remboursé est la somme revenue, pas le prix payé,
   * et la mention dit les deux.
   */
  it("un remboursement partiel montre la somme rendue, et le prix payé à côté", () => {
    const { container } = render(
      <Recu
        recu={{
          ...PAYE,
          etat: "rembourse",
          rembourseLe: "2026-09-14T10:12:00.000Z",
          montantRembourse: 15_000,
        }}
      />,
    );
    const texte = container.textContent?.replace(/\s/gu, " ") ?? "";
    expect(texte).toContain("Total remboursé15 000 F");
    expect(texte).toContain("remboursé en partie le 14 septembre 2026, 11 h 12 : 15 000 F sur 25 000 F");
    expect(texte).toContain("au prorata des analyses qui restaient");
  });
});

describe("$-06 — l'émetteur du reçu (02/10/2026)", () => {
  it("affiche l'identité saisie dans les textes juridiques", () => {
    const { container } = render(<Recu recu={PAYE} />);
    const adresse = container.querySelector("address");
    expect(adresse?.textContent).toContain("Société Fictive de Test, SARL");
    expect(adresse?.textContent).toContain("RCCM RB/COT/00 B 00000 · IFU 0000000000000");
    expect(container.textContent).not.toContain(EMETTEUR_NON_RENSEIGNE);
  });

  it("dit que l'identité n'est pas encore enregistrée, plutôt que d'en inventer une", () => {
    const { container } = render(<Recu recu={{ ...PAYE, emetteur: null }} />);
    expect(container.querySelector("address")).toBeNull();
    expect(container.textContent).toContain(EMETTEUR_NON_RENSEIGNE);
    expect(container.textContent).not.toMatch(/ImmiPro SAS|immipro\.bj/u);
  });
});

describe("$-06 — la facture à côté du reçu (avis M.C)", () => {
  it("mène à la facture et à l'avoir de la vente", () => {
    render(
      <Recu
        recu={{
          ...PAYE,
          etat: "rembourse",
          rembourseLe: "2026-09-12T10:00:00.000Z",
          pieces: [
            { numero: "RD-2026-00001", genre: "FACTURE" },
            { numero: "AV-2026-00001", genre: "AVOIR" },
          ],
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Voir la facture RD-2026-00001" })).toHaveAttribute(
      "href",
      "/paiement/facture/RD-2026-00001",
    );
    expect(screen.getByRole("link", { name: "Voir la facture d'avoir AV-2026-00001" })).toBeInTheDocument();
  });

  it("ne promet aucune facture tant qu'aucune n'est émise", () => {
    render(<Recu recu={PAYE} />);
    expect(screen.queryByRole("link", { name: /Voir la facture/u })).toBeNull();
  });
});
