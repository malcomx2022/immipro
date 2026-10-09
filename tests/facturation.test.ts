import { describe, expect, it } from "vitest";
import {
  exerciceDe,
  intituleDeLaPiece,
  numeroDeLaPiece,
} from "@/domain/facturation/numerotation";
import { depuisSousUnite, versSousUnite } from "@/domain/paiement/ouverture";
import {
  depuisMineur,
  enLettres,
  formatMineur,
  libelleDuTaux,
  mentionDeTva,
  montantEnLettres,
  regimeDeTva,
  prixPayeMineur,
  ventiler,
  versMineur,
} from "@/domain/facturation/montants";
import {
  dateDeLaPrestation,
  emetteurDeLaFacture,
  identiteDeFacturation,
  modeDeReglement,
  obstaclesALaFacturation,
} from "@/domain/facturation/facture";

/**
 * Facturation — avis comptable M.C du 04/10/2026.
 */
describe("numérotation (avis M.C, point 3)", () => {
  it("suit le format de l'avis, par série et par exercice", () => {
    expect(numeroDeLaPiece("FACTURE", "REELLE", 2026, 1)).toBe("RD-2026-00001");
    expect(numeroDeLaPiece("AVOIR", "REELLE", 2026, 12)).toBe("AV-2026-00012");
  });

  it("isole les paiements d'essai dans leur propre série", () => {
    expect(numeroDeLaPiece("FACTURE", "ESSAI", 2026, 1)).toBe("ESSAI-RD-2026-00001");
    expect(intituleDeLaPiece("AVOIR", "ESSAI")).toBe("Facture d'avoir d'essai");
  });

  it("s'allonge sans se tronquer et refuse un rang qui n'existe pas", () => {
    expect(numeroDeLaPiece("FACTURE", "REELLE", 2026, 123456)).toBe("RD-2026-123456");
    expect(() => numeroDeLaPiece("FACTURE", "REELLE", 2026, 0)).toThrow(/commence à 1/u);
  });

  it("date l'exercice à l'heure de Cotonou", () => {
    // 31/12/2026 à 23 h 30 à Cotonou = 22 h 30 UTC : encore 2026.
    expect(exerciceDe(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
    // 1er janvier 2027 à 0 h 30 à Cotonou = 31/12 à 23 h 30 UTC : déjà 2027.
    expect(exerciceDe(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

describe("date de la prestation (revue F5, D-14 option a)", () => {
  // Vente le 31/12/2026 à 23 h 50 à Cotonou, pièce émise le 02/01/2027
  // par le filet de la réconciliation.
  const vente = { confirmedAt: new Date("2026-12-31T22:50:00Z"), refundedAt: null };
  const emiseLe = new Date("2027-01-02T08:00:00Z");

  it("la pièce porte la date de la vente, l'exercice celui de l'émission", () => {
    expect(dateDeLaPrestation("FACTURE", vente, emiseLe)).toEqual(vente.confirmedAt);
    expect(exerciceDe(emiseLe)).toBe(2027);
    expect(exerciceDe(dateDeLaPrestation("FACTURE", vente, emiseLe))).toBe(2026);
  });

  it("l'avoir porte la date du remboursement, non celle de la vente", () => {
    const rendue = { ...vente, refundedAt: new Date("2027-01-01T10:00:00Z") };
    expect(dateDeLaPrestation("AVOIR", rendue, emiseLe)).toEqual(rendue.refundedAt);
  });

  it("sans date de la vente, l'émission : ce que la pièce portait jusqu'ici", () => {
    expect(dateDeLaPrestation("FACTURE", { confirmedAt: null, refundedAt: null }, emiseLe)).toEqual(emiseLe);
  });
});

describe("TVA extraite d'un prix TTC (décision du 04/10/2026)", () => {
  it("lit le régime déclaré, et seulement lui", () => {
    expect(regimeDeTva("non_assujettie")).toEqual({ declare: true, assujettie: false });
    expect(regimeDeTva("18")).toEqual({ declare: true, assujettie: true, tauxBp: 1800 });
    expect(regimeDeTva('"18 %"')).toEqual({ declare: true, assujettie: true, tauxBp: 1800 });
    expect(regimeDeTva("18,5")).toEqual({ declare: true, assujettie: true, tauxBp: 1850 });
    expect(regimeDeTva("")).toEqual({ declare: false, illisible: false });
    expect(regimeDeTva("dix-huit")).toEqual({ declare: false, illisible: true });
    expect(regimeDeTva("0")).toEqual({ declare: false, illisible: true });
  });

  it("garde le prix payé et en extrait la TVA, dont la somme tient", () => {
    const regime = regimeDeTva("18");
    expect(ventiler(5000, regime)).toEqual({ ht: 4237, tva: 763, ttc: 5000, tauxBp: 1800 });
    for (const ttc of [3000, 5000, 15000, 45000, 20000, 1200, 2900, 5900]) {
      const v = ventiler(ttc, regime);
      expect(v.ht + v.tva).toBe(ttc);
    }
  });

  it("un seul prix payé en unités mineures, une seule table de facteurs (revue M18)", () => {
    expect(prixPayeMineur({ amountMajor: 12, currency: "EUR" })).toBe(1200);
    expect(prixPayeMineur({ amountMajor: 5000, currency: "XOF" })).toBe(5000);
    for (const devise of ["XOF", "EUR", "xof", "eur", "USD", "CHF"]) {
      for (const montant of [0, 1, 12, 29.9, 5000]) {
        expect(versSousUnite(montant, devise)).toBe(versMineur(montant, devise));
        expect(depuisSousUnite(versMineur(montant, devise), devise)).toBe(depuisMineur(versMineur(montant, devise), devise));
      }
    }
  });

  it("compte l'euro en centimes, pour que la TVA tombe juste", () => {
    expect(versMineur(12, "EUR")).toBe(1200);
    expect(versMineur(5000, "XOF")).toBe(5000);
    expect(ventiler(1200, regimeDeTva("18"))).toEqual({ ht: 1017, tva: 183, ttc: 1200, tauxBp: 1800 });
    expect(formatMineur(1017, "EUR")).toMatch(/^10,17\s€$/u);
  });

  it("ne facture aucune TVA sans assujettissement déclaré", () => {
    expect(ventiler(5000, regimeDeTva("non_assujettie"))).toEqual({ ht: 5000, tva: 0, ttc: 5000, tauxBp: null });
    expect(ventiler(5000, regimeDeTva(""))).toEqual({ ht: 5000, tva: 0, ttc: 5000, tauxBp: null });
    expect(mentionDeTva(regimeDeTva(""))).toMatch(/essai/u);
    expect(libelleDuTaux(1850)).toBe("18,5 %");
  });
});

describe("la somme en toutes lettres (avis M.C, point 2)", () => {
  it.each([
    [1, "un"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [91, "quatre-vingt-onze"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [1000, "mille"],
    [80000, "quatre-vingt mille"],
    [200000, "deux cent mille"],
    [1000000, "un million"],
    [2500000, "deux millions cinq cent mille"],
  ])("%i → %s", (n, mots) => {
    expect(enLettres(n)).toBe(mots);
  });

  it("dit le montant et la devise des prix de la grille", () => {
    expect(montantEnLettres(5000, "XOF")).toBe("cinq mille francs CFA");
    expect(montantEnLettres(45000, "XOF")).toBe("quarante-cinq mille francs CFA");
    expect(montantEnLettres(1000000, "XOF")).toBe("un million de francs CFA");
    expect(montantEnLettres(1200, "EUR")).toBe("douze euros");
    expect(montantEnLettres(1017, "EUR")).toBe("dix euros et dix-sept centimes");
    expect(montantEnLettres(101, "EUR")).toBe("un euro et un centime");
  });
});

describe("ce qui ferme la série réelle", () => {
  const complet = {
    denomination: "Rêveur Digital",
    forme_juridique: "SARL",
    capital_social: "1 000 000 F CFA",
    siege_social: "Cotonou, Bénin",
    rccm: "RB/COT/00-A-0000",
    ifu: "0000000000000",
    email_contact: "client@reveurdigital.com",
  };

  it("exige le capital, que le reçu ne demandait pas", () => {
    expect(emetteurDeLaFacture(complet)?.[0]).toBe("Rêveur Digital, SARL au capital de 1 000 000 F CFA");
    expect(emetteurDeLaFacture({ ...complet, capital_social: " " })).toBeNull();
  });

  it("veut le nom et l'adresse du client, l'un sans l'autre ne suffit pas", () => {
    expect(identiteDeFacturation("  Awa  Koffi ", "Cotonou")).toEqual({ nom: "Awa Koffi", adresse: "Cotonou" });
    expect(identiteDeFacturation("Awa Koffi", "")).toBeNull();
    expect(identiteDeFacturation(null, "Cotonou")).toBeNull();
  });

  it("nomme chaque obstacle, et n'en invente aucun", () => {
    expect(
      obstaclesALaFacturation({ certificationBranchee: false, emetteurComplet: false, regime: regimeDeTva("") }),
    ).toEqual(["certification_absente", "emetteur_incomplet", "regime_tva_non_declare"]);
    expect(
      obstaclesALaFacturation({ certificationBranchee: true, emetteurComplet: true, regime: regimeDeTva("18") }),
    ).toEqual([]);
  });

  it("dit l'opérateur quand il est connu, et le dit inconnu sinon", () => {
    expect(modeDeReglement("FEDAPAY", "MTN")).toBe("Mobile Money (MTN), via FedaPay");
    expect(modeDeReglement("FEDAPAY", null)).toMatch(/non communiqué/u);
  });
});
