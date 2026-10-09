/**
 * La purge de rétention, lancée à la main — RF-4, S.152 (E10, INV-5).
 *
 * Après une restauration, et avant de rouvrir le service : une sauvegarde
 * ressuscite les pièces échues depuis la nuit sauvegardée. C'est la même
 * passe que celle du worker à 3 h 30, sous le même verrou ; l'opérateur
 * nommé en est l'auteur au journal.
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/purge-retention.mjs --par "Awa Koffi"
 *
 * En local : `npm run stockage:purge-retention -- --par "…"`.
 *
 * Puis la preuve : l'inventaire du stockage est relancé, et dit ce qui
 * reste sous des dossiers purgés ou échus. Code de sortie 1 si la passe
 * n'a pas tout supprimé, ou si une autre passe tenait le verrou.
 */
import { USAGE_PURGE_RETENTION, acteurDeLaConsole, lireLesOptionsDeRetention } from "../src/domain/exploitation/purge-stockage";

const lues = lireLesOptionsDeRetention(process.argv.slice(2));
if (!lues.ok) {
  console.error(`${lues.erreurs.map((e) => `✗ ${e}`).join("\n")}\n\n${USAGE_PURGE_RETENTION}`);
  process.exit(2);
}

const { db } = await import("../src/lib/db");
const { passeDeRetention } = await import("../src/server/jobs/retention");
const { inventorierLeStockage } = await import("../src/server/exploitation/inventaire-stockage");

let code = 0;
try {
  const passe = await passeDeRetention({ acteurId: acteurDeLaConsole(lues.par) });
  if (passe === null) {
    console.error("✗ Une autre purge est en cours (la passe du worker, ou une commande). Relancer une fois qu'elle est finie.");
    code = 1;
  } else {
    const p = passe.purge;
    console.log(`Purge de rétention — ${new Date().toISOString()} — par « ${lues.par} »\n`);
    console.log(`Dossiers purgés : ${p.dossiers} ; versions : ${p.versions} ; objets supprimés : ${p.objetsSupprimes}, et ${p.objetsSousLePrefixe} sans version sous leur préfixe.`);
    console.log(`Conservation : ${passe.conservation.alertes} alerte(s), ${passe.conservation.sessions} session(s), ${passe.conservation.ecrituresDAudit} écriture(s) du journal, ${passe.conservation.motifsDEchec} motif(s) d'échec.`);
    if (passe.suppressions.reprises > 0) {
      console.log(`Suppressions de compte reprises : ${passe.suppressions.reprises}, achevées : ${passe.suppressions.achevees}.`);
    }
    if (p.objetsEnEchec > 0 || p.dossiersIncomplets > 0) {
      console.error(
        `✗ ${p.dossiersIncomplets} dossier(s) laissé(s) échu(s) : ${p.objetsEnEchec} objet(s) refusé(s) par le stockage, ${p.objetsReserves} réservé(s) par la version d'un autre dossier (M1). Ne pas rouvrir avant de relancer, ou de trancher les réservés.`,
      );
      code = 1;
    }

    // La preuve, indépendante de la passe : ce que le stockage contient encore.
    const inventaire = await inventorierLeStockage({ limite: 1 });
    const reste = (classe: string) => inventaire.classes.find((c) => c.code === classe)?.nombre ?? 0;
    console.log(
      `\nInventaire après la passe : ${reste("APRES_PURGE")} objet(s) sous des dossiers purgés, ${reste("DOSSIER_ECHU")} sous des dossiers échus.`,
    );
    if (reste("APRES_PURGE") + reste("DOSSIER_ECHU") > 0) {
      console.log(
        "Ce sont des orphelins d'avant cette passe, ou ceux qu'elle a dû laisser : node dist/inventaire-stockage.mjs les liste, et node dist/purge-inventaire.mjs les purge une fois le périmètre validé.",
      );
    }
  }
} catch (erreur) {
  console.error(`✗ La purge n'a pas abouti : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  code = 1;
} finally {
  await db.$disconnect();
}
process.exit(code);
