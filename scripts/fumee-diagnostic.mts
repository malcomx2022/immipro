/**
 * La confirmation tardive, l'écart en B-04 et le diagnostic d'un
 * paiement, sur une base réelle — S.116.
 *
 * Le cas du bac à sable du 05/10/2026 : une transaction tenue pour
 * échouée, puis une confirmation du fournisseur. Elle doit ouvrir un
 * écart, cet écart doit rester visible en B-04 le lendemain, et le
 * diagnostic — par le paquet de l'image — doit le dire sans rien écrire.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:diagnostic
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_diagnostic_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.set("schema", "public");

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function surLAdministration(texte: string): Promise<void> {
  const client = new Client({ connectionString: administration.toString() });
  await client.connect();
  try {
    await client.query(texte);
  } finally {
    await client.end();
  }
}

console.log(`Diagnostic d'un paiement sur une base jetable (${nomBase})`);
await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${nomBase}`);
// Sans clé de fournisseur : le paquet ne doit rien appeler, et le dire.
const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: cible.toString(), FEDAPAY_API_KEY: "", FEDAPAY_SECRET_KEY: "" };

const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env });
const paquet = spawnSync("node", ["scripts/build-worker.mjs"], { encoding: "utf8" });
if (migration.status !== 0 || paquet.status !== 0) {
  console.error(`${migration.stderr ?? ""}${paquet.stderr ?? ""}`);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  process.exit(1);
}

process.env.DATABASE_URL = cible.toString();
const { db } = await import("../src/lib/db");

/**
 * Ce que le fournisseur annonce avoir encaissé : le montant décidé par la
 * plateforme, en unités mineures (revue du 07/10/2026, E2). Une
 * confirmation sans montant ne crédite plus rien.
 */
const encaisse = async (reference: string) => {
  const { versMineur } = await import("../src/domain/facturation/montants");
  const t = await db.transaction.findUniqueOrThrow({
    where: { reference },
    select: { amount: true, currency: true },
  });
  return {
    montantMineur: versMineur(t.amount, t.currency),
    devise: t.currency,
    rembourseMineur: null,
  };
};
/** Une notification qui ne dit rien de l'argent : un échec, une attente, un remboursement FedaPay. */
const sansMontant = { montantMineur: null, devise: null, rembourseMineur: null };
const { traiterLaNotification } = await import("../src/server/paiement/reception");
const { ecartsAnterieurs, paiements } = await import("../src/server/lecture/backoffice");
const { diagnostiquerLePaiement } = await import("../src/server/paiement/diagnostic");
const { jourCivil } = await import("../src/domain/format/fuseau");

