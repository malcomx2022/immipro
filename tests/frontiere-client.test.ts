import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Frontière client / serveur.
 *
 * Un composant serveur qui importe une constante depuis un module
 * `"use client"` ne reçoit pas sa valeur mais une référence au module : la
 * constante arrive `undefined` et le rendu part sans elle. Le défaut est
 * invisible en test jsdom, où la directive est inerte, et invisible au
 * typage — il ne se voit qu'à l'écran. D'où ce garde-fou.
 *
 * Importer un *composant* client depuis une page serveur est en revanche le
 * passage de frontière normal : c'est ainsi qu'on rend un écran interactif.
 * Le test ne retient donc que les noms qui ne sont pas des composants —
 * constantes et fonctions, les seules dont la valeur est réellement perdue.
 */
const SANS_DIRECTIVE = ["src/components/ui/bouton-styles.ts"];

const estClient = (chemin: string) =>
  /^\s*["']use client["']/.test(readFileSync(chemin, "utf8"));

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/.test(nom)) acc.push(p);
  }
  return acc;
}

describe("frontière client", () => {
  it.each(SANS_DIRECTIVE)("%s reste utilisable depuis un composant serveur", (f) => {
    expect(estClient(f)).toBe(false);
  });

  it("aucun composant serveur n'importe de constante d'un module client", () => {
    const fautes: string[] = [];
    for (const f of fichiers("src/components").concat(fichiers("src/app"))) {
      if (estClient(f)) continue;
      const src = readFileSync(f, "utf8");
      // Imports relatifs ou par alias, hors types : c'est la valeur qui casse.
      for (const m of src.matchAll(/import\s+\{([^}]*)\}\s+from\s+["'](\.[^"']*|@\/[^"']*)["']/g)) {
        const [, importes = "", specificateur = ""] = m;
        const estComposant = (nom: string) => /^[A-Z][a-zA-Z0-9]*$/.test(nom);
        const valeurs = importes
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type ") && !estComposant(s));
        if (valeurs.length === 0) continue;

        const base = specificateur.startsWith("@/")
          ? join("src", specificateur.slice(2))
          : join(f, "..", specificateur);
        const cible = [".ts", ".tsx"]
          .map((ext) => `${base}${ext}`)
          .find((c) => {
            try {
              return statSync(c).isFile();
            } catch {
              return false;
            }
          });
        if (cible && estClient(cible)) {
          fautes.push(`${f} importe ${valeurs.join(", ")} du module client ${cible}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });
});
