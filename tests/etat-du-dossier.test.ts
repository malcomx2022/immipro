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

  it("pose la date en passant à PRET", () => {
    expect(miseEnEtat("PRET", null, maintenant)).toEqual({
      status: "PRET",
      readyAt: maintenant,
    });
  });

  it("conserve la date d'un dossier déjà prêt", () => {
    // Elle dit depuis quand il est prêt. La repousser à chaque recalcul
    // ferait vieillir le dossier à l'envers.
    expect(miseEnEtat("PRET", jadis, maintenant).readyAt).toBe(jadis);
  });

  it("retire la date dans tous les autres états", () => {
    for (const etat of AUTRES) {
      expect(miseEnEtat(etat, jadis, maintenant), etat).toEqual({
        status: etat,
        readyAt: null,
      });
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
      const { status, readyAt } = miseEnEtat(etat, jadis, maintenant);
      expect(status === "PRET", `${etat} : le couple contredit la garde`).toBe(
        readyAt !== null,
      );
    }
  });

  it("rend la main au calcul après une pause, et ne décide pas à sa place", () => {
    // « Ton dossier est mis en pause le temps que tu regardes » : la reprise
    // le rouvre, elle ne le déclare pas complet.
    expect(REPRISE_APRES_PAUSE).toBe("ACTIF");
    expect(miseEnEtat(REPRISE_APRES_PAUSE, jadis, maintenant).readyAt).toBeNull();
  });
});
