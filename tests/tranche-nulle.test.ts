import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  avisDeTrancheNulle,
  cleDeLAvisDeTrancheNulle,
  referenceDeLAvis,
} from "@/domain/paiement/tranche-nulle";
import {
  INTERDITS_ECRAN_CANDIDAT,
  INTERDITS_PARTOUT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * B-04, RF-4, S.154 — une demande de remboursement tranchée à zéro se dit
 * au candidat, par un message fixe (décision du 09/10/2026).
 * `smoke:remboursement` l'éprouve : alerte, courriel repris, une fois.
 */
const avis = (analysesRestantes: number, dossiers = 1) =>
  avisDeTrancheNulle({ achat: "Dossier", reference: "IMP-261009-ABC123", analysesRestantes, dossiers });

describe("le message", () => {
  it("dit l'issue, ce qui reste, et où poser une question", () => {
    const { titre, corps } = avis(29);
    expect(titre).toBe("Ta demande de remboursement a été examinée");
    expect(corps).toContain("« Dossier » (référence IMP-261009-ABC123)");
    expect(corps).toContain("Aucun montant n'est remboursé : tes 29 analyses restantes restent disponibles sur ton dossier.");
    expect(corps).toContain("page Contact");
  });

  it("s'accorde au nombre, et au Pro qui sert plusieurs dossiers", () => {
    expect(avis(1).corps).toContain("ton analyse restante reste disponible sur ton dossier");
    expect(avis(0).corps).toContain("ton dossier et son historique restent tels qu'ils sont");
    expect(avis(40, 3).corps).toContain("tes 40 analyses restantes restent disponibles sur tes dossiers");
    expect(avis(0, 3).corps).toContain("tes dossiers et leur historique restent tels qu'ils sont");
  });

  it("ne promet rien, et ne parle pas comme une note (INV-1, INV-2)", () => {
    for (const n of [0, 1, 29]) {
      const { titre, corps } = avis(n);
      expect(verifierTexte(`${titre} ${corps}`, INTERDITS_PARTOUT)).toEqual([]);
      expect(verifierTexte(`${titre} ${corps}`, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    }
  });
});

describe("un avis par obligation refermée", () => {
  it("la clé distingue deux obligations successives, et rend sa référence", () => {
    const premiere = cleDeLAvisDeTrancheNulle("IMP-1", new Date("2026-10-01T10:00:00Z"));
    const seconde = cleDeLAvisDeTrancheNulle("IMP-1", new Date("2026-11-01T10:00:00Z"));
    expect(premiere).not.toBe(seconde);
    expect(referenceDeLAvis(premiere)).toBe("IMP-1");
    expect(referenceDeLAvis("recu:IMP-1")).toBeNull();
  });
});

describe("le chemin", () => {
  it("seule la tranche à zéro prévient, après la transaction et sans lever", () => {
    const paiements = sansCommentaires(readFileSync("src/server/acces/paiements.ts", "utf8"));
    expect(paiements).toMatch(
      /if \(conclusion === "refermee"\) \{\s*await prevenirDeLaTrancheNulle\(\{ \.\.\.transaction, applicationId \}, ouverteLe, maintenant\);\s*return \{ issue: "refermee" \};/u,
    );
    const avisDeRevue = sansCommentaires(readFileSync("src/server/paiement/avis-de-revue.ts", "utf8"));
    // Le motif de l'opérateur n'entre pas dans le message : il n'est même pas lu.
    expect(avisDeRevue).not.toMatch(/motif|discrepancyNote|refundBasis/u);
  });

  it("la passe de rapprochement reprend les avis restés en attente", () => {
    const passe = sansCommentaires(readFileSync("src/server/jobs/reconciliation.ts", "utf8"));
    expect(passe).toContain("bilan.avisRepris = await reprendreLesAvisDeTrancheNulle(maintenant)");
  });
});
