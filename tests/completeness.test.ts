import { describe, it, expect } from "vitest";
import { computeCompleteness, versClient } from "../src/domain/completeness/score";

const doc = (code: string, status: any, required = true) => ({ code, required, status });
const cond = (code: string, satisfaite: boolean, bloquant = true) => ({
  code, bloquant, satisfaite, messageEchec: `échec ${code}`,
});

describe("complétude du dossier", () => {
  it("est COMPLET et prêt quand tout est conforme", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME"), doc("diplome", "CONFORME")],
      conditions: [cond("fonds", true)],
      coherence: 1,
      redaction: 1,
    });
    expect(r.palier).toBe("COMPLET");
    expect(r.ready).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.interne.score).toBe(100);
  });

  it("est INCOMPLET et jamais prêt s'il manque une pièce obligatoire, même avec un score interne élevé", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME"), doc("diplome", "ATTENDUE")],
      conditions: [cond("fonds", true)],
      coherence: 1,
      redaction: 1,
    });
    expect(r.ready).toBe(false);                 // RG-07.2
    expect(r.palier).toBe("INCOMPLET");
    expect(r.compteurs.obligatoiresManquantes).toBe(1);
    expect(r.interne.score).toBeGreaterThan(70); // le score interne reste élevé, et reste interne
  });

  it("est INCOMPLET si une condition bloquante échoue", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME")],
      conditions: [cond("fonds", false)],
      coherence: 1,
      redaction: 1,
    });
    expect(r.ready).toBe(false);
    expect(r.palier).toBe("INCOMPLET");
    expect(r.missing.map((m) => m.code)).toContain("fonds");
  });

  it("est PRESQUE_COMPLET quand seules des pièces facultatives manquent", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME"), doc("cv", "ATTENDUE", false)],
      conditions: [],
      coherence: 1,
      redaction: 1,
    });
    expect(r.ready).toBe(true);
    expect(r.palier).toBe("PRESQUE_COMPLET");
    expect(r.compteurs.facultativesManquantes).toBe(1);
    expect(r.missing.find((m) => m.code === "cv")?.bloquant).toBe(false);
  });

  it("place les bloquants avant les facultatifs", () => {
    const r = computeCompleteness({
      documents: [doc("cv", "ATTENDUE", false), doc("passeport", "ATTENDUE")],
      conditions: [],
      coherence: 1,
      redaction: 1,
    });
    expect(r.missing.map((m) => m.code)).toEqual(["passeport", "cv"]);
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

  it("n'expose aucun score au client", () => {
    const r = computeCompleteness({
      documents: [doc("passeport", "CONFORME")],
      conditions: [],
      coherence: 1,
      redaction: 1,
    });
    const pub = versClient(r);
    expect(pub).not.toHaveProperty("interne");
    expect(JSON.stringify(pub)).not.toMatch(/score|%/);
  });
});
