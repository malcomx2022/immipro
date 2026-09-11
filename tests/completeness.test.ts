import { describe, it, expect } from "vitest";
import { computeCompleteness } from "../src/domain/completeness/score";

const doc = (code: string, status: any, required = true) => ({ code, required, status });
const cond = (code: string, satisfaite: boolean, bloquant = true) => ({
  code, bloquant, satisfaite, messageEchec: `échec ${code}`,
});

describe("score de complétude", () => {
  it("rend 100 et prêt quand tout est conforme", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME"), doc("diplome", "CONFORME")],
      conditions: [cond("fonds", true)],
      coherence: 1,
      redaction: 1,
    });
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("n'est jamais prêt s'il manque une pièce obligatoire, même avec un score élevé", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME"), doc("diplome", "ATTENDUE")],
      conditions: [cond("fonds", true)],
      coherence: 1,
      redaction: 1,
    });
    expect(r.ready).toBe(false);          // RG-07.2
    expect(r.score).toBeGreaterThan(70);  // le score reste élevé
  });

  it("n'est jamais prêt si une condition bloquante échoue", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME")],
      conditions: [cond("fonds", false)],
      coherence: 1,
      redaction: 1,
    });
    expect(r.ready).toBe(false);
    expect(r.missing.map((m) => m.code)).toContain("fonds");
  });

  it("ignore les pièces facultatives dans le calcul du déterministe", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME"), doc("cv", "ATTENDUE", false)],
      conditions: [],
      coherence: 1,
      redaction: 1,
    });
    expect(r.ready).toBe(true);
  });

  it("produit un message actionnable pour chaque point manquant", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "ILLISIBLE")],
      conditions: [],
      coherence: 0,
      redaction: 0,
    });
    expect(r.missing[0]!.message).toMatch(/reprenez la photo/i);
    expect(r.missing[0]!.message).not.toMatch(/non conforme/i);
  });
});
