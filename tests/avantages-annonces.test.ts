import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AVANTAGES, SOUS_TITRES } from "@/domain/payments/avantages";
import { PACKS } from "@/domain/payments/pricing";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * Ce que la page publique vend, en regard de ce que le code donne — P-06.
 *
 * ── Deux lignes fausses sur douze ───────────────────────────────────
 *
 * « Comparateur des trois dossiers en parallèle », vendu avec Pro : C-03
 * compare des **destinations** publiées, pas des dossiers, et sa page
 * n'exige qu'un candidat authentifié — elle est dans la navigation
 * principale, sans garde de pack. Le pack vendait ce que tout le monde a.
 *
 * « Rédaction assistée de la lettre de motivation », vendue avec Dossier :
 * les routes de rédaction ne vérifient aucun pack, elles débitent le quota
 * d'analyses. Un acheteur d'Essentiel en a dix, donc il l'a aussi.
 *
 * Les deux se lisaient sur un écran où quelqu'un décide de payer.
 */
describe("les avantages annoncés tiennent ce que le code donne", () => {
  /*
    Les nombres ne sont jamais recopiés : ils sont interpolés depuis la
    grille. Cette assertion le vérifie plutôt que de le supposer — un
    littéral réintroduit se désynchronise en silence, et c'est le mécanisme
    exact du défaut où un pack annonçait trois destinations et n'en servait
    qu'une.
  */
  it.each(PACKS.map((p) => [p.code, p.analyses] as const))(
    "le pack %s annonce ses %i analyses, telles que la grille les porte",
    (code, analyses) => {
      const lignes = AVANTAGES[code] ?? [];
      const ligneDesAnalyses = lignes.find((l) => /analyse/iu.test(l));

      expect(ligneDesAnalyses, code).toBeDefined();
      expect(ligneDesAnalyses).toContain(String(analyses));
    },
  );

  /*
    Le comparateur est ouvert à tout candidat authentifié : sa page
    n'appelle que `exigerCandidat`, et l'entrée de navigation est
    inconditionnelle. Le vendre dans un pack est donc faux, quelle que
    soit la formulation.
  */
  it("aucun pack ne vend le comparateur, qui est ouvert à tous", () => {
    const page = readFileSync("src/app/(app)/(dossier)/comparateur/page.tsx", "utf8");
    expect(page).toContain("exigerCandidat");
    expect(page).not.toMatch(/pack/iu);

    for (const [code, lignes] of Object.entries(AVANTAGES)) {
      for (const ligne of lignes) {
        expect(ligne, `${code} : ${ligne}`).not.toMatch(/comparateur/iu);
      }
    }
  });

  /*
    Arbitrage S.80 : la rédaction assistée est un droit des packs que la
    grille marque `redactionAssistee`, et les routes qui appellent le
    service le vérifient sur la couverture du dossier — jamais sur un code
    de pack lu à part. Elle s'annonce donc là où elle s'ouvre, et nulle
    part ailleurs.
  */
  it("la rédaction assistée est annoncée là où la grille l'ouvre, et seulement là", () => {
    for (const chemin of ["version", "relecture"]) {
      const route = readFileSync(
        `src/app/api/dossiers/[id]/redaction/[type]/${chemin}/route.ts`,
        "utf8",
      );
      expect(route, chemin).toContain("exigerRedactionAssistee(params.id!)");
      expect(route, chemin).not.toMatch(/packCode/u);
    }
    for (const pack of PACKS) {
      const annonce = AVANTAGES[pack.code]?.some((l) => /rédaction assistée/iu.test(l));
      expect(annonce, pack.code).toBe(pack.redactionAssistee);
    }
    expect(PACKS.find((p) => p.code === "essentiel")?.redactionAssistee).toBe(false);
  });

  /*
    Le comparateur de dossiers n'est pas en V1 (arbitrage S.80) : ni le
    badge ni les avantages ne l'annoncent, sous aucun nom.
  */
  it("Pro ne s'annonce pas par un comparateur, ni par une comparaison", () => {
    const pro = PACKS.find((p) => p.code === "pro")!;
    expect(pro.justification).not.toMatch(/compar/iu);
    for (const l of AVANTAGES.pro ?? []) expect(l).not.toMatch(/compar/iu);
  });

  /** Tout pack de la grille est décrit, et rien n'est décrit qui n'existe pas. */
  it("décrit exactement les paliers qui existent", () => {
    const decrits = new Set(Object.keys(AVANTAGES));
    const attendus = new Set(["decouverte", ...PACKS.map((p) => p.code)]);

    expect([...decrits].sort()).toEqual([...attendus].sort());
    expect([...Object.keys(SOUS_TITRES)].sort()).toEqual([...attendus].sort());
  });

  /*
    Une ligne vide remplirait une place sans rien dire, et c'est ce qu'on
    vient de retirer au pack Dossier — deux lignes vraies valent mieux que
    trois dont une inventée.
  */
  it("ne garde aucune ligne vide pour égaliser les cartes", () => {
    for (const [code, lignes] of Object.entries(AVANTAGES)) {
      expect(lignes.length, code).toBeGreaterThan(0);
      for (const l of lignes) expect(l.trim().length, `${code} : « ${l} »`).toBeGreaterThan(10);
    }
  });

  /** INV-1 et INV-2 : rien de ce qui se vend ne promet une issue. */
  it("ne promet rien de la décision administrative", () => {
    for (const lignes of Object.values(AVANTAGES)) {
      for (const l of lignes) expect(verifierTexte(l, INTERDITS_PARTOUT)).toEqual([]);
    }
    for (const s of Object.values(SOUS_TITRES)) {
      expect(verifierTexte(s, INTERDITS_PARTOUT)).toEqual([]);
    }
  });
});
