import { afterEach, describe, expect, it, vi } from "vitest";
import { cleDEvenementDeReconciliation } from "@/domain/paiement/ouverture";
import { consultantStripe, ETAT_DE_LINTENTION } from "@/server/paiement/stripe";
import { consultantFedaPay } from "@/server/paiement/fedapay";
import { ETATS_FEDAPAY } from "@/server/paiement/notifications";
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

  /**
   * Le corps de la réponse est **celui d'une session payée**, et le code
   * de retour est une panne. C'est ce qui distingue le garde-fou de son
   * apparence : avec un corps vide, la lecture au schéma échouerait de
   * toute façon et le code de retour ne serait jamais consulté. Ici, s'il
   * cessait de l'être, un 503 se lirait « payé ».
   */
  it("un échec temporaire ne conclut rien, même quand le corps dit « payé »", async () => {
    const paye = session({ payment_status: "paid" });
    for (const cas of [new Error("ECONNRESET"), reponse(503, paye), reponse(429, paye)]) {
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

describe("la consultation FedaPay, branchée le 22/09/2026", () => {
  const consultant = consultantFedaPay("sk_essai", "sandbox");
  const ID_FEDAPAY = "fedapay:42";
  // `reference` est celle de FedaPay ; la nôtre revient dans les métadonnées.
  const entite = (reste: Record<string, unknown>) => ({
    id: 42,
    reference: "trx_Ab3_1759467600",
    custom_metadata: { reference: REFERENCE },
    amount: 5000,
    ...reste,
  });

  /**
   * Elle était non opérationnelle faute de savoir quels états le
   * fournisseur prononce : deviner cette table-là décide si un candidat
   * est crédité, et si un échec lui est imputé.
   *
   * La documentation publique donne la liste, et elle **coïncide** avec
   * `ETATS_FEDAPAY`, écrite d'après des notifications observées. La
   * table n'est pas recopiée : c'est la même, importée — deux tables
   * divergeraient au premier correctif.
   */
  it("traduit les six états documentés, et la table est partagée", async () => {
    const attendus: Array<[string, string]> = [
      ["approved", "CONFIRMEE"],
      ["transferred", "CONFIRMEE"],
      ["pending", "EN_ATTENTE"],
      ["declined", "ECHOUEE"],
      ["canceled", "ECHOUEE"],
      ["refunded", "REMBOURSEE"],
    ];
    for (const [brut, statut] of attendus) {
      simuler(reponse(200, entite({ status: brut })));
      expect(await consultant.consulter(ID_FEDAPAY, REFERENCE), brut).toMatchObject({
        issue: "connu",
        statut,
        providerTxId: "fedapay:42",
      });
    }
    // Les six de la documentation sont couverts par la table partagée.
    for (const [brut] of attendus) expect(ETATS_FEDAPAY[brut], brut).toBeTruthy();
  });

  /** La cause n'accompagne que ce que le fournisseur a dit (N.B). */
  it("ne prononce une cause que sur les états qui en portent une", async () => {
    simuler(reponse(200, entite({ status: "declined" })));
    expect(await consultant.consulter(ID_FEDAPAY, REFERENCE)).toMatchObject({
      cause: "REFUS_EMETTEUR",
    });

    simuler(reponse(200, entite({ status: "approved" })));
    expect(await consultant.consulter(ID_FEDAPAY, REFERENCE)).not.toHaveProperty("cause");
  });

  /**
   * **La frontière du module.** Un état hors table ne se traduit pas au
   * plus proche : le job ne conclut rien, et l'écart s'ouvre au délai
   * prévu. C'est ce qui se passait quand rien n'était branché.
   */
  it("un état inconnu rend l'indisponibilité, jamais un refus", async () => {
    simuler(reponse(200, entite({ status: "quelque_chose_de_nouveau" })));
    const vu = await consultant.consulter(ID_FEDAPAY, REFERENCE);
    expect(vu).toEqual({ issue: "indisponible", detail: "état non reconnu" });
  });

  /**
   * Même exigence que côté Stripe, et pour la même raison : le corps
   * envoyé ici est **approuvé**, seul le code de retour dit la panne. Un
   * corps vide aurait buté sur le schéma, et le garde-fou aurait paru
   * tenu sans jamais être exercé.
   */
  it("une absence de réponse n'est pas un refus bancaire, ni une confirmation", async () => {
    simuler(new Error("ECONNRESET"));
    expect((await consultant.consulter(ID_FEDAPAY, REFERENCE)).issue).toBe("indisponible");

    for (const statut of [500, 502, 429]) {
      simuler(reponse(statut, entite({ status: "approved" })));
      const vu = await consultant.consulter(ID_FEDAPAY, REFERENCE);
      expect(vu, String(statut)).toEqual({ issue: "indisponible", detail: `réponse ${statut}` });
    }
  });

  it("un 404 dit que la transaction est inconnue, et rien de plus", async () => {
    simuler(reponse(404, {}));
    expect(await consultant.consulter(ID_FEDAPAY, REFERENCE)).toEqual({ issue: "introuvable" });
  });

  /** Une transaction qui n'est pas la nôtre n'est pas une panne. */
  it("une référence étrangère rend l'incohérence", async () => {
    simuler(
      reponse(200, entite({ status: "approved", custom_metadata: { reference: "IMP-AUTRUI" } })),
    );
    expect(await consultant.consulter(ID_FEDAPAY, REFERENCE)).toMatchObject({
      issue: "incoherent",
    });
  });

  it("sans identifiant, elle n'appelle personne", async () => {
    const appels = simuler(reponse(200, entite({ status: "approved" })));
    expect((await consultant.consulter(null, REFERENCE)).issue).toBe("indisponible");
    expect(appels).toHaveLength(0);
  });

  /** La forme plate documentée, celle qui bloquait l'ouverture. */
  it("lit l'entité plate comme l'entité enveloppée", async () => {
    simuler(reponse(200, { "v1/transaction": entite({ status: "approved" }) }));
    expect((await consultant.consulter(ID_FEDAPAY, REFERENCE)).issue).toBe("connu");

    simuler(reponse(200, entite({ status: "approved" })));
    expect((await consultant.consulter(ID_FEDAPAY, REFERENCE)).issue).toBe("connu");
  });

  it("la clé secrète ne paraît jamais dans ce qui est rendu", async () => {
    simuler(reponse(500, {}));
    const vu = await consultantFedaPay("sk_tres_secrete", "sandbox").consulter(
      ID_FEDAPAY,
      REFERENCE,
    );
    expect(JSON.stringify(vu)).not.toContain("sk_tres_secrete");
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