const lancer = (...args: string[]) => {
  const r = spawnSync("node", ["dist/diagnostic-paiement.mjs", ...args], { encoding: "utf8", env });
  return { code: r.status, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

try {
  const courriel = `payeur-${process.pid}@exemple.test`;
  const candidat = await db.user.create({ data: { email: courriel, emailVerified: new Date() } });
  const hier = new Date(Date.now() - 30 * 60 * 60 * 1000);
  const reference = `IMP-261004-D${process.pid}`;
  const providerTxId = `fedapay:9${process.pid}`;
  await db.transaction.create({
    data: {
      reference,
      userId: candidat.id,
      packCode: "essentiel",
      amount: 5000,
      currency: "XOF",
      provider: "FEDAPAY",
      providerTxId,
      status: "ECHOUEE",
      failureCause: "REFUS_EMETTEUR",
      failureCauseAt: hier,
      createdAt: hier,
    },
  });
  // Une transaction d'hier, close sans écart : elle ne doit pas remonter.
  await db.transaction.create({
    data: {
      reference: `IMP-261004-C${process.pid}`,
      userId: candidat.id,
      packCode: "essentiel",
      amount: 5000,
      currency: "XOF",
      provider: "FEDAPAY",
      status: "EXPIREE",
      createdAt: hier,
    },
  });

  console.log("\nLa confirmation tardive");
  const issue = await traiterLaNotification(
    { providerEventId: `${providerTxId}:approved`, providerTxId, reference, statut: "CONFIRMEE", ...(await encaisse(reference)) },
    "fedapay",
  );
  const apres = await db.transaction.findUniqueOrThrow({ where: { reference } });
  verifier(issue.issue === "refusee" && apres.status === "ECHOUEE", "la transition reste refusée : l'état abouti ne se réécrit pas");
  verifier(
    apres.discrepancy !== null && apres.discrepancy.includes(providerTxId) && /rembourser/u.test(apres.discrepancy),
    "mais l'écart s'ouvre, avec l'identifiant et le geste à faire",
  );
  verifier((await db.paymentEvent.count()) === 0, "aucun événement de paiement n'est écrit pour une notification refusée");
  const premier = apres.discrepancy;
  await traiterLaNotification(
    { providerEventId: `${providerTxId}:approved`, providerTxId, reference, statut: "CONFIRMEE", ...(await encaisse(reference)) },
    "fedapay",
  );
  verifier(
    (await db.transaction.findUniqueOrThrow({ where: { reference } })).discrepancy === premier,
    "rejouée, elle ne réécrit pas le constat",
  );

  console.log("\nB-04, le lendemain");
  const aujourdhui = jourCivil(new Date());
  const duJour = await paiements(aujourdhui);
  const anterieurs = await ecartsAnterieurs(aujourdhui);
  verifier(!duJour.some((p) => p.reference === reference), "la transaction d'hier n'entre pas dans le livre du jour");
  verifier(
    anterieurs.length === 1 && anterieurs[0]?.reference === reference && anterieurs[0]?.etat === "ECART",
    "elle figure parmi les écarts ouverts des jours précédents, et elle seule",
  );
  await db.transaction.update({
    where: { reference },
    data: {
      discrepancyOutcome: "REMBOURSEMENT_A_INITIER",
      discrepancyNote: "Remboursé au tableau de bord FedaPay",
      discrepancyResolvedAt: new Date(),
      discrepancyResolvedBy: candidat.id,
    },
  });
  verifier((await ecartsAnterieurs(aujourdhui)).length === 0, "refermé, il quitte la liste");
  await db.transaction.update({
    where: { reference },
    data: { discrepancyOutcome: null, discrepancyNote: null, discrepancyResolvedAt: null, discrepancyResolvedBy: null },
  });

  console.log("\nLe diagnostic");
  const avant = await db.auditLog.count();
  const d = await diagnostiquerLePaiement(reference, {
    env: { FEDAPAY_ENVIRONMENT: "sandbox", APP_URL: "https://immipro.app" },
    lire: async (id) => ({
      issue: "lue",
      apercu: {
        id: id.replace(/^fedapay:/u, ""),
        referenceFedaPay: "trx_essai",
        referenceMarchande: reference,
        etat: "approved",
        montant: 5000,
        devise: "XOF",
        mode: "mtn_open",
        creeeLe: hier.toISOString(),
        majLe: null,
        approuveeLe: new Date().toISOString(),
        refuseeLe: null,
        annuleeLe: null,
      },
    }),
  });
  verifier(d !== null && d.journal.length === 2, "il relit les deux notifications refusées au journal");
  verifier(
    d !== null && d.constats.some((c) => /débité sans recevoir son pack/u.test(c)) && d.constats.some((c) => /2 notifications reçues et refusées/u.test(c)),
    "il dit que le candidat a été débité, et que les notifications sont arrivées",
  );
  verifier(d !== null && !d.constats.some((c) => /Aucun webhook/u.test(c)), "il ne prétend pas qu'aucun webhook n'est arrivé");
  verifier((await db.auditLog.count()) === avant, "il n'écrit rien");

  console.log("\nLa commande de l'image");
  const sortie = lancer("--reference", reference);
  verifier(sortie.code === 0 && /FEDAPAY_API_KEY absente/u.test(sortie.sortie), "sans clé, elle n'appelle pas le fournisseur et le dit");
  verifier(/Écart\s+Paiement confirmé/u.test(sortie.sortie), "elle montre l'écart ouvert");
  verifier(!sortie.sortie.includes(courriel), "elle ne sort aucune donnée du payeur");
  const inconnue = lancer("--reference", "IMP-000000-INCONNU");
  verifier(inconnue.code === 1 && /B-04/u.test(inconnue.sortie), "une référence inconnue renvoie vers B-04");
  const vide = lancer();
  verifier(vide.code === 2 && /--reference/u.test(vide.sortie), "sans référence, elle dit quoi fournir");
  verifier((await db.auditLog.count()) === avant, "et n'écrit toujours rien");
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nUne confirmation tardive ouvre un écart qui reste visible, et le diagnostic le dit sans rien écrire.");
