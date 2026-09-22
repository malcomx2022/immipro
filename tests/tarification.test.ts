import { describe, expect, it } from "vitest";
import {
  analysesParDestination,
  MARGE_MINIMALE_RECHARGE,
  PACKS,
  packMisEnAvant,
  pireTauxParPack,
  RECHARGE_ANALYSES,
  type Devise,
} from "@/domain/payments/pricing";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

const DEVISES: readonly Devise[] = ["XOF", "EUR"];

describe("mise en avant — arbitrage du 18/09/2026", () => {
  it("un seul pack est mis en avant, et c'est Dossier", () => {
    const misEnAvant = PACKS.filter((p) => p.misEnAvant);
    expect(misEnAvant).toHaveLength(1);
    expect(misEnAvant[0]?.code).toBe("dossier");
    expect(packMisEnAvant()?.code).toBe("dossier");
  });

  it("Essentiel reste premier dans l'ordre de lecture, sans être recommandé", () => {
    expect(PACKS[0]?.code).toBe("essentiel");
    expect(PACKS[0]?.misEnAvant).toBe(false);
  });

  it("chaque pack porte une justification factuelle, jamais commerciale", () => {
    for (const pack of PACKS) {
      expect(pack.justification.length).toBeGreaterThan(10);
      // « Le plus choisi », « le plus populaire » : une popularité n'est pas
      // une raison, et le produit la contredit en support 48 h plus tard.
      expect(pack.justification).not.toMatch(/populaire|plus choisi|meilleur|best/i);
      expect(verifierTexte(pack.justification, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    }
  });
});

describe("règle de tarification de la recharge", () => {
  it("expose le prix au token le plus élevé de la grille", () => {
    // Essentiel est le pack le plus cher au token : c'est lui que la
    // recharge doit dépasser.
    expect(pireTauxParPack("EUR")).toBeCloseTo(12 / 120_000, 10);
    expect(pireTauxParPack("XOF")).toBeCloseTo(5000 / 120_000, 10);
  });

  it("place la marge minimale à 50 %", () => {
    expect(MARGE_MINIMALE_RECHARGE).toBe(1.5);
  });

  /**
   * La règle ne peut pas encore être appliquée : la recharge est libellée en
   * analyses, les packs sont contingentés en tokens, et le volume de la
   * recharge n'est pas fixé tant que le coût réel d'une analyse n'est pas
   * mesuré sur dix dossiers. Le test dit ce qui manque, il ne fige pas un
   * chiffre que la mesure va refaire.
   */
  it("reste à appliquer : la recharge n'a pas encore de volume en tokens", () => {
    expect(RECHARGE_ANALYSES).not.toHaveProperty("tokens");
    for (const devise of DEVISES) {
      expect(pireTauxParPack(devise)).toBeGreaterThan(0);
      expect(RECHARGE_ANALYSES.prix[devise]).toBeGreaterThan(0);
    }
  });

  it("garde le plancher de collecte (RG-05.5)", () => {
    expect(RECHARGE_ANALYSES.prix.XOF).toBeGreaterThanOrEqual(3000);
  });
});

/**
 * RG-03.1 — un pack couvre le nombre de destinations qu'il annonce.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * `Pack.destinations` était déclaré sur les trois packs et lu par aucun
 * code. Un achat de Pro — 45 000 XOF, badge « Trois destinations comparées
 * en parallèle » — ouvrait ses quatre-vingt-dix analyses sur un seul
 * dossier. Exécuté avant correction, contre une vraie base :
 *
 *     dossier 1 : 90 analyses
 *     dossier 2 : 0
 *     dossier 3 : 0
 *     destinations réellement couvertes : 1 sur 3
 *
 * Le candidat payait trois fois le prix de Dossier et recevait un seul
 * dossier servi.
 */
describe("la part d'analyses par destination", () => {
  it("se divise sans reste sur toute la grille", () => {
    for (const pack of PACKS) {
      expect(analysesParDestination(pack) * pack.destinations).toBe(pack.analyses);
    }
  });

  /**
   * Ce n'est pas une division choisie, c'est la grille : 90 = 3 × 30, et
   * une destination de Pro vaut exactement un pack Dossier. Si les deux
   * cessent de coïncider, c'est l'intention de la grille qui a changé, et
   * ce test doit le dire avant le code.
   *
   * Le **prix**, lui, n'est pas linéaire, et c'est voulu : 45 000 XOF font
   * bien trois fois 15 000, mais 59 € n'en font pas trois fois 29. Pro est
   * un lot remisé en euros. L'assertion ne porte donc que sur ce que la
   * couverture distribue — les analyses —, jamais sur le prix.
   */
  it("fait d'une destination de Pro exactement un pack Dossier", () => {
    const dossier = PACKS.find((p) => p.code === "dossier")!;
    const pro = PACKS.find((p) => p.code === "pro")!;

    expect(analysesParDestination(pro)).toBe(analysesParDestination(dossier));
    expect(pro.analyses).toBe(dossier.analyses * pro.destinations);
  });

  it("reste remisé en euros, et le lot n'est pas une simple multiplication", () => {
    const dossier = PACKS.find((p) => p.code === "dossier")!;
    const pro = PACKS.find((p) => p.code === "pro")!;

    expect(pro.prix.XOF).toBe(dossier.prix.XOF * pro.destinations);
    expect(pro.prix.EUR).toBeLessThan(dossier.prix.EUR * pro.destinations);
  });

  it("ne change rien aux packs qui n'ouvrent qu'une destination", () => {
    for (const pack of PACKS.filter((p) => p.destinations === 1)) {
      expect(analysesParDestination(pack)).toBe(pack.analyses);
    }
  });
});
