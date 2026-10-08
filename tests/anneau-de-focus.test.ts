import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * L'anneau de focus n'est jamais retiré d'un élément qu'on atteint à la
 * tabulation — règle clavier 3 ; revue du 07/10/2026, M12.
 *
 * `outline-none` n'est permis que sur un élément en `tabIndex={-1}` — un
 * titre qui reçoit le focus par programme, pas par la tabulation — et sur
 * le dialogue de `BottomSheet`, qui le reçoit à l'ouverture et dont le
 * premier contrôle porte l'anneau. Deux éléments tabulables, une option de
 * liste et un panneau d'onglet, l'avaient perdu.
 */
function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (nom.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/** La balise ouvrante qui contient la position `i`, accolades et chaînes comprises. */
function baliseOuvrante(src: string, i: number): string {
  let debut = i;
  while (debut > 0 && !/<[A-Za-z]/u.test(src.slice(debut, debut + 2))) debut -= 1;
  let profondeur = 0;
  let guillemet: string | null = null;
  for (let j = debut + 1; j < src.length; j += 1) {
    const c = src[j]!;
    if (guillemet) {
      if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'" || c === "`") guillemet = c;
    else if (c === "{") profondeur += 1;
    else if (c === "}") profondeur -= 1;
    else if (c === ">" && profondeur === 0) return src.slice(debut, j + 1);
  }
  return src.slice(debut);
}

const PERMIS = [join("src", "components", "ui", "BottomSheet.tsx")];

describe("anneau de focus", () => {
  it("outline-none seulement sur un élément en tabIndex={-1}", () => {
    const fautes: string[] = [];
    let vus = 0;
    for (const f of fichiers("src")) {
      if (PERMIS.includes(f)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\boutline-none\b/gu)) {
        vus += 1;
        const balise = baliseOuvrante(src, m.index);
        if (!balise.includes("tabIndex={-1}")) fautes.push(`${f} : ${balise.slice(0, 80)}`);
      }
    }
    expect(vus).toBeGreaterThan(40);
    expect(fautes).toEqual([]);
  });
});
