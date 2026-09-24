import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FUSEAU_AFFICHAGE,
  bornesDesJoursCivils,
  debutDuJourCivil,
  jourCivil,
  jourCivilPlus,
} from "@/domain/format/fuseau";
import { FUSEAU_AFFICHAGE as FUSEAU_DES_RENDEZ_VOUS } from "@/domain/consultants/rendez-vous";

/**
 * Une heure affichée se lit dans le fuseau d'affichage — I.E., étendu.
 *
 * Le lot I.E avait corrigé les formateurs des rendez-vous. Les autres
 * formateurs d'heure — reçu, alertes, versions, back-office — écrivaient
 * toujours en UTC, chacun correct en soi, et le défaut ne se voyait qu'en
 * rapprochant l'heure affichée de celle du candidat.
 */

const fichiers = (dossier: string): string[] =>
  readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.tsx?$/u.test(nom) ? [chemin] : [];
  });

/** Les options de chaque `new Intl.DateTimeFormat(…, { … })` du fichier. */
const formateurs = (source: string): string[] =>
  [...source.matchAll(/new Intl\.DateTimeFormat\([^,)]*,\s*\{([^}]*)\}/gu)].map((m) => m[1]!);

describe("fuseau d'affichage", () => {
  it("n'écrit aucune heure en UTC", () => {
    const fautifs = fichiers("src").flatMap((chemin) =>
      formateurs(readFileSync(chemin, "utf8"))
        .filter((options) => /\bhour\b/u.test(options) && /timeZone:\s*"UTC"/u.test(options))
        .map(() => chemin),
    );
    expect(fautifs).toEqual([]);
  });

  /**
   * Le garde-fou ne vaut que s'il voit les formateurs : sans ce témoin, un
   * motif qui ne trouve plus rien passerait pour un code conforme.
   */
  it("voit bien les formateurs d'heure qu'il garde", () => {
    const avecHeure = fichiers("src").filter((chemin) =>
      formateurs(readFileSync(chemin, "utf8")).some((o) => /\bhour\b/u.test(o)),
    );
    expect(avecHeure.length).toBeGreaterThanOrEqual(5);
  });

  /**
   * « Aujourd'hui » est le jour de Cotonou. Pris par
   * `new Date().toISOString().slice(0, 10)`, c'était la veille entre minuit
   * et une heure du matin : une journée de paiements vide à l'ouverture,
   * une pièce jugée sur la date d'hier.
   */
  it("ne prend jamais aujourd'hui en UTC", () => {
    const fautifs = fichiers("src").filter((chemin) =>
      /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/u.test(readFileSync(chemin, "utf8")),
    );
    expect(fautifs).toEqual([]);
  });

  it("est déclaré une fois, et les rendez-vous lisent le même", () => {
    expect(FUSEAU_DES_RENDEZ_VOUS).toBe(FUSEAU_AFFICHAGE);
  });

  it("donne le jour civil de Cotonou, pas celui d'UTC", () => {
    expect(jourCivil(new Date("2026-09-11T23:30:00Z"))).toBe("2026-09-12");
    expect(jourCivil(new Date("2026-09-11T22:59:00Z"))).toBe("2026-09-11");
  });
});

describe("bornes d'un jour civil", () => {
  it("commence à minuit à Cotonou, c'est-à-dire 23 h UTC la veille", () => {
    expect(debutDuJourCivil("2026-09-01").toISOString()).toBe("2026-08-31T23:00:00.000Z");
  });

  it("borne une période du premier minuit au lendemain du dernier jour", () => {
    const { gte, lt } = bornesDesJoursCivils("2026-09-01", "2026-09-30");
    expect(gte.toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });

  /**
   * Ce que les bornes lisent, `jourCivil` le range au même jour : aucune
   * écriture lue n'est écartée au filtre, aucune écriture rangée n'a
   * échappé à la lecture. Balayé sur deux années, à la minute des bords.
   */
  it("lit exactement ce que le jour civil range", () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      const jour = new Date(t).toISOString().slice(0, 10);
      const { gte, lt } = bornesDesJoursCivils(jour, jour);
      expect(jourCivil(gte)).toBe(jour);
      expect(jourCivil(new Date(lt.getTime() - 1))).toBe(jour);
      expect(jourCivil(lt)).toBe(jourCivilPlus(jour, 1));
    }
  });
});
