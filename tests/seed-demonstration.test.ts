import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  lireLaCible,
  peutEcrireLaDemonstration,
  sourcesSansReleve,
} from "@/domain/exploitation/demonstration";

/**
 * Le jeu de démonstration n'écrit que là où il le peut — revue du
 * 07/10/2026, M17.
 *
 * Il ne refusait qu'avec `NODE_ENV=production`, que `npm run seed:demo` ne
 * pose pas ; il affichait un mot de passe écrit dans le dépôt ; il effaçait
 * tout l'historique de la veille (INV-8) ; et sa candidate avait une
 * adresse sur un domaine réel.
 */
const LOCALE = "postgresql://immipro:immipro@localhost:5432/immipro";

describe("trois conditions, toutes exigées", () => {
  it("une base locale, nommée, sans facture réelle : la graine écrit", () => {
    expect(peutEcrireLaDemonstration(LOCALE, "immipro", 0)).toEqual({ ecrire: true, base: "immipro" });
  });

  it("le service `postgres` du compose et les adresses de boucle sont locaux", () => {
    for (const hote of ["postgres", "127.0.0.1", "[::1]"]) {
      const url = `postgresql://u:p@${hote}:5432/immipro`;
      expect(peutEcrireLaDemonstration(url, "immipro", 0).ecrire).toBe(true);
    }
  });

  it("un hôte distant est refusé, même confirmé", () => {
    const decision = peutEcrireLaDemonstration("postgresql://u:p@db.immipro.bj:5432/immipro", "immipro", 0);
    expect(decision).toEqual({ ecrire: false, raison: expect.stringMatching(/« db\.immipro\.bj ».*locale/u) });
  });

  it("sans confirmation, ou avec le nom d'une autre base, la graine dit quoi poser", () => {
    for (const confirmation of [undefined, "", "immipro_prod"]) {
      const decision = peutEcrireLaDemonstration(LOCALE, confirmation, 0);
      expect(decision).toEqual({ ecrire: false, raison: expect.stringContaining("SEED_DEMO_BASE=immipro") });
    }
  });

  it("une base qui a encaissé pour de vrai est refusée, même locale et confirmée", () => {
    // Un tunnel SSH vers la production se présente comme `localhost`.
    const decision = peutEcrireLaDemonstration(LOCALE, "immipro", 3);
    expect(decision).toEqual({ ecrire: false, raison: expect.stringMatching(/3 facture\(s\) de série réelle/u) });
  });

  it("une URL absente ou illisible est refusée", () => {
    for (const url of [undefined, "", "pas une url", "postgresql://u:p@localhost:5432/"]) {
      expect(peutEcrireLaDemonstration(url, "immipro", 0).ecrire).toBe(false);
    }
  });

  it("le nom de la base est lu sans ses paramètres", () => {
    expect(lireLaCible(`${LOCALE}?schema=public`)).toEqual({ hote: "localhost", base: "immipro" });
  });
});

describe("l'historique de la veille ne s'efface pas — INV-8", () => {
  it("un relevé ne se crée que pour une source qui n'en a aucun", () => {
    expect(sourcesSansReleve(["a", "b", "b"], ["a"])).toEqual(["b"]);
    expect(sourcesSansReleve(["a"], ["a"])).toEqual([]);
  });
});

describe("la graine elle-même", () => {
  const graine = readFileSync("prisma/seed/demonstration.ts", "utf8");

  it("passe par la décision du domaine, et non par NODE_ENV seul", () => {
    expect(graine).toMatch(/peutEcrireLaDemonstration\(/u);
    expect(graine).toMatch(/invoice\.count\(\{ where: \{ series: "REELLE" \} \}\)/u);
    expect(graine).not.toMatch(/process\.env\.NODE_ENV/u);
  });

  it("n'écrit plus de mot de passe dans le dépôt", () => {
    expect(graine).not.toMatch(/MOT_DE_PASSE\s*=\s*"/u);
    expect(graine).toMatch(/randomBytes\(/u);
  });

  it("n'efface plus l'historique de la veille", () => {
    expect(graine).not.toMatch(/sourceCheck\.deleteMany/u);
  });

  it("n'utilise que des adresses sur un domaine réservé", () => {
    const creees = [...graine.matchAll(/^const EMAIL = "([^"]+)"|email: "([^"]+)"/gmu)].map((m) => m[1] ?? m[2]);
    expect(creees.length).toBeGreaterThan(0);
    for (const adresse of creees) expect(adresse).toMatch(/@[\w.-]+\.test$/u);
  });
});
