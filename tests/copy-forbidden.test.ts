import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Interdit de vocabulaire dans l'interface candidat (CLAUDE.md, arbitrage C-09).
 * Complète `npm run check:copy` : aucune chaîne ne parle de score, de pourcentage
 * ou de chances à propos du dossier. Le back-office (src/app/(admin)) est exclu.
 */
const INTERDITS = [/\bscore\b/i, /\bchances?\b/i, /\d\s?%/, /\bsur 100\b/i, /probabilit/i, /garanti/i];

/**
 * Un spécificateur de module n'est jamais affiché : `@/domain/completeness/score`
 * nomme le barème interne, que le back-office lit et que le candidat ne voit
 * pas. L'interdit porte sur ce qui s'affiche, pas sur ce qui s'importe.
 */
const sansSpecificateurs = (src: string) =>
  src.replace(/\bfrom\s+(["'])[^"']*\1/g, "").replace(/\bimport\s*\(?\s*(["'])[^"']*\1/g, "");

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) { if (!p.includes("(admin)")) fichiers(p, acc); }
    else if (/\.tsx?$/.test(nom)) acc.push(p);
  }
  return acc;
}

describe("vocabulaire interdit côté candidat", () => {
  it("aucune chaîne de l'interface ne contient score, %, chances ou sur 100", () => {
    const fautes: string[] = [];
    for (const f of fichiers("src/app").concat(fichiers("src/components"))) {
      const src = sansSpecificateurs(readFileSync(f, "utf8"));
      const chaines = src.match(/(["'\`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
      for (const s of chaines) for (const re of INTERDITS) if (re.test(s)) fautes.push(`${f}: ${s}`);
    }
    expect(fautes).toEqual([]);
  });
});
