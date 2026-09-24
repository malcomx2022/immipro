import { describe, expect, it } from "vitest";
import {
  HEURES_PROPOSEES,
  JOURS_PROPOSES,
  creneauxProposes,
  estUnCreneauPropose,
  instantDeLHeureLocale,
  jourAffiche,
  libelleHeure,
} from "@/domain/consultants/rendez-vous";

/**
 * T-05 — les horaires offerts sont ceux que la constante déclare, dans le
 * fuseau où l'écran les écrit, et la réservation n'accepte qu'eux.
 *
 * Balayage plutôt qu'exemples : le défaut corrigé tenait à un fuseau, et
 * celui qu'on suivait jusqu'ici tenait à l'heure de la journée où l'on
 * regarde. Deux années de jours, six heures par jour.
 */

const MINUTE = 60_000;
const JOUR = 86_400_000;

const instantsDeBalayage = (): Date[] => {
  const instants: Date[] = [];
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += JOUR) {
    // 23 h 30 UTC : il est déjà le lendemain à Cotonou.
    for (const minutes of [0, 5 * 60, 11 * 60 + 59, 17 * 60, 22 * 60 + 59, 23 * 60 + 30]) {
      instants.push(new Date(t + minutes * MINUTE));
    }
  }
  return instants;
};

const lendemain = (jour: string, n: number): string => {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, j! + n)).toISOString().slice(0, 10);
};

describe("T-05 — créneaux proposés", () => {
  it("écrit à l'écran les heures que la constante déclare", () => {
    const attendues = HEURES_PROPOSEES.map((h) => `${String(h).padStart(2, "0")} h 00`);
    for (const maintenant of instantsDeBalayage()) {
      const libelles = creneauxProposes(maintenant).map((d) =>
        libelleHeure({ debut: d.toISOString(), disponible: true }),
      );
      expect(libelles).toEqual(Array(JOURS_PROPOSES).fill(attendues).flat());
    }
  });

  it("commence demain, au calendrier de Cotonou", () => {
    for (const maintenant of instantsDeBalayage()) {
      const aujourdhui = jourAffiche(maintenant.toISOString());
      const jours = [...new Set(creneauxProposes(maintenant).map((d) => jourAffiche(d.toISOString())))];
      expect(jours, maintenant.toISOString()).toEqual(
        Array.from({ length: JOURS_PROPOSES }, (_, i) => lendemain(aujourdhui, i + 1)),
      );
    }
  });

  it("lit l'avance du fuseau au lieu de la supposer", () => {
    expect(instantDeLHeureLocale(2026, 11, 30, 9).toISOString()).toBe("2026-11-30T08:00:00.000Z");
    expect(instantDeLHeureLocale(2027, 1, 1, 0).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});

describe("T-05 — seul un horaire de l'offre se réserve", () => {
  const maintenant = new Date("2026-09-15T08:00:00Z");

  it("accepte chacun des horaires proposés", () => {
    for (const propose of creneauxProposes(maintenant)) {
      expect(estUnCreneauPropose(propose, maintenant)).toBe(true);
    }
  });

  /**
   * L'unicité en base porte sur `(consultant, créneau)` : elle refuse deux
   * réservations au même instant, pas deux entretiens de quarante-cinq
   * minutes décalés d'une minute.
   */
  it("refuse un horaire décalé d'une minute, d'une heure, ou hors fenêtre", () => {
    const [premier] = creneauxProposes(maintenant);
    const dernier = creneauxProposes(maintenant).at(-1)!;
    expect(estUnCreneauPropose(new Date(premier!.getTime() + MINUTE), maintenant)).toBe(false);
    expect(estUnCreneauPropose(new Date(premier!.getTime() + 60 * MINUTE), maintenant)).toBe(false);
    expect(estUnCreneauPropose(new Date(dernier.getTime() + JOUR), maintenant)).toBe(false);
  });

  it("refuse un horaire passé, même s'il a été proposé", () => {
    const [premier] = creneauxProposes(maintenant);
    expect(estUnCreneauPropose(premier!, new Date(premier!.getTime() + MINUTE))).toBe(false);
  });

  /**
   * Page ouverte à 23 h 58 à Cotonou, validée à 0 h 02 : le créneau de
   * 9 h qu'elle offrait pour « demain » est devenu celui d'aujourd'hui.
   */
  it("tient l'offre d'une page ouverte avant minuit et validée après", () => {
    const avant = new Date("2026-09-15T22:58:00Z");
    const apres = new Date("2026-09-15T23:02:00Z");
    const [premier] = creneauxProposes(avant);
    expect(jourAffiche(premier!.toISOString())).toBe("2026-09-16");
    expect(estUnCreneauPropose(premier!, apres)).toBe(true);
  });
});
