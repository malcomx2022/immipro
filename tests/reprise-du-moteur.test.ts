import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CADENCE_DE_REPRISE_DU_MOTEUR_MS,
  DUREE_DE_REPRISE_DU_MOTEUR_MS,
  delaiAvantLaProchaineReprise,
  moteurAReprendre,
  type IssueDuMoteur,
} from "@/domain/exploitation/reprise-du-moteur";
import { reprendreLeMoteurAuDemarrage } from "@/server/exploitation/sondes";

/**
 * Le démarrage à froid de l'antivirus — S.161, constat du 09/10/2026.
 *
 * Démarré avant clamd, le worker trouvait le moteur muet et l'instance
 * restait en 503 jusqu'à l'heure pile. Il le réessaie désormais toutes
 * les 30 s, 10 min au plus.
 */
describe("la règle de reprise", () => {
  it("seul un moteur muet se reprend", () => {
    expect(moteurAReprendre("muet")).toBe(true);
    expect(moteurAReprendre("reconnu")).toBe(false);
    expect(moteurAReprendre("non_configure")).toBe(false);
    expect(moteurAReprendre(undefined)).toBe(false);
  });

  it("30 s entre deux essais, dix minutes au plus", () => {
    expect(CADENCE_DE_REPRISE_DU_MOTEUR_MS).toBe(30_000);
    expect(DUREE_DE_REPRISE_DU_MOTEUR_MS).toBe(600_000);
    expect(delaiAvantLaProchaineReprise(0, 0)).toBe(30_000);
    expect(delaiAvantLaProchaineReprise(0, 570_000)).toBe(30_000);
    expect(delaiAvantLaProchaineReprise(0, 570_001)).toBeNull();
  });

  it("la fenêtre couvre la mise en route de la passerelle (start_period du compose)", () => {
    const compose = readFileSync("docker-compose.prod.yml", "utf8");
    const passerelle = compose.split(/^ {2}antivirus:$/mu)[1]!.split(/^ {2}\S/mu)[0]!;
    const demarrage = Number(passerelle.match(/start_period: (\d+)s/u)?.[1]);
    expect(demarrage).toBeGreaterThan(0);
    expect(DUREE_DE_REPRISE_DU_MOTEUR_MS).toBeGreaterThan(demarrage * 1000 * 2);
  });
});

/** Une horloge qui avance de ce qu'on attend, sans attendre. */
function banc(reponses: (IssueDuMoteur | undefined)[]) {
  let temps = 0;
  const attentes: number[] = [];
  const journal: string[] = [];
  let appels = 0;
  return {
    attentes,
    journal,
    appels: () => appels,
    options: {
      horloge: () => temps,
      attendre: async (ms: number) => {
        attentes.push(ms);
        temps += ms;
      },
      sonder: async () => reponses[Math.min(appels++, reponses.length - 1)],
      journal: (ligne: string) => journal.push(ligne),
    },
  };
}

describe("la reprise au démarrage du worker", () => {
  it("un moteur reconnu ou absent n'est pas réessayé", async () => {
    for (const premiere of ["reconnu", "non_configure", undefined] as const) {
      const b = banc(["reconnu"]);
      const r = await reprendreLeMoteurAuDemarrage(premiere, b.options);
      expect(r).toEqual({ essais: 0, issue: premiere });
      expect(b.appels()).toBe(0);
      expect(b.journal).toEqual([]);
    }
  });

  it("muet au démarrage, reconnu au troisième essai : trois essais, puis on s'arrête", async () => {
    const b = banc(["muet", "muet", "reconnu"]);
    const r = await reprendreLeMoteurAuDemarrage("muet", b.options);
    expect(r).toEqual({ essais: 3, issue: "reconnu" });
    expect(b.attentes).toEqual([30_000, 30_000, 30_000]);
    expect(b.journal[0]).toMatch(/antivirus muet au démarrage : nouvel essai toutes les 30 s, 10 min au plus/u);
    expect(b.journal.at(-1)).toMatch(/antivirus reconnu après 3 essai\(s\)/u);
  });

  it("toujours muet : vingt essais, puis la passe horaire prend la suite", async () => {
    const b = banc(["muet"]);
    const r = await reprendreLeMoteurAuDemarrage("muet", b.options);
    expect(r).toEqual({ essais: 20, issue: "muet" });
    expect(b.attentes.reduce((a, n) => a + n, 0)).toBe(DUREE_DE_REPRISE_DU_MOTEUR_MS);
    expect(b.journal.at(-1)).toMatch(/toujours muet après 20 essai\(s\) : la passe horaire prend la suite/u);
  });

  it("une sonde qui ne répond rien arrête la reprise sans lever", async () => {
    const b = banc([undefined]);
    const r = await reprendreLeMoteurAuDemarrage("muet", b.options);
    expect(r).toEqual({ essais: 1, issue: undefined });
  });
});

describe("le worker la lance après les sondes du démarrage", () => {
  const worker = readFileSync("src/server/jobs/worker.ts", "utf8");

  it("avec l'issue du démarrage, sans l'attendre", () => {
    expect(worker).toMatch(/const sondesDuDemarrage = await sonderLesServices\(\);/u);
    expect(worker).toMatch(/void reprendreLeMoteurAuDemarrage\(sondesDuDemarrage\.antivirus\)\.catch\(/u);
    expect(worker.indexOf("reprendreLeMoteurAuDemarrage(sondesDuDemarrage")).toBeLessThan(
      worker.indexOf("demarrerLeBattement();"),
    );
  });
});
