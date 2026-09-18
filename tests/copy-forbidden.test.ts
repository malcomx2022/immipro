import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  INTERDITS_ECRAN_CANDIDAT,
  INTERDITS_PARTOUT,
  precedeDUneNegation,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * Vocabulaire interdit dans l'interface candidat (CLAUDE.md, arbitrage C-09).
 *
 * Le test lit la même liste que `npm run check:copy` et que, demain, la
 * validation à l'enregistrement du back-office : une seule liste, trois
 * points d'application. Le back-office (`src/app/(admin)`) est exclu — son
 * lecteur agit sur les codes techniques et sur les ratios d'exploitation.
 */
const RACINES = ["src/app", "src/components", "src/lib/contenu"];

interface Exception {
  chaine: string;
  fichier: string;
}

const exceptions: Exception[] = existsSync("copy-exceptions.json")
  ? (JSON.parse(readFileSync("copy-exceptions.json", "utf8")).exceptions ?? [])
  : [];

function fichiers(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (!p.includes("(admin)")) fichiers(p, acc);
    } else if (/\.tsx?$/.test(nom)) acc.push(p);
  }
  return acc;
}

/**
 * Un spécificateur de module n'est jamais affiché : `@/domain/completeness/score`
 * nomme le barème interne, que le back-office lit et que le candidat ne voit
 * pas. L'interdit porte sur ce qui s'affiche, pas sur ce qui s'importe.
 */
const sansSpecificateurs = (src: string) =>
  src.replace(/\bfrom\s+(["'])[^"']*\1/g, "").replace(/\bimport\s*\(?\s*(["'])[^"']*\1/g, "");

describe("vocabulaire interdit côté candidat", () => {
  it("aucune chaîne de l'interface ne promet un résultat ni ne note le dossier", () => {
    const fautes: string[] = [];
    for (const f of RACINES.flatMap((r) => fichiers(r))) {
      const src = sansSpecificateurs(readFileSync(f, "utf8"));
      const chaines = src.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
      for (const chaine of chaines) {
        if (exceptions.some((e) => e.fichier === f && chaine.includes(e.chaine))) continue;
        for (const faute of verifierTexte(chaine, INTERDITS_ECRAN_CANDIDAT)) {
          fautes.push(`${f}: ${chaine} → ${faute.raison}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("couvre le contenu éditorial, pas seulement les composants", () => {
    expect(RACINES).toContain("src/lib/contenu");
    expect(fichiers("src/lib/contenu").length).toBeGreaterThan(0);
  });
});

describe("la négation ne devient jamais une promesse", () => {
  it("laisse écrire la phrase qui protège", () => {
    for (const phrase of [
      "ImmiPro ne garantit pas l'obtention du visa.",
      "Ce classement n'est pas une probabilité d'obtention.",
      "Ce qui manque au dossier, pas tes chances d'obtenir le visa.",
      "Ce tableau compare des exigences publiées, pas des chances d'obtention.",
      "Aucune garantie d'obtention n'est donnée.",
      "ImmiPro prépare le dossier sans garantir la décision de l'administration.",
    ]) {
      expect(verifierTexte(phrase, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    }
  });

  it("refuse la promesse, y compris après une négation d'une autre proposition", () => {
    for (const phrase of [
      "Visa garanti en trois mois.",
      "Nos taux d'acceptation parlent pour nous.",
      "Pas de doute, visa garanti.",
      "On s'occupe de tout.",
      "Notre avocat suit votre dossier.",
      "Réussite garantie ou remboursé.",
      "Un accompagnement sans risque de refus.",
      "Nous déposons votre dossier auprès du consulat.",
    ]) {
      expect(verifierTexte(phrase, INTERDITS_ECRAN_CANDIDAT).length).toBeGreaterThan(0);
    }
  });

  it("borne la portée de la négation à sa proposition", () => {
    const phrase = "Pas de doute, visa garanti.";
    expect(precedeDUneNegation(phrase, phrase.indexOf("garanti"))).toBe(false);
    const protegee = "ImmiPro ne garantit rien.";
    expect(precedeDUneNegation(protegee, protegee.indexOf("garantit"))).toBe(true);
  });
});

describe("portées de la liste", () => {
  it("le vocabulaire de la note de dossier ne vaut que pour l'écran candidat", () => {
    // Le barème interne peut parler de score : il ne s'affiche jamais.
    expect(verifierTexte("le score interne du dossier", INTERDITS_PARTOUT)).toEqual([]);
    expect(
      verifierTexte("le score interne du dossier", INTERDITS_ECRAN_CANDIDAT).length,
    ).toBeGreaterThan(0);
  });

  it("les promesses de résultat sont interdites partout, contenu compris", () => {
    expect(verifierTexte("visa assuré", INTERDITS_PARTOUT).length).toBeGreaterThan(0);
  });
});
