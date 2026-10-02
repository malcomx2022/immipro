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
   * Le mot ne doit apparaître dans aucun texte rendu. Les commentaires sont
   * retirés d'abord : celui qui explique pourquoi il n'y a pas de facture
   * emploie forcément le mot — même balayage que le garde-fou du
   * vocabulaire interdit, et que celui de K.A.
   *
   * Une seule exception, et elle se voit : le registre des préalables porte
   * la question posée au comptable — « une facture est-elle requise ? » —
   * qui ne s'écrit pas sans le mot. C'est son objet même, et rien ne la
   * rend à un candidat.
   */
  const REGISTRE = "src/domain/exploitation/prealables.ts";

  it("aucun texte rendu n'emploie le mot", () => {
    const fautifs = fichiers("src", /\.tsx?$/u)
      .filter((f) => f !== REGISTRE)
      .filter((f) => /\bfactur(e|es|ation)\b/iu.test(sansCommentaires(lire(f))));
    expect(fautifs).toEqual([]);
  });

  /** Et l'exception reste une exception : le registre ne se rend nulle part. */
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
