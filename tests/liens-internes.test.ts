import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Aucun lien interne ne mène à une route absente — S.157, R-03.
 *
 * La recette RF-5 a trouvé deux liens de C-08 (« Signaler une erreur de
 * lecture », « Voir l'historique des versions ») qui menaient à un 404
 * depuis leur écriture : rien ne confrontait les adresses écrites dans les
 * écrans à l'arborescence de `src/app`. Ce test le fait : chaque `href`
 * (ou `retour`) qui commence par « / » doit correspondre à une page ou une
 * route, les segments `${…}` valant pour un segment dynamique.
 */
const fichiers: string[] = [];
const parcourir = (dossier: string): void => {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) parcourir(chemin);
    else if (/\.tsx?$/u.test(nom)) fichiers.push(chemin);
  }
};
parcourir("src");

const routes: string[][] = [];
const arborescence = (dossier: string, segments: string[]): void => {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      // Un groupe `(…)` ne compte pas dans l'adresse.
      arborescence(chemin, /^\(.*\)$/u.test(nom) ? segments : [...segments, nom]);
    } else if (nom === "page.tsx" || nom === "route.ts") {
      routes.push(segments);
    }
  }
};
arborescence("src/app", []);

const existe = (adresse: string): boolean => {
  const morceaux = adresse.split("/").filter(Boolean);
  return routes.some(
    (r) =>
      r.length === morceaux.length &&
      r.every((s, i) => s.startsWith("[") || morceaux[i] === "*" || s === morceaux[i]),
  );
};

describe("liens internes", () => {
  it("mènent tous à une page ou une route existante", () => {
    const morts: string[] = [];
    for (const fichier of fichiers) {
      const texte = readFileSync(fichier, "utf8");
      for (const m of texte.matchAll(/(?:href|retour)=\{?[`"'](\/[^`"'?#\s]*)/gu)) {
        const adresse = m[1]!.replace(/\$\{[^}]+\}/gu, "*");
        if (adresse === "/" || adresse.startsWith("/api/")) continue;
        if (!existe(adresse)) morts.push(`${fichier} → ${m[1]}`);
      }
    }
    expect(morts).toEqual([]);
  });

  it("connaît les deux écrans que C-08 annonce", () => {
    expect(existe("/dossiers/*/pieces/*/versions")).toBe(true);
    expect(existe("/api/dossiers/*/pieces/*/signalement")).toBe(true);
    expect(existe("/dossiers/*/pieces/*/signalement")).toBe(false);
  });
});
