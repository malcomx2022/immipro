import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Règle clavier 2 : « Aller au contenu » est le premier arrêt de chaque
 * écran et déplace le focus sur le titre, rendu focalisable par
 * `tabindex="-1"`. Le lien vit dans le gabarit et vise `#contenu` ; chaque
 * route doit donc poser cet identifiant, sinon le premier arrêt de
 * tabulation ne mène nulle part.
 *
 * Le test lit les sources plutôt que de rendre chaque page : il attrape la
 * route ajoutée sans sa cible, ce qu'aucun rendu d'écran existant ne ferait.
 */
const RACINE = join("src", "app", "(public)");

function routes(dir: string, acc: string[] = []): string[] {
  const entrees = readdirSync(dir);
  if (entrees.includes("page.tsx")) acc.push(dir);
  for (const nom of entrees) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) routes(p, acc);
  }
  return acc;
}

/** Sources d'une route : sa page et les composants posés à côté d'elle. */
function sourcesDeLaRoute(dir: string): string {
  return readdirSync(dir)
    .filter((n) => n.endsWith(".tsx") && n !== "layout.tsx")
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n");
}

describe("cible du lien d'évitement", () => {
  const dossiers = routes(RACINE);

  it("il y a bien des routes publiques à vérifier", () => {
    expect(dossiers.length).toBeGreaterThanOrEqual(7);
  });

  it.each(dossiers)("%s pose un titre focalisable id=\"contenu\"", (dir) => {
    const src = sourcesDeLaRoute(dir);
    expect(src).toContain('id="contenu"');
    expect(src).toContain("tabIndex={-1}");
  });
});
