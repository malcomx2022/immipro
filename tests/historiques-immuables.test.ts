import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSERVATION_ANNEES } from "@/domain/backoffice/audit";
import { MARGE_DU_JOURNAL_MS } from "@/server/jobs/purge";

/**
 * Les historiques immuables le sont en base — revue du 07/10/2026, F11
 * (D-24 du 09/10/2026).
 *
 * Ce que la base refuse s'éprouve dans `scripts/verifier-garde-fous.sql`
 * et dans `smoke:conservation`. Ici, ce qui se lit sans base : que chaque
 * table a son déclencheur, que le seuil du journal est celui du domaine,
 * et que tous les refus parlent le même code.
 */
const MIGRATIONS = join("prisma", "migrations");
const migration = readdirSync(MIGRATIONS).find((d) => d.endsWith("_historiques_immuables"))!;
const SQL = readFileSync(join(MIGRATIONS, migration, "migration.sql"), "utf8");

describe("historiques immuables", () => {
  it("chaque table déclarée immuable a son déclencheur", () => {
    for (const [table, fonction, evenements] of [
      ["EditorialVersion", "historique_immuable", "BEFORE UPDATE OR DELETE"],
      ["LegalPublication", "historique_immuable", "BEFORE UPDATE OR DELETE"],
      ["AuditLog", "journal_immuable", "BEFORE UPDATE OR DELETE"],
      // L'arbitrage suit son dossier quand il est supprimé : seule la mise à jour est gardée.
      ["RuleMigration", "arbitrage_fige", "BEFORE UPDATE ON"],
    ] as const) {
      expect(SQL, table).toMatch(
        new RegExp(`CREATE TRIGGER "${fonction}"\\s+${evenements.replace(/ /gu, "\\s+")}\\s+(ON\\s+)?"${table}"`, "u"),
      );
    }
  });

  it("le journal se conserve exactement la durée annoncée, et la purge attend un jour de plus", () => {
    const seuil = /now\(\) - interval '(\d+) years'/u.exec(SQL);
    expect(Number(seuil?.[1])).toBe(CONSERVATION_ANNEES);
    expect(MARGE_DU_JOURNAL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("tous les refus lèvent check_violation, facture_immuable compris", () => {
    const refus = SQL.match(/RAISE EXCEPTION[\s\S]*?;\n/gu)!;
    expect(refus.length).toBeGreaterThanOrEqual(12);
    for (const r of refus) expect(r).toContain("USING ERRCODE = 'check_violation'");
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION "facture_immuable"()');
    expect(SQL).toContain('NEW."performedAt"');
  });

  it("l'arbitrage ne pose alertedAt, decision et decidedAt qu'une fois", () => {
    expect(SQL).toMatch(/OLD\."alertedAt" IS NOT NULL AND NEW\."alertedAt" IS DISTINCT FROM/u);
    expect(SQL).toMatch(/OLD\."decision" IS NOT NULL AND \(NEW\."decision", NEW\."decidedAt"\) IS DISTINCT FROM/u);
  });

  it("la graine de démonstration ne vide plus le journal", () => {
    const graine = readFileSync(join("prisma", "seed", "demonstration.ts"), "utf8");
    expect(graine).not.toMatch(/auditLog\.(delete|deleteMany|update|updateMany)\b/u);
  });
});
