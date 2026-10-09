import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * Une version de pièce s'analyse une fois — INV-6, revue du 07/10/2026, E5.
 *
 * La file rejoue un job dont l'acquittement s'est perdu. Le job ne
 * regardait pas si la version avait déjà son verdict : le rejeu débitait
 * une seconde analyse, rappelait le modèle, écrivait un second verdict et
 * envoyait une seconde notification. `smoke:extraction` l'exécute sur une
 * base réelle ; ces lignes tiennent la forme du code qui l'empêche.
 */
const job = sansCommentaires(readFileSync("src/server/jobs/analyse.ts", "utf8"));

describe("le job d'analyse ne paie pas deux fois la même lecture", () => {
  it("la garde de tête précède le débit et l'appel au modèle", () => {
    const garde = job.indexOf("if (version.analyses.length > 0) return \"TERMINEE\"");
    expect(garde).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(job.indexOf("debiterUneAnalyse("));
    expect(garde).toBeLessThan(job.indexOf("await extraire("));
    expect(garde).toBeLessThan(job.indexOf("autorisationAccordee("));
  });

  it("chaque verdict s'écrit dans une transaction unique, avec sa notification", () => {
    // Les trois issues : illisible, verdict, hors sujet.
    expect([...job.matchAll(/await consignerUneFois\(/gu)]).toHaveLength(3);
    // Plus aucune écriture du verdict, de la pièce ou de la notification
    // hors de la transaction.
    expect(job).not.toMatch(/await db\.documentAnalysis\.create\(/u);
    expect(job).not.toMatch(/await db\.notification\.create\(/u);
    // Une seule mise à jour de la pièce reste hors transaction : le retrait
    // d'autorisation, qui n'écrit aucun verdict et ne débite rien. Elle
    // passe, comme les autres, par la règle de la version courante (RF-2).
    expect(job).not.toMatch(/\bdb\.document\.update\(/u);
    const horsTransaction = [
      ...job.matchAll(/await ecrireSurLaPieceCourante\(db,[\s\S]*?\}\);/gu),
    ];
    expect(horsTransaction).toHaveLength(1);
    expect(horsTransaction[0]![0]).toContain("MENTION_NON_ANALYSEE.autorisation_retiree");
  });

  it("la course perdue rend l'analyse débitée, et ne laisse rien d'autre", () => {
    const consigner = job.slice(job.indexOf("async function consignerUneFois("));
    expect(consigner).toContain("await db.$transaction(ecrire)");
    expect(consigner).toMatch(/code !== "P2002"\) throw erreur/u);
    expect(consigner).toMatch(/if \(consomme\) \{\s*await rendreUneTentative\(/u);
  });

  it("le reclassement hors sujet dit ce qu'il a coûté et relie son débit", () => {
    const hors = job.slice(job.indexOf("async function acheverHorsSujet("));
    expect(hors).toContain("creditConsumed: cout.consomme && courante");
    expect(hors).toMatch(/where: \{ id: cout\.ligne, analysisId: null \}/u);
  });

  it("la base départage deux exécutions simultanées", () => {
    const migration = readFileSync(
      "prisma/migrations/20261007160000_une_analyse_par_version/migration.sql",
      "utf8",
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "documentanalysis_une_par_version"\s+ON "DocumentAnalysis" \("versionId"\)/u,
    );
    expect(readFileSync("scripts/verifier-garde-fous.sql", "utf8")).toContain(
      "INV-6 · une seconde analyse sur la même version",
    );
  });
});
