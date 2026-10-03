/**
 * La relecture humaine de la complétude, sur une base réelle — S.113.
 *
 * Troisième garde-fou de l'avis juridique L.A (03/10/2026) : le candidat
 * peut demander qu'une personne relise son évaluation de complétude.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:relecture
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_relecture_${process.pid}`;
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

console.log(`Relecture de la complétude sur une base jetable (${nomBase})`);
await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${nomBase}`);
process.env.DATABASE_URL = cible.toString();

const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: cible.toString() },
});
if (migration.status !== 0) {
  console.error(`${migration.stdout ?? ""}${migration.stderr ?? ""}`);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  process.exit(1);
}

const { db } = await import("../src/lib/db");
const { demanderUneRelecture, repondreALaRelecture, etatDeLaRelecture, fileDesRelectures } =
  await import("../src/server/dossiers/relecture-completude");

const codeDe = (e: unknown) => (e as { echec?: { code?: string } }).echec?.code ?? String(e);

try {
  const admin = await db.user.create({ data: { email: `relecteur-${process.pid}@exemple.test`, role: "ADMIN" } });
  const candidat = await db.user.create({ data: { email: `candidat-${process.pid}@exemple.test`, role: "CANDIDAT" } });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL", visaType: "ETUDES", category: "ETUDES", version: 1,
      effectiveFrom: new Date("2026-01-01"), rules: {}, sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL", verifiedAt: new Date("2026-01-01"), verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
    },
  });
  const dossier = await db.application.create({ data: { userId: candidat.id, visaRuleId: regle.id } });

  console.log("\nDemande");
  verifier((await etatDeLaRelecture(dossier.id)).etat === "aucune", "aucune demande au départ");
  const courte = await demanderUneRelecture(dossier.id, "faux").then(() => null, codeDe);
  verifier(courte === "champs_invalides", `une explication trop courte est refusée (${courte})`);
  const demande = await demanderUneRelecture(dossier.id, "Mon relevé bancaire est déposé mais compté comme manquant.");
  verifier(demande.status === "EN_ATTENTE", "la demande est enregistrée");
  const doublon = await demanderUneRelecture(dossier.id, "Une seconde demande, pendant que la première attend.").then(() => null, codeDe);
  verifier(doublon === "etat_incompatible", `une seule demande en attente par dossier (${doublon})`);
  verifier((await fileDesRelectures()).some((d) => d.id === demande.id), "elle apparaît dans la file du relecteur");

  console.log("\nRéponse");
  const promesse = await repondreALaRelecture(demande.id, { reponse: "Pas de souci, visa garanti avec ce dossier.", acteurId: admin.id }).then(() => null, codeDe);
  verifier(promesse === "champs_invalides", `une réponse qui promet est refusée (${promesse})`);
  await repondreALaRelecture(demande.id, { reponse: "Votre relevé est bien pris en compte ; la complétude a été recalculée.", acteurId: admin.id });
  const etat = await etatDeLaRelecture(dossier.id);
  verifier(etat.etat === "traitee" && etat.reponse.includes("bien pris en compte"), "la réponse est portée sur la demande");
  const alerte = await db.notification.findFirst({ where: { userId: candidat.id, title: "Relecture de ta complétude" } });
  verifier(alerte !== null, "le candidat la reçoit dans ses alertes");
  const journal = await db.auditLog.count({ where: { action: "dossier.completude.relecture" } });
  verifier(journal === 1, "la réponse est journalisée");
  const rejeu = await repondreALaRelecture(demande.id, { reponse: "Une seconde réponse à la même demande, refusée.", acteurId: admin.id }).then(() => null, codeDe);
  verifier(rejeu === "etat_incompatible", `une demande traitée ne se re-traite pas (${rejeu})`);

  console.log("\nContraintes de la base");
  const incoherente = await db.completenessReviewRequest
    .create({ data: { applicationId: dossier.id, explanation: "x".repeat(30), status: "TRAITEE" } })
    .then(() => true, () => false);
  verifier(!incoherente, "une demande traitée sans réponse ni relecteur est refusée par la base");
  const nouvelle = await demanderUneRelecture(dossier.id, "Après la réponse, une nouvelle demande reste possible.");
  verifier(nouvelle.status === "EN_ATTENTE", "une fois traitée, le candidat peut redemander");
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
console.log("\nLa relecture humaine de la complétude tient : une demande, une réponse, sans promesse.");
