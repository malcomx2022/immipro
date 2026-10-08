import { afterEach, describe, expect, it, vi } from "vitest";
import { arreterProprement, DELAI_D_ARRET_MS } from "@/server/jobs/arret";

/**
 * Arrêt propre du worker — revue du 07/10/2026, M9. Le signal réel est
 * éprouvé par `npm run smoke:worker -- --base` ; ici, la conduite.
 */
describe("arreterProprement", () => {
  const ecoutes: Array<[string, (...a: unknown[]) => void]> = [];
  const surveiller = () =>
    vi.spyOn(process, "on").mockImplementation(((signal: string, f: (...a: unknown[]) => void) => {
      ecoutes.push([signal, f]);
      return process;
    }) as never);

  afterEach(() => {
    ecoutes.length = 0;
    vi.restoreAllMocks();
  });

  it("écoute SIGTERM et SIGINT", () => {
    surveiller();
    arreterProprement({ stop: vi.fn() } as never, vi.fn());
    expect(ecoutes.map(([s]) => s).sort()).toEqual(["SIGINT", "SIGTERM"]);
  });

  it("laisse finir les tâches, dit « worker arrêté » et sort en 0", async () => {
    surveiller();
    const journal = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const stop = vi.fn().mockResolvedValue(undefined);
    const sortir = vi.fn();
    const arreter = arreterProprement({ stop } as never, sortir);
    await arreter("SIGTERM");
    expect(stop).toHaveBeenCalledWith({ graceful: true, wait: true, timeout: DELAI_D_ARRET_MS });
    expect(journal).toHaveBeenCalledWith("worker arrêté");
    expect(sortir).toHaveBeenCalledWith(0);
  });

  it("un second signal pendant l'arrêt est ignoré", async () => {
    surveiller();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    let finir!: () => void;
    const stop = vi.fn().mockReturnValue(new Promise<void>((r) => (finir = r)));
    const sortir = vi.fn();
    const arreter = arreterProprement({ stop } as never, sortir);
    const premier = arreter("SIGTERM");
    await arreter("SIGINT");
    finir();
    await premier;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(sortir).toHaveBeenCalledTimes(1);
  });

  it("un arrêt qui échoue sort en 1", async () => {
    surveiller();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sortir = vi.fn();
    await arreterProprement({ stop: vi.fn().mockRejectedValue(new Error("base partie")) } as never, sortir)(
      "SIGTERM",
    );
    expect(sortir).toHaveBeenCalledWith(1);
  });
});
