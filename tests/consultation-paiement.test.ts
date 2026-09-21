import { afterEach, describe, expect, it, vi } from "vitest";
import { cleDEvenementDeReconciliation } from "@/domain/paiement/ouverture";
import { consultantStripe, ETAT_DE_LINTENTION } from "@/server/paiement/stripe";
import { consultantFedaPay, CONSULTATION_NON_OPERATIONNELLE } from "@/server/paiement/fedapay";
import { leConsultant } from "@/server/paiement/consultation";

/**
 * La consultation d'un paiement — RG-05.4.
 *
 * Le webhook peut se perdre. Ce que la consultation a le droit de
 * conclure, et surtout ce qu'elle n'a pas le droit de conclure, se joue
 * ici : **une absence de réponse n'est pas un refus bancaire**, et une
 * cause d'échec ne s'invente pas.
 *
 * La concurrence webhook/réconciliation demande une base, et vit dans
 * `scripts/fumee-reconciliation.mts`.
 */

const reponse = (statut: number, charge: unknown) => ({
  status: statut,
  json: async () => charge,
});

function simuler(...reponses: Array<{ status: number; json: () => Promise<unknown> } | Error>) {
  const appels: Array<{ url: string }> = [];
  let rang = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      appels.push({ url });
      const suivante = reponses[Math.min(rang++, reponses.length - 1)];
      if (suivante instanceof Error) throw suivante;
      return suivante as unknown as Response;
    }),
  );
  return appels;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const REFERENCE = "IMP-260921-ABCDEF";
const ID = "stripe:cs_test_1";
const session = (reste: Record<string, unknown>) => ({
  id: "cs_test_1",
  metadata: { reference: REFERENCE },
  ...reste,
});

describe("l'identifiant d'événement de réconciliation", () => {
  it("est déterministe : deux passes sur le même état portent la même clé", () => {
    expect(cleDEvenementDeReconciliation(REFERENCE, "CONFIRMEE")).toBe(
      cleDEvenementDeReconciliation(REFERENCE, "CONFIRMEE"),
    );
  });

  it("distingue les états, et ne se confond pas avec un webhook", () => {
    expect(cleDEvenementDeReconciliation(REFERENCE, "CONFIRMEE")).not.toBe(
      cleDEvenementDeReconciliation(REFERENCE, "ECHOUEE"),
    );
    expect(cleDEvenementDeReconciliation(REFERENCE, "CONFIRMEE")).not.toMatch(/^stripe:|^fedapay:/u);
  });
});

