import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acteurDeLaConsole,
  lireLaLigneDuPerimetre,
  lireLesOptionsDePurgeDuPerimetre,
  lireLesOptionsDeRetention,
  prefixeDuDossier,
} from "@/domain/exploitation/purge-stockage";
import { ligneDuPerimetre } from "@/domain/exploitation/inventaire-stockage";
import { prefixeDeDepot } from "@/domain/dossiers/televersement";
import { origineDe } from "@/domain/backoffice/acteur";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * RF-4, S.152 — les purges lancées à la main, et le préfixe d'un dossier.
 * Décisions du 09/10/2026 : empreinte stricte, opérateur nommé, journal par
 * dossier. `smoke:purge` les éprouve sur un stockage et une base réels.
 */
const lire = (f: string) => sansCommentaires(readFileSync(f, "utf8"));
const EMPREINTE = "a".repeat(64);

describe("le préfixe et les lignes", () => {
  it("le préfixe d'un dossier est celui de toutes ses clés de dépôt", () => {
    expect(prefixeDeDepot("d1", "passeport").startsWith(prefixeDuDossier("d1"))).toBe(true);
    // Le préfixe se ferme par la barre : `d1` ne couvre pas `d10`.
    expect(prefixeDeDepot("d10", "passeport").startsWith(prefixeDuDossier("d1"))).toBe(false);
  });

  it("une ligne du périmètre se relit telle que l'inventaire l'écrit", () => {
    const objet = { zone: "QUARANTAINE" as const, cle: "dossiers/d1/passeport/1700000000000-x" };
    expect(lireLaLigneDuPerimetre(ligneDuPerimetre(objet))).toEqual(objet);
    expect(lireLaLigneDuPerimetre("AILLEURS dossiers/d1/x")).toBeNull();
    expect(lireLaLigneDuPerimetre("CONFIANCE ")).toBeNull();
  });

  it("l'opérateur s'écrit comme un geste de la console du serveur (S.115)", () => {
    expect(acteurDeLaConsole("Awa Koffi")).toBe("console:Awa Koffi");
    expect(origineDe(acteurDeLaConsole("Awa Koffi"))).toBe("console du serveur");
  });
});

describe("les options", () => {
  it("la purge de rétention exige l'opérateur", () => {
    expect(lireLesOptionsDeRetention(["--par", "Awa Koffi"])).toEqual({ ok: true, par: "Awa Koffi" });
    expect(lireLesOptionsDeRetention([]).ok).toBe(false);
    expect(lireLesOptionsDeRetention(["--par", "A"]).ok).toBe(false);
    expect(lireLesOptionsDeRetention(["--par", "Awa\nKoffi"]).ok).toBe(false);
    expect(lireLesOptionsDeRetention(["--par", "Awa", "--tout"]).ok).toBe(false);
  });

  it("sans --confirmer, la purge du périmètre ne fait que montrer", () => {
    expect(lireLesOptionsDePurgeDuPerimetre([])).toEqual({
      ok: true,
      options: { mode: "MONTRER", empreinte: null },
    });
    expect(lireLesOptionsDePurgeDuPerimetre(["--empreinte", EMPREINTE.toUpperCase()])).toEqual({
      ok: true,
      options: { mode: "MONTRER", empreinte: EMPREINTE },
    });
    // `--par` sans confirmation laisserait croire que quelque chose part.
    expect(lireLesOptionsDePurgeDuPerimetre(["--par", "Awa"]).ok).toBe(false);
  });

  it("pour supprimer : l'empreinte, la confirmation et l'opérateur, chacun dit s'il manque", () => {
    expect(
      lireLesOptionsDePurgeDuPerimetre(["--empreinte", EMPREINTE, "--confirmer", "--par", "Awa Koffi"]),
    ).toEqual({ ok: true, options: { mode: "SUPPRIMER", empreinte: EMPREINTE, par: "Awa Koffi" } });

    const sansRien = lireLesOptionsDePurgeDuPerimetre(["--confirmer"]);
    expect(sansRien.ok).toBe(false);
    if (!sansRien.ok) {
      expect(sansRien.erreurs.some((e) => e.startsWith("--confirmer exige --empreinte"))).toBe(true);
      expect(sansRien.erreurs.some((e) => e.startsWith("--par"))).toBe(true);
    }
    expect(
      lireLesOptionsDePurgeDuPerimetre(["--empreinte", "abc", "--confirmer", "--par", "Awa"]).ok,
    ).toBe(false);
    expect(lireLesOptionsDePurgeDuPerimetre(["--tout", "--confirmer"]).ok).toBe(false);
  });
});

