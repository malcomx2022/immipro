/**
 * Le diagnostic d'un paiement, en lecture seule — S.116.
 *
 * En production, depuis l'image (ni `tsx` ni les sources n'y sont) :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/diagnostic-paiement.mjs \
 *       --reference IMP-261005-P98AEE
 *
 * En local : `npm run paiement:diagnostic -- --reference …`.
 *
 * Rien n'est écrit, ni en base ni chez le fournisseur : une transaction ne
 * change d'état que par une notification signée ou par la réconciliation
 * (INV-7). La sortie ne porte aucune donnée du payeur — ni nom, ni
 * numéro, ni courriel —, elle peut se coller dans un ticket.
 */
import { lireLaReference, USAGE_DIAGNOSTIC } from "../src/domain/paiement/diagnostic";

const lue = lireLaReference(process.argv.slice(2));
if (!lue.ok) {
  console.error(`✗ ${lue.erreur}\n\n${USAGE_DIAGNOSTIC}`);
  process.exit(2);
}

const { db } = await import("../src/lib/db");
const { diagnostiquerLePaiement } = await import("../src/server/paiement/diagnostic");

const ligne = (intitule: string, valeur: string | number | null | undefined): void =>
  console.log(`  ${intitule.padEnd(24)} ${valeur ?? "—"}`);

let code = 0;
try {
  const d = await diagnostiquerLePaiement(lue.reference);
  if (!d) {
    console.error(`✗ Aucune transaction ${lue.reference} : vérifier la référence en B-04 (/paiements) ou sur le reçu du candidat.`);
    code = 1;
  } else {
    const t = d.transaction;
    console.log(`Transaction ${t.reference}`);
    ligne("État", t.statut);
    ligne("Cause d'échec", t.cause);
    ligne("Fournisseur", t.fournisseur);
    ligne("Identifiant fournisseur", t.providerTxId);
    ligne("Montant", `${t.montant} ${t.devise}`);
    ligne("Créée le", t.creeeLe);
    ligne("Confirmée le", t.confirmeeLe);
    ligne("Rapprochée le", t.rapprocheeLe);
    ligne("Écart", t.ecart ? `${t.ecart}${t.ecartRefermeLe ? ` (refermé le ${t.ecartRefermeLe})` : " (ouvert)"}` : null);
    ligne("Pièces comptables", t.pieces.join(", ") || null);

    console.log(`\nÉvénements de paiement appliqués (${d.evenements.length})`);
    if (d.evenements.length === 0) console.log("  aucun");
    for (const e of d.evenements) {
      console.log(`  ${e.recuLe}  ${e.origine === "webhook" ? "webhook        " : "réconciliation "} ${e.annonce.padEnd(11)} ${e.id}`);
    }

    console.log(`\nJournal d'audit sur cette transaction (${d.journal.length})`);
    if (d.journal.length === 0) console.log("  aucune ligne");
    for (const l of d.journal) console.log(`  ${l.le}  ${l.action}  ${l.auteur}\n      ${l.motif}`);

    console.log("\nChez le fournisseur");
    if (!d.apercu) {
      console.log("  non lue (voir les constats)");
    } else {
      const a = d.apercu;
      ligne("Identifiant", a.id);
      ligne("Référence FedaPay", a.referenceFedaPay);
      ligne("Référence marchande", a.referenceMarchande);
      ligne("État", a.etat);
      ligne("Montant", a.montant !== null ? `${a.montant} ${a.devise ?? ""}`.trim() : null);
      ligne("Moyen (mode)", a.mode);
      ligne("Créée le", a.creeeLe);
      ligne("Mise à jour le", a.majLe);
      ligne("Approuvée le", a.approuveeLe);
      ligne("Refusée le", a.refuseeLe);
      ligne("Annulée le", a.annuleeLe);
    }

    console.log("\nConstats");
    for (const c of d.constats) console.log(`  • ${c}`);
  }
} finally {
  await db.$disconnect();
}
process.exit(code);
