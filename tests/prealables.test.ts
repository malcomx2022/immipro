import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LIBELLE_JALON,
  PREALABLES,
  prealablesDe,
  type Jalon,
} from "@/domain/exploitation/prealables";
import { EMETTEUR_NON_RENSEIGNE, emetteurDuRecu } from "@/domain/paiement/recu";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * M.C, le 20/09/2026 — le document s'appelle un reçu, et l'existence d'une
 * facture est une question de comptabilité.
 *
 * Et, à cette occasion, le registre des préalables qu'aucune ligne de code
 * ne lève. Deux arbitrages en ont produit un le même jour ; sans registre
 * ils ne vivaient que dans un fichier de prose, c'est-à-dire surveillés
 * par celui qui l'ouvre.
 */

function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}
const lire = (f: string) => readFileSync(f, "utf8");

describe("le reçu ne se présente pas comme une facture", () => {
  /**
   * M.C, revu le 04/10/2026 sur avis comptable : chaque vente donne lieu à
   * une facture, **distincte** du reçu. Le mot « facture » a donc sa place
   * dans le produit — dans la facturation. Ce qui reste vrai, et que ce
   * garde-fou tient : le reçu, lui, ne s'appelle pas facture. Son module
   * n'emploie pas le mot, et son écran ne l'emploie que pour mener à la
   * facture, qui est une autre pièce avec sa propre numérotation.
   *
   * Les commentaires sont retirés d'abord : celui qui explique la
   * différence emploie forcément le mot.
   */
  it("le module du reçu n'emploie pas le mot", () => {
    expect(sansCommentaires(lire("src/domain/paiement/recu.ts"))).not.toMatch(/\bfactur/iu);
  });

  it("l'écran du reçu ne l'emploie que pour mener à la facture", () => {
    const ecran = sansCommentaires(lire("src/app/(app)/paiement/recu/[id]/Recu.tsx"))
      .replace(/\/paiement\/facture\//gu, "")
      .replace(/"Voir la facture(?: d'avoir)?"/gu, "")
      // Le genre de la pièce, tel que la base le nomme.
      .replace(/genre === "FACTURE"/gu, "");
    expect(ecran).not.toMatch(/\bfactur/iu);
  });

  /** Le registre ne se rend nulle part, lui non plus. */
  it("le registre des préalables n'est lu par aucun écran", () => {
    const lecteurs = fichiers("src/app", /\.tsx?$/u).filter((f) =>
      lire(f).includes("exploitation/prealables"),
    );
    expect(lecteurs).toEqual([]);
  });

  /**
   * La référence reste non séquentielle. C'est la propriété qui interdit de
   * la renommer en numéro de facture : une facture se numérote en continu,
   * et une suite d'entiers dirait le nombre de paiements du mois à qui en
   * voit deux.
   */
  it("la référence reste non séquentielle", () => {
    const acces = lire("src/server/acces/paiements.ts");
    expect(acces).toMatch(/suiteDictable\(6\)/u);
    // Ni compteur, ni auto-incrément, ni numéro d'ordre.
    expect(acces).not.toMatch(/sequence|autoincrement|numeroSuivant|compteurDeFacture/iu);
    const schema = lire("prisma/schema.prisma");
    const transaction = /model Transaction \{[\s\S]*?\n\}/u.exec(schema)![0];
    expect(transaction).not.toMatch(/@default\(autoincrement\(\)\)/u);
  });

  /** L'émetteur reste celui d'un reçu, et son identité reste à compléter. */
  it("l'émetteur ne promet pas de mentions qu'il ne porte pas", () => {
    // Ce que la mise en forme ajoute aux valeurs saisies : seulement « RCCM »
    // et « IFU ». Ni « facture », ni TVA, ni numéro d'ordre.
    const lignes = emetteurDuRecu({
      denomination: "D",
      forme_juridique: "F",
      siege_social: "S",
      rccm: "R",
      ifu: "I",
      email_contact: "e@exemple.test",
    })!.join(" ");
    for (const texte of [lignes, EMETTEUR_NON_RENSEIGNE]) {
      expect(texte).not.toMatch(/factur/iu);
      expect(texte).not.toMatch(/TVA|SIRET|n°\s?\d/iu);
    }
  });
});

describe("les préalables que le code ne lève pas", () => {
  it("chacun dit qui tranche, ce qu'il bloque, et ce qu'on fait en attendant", () => {
    expect(PREALABLES.length).toBeGreaterThan(0);
    for (const p of PREALABLES) {
      expect(p.arbitrage, p.arbitrage).toMatch(/^[A-Z]\.[A-Z]$/u);
      expect(p.question.length, p.arbitrage).toBeGreaterThan(40);
      expect(p.question, p.arbitrage).toContain("?");
      expect(p.competence.length, p.arbitrage).toBeGreaterThan(5);
      expect(LIBELLE_JALON[p.jalon], p.arbitrage).toBeTruthy();
      expect(p.enAttendant.length, p.arbitrage).toBeGreaterThan(40);
    }
  });

  /**
   * La compétence est un métier, jamais un nom : les personnes changent, et
   * un registre qui nomme quelqu'un vieillit au premier départ.
   */
  it("la compétence nomme un métier, pas une personne", () => {
    for (const p of PREALABLES) {
      expect(p.competence, p.arbitrage).not.toMatch(/@|\b[A-Z][a-zéèêà]+\s+[A-Z]/u);
    }
  });

  /**
   * Aucun drapeau « validé » à cocher. Il serait coché : un registre ne
   * peut pas vérifier qu'un comptable a rendu son avis, et prétendre le
   * faire serait pire que de ne rien prétendre.
   */
  it("le registre ne prétend pas tenir ce qu'il ne peut pas vérifier", () => {
    const source = lire("src/domain/exploitation/prealables.ts");
    expect(source).not.toMatch(/\b(valide|validated|fait|done|coche)\s*[:?]\s*boolean/iu);
  });

  it("chaque préalable se retrouve dans le relevé, sous son arbitrage", () => {
    const ecarts = lire("docs/prototype/ECARTS-A-ARBITRER.md");
    for (const p of PREALABLES) {
      const code = p.arbitrage.replace(".", "\\.");
      expect(ecarts, p.arbitrage).toMatch(new RegExp(`\\*\\*${code} —`, "u"));
    }
  });

  it("les jalons se lisent séparément, pour qui prépare une étape", () => {
    const jalons: Jalon[] = ["OUVERTURE_PUBLIQUE", "ENCAISSEMENT_COMMERCIAL"];
    const total = jalons.reduce((n, j) => n + prealablesDe(j).length, 0);
    expect(total).toBe(PREALABLES.length);
    expect(prealablesDe("ENCAISSEMENT_COMMERCIAL").map((p) => p.arbitrage)).toContain("M.C");
  });
});
