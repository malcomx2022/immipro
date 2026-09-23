import { describe, expect, it } from "vitest";
import { ficheParSlug, libellePieces, rangAffiche } from "@/domain/destinations/fiche";
import { CLASSEMENT, FICHES } from "@/lib/contenu/destinations";
import { formatMontant } from "@/lib/utils";

describe("fiches destination", () => {
  it("retrouve une fiche par son slug, et rien sinon", () => {
    expect(ficheParSlug(FICHES, "pays-bas")?.pays).toBe("Pays-Bas");
    expect(ficheParSlug(FICHES, "atlantide")).toBeUndefined();
  });

  it("numérote les rangs à partir de 1", () => {
    expect(rangAffiche(0)).toBe("1");
    expect(rangAffiche(2)).toBe("3");
  });

  it("accorde le décompte des pièces", () => {
    expect(libellePieces(8)).toBe("8 pièces à réunir");
    expect(libellePieces(1)).toBe("1 pièce à réunir");
    /*
      Zéro n'est pas un nombre de pièces mais une absence de liste. La forme
      accordée rendait « 0 pièce à réunir », et C-04 enchaînait « le détail,
      pièce par pièce, s'ouvre avec le dossier » — un détail promis sur une
      liste vide. Quatre écrans lisent ce libellé.
    */
    expect(libellePieces(0)).toBe("Aucune pièce n'est consignée");
  });
});

describe("INV-8 — toute information réglementaire porte sa source et sa date", () => {
  it("chaque fiche destination porte une source et une date de vérification", () => {
    for (const fiche of FICHES) {
      expect(fiche.mention.source).not.toBe("");
      expect(Number.isNaN(Date.parse(fiche.mention.verifieeLe))).toBe(false);
    }
  });

  it("le classement en porte une aussi", () => {
    // Les guides et les articles ne sont plus des constantes du dépôt
    // (J.C) : c'est la base qui refuse désormais une publication sans
    // source ni date, et `tests/editorial.test.ts` le vérifie.
    expect(CLASSEMENT.mention.source).not.toBe("");
    expect(Number.isNaN(Date.parse(CLASSEMENT.mention.verifieeLe))).toBe(false);
  });
});

describe("INV-1 — une destination écartée l'est sur un motif vérifiable", () => {
  it("chaque écartée nomme son motif", () => {
    expect(CLASSEMENT.ecartees.length).toBeGreaterThan(0);
    for (const d of CLASSEMENT.ecartees) {
      expect(d.motif.length).toBeGreaterThan(20);
      expect(d.motif).not.toMatch(/profil (non )?adapt/i);
    }
  });
});

/**
 * Le test « sommaire des guides » vivait ici. Il vérifiait qu'une entrée de
 * sommaire correspondait bien à un intertitre du corps — une duplication
 * qu'il fallait surveiller, et que le prototype avait déjà ratée.
 *
 * Le sommaire se déduit maintenant des intertitres (J.C) : la classe de
 * défaut n'existe plus, et le test qui la guettait non plus. Ce qui reste à
 * vérifier, c'est la déduction elle-même — `tests/editorial.test.ts`.
 */

describe("formatMontant — copie du prototype", () => {
  // `Intl` sépare les milliers par une espace fine insécable ; la comparaison
  // porte sur la forme, pas sur le codet de l'espace.
  const normalise = (s: string) => s.replace(/\s/gu, " ");

  it("écrit le franc CFA « 5 000 F », sans décimale ni « CFA »", () => {
    expect(normalise(formatMontant(5000, "XOF"))).toBe("5 000 F");
    expect(normalise(formatMontant(6900000, "XOF"))).toBe("6 900 000 F");
    expect(formatMontant(5000, "XOF")).not.toContain("CFA");
  });

  it("écrit l'euro « 12 € », et ne garde les décimales que si elles existent", () => {
    expect(normalise(formatMontant(12, "EUR"))).toBe("12 €");
    expect(normalise(formatMontant(1130.77, "EUR"))).toBe("1 130,77 €");
  });
});
