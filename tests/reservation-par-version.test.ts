import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * RF-3 — 09/10/2026. Une opération, un débit durable.
 *
 * E5 : un arrêt entre le débit et le verdict laissait un débit que le
 * rejeu ne retrouvait pas. FON-03 : la reprise gratuite après « illisible »
 * était refusée à solde nul par la promotion et par l'annonce du dépôt.
 * `smoke:extraction` et `smoke:balayage` rejouent les deux sur une base
 * réelle ; ce garde-fou tient le câblage.
 */
const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("la réservation d'une analyse nomme sa version (E5)", () => {
  it("le débit de la lecture porte la version, et se reprend", () => {
    const analyse = lire("src/server/jobs/analyse.ts");
    expect(analyse).toContain("debiterUneAnalyse(tache.applicationId, undefined, { versionId: version.id })");
    const quota = lire("src/server/acces/quota.ts");
    expect(quota).toMatch(/const ouverte = await reservationOuverte\(applicationId, options\.versionId, tx\);/u);
    expect(quota).toMatch(/if \(ouverte\) return \{ \.\.\.ouverte, reprise: true \};/u);
  });

  it("une sortie sans verdict rend la réservation ouverte, et elle seule", () => {
    const analyse = lire("src/server/jobs/analyse.ts");
    // Version remplacée, autorisation retirée, course perdue.
    expect([...analyse.matchAll(/await rendreLaReservation\(/gu)]).toHaveLength(3);
  });

  it("la migration est additive", () => {
    const sql = lire("prisma/migrations/20261009180000_reservation_par_version/migration.sql");
    // Aucune instruction qui retire ou réécrit : les clauses `ON DELETE` de
    // la clé étrangère ne sont pas des instructions.
    expect(sql).not.toMatch(/^\s*(DROP|UPDATE|DELETE|TRUNCATE)\b/imu);
    expect(sql).toContain('ADD COLUMN "versionId" TEXT;');
    expect(sql).toContain('CREATE INDEX "AnalysisCredit_versionId_idx"');
  });
});

describe("la reprise gratuite se décide une fois (FON-03)", () => {
  it.each([
    "src/server/jobs/analyse.ts",
    "src/server/jobs/balayage.ts",
    "src/app/api/dossiers/[id]/pieces/[pieceId]/depot/route.ts",
  ])("%s lit la règle commune", (chemin) => {
    expect(lire(chemin)).toMatch(/lectureAPayer|analyseAnnoncee/u);
  });

  it("le dépôt n'annonce plus la lecture sur le seul solde", () => {
    expect(lire("src/app/api/dossiers/[id]/pieces/[pieceId]/depot/route.ts")).not.toMatch(
      /analyseraLaPiece: \(await solde/u,
    );
  });
});
