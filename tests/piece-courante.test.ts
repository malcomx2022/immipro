import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * RF-2, FON-02 — 09/10/2026. La version courante commande la pièce.
 *
 * L'analyse, le balayage et la revue humaine écrivaient l'état d'une pièce
 * depuis le résultat d'une version, sans vérifier qu'elle était encore la
 * dernière : le verdict d'une v1 lente s'affichait avec le fichier v2.
 * `smoke:extraction` et `smoke:balayage` rejouent les courses sur une base
 * réelle ; ce garde-fou empêche qu'un quatrième écrivain contourne la règle.
 */
const lire = (chemin: string) => readFileSync(chemin, "utf8");

const ECRIVAINS = [
  "src/server/jobs/analyse.ts",
  "src/server/jobs/balayage.ts",
  "src/server/revue/decision.ts",
];

describe("seule la version courante écrit sur la pièce", () => {
  it.each(ECRIVAINS)("%s n'écrit la pièce qu'à travers la règle commune", (chemin) => {
    const source = lire(chemin);
    expect(source).not.toMatch(/\bdocument\.update(Many)?\(/u);
    expect(source).toContain("ecrireSurLaPieceCourante(");
  });

  it("la règle tient la version la plus récente et le dossier modifiable, dans l'écriture", () => {
    const regle = lire("src/server/acces/piece-courante.ts");
    expect(regle).toMatch(/versions: \{ none: \{ rank: \{ gt: rang \} \} \}/u);
    expect(regle).toMatch(/status: \{ notIn: \[\.\.\.ETATS_FIGES\] \}/u);
    expect(regle).toContain("document.updateMany(");
  });

  it("une lecture obsolète est rendue au candidat (choix A-2)", () => {
    const analyse = lire("src/server/jobs/analyse.ts");
    expect([...analyse.matchAll(/rendreUneAnalyse\([^)]*MOTIF_OBSOLETE/gu)]).toHaveLength(2);
    expect(analyse).toContain("creditConsumed: consomme && courante");
  });
});
