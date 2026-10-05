import { describe, expect, it } from "vitest";
import { ecartDeConfirmationTardive } from "@/server/paiement/cycle";
import {
  constatsDuDiagnostic,
  lireLaReference,
  origineDeLEvenement,
  type FaitsDuPaiement,
} from "@/domain/paiement/diagnostic";

/**
 * S.116 — le cas du bac à sable du 05/10/2026 : « Transaction réussie »
 * chez FedaPay, ECHOUEE chez nous, aucun webhook en base.
 */
describe("confirmation tardive", () => {
  it("ouvre un écart sur une transaction échouée ou expirée", () => {
    expect(ecartDeConfirmationTardive("ECHOUEE", "CONFIRMEE", "fedapay:1")).toMatch(/tenue pour échouée.*rembourser/u);
    expect(ecartDeConfirmationTardive("EXPIREE", "CONFIRMEE", "fedapay:1")).toMatch(/tenue pour expirée/u);
  });

  it("ne dit rien des autres refus", () => {
    expect(ecartDeConfirmationTardive("ECHOUEE", "EN_ATTENTE", "fedapay:1")).toBeNull();
    expect(ecartDeConfirmationTardive("REMBOURSEE", "CONFIRMEE", "fedapay:1")).toBeNull();
    expect(ecartDeConfirmationTardive("CONFIRMEE", "ECHOUEE", "fedapay:1")).toBeNull();
  });
});

describe("lecture de la commande", () => {
  it("rend la référence, en majuscules", () => {
    expect(lireLaReference(["--reference", "imp-261005-p98aee"])).toEqual({ ok: true, reference: "IMP-261005-P98AEE" });
  });

  it("dit quoi fournir quand elle manque", () => {
    const lu = lireLaReference([]);
    expect(lu.ok).toBe(false);
    if (!lu.ok) expect(lu.erreur).toMatch(/--reference.*IMP-/u);
  });
});

describe("origine d'un événement", () => {
  it("distingue la réconciliation du webhook", () => {
    expect(origineDeLEvenement("reconciliation:IMP-1:ECHOUEE")).toBe("reconciliation");
    expect(origineDeLEvenement("fedapay:42:approved")).toBe("webhook");
  });
});

const faits = (f: Partial<FaitsDuPaiement> = {}): FaitsDuPaiement => ({
  reference: "IMP-261005-P98AEE",
  statut: "ECHOUEE",
  fournisseur: "FEDAPAY",
  providerTxId: "fedapay:42",
  webhooks: 0,
  reconciliations: 1,
  notificationsRefusees: 0,
  ecartOuvert: false,
  lecture: { issue: "lue", id: "42", etat: "declined", statut: "ECHOUEE", referenceMarchande: "IMP-261005-P98AEE" },
  racine: "https://immipro.app/",
  espace: "sandbox",
  ...f,
});

describe("constats du diagnostic", () => {
  it("le cas relevé : refus fidèle à la transaction lue, webhook absent", () => {
    const c = constatsDuDiagnostic(faits());
    expect(c.some((t) => /fidèle.*autre transaction/u.test(t))).toBe(true);
    expect(c.some((t) => t.includes("https://immipro.app/api/webhooks/fedapay") && t.includes("FEDAPAY_WEBHOOK_SECRET"))).toBe(true);
    expect(c.some((t) => /réconciliation/u.test(t))).toBe(true);
  });

  it("un fournisseur qui dit payé sur une transaction échouée : débit sans pack, à rembourser", () => {
    const c = constatsDuDiagnostic(
      faits({ lecture: { issue: "lue", id: "42", etat: "approved", statut: "CONFIRMEE", referenceMarchande: null }, ecartOuvert: true }),
    );
    expect(c.some((t) => /débité sans recevoir son pack.*écart est ouvert.*rembourser/u.test(t))).toBe(true);
  });

  it("une référence marchande qui n'est pas la nôtre : ne rien appliquer", () => {
    const c = constatsDuDiagnostic(
      faits({ lecture: { issue: "lue", id: "42", etat: "approved", statut: "CONFIRMEE", referenceMarchande: "IMP-AUTRE" } }),
    );
    expect(c[0]).toMatch(/ne désigne pas ce paiement/u);
  });

  it("des notifications refusées : le webhook est arrivé, le motif est au journal", () => {
    const c = constatsDuDiagnostic(faits({ notificationsRefusees: 1 }));
    expect(c.some((t) => /Aucun webhook/u.test(t))).toBe(false);
    expect(c.some((t) => /1 notification reçue et refusée/u.test(t))).toBe(true);
  });

  it("chaque constat dit quoi faire ou ce qui est établi", () => {
    const c = constatsDuDiagnostic(faits({ statut: "CONFIRMEE", webhooks: 1, reconciliations: 0, lecture: { issue: "lue", id: "42", etat: "approved", statut: "CONFIRMEE", referenceMarchande: null } }));
    expect(c).toEqual(["Aucun désaccord relevé entre la plateforme et le fournisseur pour cette référence."]);
  });
});