describe("la purge d'un dossier vide son préfixe (E4, étape 3)", () => {
  const purge = lire("src/server/jobs/purge.ts");

  it("le préfixe se vide après les versions, et seulement si rien n'a résisté", () => {
    const corps = purge.slice(purge.indexOf("export async function purgerLesPiecesEchues"));
    expect(corps.indexOf("await supprimerPartout(version.objectKey)")).toBeLessThan(
      corps.indexOf("await viderLePrefixe(dossier.id)"),
    );
    expect(corps).toMatch(/if \(resistent\.size === 0\) \{\s*try \{\s*prefixe = await viderLePrefixe/u);
    // Un dossier ne se dit purgé que si son préfixe est vide de tout ce qui pouvait partir.
    expect(corps).toContain("const complet = resistent.size === 0 && prefixe !== null && !reserve;");
  });

  it("une clé désignée par la version vivante d'un autre dossier est gardée (M1)", () => {
    const vider = purge.slice(purge.indexOf("async function viderLePrefixe"));
    expect(vider).toMatch(/purgedAt: null,\s*document: \{ applicationId: \{ not: applicationId \} \}/u);
    expect(vider).toMatch(/if \(reservees\.has\(objet\.cle\)\) \{\s*reserves \+= 1;\s*continue;/u);
  });
});

describe("une passe de purge à la fois, et la même partout", () => {
  it("le worker et la commande lancent la même passe, sous le même verrou", () => {
    const worker = lire("src/server/jobs/worker.ts");
    expect(worker).toContain("const passe = await passeDeRetention();");
    expect(worker).not.toMatch(/purgerLesPiecesEchues\(|purgerCeQuiEstEchu\(/u);
    expect(lire("scripts/purge-retention.mts")).toContain("await passeDeRetention({ acteurId: acteurDeLaConsole(lues.par) })");
    const retention = lire("src/server/jobs/retention.ts");
    expect(retention).toMatch(/pg_try_advisory_xact_lock\(hashtextextended\(\$\{CLE_DU_VERROU_DE_PURGE\}, 0\)\)/u);
    expect(retention).toContain("return sousLeVerrouDePurge(async () => ({");
  });

  it("la purge du périmètre recalcule l'inventaire et compare l'empreinte avant toute suppression", () => {
    const source = lire("src/server/exploitation/purge-inventaire.ts");
    const comparaison = source.indexOf("if (perimetre.empreinte !== demande.empreinte)");
    expect(source.indexOf("await inventorierLeStockage(")).toBeLessThan(comparaison);
    expect(comparaison).toBeLessThan(source.indexOf("await supprimerDansLaZone("));
    expect(source).toContain("await sousLeVerrouDePurge(");
    // La zone où l'inventaire a vu l'objet, et nulle part ailleurs.
    expect(source).not.toContain("supprimerPartout");
  });

  it("chaque dossier touché est journalisé sous l'opérateur, et l'échec du journal n'est pas avalé", () => {
    const source = lire("src/server/exploitation/purge-inventaire.ts");
    expect(source).toMatch(/await journaliser\(\{\s*acteurId: acteurDeLaConsole\(demande\.par\),\s*action: "piece\.purge\.inventaire",/u);
    const journal = source.slice(source.indexOf("await journaliser("));
    expect(journal.slice(0, journal.indexOf("});") + 3)).not.toContain(".catch(");
  });

  it("les deux commandes sont dans le paquet de l'image, avec le require de minio", () => {
    const build = readFileSync("scripts/build-worker.mjs", "utf8");
    expect(build).toContain('for (const nom of ["purge-retention", "purge-inventaire"])');
    const entree = build.slice(build.indexOf('for (const nom of ["purge-retention"'));
    expect(entree.slice(0, entree.indexOf("});"))).toContain("createRequire");
  });
});
