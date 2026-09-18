import { describe, expect, it } from "vitest";
import {
  avancement,
  estDerniereEtape,
  etapeValide,
  NOMBRE_ETAPES,
  QUESTIONS,
  QUESTIONS_ACCUEIL,
  questionDeLEtape,
  questionsRestantes,
  repereEtape,
  resumeReponses,
  simulationComplete,
} from "@/domain/simulateur/questions";

describe("simulateur — WF-01", () => {
  it("pose six questions, une par écran", () => {
    expect(NOMBRE_ETAPES).toBe(6);
    expect(QUESTIONS).toHaveLength(6);
    expect(new Set(QUESTIONS.map((q) => q.cle)).size).toBe(6);
  });

  it("n'en pose que trois sur l'accueil", () => {
    expect(QUESTIONS_ACCUEIL.map((q) => q.cle)).toEqual([
      "objectif",
      "diplome",
      "budget",
    ]);
  });

  it("borne l'étape au lieu de rendre un écran vide", () => {
    expect(etapeValide(-3)).toBe(0);
    expect(etapeValide(42)).toBe(5);
    expect(questionDeLEtape(99).cle).toBe("famille");
  });

  it("donne un avancement et un repère lisibles", () => {
    expect(avancement(0)).toBeCloseTo(1 / 6);
    expect(avancement(5)).toBe(1);
    expect(repereEtape(1)).toBe("2 / 6");
    expect(estDerniereEtape(5)).toBe(true);
    expect(estDerniereEtape(4)).toBe(false);
  });

  it("accorde le décompte des questions restantes", () => {
    expect(questionsRestantes(0)).toBe("5 questions restantes");
    expect(questionsRestantes(4)).toBe("1 question restante");
  });

  it("ne se déclare complet qu'avec les six réponses", () => {
    const partiel = { objectif: "Étudier", diplome: "Licence" };
    expect(simulationComplete(partiel)).toBe(false);
    const complet = Object.fromEntries(
      QUESTIONS.map((q) => [q.cle, q.options[0] as string]),
    );
    expect(simulationComplete(complet)).toBe(true);
  });

  it("résume les réponses données, en omettant les manquantes", () => {
    expect(resumeReponses({ objectif: "Étudier", budget: "4 à 8 millions F" })).toBe(
      "Étudier, 4 à 8 millions F",
    );
    expect(resumeReponses({})).toBe("");
  });

  it("propose des options distinctes pour chaque question", () => {
    for (const q of QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.intitule.length).toBeGreaterThan(0);
      expect(q.aide.length).toBeGreaterThan(0);
    }
  });
});
