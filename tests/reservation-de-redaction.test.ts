import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MARGE_SUR_L_APPEL,
  NOTE_RESERVATION_RENDUE,
  RESERVATION_DE_REDACTION_MINUTES,
  echeanceDeLaReservation,
} from "@/domain/redaction/reservation";
import { NOTE_REDACTION_ASSISTEE } from "@/domain/payments/montee";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * RF-4, S.153 — la réservation d'une rédaction assistée (reliquat de
 * S.148). Un arrêt entre le débit et le texte laissait un débit sans issue.
 * `smoke:redaction` l'éprouve sur une base réelle : interruption rendue à
 * l'échéance, une seule fois ; issue soldée, jamais rendue.
 */
const lire = (f: string) => sansCommentaires(readFileSync(f, "utf8"));

describe("la règle", () => {
  it("l'échéance laisse passer plusieurs appels entiers, jamais une requête en cours", () => {
    expect(MARGE_SUR_L_APPEL).toBeGreaterThanOrEqual(5);
    const maintenant = new Date("2026-10-09T12:00:00Z");
    expect(echeanceDeLaReservation(maintenant).getTime() - maintenant.getTime()).toBe(
      RESERVATION_DE_REDACTION_MINUTES * 60_000,
    );
  });

  it("le rendu porte la trace de la rédaction, sans rien promettre", () => {
    // Le diagnostic E5 (S.149) écarte les lignes de la rédaction par ce préfixe.
    expect(NOTE_RESERVATION_RENDUE.startsWith(NOTE_REDACTION_ASSISTEE)).toBe(true);
    expect(verifierTexte(NOTE_RESERVATION_RENDUE, INTERDITS_PARTOUT)).toEqual([]);
  });
});

describe("chaque débit de rédaction porte son échéance, et chaque issue la solde", () => {
  it("la mise en forme réserve avant l'appel et rend ses échecs par la réservation", () => {
    const source = lire("src/server/redaction/mise-en-forme.ts");
    expect(source.indexOf("reserveJusquA: echeanceDeLaReservation(")).toBeGreaterThan(-1);
    expect(source.indexOf("reserveJusquA: echeanceDeLaReservation(")).toBeLessThan(
      source.indexOf("await redacteur("),
    );
    expect(source).not.toContain("rendreUneTentative");
    expect([...source.matchAll(/rendreLaReservationDeRedaction\(\s*dossierId,\s*debit\.ligne/gu)]).toHaveLength(2);
  });

  it("la version et le solde de sa réservation s'écrivent dans la même transaction", () => {
    const route = lire("src/app/api/dossiers/[id]/redaction/[type]/version/route.ts");
    expect(route).toMatch(
      /db\.\$transaction\(\[\s*db\.documentVersion\.create\(\{ data: \{ id, \.\.\.donnees \} \}\),\s*solderLaReservationDeRedaction\(db, reservation, id\),\s*\]\)/u,
    );
    expect(route).toContain("issue.reservation");
  });

  it("la relecture réserve avant l'appel, et solde avec l'avis daté", () => {
    const route = lire("src/app/api/dossiers/[id]/redaction/[type]/relecture/route.ts");
    expect(route.indexOf("reserveJusquA: echeanceDeLaReservation(")).toBeLessThan(route.indexOf("await laCritique()("));
    const transaction = route.slice(route.indexOf("await db.$transaction(["));
    const fin = transaction.indexOf("]);");
    expect(transaction.slice(0, fin)).toContain("data: { critiquedAt: new Date() }");
    expect(transaction.slice(0, fin)).toContain("solderLaReservationDeRedaction(db, debit.ligne, derniere.id)");
    expect(route).not.toContain("rendreUneTentative");
  });
});

describe("le grand livre", () => {
  const quota = lire("src/server/acces/quota.ts");

  it("solder et rendre sont conditionnels : une réservation ne se règle qu'une fois", () => {
    const solder = quota.slice(quota.indexOf("export function solderLaReservationDeRedaction"));
    expect(solder.slice(0, solder.indexOf("\n}"))).toContain("reservedUntil: { not: null }");
    const rendre = quota.slice(quota.indexOf("export async function rendreLaReservationDeRedaction"));
    const corps = rendre.slice(0, rendre.indexOf("\n}"));
    expect(corps).toContain("sousVerrouDuGrandLivre(");
    expect(corps).toMatch(/reservedUntil: \{ not: null \}[\s\S]*if \(!debit\) return false;/u);
  });

  it("le débit d'une rédaction n'est pas une réservation de lecture (RF-3)", () => {
    const ouverte = quota.slice(quota.indexOf("async function reservationOuverte"));
    expect(ouverte.slice(0, ouverte.indexOf("\n}"))).toContain(
      "OR: [{ note: null }, { NOT: { note: { startsWith: NOTE_REDACTION_ASSISTEE } } }]",
    );
  });

  it("la passe horaire rend les réservations échues", () => {
    const worker = lire("src/server/jobs/worker.ts");
    const passe = worker.slice(worker.indexOf("boss.work(JOBS.REPRISE_QUARANTAINE"));
    expect(passe.slice(0, passe.indexOf("});"))).toContain("await rendreLesReservationsDeRedactionEchues()");
  });

  it("la migration est additive", () => {
    const sql = readFileSync("prisma/migrations/20261009200000_reservation_de_redaction/migration.sql", "utf8");
    expect(sql).toContain('ADD COLUMN "reservedUntil" TIMESTAMP(3)');
    expect(sql).not.toMatch(/^\s*(DROP|UPDATE|DELETE|TRUNCATE)/imu);
  });
});
