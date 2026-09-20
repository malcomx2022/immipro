import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Aucun lien interne ne mène nulle part.
 *
 * Écrit après avoir trouvé quatre boutons morts, tous découverts en
 * cliquant : « Télécharger mes données » renvoyait sur son propre écran,
 * « Télécharger mon dossier » sur une adresse en 404 juste avant une purge
 * irréversible, et « Ouvrir ma checklist » sur une adresse en 404 juste
 * après un paiement. Aucun test ne les voyait, parce qu'un `href` est une
 * chaîne et qu'une chaîne compile.
 *
 * Le test lit les écrans **comme un texte** — même garde-fou de dérive que
 * `schema-domaine` et `api-invariants` — et vérifie que chaque adresse
 * littérale correspond à une page de l'App Router. Il ne peut rien dire des
 * adresses construites par interpolation ; c'est la limite, et elle est
 * assumée : un `href={`/dossiers/${id}`}` a au moins un segment vérifié par
 * le typage des paramètres, une chaîne entière n'en a aucun.
 */
function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

/**
 * Adresses servies, déduites de l'arborescence. Les groupes de routes —
 * `(app)`, `(auth)` — n'ajoutent pas de segment ; les segments dynamiques
 * deviennent un joker.
 */
const ROUTES = fichiers("src/app", /^page\.tsx$/u).map((f) =>
  f
    .replace(/^src\/app/u, "")
    .replace(/\/page\.tsx$/u, "")
    .replace(/\/\([^/]*\)/gu, "")
    .replace(/\[[^\]]+\]/gu, "*")
    .replace(/^$/u, "/"),
);

const sert = (adresse: string): boolean =>
  ROUTES.some((motif) => {
    const segmentsMotif = motif.split("/").filter(Boolean);
    const segments = adresse.split("/").filter(Boolean);
    if (segmentsMotif.length !== segments.length) return false;
    return segmentsMotif.every((m, i) => m === "*" || m === segments[i]);
  });

const ECRANS = [
  ...fichiers("src/app", /\.tsx$/u),
  ...fichiers("src/components", /\.tsx$/u),
];

/** `href="/quelque-chose"` — les adresses littérales, ancres et requêtes ôtées. */
function adressesDe(fichier: string): string[] {
  const source = readFileSync(fichier, "utf8");
  const trouvees = source.matchAll(/href="(\/[^"]*)"/gu);
  return [...trouvees].map((m) => m[1]!.split("#")[0]!.split("?")[0]!);
}

describe("aucun lien interne ne mène nulle part", () => {
  it("l'arborescence des routes est lue", () => {
    expect(ROUTES.length).toBeGreaterThan(20);
    expect(ROUTES).toContain("/tableau-de-bord");
    expect(ROUTES).toContain("/dossiers/*/archive");
  });

  const liens = ECRANS.flatMap((f) => adressesDe(f).map((a) => [f, a] as const));

  it("il y a des liens à vérifier", () => {
    expect(liens.length).toBeGreaterThan(10);
  });

  it.each(liens)("%s → %s est servi", (_fichier, adresse) => {
    expect(sert(adresse), `${adresse} n'a pas de page`).toBe(true);
  });

  /**
   * Un lien qui pointe sur l'écran où il se trouve est mort d'une autre
   * façon : il est servi, et il ne fait rien. C'est ainsi que
   * « Télécharger mes données » a vécu deux lots sur A-05.
   */
  it("aucun lien ne renvoie à l'écran qui le porte", () => {
    const boucles = ECRANS.flatMap((fichier) => {
      const chemin = fichier
        .replace(/^src\/app/u, "")
        .replace(/\/[^/]+\.tsx$/u, "")
        .replace(/\/\([^/]*\)/gu, "");
      if (!fichier.startsWith("src/app/") || chemin.includes("[")) return [];
      return adressesDe(fichier)
        .filter((a) => a === chemin && a !== "/")
        .map((a) => `${fichier} → ${a}`);
    });
    expect(boucles).toEqual([]);
  });
});
