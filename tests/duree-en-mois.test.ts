import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decalerDeMois } from "@/domain/format/mois";
import { dateAuPlusTot } from "@/domain/dossiers/echeancier";
import { dateDePeremption } from "@/server/acces/pieces";
import { echeanceEnMois } from "@/server/jobs/purge";

/**
 * Une durée en mois ne déborde pas — RG-06.6, RG-09.1, RG-10.2.
 *
 * ── Trois calculs, le même débordement ──────────────────────────────
 *
 * `setUTCMonth` vise un quantième qui n'existe pas dans le mois d'arrivée
 * et reporte sur le mois suivant : le 30 novembre plus trois mois visait
 * le 30 février et rendait le 2 mars. Constaté en exécution sur une pièce
 * valable trois mois :
 *
 *     déposé 2026-11-30 → périme le 2027-03-02
 *     déposé 2026-08-31 → périme le 2026-12-01
 *     déposé 2026-01-31 → périme le 2026-05-01
 *
 * Deux à trois jours de validité que la règle n'accorde pas, et toujours
 * dans le sens qui rassure : la plateforme déclarait conforme, le 1er
 * mars, un relevé que l'autorité refuse.
 *
 * Les essais balaient deux années entières plutôt que trois exemples : le
 * défaut est arithmétique, et une propriété vraie sur tous les jours vaut
 * mieux qu'une liste de cas que le prochain lecteur croira exhaustive.
 */

/** Tous les jours de 2026 et 2027, à midi UTC. */
const JOURS: Date[] = [];
for (
  let t = Date.UTC(2026, 0, 1, 12);
  t < Date.UTC(2028, 0, 1, 12);
  t += 86_400_000
) {
  JOURS.push(new Date(t));
}

/** Les durées que le référentiel emploie, et leurs voisines. */
const DUREES = [1, 2, 3, 6, 12, 24];

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("une durée en mois tombe dans le mois qu'elle vise", () => {
  it("le mois d'arrivée est exactement celui qu'on demande", () => {
    for (const depart of JOURS) {
      for (const mois of DUREES) {
        for (const sens of [1, -1]) {
          const arrivee = decalerDeMois(depart, mois * sens);
          const attendu = (depart.getUTCMonth() + mois * sens + 24) % 12;
          expect(
            arrivee.getUTCMonth(),
            `${iso(depart)} ${sens > 0 ? "+" : "-"}${mois}`,
          ).toBe(attendu);
        }
      }
    }
  });

  it("le quantième est conservé, ou ramené au dernier jour du mois", () => {
    for (const depart of JOURS) {
      for (const mois of DUREES) {
        const arrivee = decalerDeMois(depart, mois);
        const dernier = new Date(
          Date.UTC(arrivee.getUTCFullYear(), arrivee.getUTCMonth() + 1, 0),
        ).getUTCDate();
        const attendu = Math.min(depart.getUTCDate(), dernier);
        expect(arrivee.getUTCDate(), `${iso(depart)} +${mois}`).toBe(attendu);
      }
    }
  });

  /* L'heure est conservée : c'est une durée en mois, pas un autre moment. */
  it("l'heure du départ traverse le décalage", () => {
    const depart = new Date("2026-11-30T14:37:12.345Z");
    const arrivee = decalerDeMois(depart, 3);
    expect(arrivee.toISOString()).toBe("2027-02-28T14:37:12.345Z");
  });
});

describe("la péremption n'accorde pas un jour de plus que la règle", () => {
  it("une pièce de trois mois déposée fin novembre périme fin février", () => {
    expect(iso(dateDePeremption(3, new Date("2026-11-30T10:00:00Z"))!)).toBe("2027-02-28");
    expect(iso(dateDePeremption(3, new Date("2026-08-31T10:00:00Z"))!)).toBe("2026-11-30");
    expect(iso(dateDePeremption(1, new Date("2026-01-31T10:00:00Z"))!)).toBe("2026-02-28");
  });

  it("une pièce sans durée de validité ne périme pas", () => {
    expect(dateDePeremption(null, new Date("2026-11-30T10:00:00Z"))).toBeNull();
  });
});

/**
 * Les deux bouts d'une durée se répondent.
 *
 * « Demander au plus tôt » n'est pas « le dépôt moins trois mois » : c'est
 * la date à partir de laquelle la pièce vaut **encore** le jour du dépôt.
 * Les deux ne coïncident pas quand le quantième n'existe pas dans le mois
 * d'arrivée — un dépôt au 31 mai, reculé de trois mois, donne le 28
 * février, et une pièce du 28 février périme le 28 mai.
 */
describe("une pièce demandée au plus tôt vaut le jour du dépôt", () => {
  it("elle n'est jamais périmée à la date de dépôt visée", () => {
    for (const depot of JOURS) {
      for (const mois of DUREES) {
        const demandee = dateAuPlusTot(iso(depot), mois);
        const perime = dateDePeremption(mois, new Date(`${demandee}T12:00:00Z`))!;
        expect(iso(perime) >= iso(depot), `dépôt ${iso(depot)} · ${mois} mois`).toBe(true);
      }
    }
  });

  it("et la veille ne tiendrait pas : la date est la plus précoce qui tienne", () => {
    for (const depot of JOURS) {
      for (const mois of DUREES) {
        const demandee = new Date(`${dateAuPlusTot(iso(depot), mois)}T12:00:00Z`);
        const veille = new Date(demandee.getTime() - 86_400_000);
        const perimeLaVeille = dateDePeremption(mois, veille)!;
        expect(
          iso(perimeLaVeille) < iso(depot),
          `dépôt ${iso(depot)} · ${mois} mois · veille ${iso(veille)}`,
        ).toBe(true);
      }
    }
  });
});

describe("la coupure d'une conservation ne tombe pas trop tôt", () => {
  it("reculer d'un mois depuis un 31 reste dans le mois visé", () => {
    expect(iso(echeanceEnMois(1, new Date("2026-03-31T10:00:00Z")))).toBe("2026-02-28");
    expect(iso(echeanceEnMois(3, new Date("2026-05-31T10:00:00Z")))).toBe("2026-02-28");
  });
});

/**
 * Et les trois sites passent par la même fonction. Écrite trois fois,
 * elle déborderait de nouveau au premier endroit qu'on oublie.
 */
describe("une seule arithmétique des mois", () => {
  it("aucun site ne recalcule un décalage de mois à la main", () => {
    for (const fichier of [
      "src/server/acces/pieces.ts",
      "src/server/jobs/purge.ts",
      "src/domain/dossiers/echeancier.ts",
    ]) {
      expect(readFileSync(fichier, "utf8"), fichier).not.toMatch(/setUTCMonth\s*\(/u);
    }
  });
});
