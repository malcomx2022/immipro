import { describe, it, expect } from "vitest";
import { peutLire, evenementLecture } from "../src/domain/consultants/access";

const t0 = new Date("2026-09-01T00:00:00Z");
const t1 = new Date("2026-09-13T12:00:00Z");
const dossier = { id: "d1", destination: "NL" };
const hab = [{ consultantId: "c1", destination: "NL", habiliteLe: t0 }];
const acc = [{ dossierId: "d1", consultantId: "c1", donneLe: t0 }];

describe("accès consultant", () => {
  it("autorise quand habilitation ET accord sont actifs", () => {
    const d = peutLire("c1", dossier, hab, acc, t1);
    expect(d.autorise).toBe(true);
    if (d.autorise) expect(d.portee).not.toContain("paiement");
  });

  it("refuse sans habilitation sur la destination, même avec accord", () => {
    const d = peutLire("c1", { id: "d1", destination: "DE" }, hab, acc, t1);
    expect(d).toEqual({ autorise: false, motifs: ["NON_HABILITE"] });
  });

  it("refuse sans accord du candidat, même habilité", () => {
    const d = peutLire("c1", dossier, hab, [], t1);
    expect(d).toEqual({ autorise: false, motifs: ["SANS_ACCORD"] });
  });

  it("coupe l'accès dès la révocation", () => {
    const revoque = [{ ...acc[0]!, revoqueLe: new Date("2026-09-10T00:00:00Z") }];
    expect(peutLire("c1", dossier, hab, revoque, t1).autorise).toBe(false);
    expect(peutLire("c1", dossier, hab, revoque, new Date("2026-09-05T00:00:00Z")).autorise).toBe(true);
  });

  it("journalise les refus comme les lectures", () => {
    const d = peutLire("c2", dossier, hab, acc, t1);
    const ev = evenementLecture("c2", dossier, d, undefined, t1);
    expect(ev.resultat).toBe("REFUSEE");
    expect(ev.motifs).toEqual(["NON_HABILITE", "SANS_ACCORD"]);
  });
});
