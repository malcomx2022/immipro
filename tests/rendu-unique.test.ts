import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * Une revue se tranche une fois, une analyse se rend une fois — INV-6,
 * revue du 07/10/2026, F4.
 *
 * La décision de revue lisait `decidedAt` puis écrivait sans condition, et
 * `rendreUneAnalyse` lisait s'il existait un rendu puis écrivait le sien :
 * deux gestes simultanés passaient tous deux. `smoke:extraction` exécute
 * deux décisions simultanées ; ces lignes tiennent la forme du code.
 */
describe("ce qui départage deux gestes simultanés", () => {
  const decision = sansCommentaires(readFileSync("src/server/revue/decision.ts", "utf8"));
  const quota = sansCommentaires(readFileSync("src/server/acces/quota.ts", "utf8"));

  it("la décision s'écrit à condition que personne ne l'ait prise", () => {
    expect(decision).toMatch(/tx\.manualReview\.updateMany\(\{\s*where: \{ id: revue\.id, decidedAt: null \}/u);
    expect(decision).toMatch(/if \(count === 0\) \{\s*throw echec\("etat_incompatible"/u);
    expect(decision).not.toMatch(/db\.manualReview\.update\(/u);
  });

  it("l'avis part dans la même transaction que la décision, et le journal après", () => {
    const transaction = decision.indexOf("await db.$transaction(async (tx) =>");
    expect(transaction).toBeGreaterThan(-1);
    expect(decision.indexOf("tx.notification.create(")).toBeGreaterThan(transaction);
    expect(decision.indexOf("await journaliser(")).toBeGreaterThan(
      decision.indexOf("tx.notification.create("),
    );
  });

  it("un second rendu bute sur l'unicité et ne rend rien", () => {
    const rendre = quota.slice(quota.indexOf("export async function rendreUneAnalyse("));
    expect(rendre).toMatch(/code === "P2002"\) return false/u);
    const migration = readFileSync(
      "prisma/migrations/20261008092000_un_seul_rendu_par_analyse/migration.sql",
      "utf8",
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "analysiscredit_un_seul_rendu_par_analyse"[\s\S]*WHERE "reason" = 'ANALYSE_RENDUE' AND "analysisId" IS NOT NULL/u,
    );
  });
});
