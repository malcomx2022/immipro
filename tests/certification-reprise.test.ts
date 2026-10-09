import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NON_BRANCHE, certificationBranchee, leCertificateur } from "@/server/facturation/certification";
import { messageDesCertifications } from "@/domain/facturation/facture";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * S.158 (RF-6, préparation de M.C) — la certification d'une pièce réelle
 * se reprend sans rien inventer. Le chemin réel contre une base s'éprouve
 * dans `smoke:facturation`.
 */
describe("aucun certificateur ne se choisit par l'environnement", () => {
  it("rend la fonction non branchée, quoi qu'on déclare", () => {
    for (const env of [
      {},
      { FACTURATION_CERTIFICATEUR: "essai" },
      { FACTURATION_CERTIFICATEUR: "mecef", NODE_ENV: "development" },
      { FACTURATION_TVA: "18", FEDAPAY_ENVIRONMENT: "live" },
    ]) {
      expect(leCertificateur(env)).toBe(NON_BRANCHE);
      expect(certificationBranchee(env)).toBe(false);
    }
  });

  it("n'écrit aucun faux certificateur dans le code servi", () => {
    const source = readFileSync("src/server/facturation/certification.ts", "utf8");
    expect(source).not.toMatch(/CODE-|faux|essai/iu);
  });
});

describe("la reprise des certifications", () => {
  const emission = readFileSync("src/server/facturation/emission.ts", "utf8");

  it("garde la pièce en attente au lieu de laisser l'erreur remonter", () => {
    expect(emission).toMatch(/catch \(erreur\) \{\s+console\.warn\(\s+`\[facturation\] \$\{piece\.number\} : certification en attente/u);
    expect(emission).toContain('return "en_attente";');
  });

  it("tient un verrou par pièce, relit le code dessous, et l'écrit dans la même transaction", () => {
    expect(emission).toContain("pg_try_advisory_xact_lock(hashtextextended(${`certification:${piece.id}`}, 0))");
    expect(emission).toContain('if (actuelle?.certificationCode) return "deja_certifiee";');
    expect(emission).toMatch(/await tx\.invoice\.update\(\{\s+where: \{ id: piece\.id \},\s+data: \{ certificationCode/u);
  });

  it("est appelée par la réconciliation, après le filet des pièces manquantes", () => {
    const reconciliation = readFileSync("src/server/jobs/reconciliation.ts", "utf8");
    expect(reconciliation.indexOf("emettreLesPiecesEnSouffrance()")).toBeLessThan(
      reconciliation.indexOf("certifierLesPiecesEnAttente()"),
    );
  });

  it("se classe avec les paiements au journal", () => {
    const lecture = readFileSync("src/server/lecture/backoffice.ts", "utf8");
    expect(lecture).toContain('"facture.emission": "PAIEMENT"');
    expect(lecture).toContain('"facture.certification": "PAIEMENT"');
  });
});

describe("ce que l'exploitant lit", () => {
  it("dit le nombre, l'âge et ce qui reprend", () => {
    expect(messageDesCertifications({ lisible: true, enAttente: 0, depuisHeures: 0 })).toBe(
      "Aucune pièce réelle n'attend son code de certification.",
    );
    const attente = messageDesCertifications({ lisible: true, enAttente: 3, depuisHeures: 5 });
    expect(attente).toContain("3 pièce(s) réelle(s)");
    expect(attente).toContain("depuis 5 h");
    expect(attente).toContain("La réconciliation les reprend");
    expect(messageDesCertifications({ lisible: false, enAttente: 0, depuisHeures: 0 })).toContain(
      "n'ont pas pu être lues",
    );
    expect(verifierTexte(attente, INTERDITS_PARTOUT)).toEqual([]);
  });
});
