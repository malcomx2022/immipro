/**
 * Le diagnostic des données antérieures, en lecture seule — RF-4, S.149.
 *
 * En production, depuis l'image (ni `tsx` ni les sources n'y sont) :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/diagnostic-donnees.mjs
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/diagnostic-donnees.mjs --limite 200
 *
 * En local : `npm run donnees:diagnostic`.
 *
 * Rien n'est écrit. Pour chaque constat : le nombre, les premiers
 * identifiants techniques, la règle, le responsable et le traitement
 * proposé. Aucun nom, courriel ni contenu de pièce : la sortie se colle
 * dans un ticket. Un constat est une liste à relire, pas un ordre de
 * correction.
 */
import { lireLesOptions, USAGE_DIAGNOSTIC_DONNEES } from "../src/domain/exploitation/diagnostic-donnees";

const options = lireLesOptions(process.argv.slice(2));
if (!options.ok) {
  console.error(`✗ ${options.erreur}\n\n${USAGE_DIAGNOSTIC_DONNEES}`);
  process.exit(2);
}

const { db } = await import("../src/lib/db");
const { diagnostiquerLesDonnees } = await import("../src/server/exploitation/diagnostic-donnees");

let code = 0;
try {
  const constats = await diagnostiquerLesDonnees({ limite: options.limite });
  console.log(`Diagnostic des données — ${new Date().toISOString()} — lecture seule\n`);
  for (const c of constats) {
    console.log(`${c.nombre === 0 ? "✓" : "!"} ${c.code} — ${c.titre} : ${c.nombre}`);
    if (c.nombre === 0) continue;
    console.log(`    Règle        ${c.regle}`);
    console.log(`    Responsable  ${c.responsable}`);
    console.log(`    Traitement   ${c.traitement}`);
    for (const id of c.identifiants) console.log(`      ${id}`);
    if (c.nombre > c.identifiants.length) {
      console.log(`      … et ${c.nombre - c.identifiants.length} autre(s) : relancer avec --limite`);
    }
  }
  const aRelire = constats.filter((c) => c.nombre > 0).length;
  console.log(
    `\n${aRelire === 0 ? "Aucun constat." : `${aRelire} constat(s) à relire.`} Rien n'a été écrit.`,
  );
} catch (erreur) {
  console.error(`✗ Le diagnostic n'a pas abouti : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  code = 1;
} finally {
  await db.$disconnect();
}
process.exit(code);
