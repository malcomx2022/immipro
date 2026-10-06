import { PrismaClient } from "@prisma/client";
import { chargerEditorial } from "./editorial-contenu";

/**
 * Contenus éditoriaux de départ, en développement : remet les textes
 * d'origine (voir `editorial-contenu.ts`). La production, qui ne doit jamais
 * écraser une retouche de B-08, passe par `dist/graine-editoriale.mjs`.
 */
const db = new PrismaClient();

async function main() {
  for (const r of await chargerEditorial(db, { ecraser: true })) {
    console.log(`✓ ${r.kind.toLowerCase()} ${r.slug}`);
  }
  await db.$disconnect();
}

void main();
