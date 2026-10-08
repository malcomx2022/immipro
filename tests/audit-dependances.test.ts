import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXCEPTIONS_MAXI,
  jugerLAudit,
  type ExceptionDAudit,
  type RapportDAudit,
} from "@/domain/exploitation/audit";

/**
 * La porte de l'audit — revue du 07/10/2026, audit, D-34.
 *
 * Le rapport est celui de `npm audit --json`, réduit : un avis porté par un
 * paquet, et les paquets par lesquels il se propage.
 */
const rapport: RapportDAudit = {
  vulnerabilities: {
    "deepmerge-ts": {
      via: [
        {
          source: 1145093,
          name: "deepmerge-ts",
          title: "DeepmergeTS has stack exhaustion",
          url: "https://github.com/advisories/GHSA-ggr8-5vv4-36mx",
          severity: "high",
          range: "<8.0.0",
        },
      ],
    },
    "@prisma/config": { via: ["deepmerge-ts"] },
    prisma: { via: ["@prisma/config"] },
    "stream-json": {
      via: [
        {
          name: "stream-json",
          title: "O(depth²)",
          url: "https://github.com/advisories/GHSA-528h-pc64-c93x",
          severity: "moderate",
          range: "<=3.4.0",
        },
      ],
    },
  },
};

const acceptation: ExceptionDAudit = {
  avis: "GHSA-ggr8-5vv4-36mx",
  paquet: "deepmerge-ts",
  motif: "CLI Prisma seulement.",
  date: "2026-10-08",
};

describe("une vulnérabilité élevée ou critique bloque, sauf acceptation motivée", () => {
  it("sans exception, l'avis élevé bloque — une fois, sur le paquet qui le porte", () => {
    const verdict = jugerLAudit(rapport, []);
    expect(verdict.bloquants.map((a) => [a.id, a.paquet])).toEqual([
      ["GHSA-ggr8-5vv4-36mx", "deepmerge-ts"],
    ]);
  });

  it("une modérée s'affiche sans bloquer", () => {
    const verdict = jugerLAudit(rapport, []);
    expect(verdict.affiches.map((a) => a.id)).toEqual(["GHSA-528h-pc64-c93x"]);
  });

  it("une exception motivée et datée tolère l'avis", () => {
    const verdict = jugerLAudit(rapport, [acceptation]);
    expect(verdict.bloquants).toEqual([]);
    expect(verdict.toleres.map((a) => a.id)).toEqual(["GHSA-ggr8-5vv4-36mx"]);
    expect(verdict.fautes).toEqual([]);
  });

  it("une critique bloque comme une élevée", () => {
    const critique: RapportDAudit = {
      vulnerabilities: {
        x: { via: [{ name: "x", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "critical" }] },
      },
    };
    expect(jugerLAudit(critique, []).bloquants).toHaveLength(1);
  });
});

describe("le fichier d'exceptions ne dérive pas", () => {
  it("une exception dont l'avis n'est plus signalé fait échouer la porte", () => {
    const verdict = jugerLAudit({ vulnerabilities: {} }, [acceptation]);
    expect(verdict.fautes).toEqual([expect.stringMatching(/n'a plus d'objet.*à retirer/u)]);
  });

  it("une exception sans motif ou sans date ne tolère rien", () => {
    for (const manque of [{ motif: " " }, { date: "08/10/2026" }, { paquet: undefined }]) {
      const verdict = jugerLAudit(rapport, [{ ...acceptation, ...manque }]);
      expect(verdict.fautes).toHaveLength(1);
      expect(verdict.bloquants).toHaveLength(1);
    }
  });

  it("une exception qui vise un autre paquet que celui de l'avis ne tolère rien", () => {
    const verdict = jugerLAudit(rapport, [{ ...acceptation, paquet: "prisma" }]);
    expect(verdict.fautes).toEqual([expect.stringMatching(/porte sur deepmerge-ts/u)]);
    expect(verdict.bloquants).toHaveLength(1);
  });

  it(`au-delà de ${EXCEPTIONS_MAXI} entrées, la porte refuse`, () => {
    const trop = Array.from({ length: EXCEPTIONS_MAXI + 1 }, () => acceptation);
    expect(jugerLAudit(rapport, trop).fautes[0]).toMatch(/c'est une dette/u);
  });

  it("le fichier livré respecte ses propres règles", () => {
    const fichier = JSON.parse(readFileSync("audit-exceptions.json", "utf8")) as {
      exceptions: ExceptionDAudit[];
    };
    expect(fichier.exceptions.length).toBeLessThanOrEqual(EXCEPTIONS_MAXI);
    for (const e of fichier.exceptions) {
      expect(e.avis).toMatch(/^GHSA-/u);
      expect(e.motif?.length ?? 0).toBeGreaterThan(40);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });
});
