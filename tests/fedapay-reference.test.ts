import { describe, expect, it } from "vitest";
import { lireFedaPay, referenceMarchande } from "@/server/paiement/notifications";

/**
 * Notre référence chez FedaPay — 03/10/2026.
 *
 * `reference` est générée par FedaPay (`trx_…`) : la documentation de
 * `POST /transactions` ne la connaît pas en entrée. La nôtre voyage dans
 * `custom_metadata`, documenté à la création et rendu sur la transaction,
 * donc dans l'événement, qui porte la transaction entière sous `entity`.
 */
describe("referenceMarchande", () => {
  it("lit la référence dans les métadonnées, jamais dans `reference`", () => {
    expect(referenceMarchande({ custom_metadata: { reference: "IMP-261003-ABCDEF" } })).toBe(
      "IMP-261003-ABCDEF",
    );
    expect(referenceMarchande({ custom_metadata: {} })).toBeNull();
  });

  it("accepte `merchant_reference` en repli", () => {
    expect(referenceMarchande({ merchant_reference: "IMP-261003-ABCDEF" })).toBe(
      "IMP-261003-ABCDEF",
    );
  });

  it("des métadonnées vides sérialisées en tableau ne cassent rien", () => {
    expect(referenceMarchande({ custom_metadata: [] })).toBeNull();
    expect(referenceMarchande({ custom_metadata: null })).toBeNull();
  });
});

describe("lireFedaPay — l'événement tel que FedaPay l'envoie", () => {
  const evenement = (entite: Record<string, unknown>) => ({
    name: "transaction.approved",
    object: "transaction",
    entity: { id: 516681, reference: "trx_Ab3_1759467600", status: "approved", ...entite },
  });

  it("retrouve notre référence dans les métadonnées", () => {
    const lue = lireFedaPay(evenement({ custom_metadata: { reference: "IMP-261003-ABCDEF" } }));
    expect(lue).toMatchObject({
      reference: "IMP-261003-ABCDEF",
      providerTxId: "fedapay:516681",
      statut: "CONFIRMEE",
    });
  });

  it("sans métadonnées, la référence est inconnue — et non celle de FedaPay", () => {
    const lue = lireFedaPay(evenement({}));
    expect(lue?.reference).toBeNull();
    // Le paiement se retrouve alors par l'identifiant posé à l'ouverture.
    expect(lue?.providerTxId).toBe("fedapay:516681");
  });
});

/**
 * Le montant que FedaPay notifie — revue du 07/10/2026, E2 (D-7 : hors
 * frais, vérifié le 08/10/2026 sur IMP-261005-P98AEE).
 */
describe("le montant de la notification FedaPay", () => {
  const entite = (reste: Record<string, unknown>) => ({
    entity: { id: 42, status: "approved", custom_metadata: { reference: "IMP-261008-AAAAAA" }, ...reste },
  });

  it("le montant se lit en francs, avec sa devise", () => {
    expect(lireFedaPay(entite({ amount: 15000, currency: { iso: "XOF" } }))).toMatchObject({
      montantMineur: 15000,
      devise: "XOF",
      rembourseMineur: null,
    });
  });

  it("une devise rendue par son seul identifiant reste inconnue, le montant se lit", () => {
    expect(lireFedaPay(entite({ amount: 15000, currency_id: 1 }))).toMatchObject({
      montantMineur: 15000,
      devise: null,
    });
  });

  it("un refus sans montant lisible reste un refus lisible", () => {
    expect(lireFedaPay({ entity: { id: 43, status: "declined" } })).toMatchObject({
      statut: "ECHOUEE",
      montantMineur: null,
      devise: null,
    });
  });
});
