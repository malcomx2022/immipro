import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FUSEAU_AFFICHAGE, jourCivil } from "@/domain/format/fuseau";
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

  it("est déclaré une fois, et les rendez-vous lisent le même", () => {
    expect(FUSEAU_DES_RENDEZ_VOUS).toBe(FUSEAU_AFFICHAGE);
  });

  it("donne le jour civil de Cotonou, pas celui d'UTC", () => {
    expect(jourCivil(new Date("2026-09-11T23:30:00Z"))).toBe("2026-09-12");
    expect(jourCivil(new Date("2026-09-11T22:59:00Z"))).toBe("2026-09-11");
  });
});
