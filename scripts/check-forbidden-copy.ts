#!/usr/bin/env tsx
/**
 * Échoue si une formulation interdite par INV-1 / INV-2 apparaît dans le code,
 * dans le contenu ou dans les seeds.
 *
 * Ce n'est pas un détail de style : la frontière entre « information » et
 * « conseil juridique » se joue dans les mots affichés à l'utilisateur.
 *
 * La liste vit dans `src/domain/copy/vocabulaire-interdit.ts`, partagée avec
 * le test de l'interface candidat et avec la validation à l'enregistrement
 * côté back-office. Une seule liste, trois points d'application.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import {
  INTERDITS_PARTOUT,
  verifierTexte,
  type Faute,
} from "../src/domain/copy/vocabulaire-interdit";

interface Exception {
  chaine: string;
  fichier: string;
  motif: string;
  date: string;
}

const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".mdx"]);
const IGNORE = new Set([
  "node_modules", ".next", ".git", "dist", "build", "coverage", "docs",
]);
/** Le module de la liste se cite lui-même ; il ne s'applique pas à lui-même. */
const HORS_PERIMETRE = [
  "src/domain/copy/vocabulaire-interdit.ts",
  "scripts/check-forbidden-copy.ts",
  "CLAUDE.md",
];

const SEUIL_EXCEPTIONS = 5;

function chargerExceptions(): Exception[] {
  if (!existsSync("copy-exceptions.json")) return [];
  const brut: unknown = JSON.parse(readFileSync("copy-exceptions.json", "utf8"));
  if (typeof brut !== "object" || brut === null) return [];
  const liste = (brut as { exceptions?: unknown }).exceptions;
  return Array.isArray(liste) ? (liste as Exception[]) : [];
}

const exceptions = chargerExceptions();

const couvertParException = (fichier: string, ligne: string) =>
  exceptions.some(
    (e) => fichier.replace(/\\/gu, "/") === e.fichier && ligne.includes(e.chaine),
  );

let fautes = 0;

function parcourir(dir: string) {
  if (!existsSync(dir)) return;
  for (const nom of readdirSync(dir)) {
    if (IGNORE.has(nom)) continue;
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      parcourir(p);
      continue;
    }
    if (!EXT.has(extname(p))) continue;
    if (HORS_PERIMETRE.some((h) => p.replace(/\\/gu, "/").endsWith(h))) continue;

    readFileSync(p, "utf8").split("\n").forEach((ligne, i) => {
      const trouvees: Faute[] = verifierTexte(ligne, INTERDITS_PARTOUT);
      if (trouvees.length === 0) return;
      if (couvertParException(p, ligne)) return;
      for (const f of trouvees) {
        console.error(`\n  ${p}:${i + 1}\n    ${ligne.trim()}\n    → ${f.raison}`);
        fautes++;
      }
    });
  }
}

// Code, contenu et seeds : la dérive viendra des textes, pas des composants.
for (const racine of ["src", "prisma", "content"]) parcourir(racine);

if (exceptions.length > SEUIL_EXCEPTIONS) {
  console.warn(
    `\n⚠ ${exceptions.length} dérogations dans copy-exceptions.json, au-delà du seuil de ${SEUIL_EXCEPTIONS}.` +
      `\n  Ce n'est plus une exception, c'est une dérive du vocabulaire : la règle est à rediscuter.\n`,
  );
}

if (fautes) {
  console.error(`\n✗ ${fautes} formulation(s) interdite(s). Voir CLAUDE.md.\n`);
  process.exit(1);
}
console.log("✓ Aucune formulation interdite.");