describe("la consultation Stripe retrouve ce que le webhook a perdu", () => {
  const consultant = consultantStripe("sk_essai");

  it("un paiement confirmé", async () => {
    simuler(reponse(200, session({ payment_status: "paid", status: "complete" })));
    expect(await consultant.consulter(ID, REFERENCE)).toEqual({
      issue: "connu",
      statut: "CONFIRMEE",
      providerTxId: "stripe:cs_test_1",
    });
  });

  it("un paiement encore en cours", async () => {
    simuler(
      reponse(
        200,
        session({
          payment_status: "unpaid",
          payment_intent: { id: "pi_1", status: "processing" },
        }),
      ),
    );
    expect(await consultant.consulter(ID, REFERENCE)).toMatchObject({
      issue: "connu",
      statut: "EN_ATTENTE",
    });
  });

  /**
   * Un refus, avec la cause **que le fournisseur a donnée** — jamais une
   * autre, et aucune quand il n'en donne pas de reconnue (N.B).
   */
  it("un refus, avec la cause qu'il donne", async () => {
    simuler(
      reponse(
        200,
        session({
          payment_status: "unpaid",
          payment_intent: {
            id: "pi_1",
            status: "requires_payment_method",
            last_payment_error: { decline_code: "insufficient_funds" },
          },
        }),
      ),
    );
    const vu = await consultant.consulter(ID, REFERENCE);
    expect(vu).toMatchObject({ issue: "connu", statut: "ECHOUEE" });
    expect((vu as { cause?: string }).cause).toBe("SOLDE_INSUFFISANT");
  });

  it("un refus dont le code est inconnu reste un refus sans cause", async () => {
    simuler(
      reponse(
        200,
        session({
          payment_status: "unpaid",
          payment_intent: {
            id: "pi_1",
            status: "requires_payment_method",
            last_payment_error: { decline_code: "un_code_que_personne_ne_connait" },
          },
        }),
      ),
    );
    const vu = await consultant.consulter(ID, REFERENCE);
    expect(vu).toEqual({ issue: "connu", statut: "ECHOUEE", providerTxId: "stripe:cs_test_1" });
  });

  /**
   * L'onglet fermé n'est pas une carte rejetée. Écrire `ECHOUEE` ici
   * accuserait le moyen de paiement d'un candidat que personne n'a
   * refusé, et le motif partirait jusque sur son écran.
   */
  it("une session abandonnée n'est pas un refus", async () => {
    for (const etat of ["requires_payment_method", "canceled"]) {
      simuler(
        reponse(200, session({ payment_status: "unpaid", payment_intent: { id: "pi_1", status: etat } })),
      );
      expect(await consultant.consulter(ID, REFERENCE), etat).toEqual({ issue: "sans_paiement" });
    }
  });

  it("une session expirée sans paiement non plus", async () => {
    simuler(reponse(200, session({ payment_status: "unpaid", status: "expired" })));
    expect(await consultant.consulter(ID, REFERENCE)).toEqual({ issue: "sans_paiement" });
  });

  it("ne trouve rien : le fournisseur ne connaît pas cette session", async () => {
    simuler(reponse(404, { error: { type: "invalid_request_error" } }));
    expect(await consultant.consulter(ID, REFERENCE)).toEqual({ issue: "introuvable" });
  });

  it("sans identifiant, il n'y a rien à consulter", async () => {
    const appels = simuler(reponse(200, session({ payment_status: "paid" })));
    expect(await consultant.consulter(null, REFERENCE)).toEqual({ issue: "introuvable" });
    expect(appels).toHaveLength(0);
  });

  /* ---------------------------------------------------------------- *
   * La frontière qui compte : pas de réponse ≠ refus.
   * ---------------------------------------------------------------- */

  it("un échec temporaire ne conclut rien", async () => {
    for (const cas of [new Error("ECONNRESET"), reponse(503, {}), reponse(429, {})]) {
      simuler(cas);
      const vu = await consultant.consulter(ID, REFERENCE);
      expect(vu.issue).toBe("indisponible");
      // Surtout pas : ni refus, ni expiration, ni confirmation.
      expect(["connu", "sans_paiement"]).not.toContain(vu.issue);
    }
  });

  it("une réponse illisible ne conclut rien non plus", async () => {
    simuler(reponse(200, { quelque: "chose" }));
    expect((await consultant.consulter(ID, REFERENCE)).issue).toBe("indisponible");
  });

  it("un état d'intention inconnu ne se devine pas", async () => {
    simuler(
      reponse(
        200,
        session({ payment_status: "unpaid", payment_intent: { id: "pi_1", status: "etat_futur" } }),
      ),
    );
    expect(await consultant.consulter(ID, REFERENCE)).toEqual({
      issue: "indisponible",
      detail: "état d'intention inconnu",
    });
  });

  /** Aucun état du fournisseur ne prononce notre expiration (point 9). */
  it("aucune traduction ne mène à EXPIREE", () => {
    expect(Object.values(ETAT_DE_LINTENTION)).not.toContain("EXPIREE");
  });

  /* ---------------------------------------------------------------- *
   * Un identifiant incohérent.
   * ---------------------------------------------------------------- */

  it("une session qui n'est pas celle demandée est incohérente", async () => {
    simuler(reponse(200, { ...session({ payment_status: "paid" }), id: "cs_test_AUTRE" }));
    expect(await consultant.consulter(ID, REFERENCE)).toMatchObject({ issue: "incoherent" });
  });

  it("une référence interne qui est celle d'un autre paiement aussi", async () => {
    simuler(
      reponse(200, { ...session({ payment_status: "paid" }), metadata: { reference: "IMP-AUTRE" } }),
    );
    const vu = await consultant.consulter(ID, REFERENCE);
    expect(vu).toMatchObject({ issue: "incoherent" });
    // Et surtout, rien n'est confirmé sur la foi de cette réponse.
    expect(vu.issue).not.toBe("connu");
  });
});

describe("la consultation FedaPay est non opérationnelle, et le dit", () => {
  /**
   * Faute de documentation vérifiée, il n'y a pas de traduction honnête :
   * deviner quels états valent confirmation ou refus déciderait si un
   * candidat est crédité, et si un échec lui est imputé.
   */
  it("rend `indisponible` avec sa raison, jamais un état", async () => {
    const vu = await consultantFedaPay().consulter("fedapay:42", REFERENCE);
    expect(vu).toEqual({ issue: "indisponible", detail: CONSULTATION_NON_OPERATIONNELLE });
    expect(CONSULTATION_NON_OPERATIONNELLE).toMatch(/non branchée|non vérifi/u);
  });

  it("ne prononce ni confirmation, ni refus, ni expiration", async () => {
    const vu = await consultantFedaPay().consulter("fedapay:42", REFERENCE);
    expect(vu.issue).not.toBe("connu");
    expect(vu.issue).not.toBe("sans_paiement");
  });
});

describe("le consultant suit le fournisseur de la transaction", () => {
  const AVEC = { FEDAPAY_API_KEY: "k", STRIPE_API_KEY: "k" };

  it("chacun le sien, et jamais l'autre", () => {
    expect(leConsultant("STRIPE", AVEC)?.fournisseur).toBe("STRIPE");
    expect(leConsultant("FEDAPAY", AVEC)?.fournisseur).toBe("FEDAPAY");
  });

  it("sans clé, aucun consultant", () => {
    expect(leConsultant("STRIPE", { ...AVEC, STRIPE_API_KEY: "  " })).toBeNull();
    expect(leConsultant("FEDAPAY", {})).toBeNull();
  });
});
