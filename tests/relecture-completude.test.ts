import { describe, expect, it } from "vitest";
import {
  AIDE_EXPLICATION,
  INVITATION_RELECTURE,
  MENTION_EN_ATTENTE,
  avisDeRelecture,
  refusDeLaDemande,
} from "@/domain/completeness/relecture";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import { PREALABLES } from "@/domain/exploitation/prealables";

/**
 * Relecture humaine de la complétude — troisième garde-fou de l'avis
 * juridique L.A du 03/10/2026.
 */
describe("demande de relecture", () => {
  it("une explication trop courte dit quoi écrire", () => {
    expect(refusDeLaDemande("faux")).toBe(AIDE_EXPLICATION);
    expect(refusDeLaDemande("Mon passeport est déposé mais compté comme manquant.")).toBeNull();
    expect(refusDeLaDemande("x".repeat(1001))).toMatch(/dépasse 1000 caractères/u);
  });

  it("aucun texte de l'écran ne parle de note, de chances ni de promesse", () => {
    for (const texte of [INVITATION_RELECTURE, AIDE_EXPLICATION, MENTION_EN_ATTENTE]) {
      expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT), texte).toEqual([]);
    }
  });

  it("l'avis au candidat porte la réponse du relecteur, telle quelle", () => {
    expect(avisDeRelecture("  Votre relevé est bien compté.  ")).toEqual({
      titre: "Relecture de ta complétude",
      corps: "Votre relevé est bien compté.",
    });
  });
});

describe("L.A est levé", () => {
  it("il ne figure plus parmi les préalables de l'ouverture publique", () => {
    expect(PREALABLES.map((p) => p.arbitrage)).not.toContain("L.A");
  });
});
