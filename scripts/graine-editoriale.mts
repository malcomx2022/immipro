/**
 * Chargement du guide et de l'article de départ en production — S.120.
 *
 * `npm run seed:editorial` ne tourne pas dans l'image (ni `tsx` ni les
 * sources). Ce paquet comble ce manque :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/graine-editoriale.mjs
 *
 * Il ne **crée que les documents absents**. Un document déjà présent — qu'il
 * ait été retouché, republié ou dépublié en B-08 — est laissé tel quel : la
 * commande peut être relancée sans risque. (La graine de développement, elle,
 * remet les textes d'origine.)
 */
import { PrismaClient } from "@prisma/client";
import { chargerEditorial } from "../prisma/seed/editorial-contenu";

const db = new PrismaClient();
let code = 0;
try {
  for (const r of await chargerEditorial(db, { ecraser: false })) {
    const verbe = r.issue === "cree" ? "créé" : "déjà présent, laissé tel quel";
    console.log(`✓ ${r.kind.toLowerCase()} ${r.slug} — ${verbe}`);
  }
} catch (erreur) {
  console.error(
    `✗ Le chargement a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}. ` +
      "Vérifier DATABASE_URL et que les migrations sont appliquées (prisma migrate deploy).",
  );
  code = 1;
} finally {
  await db.$disconnect();
}
process.exit(code);
