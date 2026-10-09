import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cheminDeRetour, cleDOuverture } from "@/domain/paiement/ouverture";
import { cleDIdempotence } from "@/domain/paiement/remboursement";
import {
  adaptateurStripe,
  consultantStripe,
  remboursementStripe,
  VERSION_API_STRIPE,
} from "@/server/paiement/stripe";

/**
 * La version d'API Stripe est figée — revue du 07/10/2026, M19 étape 1
 * (D-31 du 09/10/2026).
 *
 * Sans en-tête `Stripe-Version`, chaque appel prenait la version par
 * défaut du compte : une montée faite au tableau de bord changeait la forme
 * des sessions et des remboursements que nos schémas lisent, sans qu'une
 * ligne de code ait bougé. La version est celle du SDK 17.7.0 contre lequel
 * l'adaptateur a été écrit, retiré ici : il n'était importé nulle part.
 */
const appels: Array<{ url: string; version: string | undefined }> = [];

function simuler(charge: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const entetes = (options?.headers ?? {}) as Record<string, string>;
      appels.push({ url, version: entetes["Stripe-Version"] });
      return { status: 200, json: async () => charge } as unknown as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  appels.length = 0;
});

describe("Stripe-Version sur chaque appel", () => {
  it("la version figée est celle de D-31", () => {
    expect(VERSION_API_STRIPE).toBe("2025-02-24.acacia");
  });

  it("ouverture, consultation et remboursement la portent", async () => {
    const reference = "IMP-261009-STRIPE";
    simuler({ id: "cs_1", url: "https://checkout.stripe.com/x", amount_total: 1200, currency: "eur", metadata: { reference }, payment_intent: "pi_1" });
    await adaptateurStripe("sk_essai", (c) => new URL(c, "https://immipro.test").toString()).creer({
      reference,
      montant: 12,
      devise: "EUR",
      cle: cleDOuverture(reference),
      retour: cheminDeRetour(reference),
      intitule: "ImmiPro — Pack Dossier",
    });
    await consultantStripe("sk_essai").consulter("stripe:cs_1", reference);
    await remboursementStripe("sk_essai").demander({
      reference,
      providerTxId: "stripe:cs_1",
      montant: 12,
      devise: "EUR",
      cle: cleDIdempotence(reference),
    });

    expect(appels.length).toBeGreaterThanOrEqual(3);
    for (const appel of appels) expect(appel.version, appel.url).toBe(VERSION_API_STRIPE);
  });

  it("le paquet stripe, jamais importé, n'est plus une dépendance", () => {
    const paquet = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(paquet.dependencies?.stripe).toBeUndefined();
    expect(paquet.devDependencies?.stripe).toBeUndefined();
  });
});
