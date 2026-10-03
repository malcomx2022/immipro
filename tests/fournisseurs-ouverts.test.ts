import { describe, expect, it } from "vitest";
import {
  deviseProposee,
  devisesOuvertes,
  fournisseursDeclares,
  mentionRailFerme,
} from "@/domain/payments/rail";
import { espaceReel, fournisseursActifs } from "@/server/paiement/secrets";
import { lOuvreur, ouvertureConfiguree } from "@/server/paiement/ouvreurs";
import { remboursementConfigure } from "@/server/paiement/remboursement";
import { observer, sonderLesSignatures } from "@/server/exploitation/capacites";
import { DEPENDANCES, capacite } from "@/domain/exploitation/dependances";

/**
 * Le pilote FedaPay seul — 03/10/2026.
 *
 * Les clés FedaPay sont posées en production, celles de Stripe vides par
 * choix. L'état de service exigeait les deux et lisait « non configuré »
 * une instance prête à encaisser en francs CFA ; l'écran proposait de
 * payer par carte un paiement que rien ne pouvait ouvrir.
 */
const PILOTE = {
  PAIEMENT_FOURNISSEURS: "FEDAPAY",
  FEDAPAY_ENVIRONMENT: "sandbox",
  FEDAPAY_API_KEY: "sk_sandbox_essai",
  FEDAPAY_WEBHOOK_SECRET: "wh_sandbox_essai",
  APP_URL: "https://immipro.test",
};
const par = (cle: string) => DEPENDANCES.find((d) => d.cle === cle)!;

describe("fournisseursDeclares", () => {
  it("lit la déclaration, sans tenir compte de la casse ni des espaces", () => {
    expect(fournisseursDeclares("fedapay").fournisseurs).toEqual(["FEDAPAY"]);
    expect(fournisseursDeclares(" FEDAPAY , stripe ").fournisseurs).toEqual(["FEDAPAY", "STRIPE"]);
  });

  it("absente ou vide, elle vaut les deux — le comportement d'avant", () => {
    expect(fournisseursDeclares(undefined).fournisseurs).toEqual(["FEDAPAY", "STRIPE"]);
    expect(fournisseursDeclares("").fournisseurs).toEqual(["FEDAPAY", "STRIPE"]);
  });

  it("tolère les guillemets et un commentaire de fin, selon l'outil qui charge le fichier", () => {
    expect(fournisseursDeclares('"FEDAPAY"')).toMatchObject({ fournisseurs: ["FEDAPAY"], declaration: "lue" });
    expect(fournisseursDeclares("'fedapay'").fournisseurs).toEqual(["FEDAPAY"]);
    expect(fournisseursDeclares("FEDAPAY # pilote").fournisseurs).toEqual(["FEDAPAY"]);
    expect(fournisseursDeclares("FEDAPAY\r").fournisseurs).toEqual(["FEDAPAY"]);
  });

  it("dit ce que la déclaration a donné, pour l'état de service", () => {
    expect(fournisseursDeclares(undefined).declaration).toBe("absente");
    expect(fournisseursDeclares("FEDAPAY").declaration).toBe("lue");
    expect(fournisseursDeclares("fedapy").declaration).toBe("illisible");
  });

  it("une faute de frappe ne ferme pas tout le paiement, et se signale", () => {
    const lu = fournisseursDeclares("fedapy");
    expect(lu.fournisseurs).toEqual(["FEDAPAY", "STRIPE"]);
    expect(lu.inconnus).toEqual(["FEDAPY"]);
  });
});

describe("devises ouvertes", () => {
  it("FedaPay seul : le franc CFA seul", () => {
    expect(devisesOuvertes(["FEDAPAY"])).toEqual(["XOF"]);
    expect(devisesOuvertes(["FEDAPAY", "STRIPE"])).toEqual(["XOF", "EUR"]);
  });

  it("un compte qui suggère l'euro se voit proposer la devise ouverte", () => {
    expect(deviseProposee("EUR", ["XOF"])).toBe("XOF");
    expect(deviseProposee("EUR", ["XOF", "EUR"])).toBe("EUR");
  });

  it("le rail fermé se dit, avec ce qui reste possible", () => {
    expect(mentionRailFerme("EUR")).toMatch(/pas encore ouvert/u);
    expect(mentionRailFerme("EUR")).toMatch(/Mobile Money/u);
  });
});

describe("le serveur suit la déclaration", () => {
  it("l'ouverture est configurée sans clé Stripe", () => {
    expect(fournisseursActifs(PILOTE)).toEqual(["FEDAPAY"]);
    expect(ouvertureConfiguree(PILOTE)).toBe(true);
    // Sans déclaration, les deux clés restent exigées.
    expect(ouvertureConfiguree({ ...PILOTE, PAIEMENT_FOURNISSEURS: "" })).toBe(false);
  });

  it("un rail fermé n'ouvre rien, même si une clé traîne", () => {
    expect(lOuvreur("XOF", PILOTE)?.fournisseur).toBe("FEDAPAY");
    expect(lOuvreur("EUR", { ...PILOTE, STRIPE_API_KEY: "sk_test_oubliee" })).toBeNull();
  });

  it("le remboursement n'exige que la clé des rails ouverts", () => {
    expect(remboursementConfigure(PILOTE)).toBe(true);
  });

  it("l'état de service lit la confirmation des paiements opérationnelle", () => {
    expect(sonderLesSignatures(PILOTE)).toBe("CONCLUANTE");
    const paiements = par("paiements");
    expect(capacite(paiements, observer(paiements, PILOTE))).toBe("OPERATIONNELLE");
    const ouverture = par("ouverture_paiement");
    expect(observer(ouverture, PILOTE).configuree).toBe(true);
  });

  it("sans secret entrant, rien n'est configuré — fail-closed (INV-7)", () => {
    const sansSecret = { ...PILOTE, FEDAPAY_WEBHOOK_SECRET: "" };
    const paiements = par("paiements");
    expect(observer(paiements, sansSecret).configuree).toBe(false);
    expect(sonderLesSignatures(sansSecret)).toBe("ABSENTE");
  });
});

describe("espaceReel — l'encaissement réel attend les conditions publiées", () => {
  it("FedaPay : seul `live` encaisse ; le bac à sable est l'espace par défaut", () => {
    expect(espaceReel("FEDAPAY", { FEDAPAY_ENVIRONMENT: "live" })).toBe(true);
    expect(espaceReel("FEDAPAY", { FEDAPAY_ENVIRONMENT: " LIVE " })).toBe(true);
    expect(espaceReel("FEDAPAY", { FEDAPAY_ENVIRONMENT: "sandbox" })).toBe(false);
    expect(espaceReel("FEDAPAY", {})).toBe(false);
  });

  it("Stripe : une clé live, et elle seule", () => {
    expect(espaceReel("STRIPE", { STRIPE_API_KEY: "sk_live_abc" })).toBe(true);
    expect(espaceReel("STRIPE", { STRIPE_API_KEY: "rk_live_abc" })).toBe(true);
    expect(espaceReel("STRIPE", { STRIPE_API_KEY: "sk_test_abc" })).toBe(false);
  });
});
