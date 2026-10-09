/**
 * L'inventaire du stockage, en lecture seule — RF-4, S.151 (revue E4).
 *
 * En production, depuis l'image (ni `tsx` ni les sources n'y sont) :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/inventaire-stockage.mjs
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/inventaire-stockage.mjs --json > inventaire.json
 *
 * En local : `npm run stockage:inventaire`.
 *
 * Rien n'est supprimé, rien n'est écrit. Chaque objet des deux zones est
 * classé : rattaché à une version, dépôt en cours, ou écart à relire. Le
 * périmètre candidat (appartenance démontrée, rétention échue) est donné
 * avec son empreinte : c'est elle que la validation retient, et elle
 * seule qu'une purge pourra viser.
 */
import {
  USAGE_INVENTAIRE_STOCKAGE,
  lireLesOptionsDInventaire,
} from "../src/domain/exploitation/inventaire-stockage";

const options = lireLesOptionsDInventaire(process.argv.slice(2));
if (!options.ok) {
  console.error(`✗ ${options.erreur}\n\n${USAGE_INVENTAIRE_STOCKAGE}`);
  process.exit(2);
}

const { db } = await import("../src/lib/db");
const { inventorierLeStockage } = await import("../src/server/exploitation/inventaire-stockage");

const enKo = (octets: number) => `${Math.ceil(octets / 1024).toLocaleString("fr-FR")} Kio`;

let code = 0;
try {
  const inventaire = await inventorierLeStockage({ limite: options.limite });
  if (options.json) {
    console.log(JSON.stringify(inventaire, null, 2));
  } else {
    console.log(`Inventaire du stockage — ${inventaire.date} — lecture seule\n`);
    console.log(
      `Objets listés : ${inventaire.objets.CONFIANCE} en zone de confiance, ${inventaire.objets.QUARANTAINE} en quarantaine.\n`,
    );
    for (const c of inventaire.classes) {
      const marque = c.nombre === 0 || !c.ecart ? "✓" : "!";
      console.log(`${marque} ${c.code} — ${c.titre} : ${c.nombre}${c.octets > 0 ? ` (${enKo(c.octets)})` : ""}`);
      if (c.nombre === 0 || !c.ecart) continue;
      console.log(`    Règle        ${c.regle}`);
      console.log(`    Responsable  ${c.responsable}`);
      console.log(`    Traitement   ${c.traitement}`);
      for (const id of c.identifiants) console.log(`      ${id}`);
      if (c.nombre > c.identifiants.length) {
        console.log(`      … et ${c.nombre - c.identifiants.length} autre(s) : relancer avec --limite ou --json`);
      }
    }
    const p = inventaire.perimetre;
    console.log(
      `\nPérimètre candidat à une purge, après validation : ${p.nombre} objet(s)${p.octets > 0 ? `, ${enKo(p.octets)}` : ""}.`,
    );
    console.log(`Empreinte du périmètre : ${p.empreinte}`);
    console.log("Rien n'a été supprimé ni écrit.");
  }
} catch (erreur) {
  console.error(`✗ L'inventaire n'a pas abouti : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  code = 1;
} finally {
  await db.$disconnect();
}
process.exit(code);
