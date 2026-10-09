import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INV-6 se lit en analyses — revue du 07/10/2026, M6 (D-1 du 09/10/2026).
 *
 * Le quota est le grand livre `AnalysisCredit` : une analyse par pièce lue
 * ou par mise en forme et relecture assistées, l'unité que le candidat voit
 * et achète (RG-15.2). Les jetons sont mesurés sur chaque appel (`AiUsage`)
 * et surveillés contre `Pack.tokensIA` par l'alerte de B-07 ; ils ne
 * plafonnent rien.
 *
 * CLAUDE.md et DOC-11 disaient « quota de tokens », et `verifierQuota`,
 * sans appelant, en était la trace dans le code. Ce test empêche les deux
 * lectures de se recontredire.
 */
const lire = (chemin: string) => readFileSync(chemin, "utf8");

function sources(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx)$/u.test(nom)) acc.push(p);
  }
  return acc;
}

describe("INV-6 : quota d'analyses, jetons mesurés et surveillés", () => {
  it("CLAUDE.md et DOC-11 ne parlent plus de quota de tokens", () => {
    for (const fichier of ["CLAUDE.md", join("docs", "DOC-11-workflows.md")]) {
      expect(lire(fichier), fichier).not.toMatch(/quota (de|des|en) (tokens|jetons)/iu);
    }
  });

  it("CLAUDE.md et DOC-11 portent la même ligne d'INV-6", () => {
    const ligne = (texte: string) => texte.split("\n").find((l) => l.startsWith("| INV-6 |"));
    const claude = ligne(lire("CLAUDE.md"));
    const doc11 = ligne(lire(join("docs", "DOC-11-workflows.md")));
    expect(claude).toMatch(/quota d'analyses/u);
    expect(doc11).toMatch(/quota d'analyses/u);
    for (const l of [claude, doc11]) expect(l).toMatch(/dépassement silencieux/u);
  });

  it("aucun contrôle de quota en jetons ne survit dans le code", () => {
    const fautifs = sources("src").filter((f) => /\bverifierQuota\b|\bQuotaCheck\b/u.test(lire(f)));
    expect(fautifs).toEqual([]);
    // Ni à l'écran de B-07, qui l'affirmait à l'exploitant.
    const affirment = sources("src").filter((f) => /quota\s+(des packs\s+)?reste compté en jetons/iu.test(lire(f)));
    expect(affirment).toEqual([]);
  });
});
