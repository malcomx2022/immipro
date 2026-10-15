import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le dénominateur du compteur d'analyses — REV11-L6, 15/10/2026.
 *
 * Reproduit par la recette navigateur : sur un pack Essentiel de dix
 * analyses, après neuf lectures et une lecture illisible débitée puis
 * rendue, C-08 affichait « Analyses restantes : 1 sur 11 ». Le total
 * additionnait toute ligne positive du grand livre, rendu compris, alors
 * qu'un rendu restitue ce qui avait été débité et n'ouvre rien.
 *
 * Le grand livre est joué en mémoire : les sommes sont celles que la base
 * calculerait, et ce que `compteur` lui demande est vérifié tel quel.
 */
type Ligne = { delta: number; reason: string };
let livre: Ligne[] = [];

const somme = (lignes: Ligne[]) => lignes.reduce((total, l) => total + l.delta, 0);
const filtrer = (where: { reason?: { in: string[] }; delta?: { gt: number } }) =>
  livre.filter(
    (l) =>
      (!where.reason || where.reason.in.includes(l.reason)) &&
      (!where.delta || l.delta > where.delta.gt),
  );

vi.mock("@/lib/db", () => ({
  db: {
    analysisCredit: {
      groupBy: async ({ where }: { where: Parameters<typeof filtrer>[0] }) => [
        { applicationId: "dossier", _sum: { delta: somme(filtrer(where)) } },
      ],
      aggregate: async ({ where }: { where: Parameters<typeof filtrer>[0] }) => ({
        _sum: { delta: somme(filtrer(where)) },
      }),
    },
  },
}));

const { compteur, MOTIFS_D_OCTROI } = await import("@/server/acces/quota");

describe("C-08 — « Analyses restantes : n sur total »", () => {
  beforeEach(() => {
    livre = [{ delta: 10, reason: "ACHAT_PACK" }];
  });

  it("ne compte pas une analyse rendue comme un octroi", async () => {
    for (let i = 0; i < 10; i += 1) livre.push({ delta: -1, reason: "ANALYSE" });
    livre.push({ delta: 1, reason: "ANALYSE_RENDUE" });
    expect(await compteur("dossier")).toEqual({ restantes: 1, total: 10 });
  });

  it("compte une recharge et un geste commercial dans le total", async () => {
    livre.push({ delta: 10, reason: "RECHARGE" }, { delta: 2, reason: "GESTE_COMMERCIAL" });
    livre.push({ delta: -3, reason: "ANALYSE" });
    expect(await compteur("dossier")).toEqual({ restantes: 19, total: 22 });
  });

  it("ne compte ni un remboursement ni une consommation dans le total", async () => {
    livre.push({ delta: -4, reason: "ANALYSE" }, { delta: -6, reason: "REMBOURSEMENT" });
    expect(await compteur("dossier")).toEqual({ restantes: 0, total: 10 });
    expect(MOTIFS_D_OCTROI).toEqual(["ACHAT_PACK", "RECHARGE", "GESTE_COMMERCIAL"]);
  });
});
