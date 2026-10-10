import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Les réponses du simulateur comme source externe — S.164, RF-7.
 *
 * Les écrans les lisaient dans un effet, puis les recopiaient dans un
 * état. Ils les lisent désormais par `useSyncExternalStore` : la source
 * doit rendre la même référence tant que rien ne change, et l'écran doit
 * suivre le geste même quand le stockage refuse d'écrire.
 */
type Module = typeof import("@/lib/simulation-session");

async function charger(): Promise<Module> {
  vi.resetModules();
  return import("@/lib/simulation-session");
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useReponsesDeSession", () => {
  it("lit la session, suit l'écriture et l'effacement", async () => {
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "ETUDES" }));
    const m = await charger();
    const { result } = renderHook(() => m.useReponsesDeSession());
    expect(result.current).toEqual({ objectif: "ETUDES" });

    act(() => m.ecrireReponses({ objectif: "TRAVAIL" }));
    expect(result.current).toEqual({ objectif: "TRAVAIL" });
    expect(m.lireReponses()).toEqual({ objectif: "TRAVAIL" });

    act(() => m.effacerReponses());
    expect(result.current).toEqual({});
    expect(window.sessionStorage.getItem("immipro.simulation")).toBeNull();
  });

  it("même référence d'un rendu à l'autre tant que rien ne change", async () => {
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "ETUDES" }));
    const m = await charger();
    const { result, rerender } = renderHook(() => m.useReponsesDeSession());
    const premiere = result.current;
    rerender();
    expect(result.current).toBe(premiere);
  });

  it("stockage refusé à l'écriture : l'écran suit quand même le geste", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const m = await charger();
    const { result } = renderHook(() => m.useReponsesDeSession());
    expect(result.current).toEqual({});

    act(() => m.ecrireReponses({ objectif: "TRAVAIL" }));
    expect(result.current).toEqual({ objectif: "TRAVAIL" });

    act(() => m.effacerReponses());
    expect(result.current).toEqual({});
  });

  it("stockage illisible : état vide, sans erreur", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqué", "SecurityError");
    });
    const m = await charger();
    const { result } = renderHook(() => m.useReponsesDeSession());
    expect(result.current).toEqual({});
    expect(m.lireReponses()).toEqual({});
  });
});
