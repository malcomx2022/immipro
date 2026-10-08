import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * La divergence ne se perd plus entre la publication et sa mise en file —
 * revue du 07/10/2026, M8 (D-23).
 *
 * `publierLaRegle` faisait sa transaction, puis postait la propagation. Un
 * `poster` qui levait faisait répondre 5xx à une publication faite, et un
 * nouvel essai ne trouvait plus de prédécesseur : les dossiers de la
 * version remplacée n'étaient jamais prévenus. Le comportement s'éprouve
 * dans `scripts/fumee-publication.mts` ; ces essais tiennent la forme.
 */
const lire = (f: string) => readFileSync(f, "utf8");
const PUBLICATION = lire("src/server/regles/publication.ts");
const DIVERGENCE = lire("src/server/jobs/divergence.ts");
const WORKER = lire("src/server/jobs/worker.ts");
const MIGRATION = lire("prisma/migrations/20261009090000_divergence_a_propager/migration.sql");

describe("la publication écrit sa dette de propagation", () => {
  it("dans sa transaction, à côté de la mise en vigueur", () => {
    const transaction = PUBLICATION.slice(PUBLICATION.indexOf("db.$transaction(["));
    const fin = transaction.indexOf("]);");
    expect(transaction.slice(0, fin)).toMatch(/divergenceDueAt: aujourdhui/u);
  });

  it("et une mise en file qui échoue ne fait plus échouer la publication", () => {
    const apres = PUBLICATION.slice(PUBLICATION.indexOf("let divergenceMiseEnFile"));
    expect(apres).toMatch(/try \{[\s\S]*?poster\(file, JOBS\.DIVERGENCE_REGLEMENTAIRE[\s\S]*?\} catch/u);
    expect(PUBLICATION).toMatch(/divergenceAPropager: veille !== null/u);
  });
});

describe("la passe efface la dette, la reprise la retrouve", () => {
  it("la propagation complète remet la colonne à nul", () => {
    expect(DIVERGENCE).toMatch(/if \(!doitRejouer\(complet\)\)[\s\S]*?divergenceDueAt: null/u);
  });

  it("une seule passe à la fois pour une version, sous verrou consultatif", () => {
    expect(DIVERGENCE).toMatch(/pg_try_advisory_xact_lock\(hashtextextended\(\$\{`divergence:\$\{nouvelleId\}`\}/u);
    // Le job posté et la reprise passent tous deux par le verrou.
    expect(WORKER).toMatch(/propagerSansRecouvrement\(job\.data\.nouvelleId\)/u);
    expect(WORKER).not.toMatch(/propagerLaPublication\(/u);
  });

  it("la reprise est planifiée toutes les heures", () => {
    expect(WORKER).toMatch(/boss\.work\(JOBS\.REPRISE_DIVERGENCE/u);
    expect(WORKER).toMatch(/boss\.schedule\(JOBS\.REPRISE_DIVERGENCE, "\d+ \* \* \* \*"\)/u);
  });
});

describe("la migration", () => {
  it("indexe la colonne et la réserve aux versions mises en vigueur", () => {
    expect(MIGRATION).toMatch(/CREATE INDEX "VisaRule_divergenceDueAt_idx"/u);
    expect(MIGRATION).toMatch(
      /CONSTRAINT "regle_divergence_sur_version_en_vigueur"\s+CHECK \("divergenceDueAt" IS NULL OR "publishedAt" IS NOT NULL\)/u,
    );
  });

  it("D-23 : marque une fois la version en vigueur de chaque procédure qui a un prédécesseur", () => {
    const rejeu = MIGRATION.slice(MIGRATION.indexOf("UPDATE"));
    expect(rejeu).toMatch(/"publishedAt" IS NOT NULL/u);
    expect(rejeu).toMatch(/"effectiveTo" IS NULL/u);
    expect(rejeu).toMatch(/p\."version" < v\."version"/u);
    // Échue tout de suite : la première reprise horaire la passe.
    expect(rejeu).toMatch(/now\(\) - interval '1 hour'/u);
  });
});
