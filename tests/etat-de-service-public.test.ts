import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpsPublic } from "@/domain/exploitation/etat-public";
import { jetonValide, lecteurExploitant } from "@/server/exploitation/lecteur";

/**
 * `/api/health` public, sans limitation, hors composeur — revue du
 * 07/10/2026, M10 (D-4 : un anonyme lit `{ status, db }`).
 */
describe("ce que lit un anonyme", () => {
  it("le statut et la base, rien d'autre", () => {
    const complet = {
      status: "pilote",
      db: "up" as const,
      aptitude: "PILOTE",
      fournisseursDePaiement: { ouverts: ["FEDAPAY"] },
      remboursementManuel: { payes: 4 },
      facturation: { obstacles: ["certification"] },
    };
    expect(corpsPublic(complet)).toEqual({ status: "pilote", db: "up" });
  });
});

describe("qui lit le détail", () => {
  const JETON = "un-jeton-d-exploitation-assez-long";

  it.each([
    ["un administrateur connecté", { role: "ADMIN" }, null, JETON, true],
    ["le jeton juste", null, `Bearer ${JETON}`, JETON, true],
    ["un veilleur", { role: "VEILLEUR" }, null, JETON, false],
    ["un candidat", { role: "CANDIDAT" }, null, JETON, false],
    ["un anonyme", null, null, JETON, false],
    ["un jeton faux de même longueur", null, `Bearer ${JETON.replace(/.$/u, "x")}`, JETON, false],
    ["un jeton de longueur différente", null, `Bearer ${JETON}-et-plus`, JETON, false],
    ["un autre schéma", null, `Basic ${JETON}`, JETON, false],
    ["un jeton attendu vide", null, "Bearer ", "", false],
    ["un jeton attendu absent", null, `Bearer ${JETON}`, undefined, false],
  ] as const)("%s → %s", (_cas, acteur, entete, attendu, lit) => {
    expect(lecteurExploitant(acteur as never, entete, attendu)).toBe(lit);
  });

  it("la comparaison du jeton est à temps constant", () => {
    const src = readFileSync("src/server/exploitation/lecteur.ts", "utf8");
    expect(src).toContain("timingSafeEqual");
    expect(src).not.toMatch(/jeton\s*===\s*attendu|attendu\s*===\s*jeton/u);
    expect(jetonValide(null, "x")).toBe(false);
  });
});

describe("la route", () => {
  const SOURCE = readFileSync("src/app/api/health/route.ts", "utf8");

  it("passe par le composeur, en lecture limitée", () => {
    expect(SOURCE).toMatch(/export const GET = route\(\{/u);
    expect(SOURCE).toMatch(/acces: "public"/u);
    expect(SOURCE).toMatch(/limite: "lecture"/u);
    expect(SOURCE).not.toMatch(/export\s+async\s+function\s+GET/u);
  });

  it("rend le corps public sauf à l'exploitant, avec le même code HTTP", () => {
    expect(SOURCE).toMatch(/lecteur \? corps : corpsPublic\(corps\)/u);
    expect(SOURCE).toMatch(/status: enService \? 200 : 503/u);
  });
});

describe("les tâches en échec (revue M9)", async () => {
  const { messageDesTachesEnEchec } = await import("@/server/exploitation/taches");

  it("dit les files, et ce qui n'a pas pu être lu", () => {
    expect(messageDesTachesEnEchec({ lisible: true, parFile: {}, total: 0 })).toBe(
      "Aucune tâche en échec depuis 24 h.",
    );
    expect(
      messageDesTachesEnEchec({ lisible: true, parFile: { "regle.divergence": 2, "retention.purge": 1 }, total: 3 }),
    ).toBe("3 tâche(s) en échec depuis 24 h : regle.divergence (2), retention.purge (1).");
    expect(messageDesTachesEnEchec({ lisible: false, parFile: {}, total: 0 })).toMatch(/n'ont pas pu être lues/u);
  });
});
