import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { miseEnEtat, REPRISE_APRES_PAUSE, type EtatStocke } from "@/domain/dossiers/etat";

/**
 * Le couple `status` / `readyAt` — RG-07.2.
 *
 * Ce que ce fichier tient est la règle seule, sans base. Ce qu'elle vaut
 * une fois écrite — c'est-à-dire si la garde SQL l'accepte sur chacune des
 * sept transitions du produit — se joue dans `scripts/fumee-transitions`,
 * contre un vrai PostgreSQL : une règle pure ne peut pas éprouver une
 * contrainte de base, et c'est justement là que six écritures se sont
 * trompées pendant quatre jours.
 */
describe("La date de mise en état suit l'état", () => {
  const AUTRES: EtatStocke[] = [
    "BROUILLON",
    "ACTIF",
    "SOUMIS",
    "SUSPENDU",
    "ISSUE_DECLAREE",
    "ABANDONNE",
    "ARCHIVE",
  ];
  const jadis = new Date("2026-09-01T08:00:00Z");
  const maintenant = new Date("2026-09-22T10:00:00Z");
  const VIERGE = { readyAt: null, suspendedAt: null };
  const DATES = { readyAt: jadis, suspendedAt: jadis };

  it("pose la date en passant à PRET", () => {
    expect(miseEnEtat("PRET", VIERGE, maintenant)).toEqual({
      status: "PRET",
      readyAt: maintenant,
      suspendedAt: null,
    });
  });

  it("conserve la date d'un dossier déjà prêt", () => {
    // Elle dit depuis quand il est prêt. La repousser à chaque recalcul
    // ferait vieillir le dossier à l'envers.
    expect(miseEnEtat("PRET", { readyAt: jadis, suspendedAt: null }, maintenant).readyAt).toBe(
      jadis,
    );
  });

  it("retire la date dans tous les autres états", () => {
    for (const etat of AUTRES) {
      expect(miseEnEtat(etat, DATES, maintenant).readyAt, etat).toBeNull();
    }
  });

  /**
   * Arbitrage S.78 : la date de suspension suit la même règle que `readyAt`.
   * La base exige qu'un dossier suspendu la porte, et qu'aucun autre ne la
   * garde — sa durée décide de la purge des pièces, et une date qui
   * survivrait à la reprise ferait purger un dossier qui ne l'est plus.
   */
  it("pose la date de suspension, la garde, et la retire à la reprise", () => {
    expect(miseEnEtat("SUSPENDU", VIERGE, maintenant).suspendedAt).toBe(maintenant);
    // La purge, une analyse, un paiement réécrivent `SUSPENDU` sur un
    // dossier déjà suspendu : la pause ne repart pas pour autant.
    expect(miseEnEtat("SUSPENDU", DATES, maintenant).suspendedAt).toBe(jadis);
    for (const etat of ["BROUILLON", "ACTIF", "PRET", "SOUMIS", "ARCHIVE"] as const) {
      expect(miseEnEtat(etat, DATES, maintenant).suspendedAt, etat).toBeNull();
    }
  });

  /**
   * La garde de la base, relue comme un texte. Le test ne l'exécute pas —
   * il vérifie que la règle du domaine est bien celle que la base impose,
   * et non une seconde règle qui lui ressemblerait.
   */
  it("dit la même chose que la garde SQL", () => {
    const sql = readFileSync(
      "prisma/migrations/20260918000100_garde_fous/migration.sql",
      "utf8",
    );
    expect(sql).toContain(`CHECK (("status" = 'PRET') = ("readyAt" IS NOT NULL))`);

    for (const etat of [...AUTRES, "PRET" as const]) {
      const { status, readyAt } = miseEnEtat(etat, DATES, maintenant);
      expect(status === "PRET", `${etat} : le couple contredit la garde`).toBe(
        readyAt !== null,
      );
    }
  });

  it("rend la main au calcul après une pause, et ne décide pas à sa place", () => {
    // « Ton dossier est mis en pause le temps que tu regardes » : la reprise
    // le rouvre, elle ne le déclare pas complet.
    expect(REPRISE_APRES_PAUSE).toBe("ACTIF");
    expect(miseEnEtat(REPRISE_APRES_PAUSE, DATES, maintenant).readyAt).toBeNull();
  });
});
