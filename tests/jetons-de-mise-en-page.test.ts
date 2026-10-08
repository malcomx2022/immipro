import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

/**
 * Aucune valeur de mise en page en dur — CLAUDE.md, règle d'architecture 3 ;
 * revue du 07/10/2026, F7 (D-20 : un jeton par valeur).
 *
 * Cent trente et une largeurs arbitraires (`max-w-[640px]`, `w-[340px]`,
 * `grid-cols-[1fr_1.4fr_6rem_1fr]`…) vivaient dans les écrans, et rien ne
 * les interdisait. Elles ont désormais un nom dans `tailwind.config.ts`.
 * Une valeur arbitraire numérique dans le code de l'interface fait échouer
 * cet essai : la largeur se déclare en jeton, ou réutilise un jeton
 * existant.
 */
function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p);
  }
  return acc;
}

/** `max-w-[640px]`, `md:w-[320px]`, `text-[17px]`, `grid-cols-[1fr_2rem]` : un utilitaire suivi d'une valeur entre crochets qui porte un chiffre. */
const ARBITRAIRE = /(?<![\w-])(?:[a-z]+:)*[a-z][a-z-]*-\[[^\]\s"'`]*\d[^\]\s"'`]*\]/gu;

describe("les largeurs passent par des jetons", () => {
  it("aucune valeur arbitraire numérique dans l'interface", () => {
    const fautes: string[] = [];
    for (const f of fichiers("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(ARBITRAIRE)) fautes.push(`${f} : ${m[0]}`);
    }
    expect(fautes).toEqual([]);
  });

  it("le garde-fou reconnaît bien ce qu'il refuse", () => {
    const essais = ["max-w-[640px]", "md:w-[320px]", "grid-cols-[1fr_1.4fr_6rem_1fr]", "max-w-[calc(100vw-4rem)]"];
    for (const e of essais) expect(`className="${e}"`.match(ARBITRAIRE), e).not.toBeNull();
    expect('className="max-w-decision md:w-versions"'.match(ARBITRAIRE)).toBeNull();
  });

  it("les jetons gardent leurs valeurs d'avant (D-20 : sans regroupement)", () => {
    const { maxWidth, width, gridTemplateColumns } = config.theme.extend;
    expect(maxWidth).toMatchObject({ decision: "640px", colonne: "720px", texte: "760px", "lecture-large": "80ch" });
    expect(width).toMatchObject({ panneau: "340px", versions: "320px", recherche: "240px" });
    expect(gridTemplateColumns.revue).toBe("1fr 1.4fr 6rem 1fr");
  });
});
