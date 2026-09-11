#!/usr/bin/env node
/**
 * Échoue si une formulation interdite par les invariants INV-1 / INV-2
 * apparaît dans le code ou l'interface.
 *
 * Ce n'est pas un détail de style : la frontière entre « information » et
 * « conseil juridique » se joue dans les mots affichés à l'utilisateur.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const INTERDITS = [
  { motif: /chances?\s+d['’]obtention/iu, raison: "INV-1 — aucun avis sur les chances d'obtention" },
  { motif: /chances?\s+de\s+succ[èe]s/iu, raison: "INV-1 — le score s'appelle « complétude du dossier »" },
  { motif: /probabilit[ée]\s+(de\s+)?(succ[èe]s|r[ée]ussite|acceptation)/iu, raison: "INV-1 — pas de prédiction d'acceptation" },
  { motif: /garantie?\s+d['’]obtention/iu, raison: "INV-2 — aucune promesse de résultat" },
  { motif: /visa\s+garanti/iu, raison: "INV-2 — aucune promesse de résultat" },
  { motif: /nous\s+(remplissons|d[ée]posons|soumettons)\s+(votre|ton)/iu, raison: "INV-1 — la plateforme ne dépose rien à la place du candidat" },
];

const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".mdx"]);
const IGNORE = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "docs"]);

let fautes = 0;

function parcourir(dir) {
  for (const e of readdirSync(dir)) {
    if (IGNORE.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { parcourir(p); continue; }
    if (!EXT.has(extname(p))) continue;
    if (p.endsWith("check-forbidden-copy.mjs") || p.endsWith("CLAUDE.md")) continue;

    readFileSync(p, "utf8").split("\n").forEach((ligne, i) => {
      for (const { motif, raison } of INTERDITS) {
        if (motif.test(ligne)) {
          console.error(`\n  ${p}:${i + 1}\n    ${ligne.trim()}\n    → ${raison}`);
          fautes++;
        }
      }
    });
  }
}

parcourir("src");
parcourir("prisma");

if (fautes) {
  console.error(`\n✗ ${fautes} formulation(s) interdite(s). Voir CLAUDE.md.\n`);
  process.exit(1);
}
console.log("✓ Aucune formulation interdite.");
