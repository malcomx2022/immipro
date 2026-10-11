import { describe, expect, it } from "vitest";
import { mesurerLesJetons, usageARapprocher, MAXIMUM_JETONS } from "@/domain/ia/usage";
import { coutMicrosDesJetons } from "@/domain/backoffice/couts";

describe("INV-6 — des compteurs observés, représentables en base", () => {
  it.each([-1, 1.5, Infinity, -Infinity, NaN, "12", {}, [], MAXIMUM_JETONS + 1, Number.MAX_SAFE_INTEGER])("refuse %j et garde le côté connu", (v) => {
    expect(mesurerLesJetons(v, 30)).toEqual({ etat: "INVALIDE", jetonsEntree: null, jetonsSortie: 30 });
  });
  it.each([0, 12, MAXIMUM_JETONS])("conserve le vrai entier %i", (v) => {
    expect(mesurerLesJetons(v, 0)).toEqual({ etat: "CONNUE", jetonsEntree: v, jetonsSortie: 0 });
  });
  it("ne qualifie pas les anciens zéros et ne change pas leurs nombres", () => {
    expect(usageARapprocher(null, 0, 0)).toBe(true);
    expect(usageARapprocher("CONNUE", 0, 0)).toBe(false);
    expect(usageARapprocher(null, 120, 30)).toBe(false);
    expect(usageARapprocher(null, -1, 30)).toBe(true);
  });
  it("ne calcule pas le coût d'une consommation inconnue ou invalide", () => {
    const tarif = { entreeParMillion: 3, sortieParMillion: 15, devise: "EUR" };
    expect(coutMicrosDesJetons(tarif, null, 30)).toBeNull();
    expect(coutMicrosDesJetons(tarif, -1, 30)).toBeNull();
    expect(coutMicrosDesJetons(tarif, 0, 0)).toBe(0);
    expect(coutMicrosDesJetons({ ...tarif, entreeParMillion: Number.MAX_VALUE }, 100, 30)).toBeNull();
  });
});
