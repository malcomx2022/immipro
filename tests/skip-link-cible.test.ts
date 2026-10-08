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
const RACINES = [
  join("src", "app", "(public)"),
  join("src", "app", "(auth)"),
  join("src", "app", "(app)"),
  join("src", "app", "(admin)"),
];

/**
 * Composants partagés qui posent la cible pour la route qui les rend.
 *
 * Le back-office la met dans son en-tête plutôt que dans chacun de ses
 * sept registres, et les deux index de rubrique — guides et articles — la
 * mettent dans `Rubrique`, qui les rend tous les deux. Répéter le même
 * titre focalisable dans chaque écran finirait par diverger. Chaque
 * porteur est vérifié une fois, ci-dessous.
 */
const PORTEURS = ["EnteteAdmin", "Rubrique", "TexteJuridique"];

const FICHIERS_PORTEURS: Record<string, string> = {
  EnteteAdmin: join("src", "components", "admin", "EnteteAdmin.tsx"),
  Rubrique: join("src", "components", "ui", "Rubrique.tsx"),
  // S.101 — les quatre pages juridiques le partagent.
  TexteJuridique: join("src", "components", "juridique", "TexteJuridique.tsx"),
};

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
  const dossiers = RACINES.flatMap((r) => routes(r));

  it("il y a bien des routes à vérifier, dans les quatre gabarits", () => {
    expect(dossiers.length).toBeGreaterThanOrEqual(35);
  });

  it.each(PORTEURS)("le composant partagé %s pose bien la cible", (porteur) => {
    const src = readFileSync(FICHIERS_PORTEURS[porteur]!, "utf8");
    expect(src).toContain('id="contenu"');
    expect(src).toContain("tabIndex={-1}");
  });

  /*
    Les pages d'état — revue du 07/10/2026, E8. Un `not-found`, un `error`
    ou un `loading` remplace la page : il doit poser la cible lui-même, ou
    passer par un composant qui la pose.
  */
  const ETATS = readdirSync(join("src", "app"), { recursive: true, encoding: "utf8" })
    .filter((f) => /(^|\/)(not-found|error|loading|global-error)\.tsx$/u.test(f))
    .map((f) => join("src", "app", f));
  const PORTEURS_D_ETAT: Record<string, string> = {
    EtatDEcran: join("src", "components", "ui", "EtatDEcran.tsx"),
    ChargementDePage: join("src", "components", "etats", "ChargementDePage.tsx"),
  };
  const RELAIS = ["PageIntrouvable", "EchecDeRendu"];

  it("il y a bien des pages d'état à vérifier", () => {
    expect(ETATS.length).toBeGreaterThanOrEqual(15);
  });

  it.each(Object.keys(PORTEURS_D_ETAT))("le composant d'état %s pose bien la cible", (porteur) => {
    const src = readFileSync(PORTEURS_D_ETAT[porteur]!, "utf8");
    expect(src).toContain('id="contenu"');
    expect(src).toContain("tabIndex={-1}");
  });

  it.each(RELAIS)("%s rend EtatDEcran", (relais) => {
    expect(readFileSync(join("src", "components", "etats", `${relais}.tsx`), "utf8")).toContain("<EtatDEcran");
  });

  it.each(ETATS)("%s rend la cible du lien d'évitement", (f) => {
    const src = readFileSync(f, "utf8");
    const porteurs = [...Object.keys(PORTEURS_D_ETAT), ...RELAIS];
    expect(porteurs.some((p) => src.includes(`<${p}`)), f).toBe(true);
  });

  it.each(dossiers)("%s pose un titre focalisable id=\"contenu\"", (dir) => {
    const src = sourcesDeLaRoute(dir);
    if (PORTEURS.some((p) => src.includes(`<${p}`))) return;
    expect(src).toContain('id="contenu"');
    expect(src).toContain("tabIndex={-1}");
  });
});
