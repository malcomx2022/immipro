/**
 * La purge du périmètre validé de l'inventaire du stockage — RF-4, S.152 (E4).
 *
 * Sans option, la commande montre le périmètre et son empreinte, et ne
 * supprime rien. Pour supprimer, l'empreinte validée, la confirmation et
 * le nom de l'opérateur :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/purge-inventaire.mjs
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/purge-inventaire.mjs \
 *       --empreinte <sha256 validé> --confirmer --par "Awa Koffi"
 *
 * En local : `npm run stockage:purge-inventaire -- …`.
 *
 * L'inventaire est recalculé au lancement : si l'empreinte n'est plus
 * celle qui a été validée, rien n'est supprimé, et la nouvelle liste se
 * fait valider. Mode d'emploi : docs/exploitation/inventaire-stockage.md.
 */
import {
  USAGE_PURGE_INVENTAIRE,
  lireLesOptionsDePurgeDuPerimetre,
} from "../src/domain/exploitation/purge-stockage";

const lues = lireLesOptionsDePurgeDuPerimetre(process.argv.slice(2));
if (!lues.ok) {
  console.error(`${lues.erreurs.map((e) => `✗ ${e}`).join("\n")}\n\n${USAGE_PURGE_INVENTAIRE}`);
  process.exit(2);
}
const options = lues.options;

const { db } = await import("../src/lib/db");
const { inventorierLeStockage } = await import("../src/server/exploitation/inventaire-stockage");
const { purgerLePerimetreValide } = await import("../src/server/exploitation/purge-inventaire");

let code = 0;
try {
  if (options.mode === "MONTRER") {
    const { perimetre } = await inventorierLeStockage({ limite: 1 });
    console.log(`Périmètre candidat — ${new Date().toISOString()} — rien n'est supprimé\n`);
    for (const ligne of perimetre.lignes) console.log(`  ${ligne}`);
    console.log(`\n${perimetre.nombre} objet(s). Empreinte : ${perimetre.empreinte}`);
    if (options.empreinte !== null) {
      console.log(
        options.empreinte === perimetre.empreinte
          ? "✓ C'est l'empreinte donnée : le périmètre n'a pas changé depuis sa validation."
          : "✗ Ce n'est pas l'empreinte donnée : le périmètre a changé, il se revalide avant toute purge.",
      );
    }
  } else {
    const issue = await purgerLePerimetreValide({ empreinte: options.empreinte, par: options.par });
    if (issue.issue === "OCCUPE") {
      console.error("✗ Une autre purge est en cours (la passe du worker, ou une commande). Relancer une fois qu'elle est finie. Rien n'a été supprimé.");
      code = 1;
    } else if (issue.issue === "EMPREINTE") {
      console.error(
        `✗ Le périmètre a changé depuis sa validation : ${issue.nombre} objet(s), empreinte ${issue.constatee}, et non ${issue.validee}. Rien n'a été supprimé : relancer l'inventaire, faire valider la nouvelle liste, puis relancer avec la nouvelle empreinte.`,
      );
      code = 1;
    } else {
      console.log(
        `${issue.enEchec === 0 ? "✓" : "✗"} ${issue.supprimes} objet(s) supprimé(s) dans ${issue.dossiers} dossier(s), par « ${options.par} » ; inscrit au journal (piece.purge.inventaire).`,
      );
      if (issue.enEchec > 0) {
        console.error(
          `✗ ${issue.enEchec} objet(s) refusé(s) par le stockage : ils restent, et l'inventaire les montrera. Relancer l'inventaire, faire valider, relancer.`,
        );
        code = 1;
      }
    }
  }
} catch (erreur) {
  console.error(`✗ La purge n'a pas abouti : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  code = 1;
} finally {
  await db.$disconnect();
}
process.exit(code);
