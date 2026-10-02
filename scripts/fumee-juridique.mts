/**
 * Les textes juridiques, de bout en bout — S.101.
 *
 * ── Ce qu'elle tient, et pourquoi il fallait une base ───────────────
 *
 * Q.A refuse un drapeau « validé » codé en dur : la validation est un acte
 * tracé, et chaque version publiée est une ligne qu'on ne réécrit pas. Les
 * tests unitaires tiennent la décision ; seule une base tient le reste :
 *
 * - une page n'existe pas tant qu'aucune version n'est validée ;
 * - la validation est refusée sans relecteur nommé, puis acceptée ;
 * - une variable modifiée republie aussitôt le texte validé qui l'emploie,
 *   en reprenant le relecteur, et laisse en l'état celui qui ne l'emploie pas ;
 * - chaque geste laisse sa trace au journal ;
 * - la base elle-même refuse une page inconnue et un relecteur anonyme.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:juridique
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_juridique_${process.pid}`;
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

console.log(`Textes juridiques sur une base jetable (${nomBase})`);
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
const { VARIABLES_JURIDIQUES } = await import("../src/domain/juridique/variables");
const { enregistrerLesVariables, validerUnTexte } = await import("../src/server/juridique/ecriture");
const { texteServi, pagesPubliees, etatDesTextes } = await import("../src/server/juridique/lecture");

/** Une valeur factice acceptable pour chaque nature — rien de réel. */
function valeurFactice(nature: string, cle: string): string {
  switch (nature) {
    case "email":
      return `${cle.replace(/_/g, "-")}@exemple.test`;
    case "telephone":
      return "+229 01 00 00 00 00";
    case "url":
      return "https://exemple.test";
    case "liste":
      return `Premier élément (${cle})\nSecond élément (${cle})`;
    case "texte":
      return `Texte factice de la fumée pour ${cle}.`;
    default:
      return `Valeur factice ${cle}`;
  }
}

const ATTESTATION = {
  relecteur: "Maître Fictif, juriste de fumée",
  relueLe: "2026-10-01",
  motif: "Première publication",
  atteste: true,
};

try {
  const admin = await db.user.create({
    data: { email: `fumee-juridique-${process.pid}@exemple.test`, role: "ADMIN" },
  });

  console.log("\nAvant toute validation");
  verifier((await texteServi("conditions")) === null, "aucune page n'est servie");
  verifier(Object.keys(await pagesPubliees()).length === 0, "aucune page n'est annoncée publiée");

  console.log("\nValidation refusée tant que le texte est incomplet ou anonyme");
  const incomplet = await validerUnTexte("mentions-legales", ATTESTATION, admin.id);
  verifier(!incomplet.ok, "variables obligatoires vides : validation refusée");

  const toutes = Object.fromEntries(
    VARIABLES_JURIDIQUES.filter((v) => !v.facultative).map((v) => [v.cle, valeurFactice(v.nature, v.cle)]),
  );
  const saisie = await enregistrerLesVariables(toutes, admin.id);
  verifier(saisie.ok && saisie.republiees.length === 0, "les variables s'enregistrent sans rien republier");

  const refusee = await validerUnTexte("mentions-legales", { ...ATTESTATION, relecteur: "" }, admin.id);
  verifier(!refusee.ok, "sans relecteur nommé : validation refusée");
  const nonAttestee = await validerUnTexte("mentions-legales", { ...ATTESTATION, atteste: false }, admin.id);
  verifier(!nonAttestee.ok, "sans attestation cochée : validation refusée");
  verifier((await db.legalPublication.count()) === 0, "aucun refus n'a écrit de version");

  console.log("\nValidation");
  for (const page of ["mentions-legales", "conditions", "contact"] as const) {
    const issue = await validerUnTexte(page, ATTESTATION, admin.id);
    verifier(issue.ok && issue.rang === 1, `${page} validée en version 1`);
  }
  const servie = await texteServi("mentions-legales");
  verifier(servie?.rang === 1, "la page validée est servie en version 1");
  verifier(
    JSON.stringify(servie?.blocs ?? []).includes("Valeur factice denomination"),
    "le texte servi porte la valeur de la variable",
  );
  const publiees = await pagesPubliees();
  verifier(
    publiees["mentions-legales"] === 1 && publiees.conditions === 1 && publiees["donnees-personnelles"] === undefined,
    "seules les pages validées sont annoncées",
  );
  verifier((await texteServi("donnees-personnelles")) === null, "une page non validée reste introuvable");

  console.log("\nRepublication sur modification d'une variable");
  const avant = await db.legalPublication.findFirstOrThrow({ where: { page: "mentions-legales", rang: 1 } });
  const maj = await enregistrerLesVariables({ hebergeur: "Hébergeur factice renommé" }, admin.id);
  verifier(
    maj.ok && maj.republiees.some((r) => r.page === "mentions-legales" && r.rang === 2),
    "mentions légales republiées en version 2",
  );
  verifier(
    maj.ok && !maj.republiees.some((r) => r.page === "conditions"),
    "un texte qui n'emploie pas la variable n'est pas republié",
  );
  const v2 = await db.legalPublication.findFirstOrThrow({ where: { page: "mentions-legales", rang: 2 } });
  verifier(v2.kind === "MISE_A_JOUR_VARIABLES", "la version 2 est une mise à jour des variables");
  verifier(v2.reviewer === ATTESTATION.relecteur, "la relecture est reprise de la version validée");
  verifier(v2.reason.includes("hebergeur") || v2.reason.toLowerCase().includes("hébergeur"), "le motif nomme la variable");
  const v1Relue = await db.legalPublication.findFirstOrThrow({ where: { page: "mentions-legales", rang: 1 } });
  verifier(
    JSON.stringify(v1Relue.body) === JSON.stringify(avant.body),
    "la version 1 n'a pas été réécrite",
  );
  verifier((await texteServi("mentions-legales"))?.rang === 2, "la page sert désormais la version 2");

  const nonValidee = await enregistrerLesVariables({ email_donnees: "dpo-bis@exemple.test" }, admin.id);
  verifier(
    nonValidee.ok && !nonValidee.republiees.some((r) => r.page === "donnees-personnelles"),
    "un texte jamais validé n'est pas publié par une variable",
  );

  console.log("\nÉcran d'administration");
  const etat = await etatDesTextes();
  const mentions = etat.textes.find((t) => t.page === "mentions-legales");
  verifier(mentions?.etat === "PUBLIE", "l'écran voit les mentions légales publiées");
  verifier(
    etat.textes.find((t) => t.page === "donnees-personnelles")?.etat === "NON_PUBLIE",
    "l'écran voit les données personnelles non publiées",
  );

  console.log("\nJournal");
  const actions = (await db.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
  verifier(actions.filter((a) => a === "juridique.validation").length === 3, "trois validations journalisées");
  verifier(actions.includes("juridique.variables"), "la modification des variables est journalisée");
  verifier(actions.includes("juridique.publication"), "la republication est journalisée");

  console.log("\nContraintes de la base");
  const pageInconnue = await db.legalPublication
    .create({
      data: {
        page: "page-inventee",
        rang: 1,
        kind: "VALIDATION",
        templateHash: "0",
        title: "x",
        standfirst: "x",
        body: [],
        variables: {},
        reviewer: ATTESTATION.relecteur,
        reviewedAt: new Date(),
        publishedBy: admin.id,
        reason: "fumée",
      },
    })
    .then(() => true)
    .catch(() => false);
  verifier(!pageInconnue, "une page inconnue est refusée par la base");
  const anonyme = await db.legalPublication
    .create({
      data: {
        page: "contact",
        rang: 9,
        kind: "VALIDATION",
        templateHash: "0",
        title: "x",
        standfirst: "x",
        body: [],
        variables: {},
        reviewer: "  ",
        reviewedAt: new Date(),
        publishedBy: admin.id,
        reason: "fumée",
      },
    })
    .then(() => true)
    .catch(() => false);
  verifier(!anonyme, "un relecteur anonyme est refusé par la base");
  const doublon = await db.legalPublication
    .create({
      data: {
        page: "contact",
        rang: 1,
        kind: "VALIDATION",
        templateHash: "0",
        title: "x",
        standfirst: "x",
        body: [],
        variables: {},
        reviewer: ATTESTATION.relecteur,
        reviewedAt: new Date(),
        publishedBy: admin.id,
        reason: "fumée",
      },
    })
    .then(() => true)
    .catch(() => false);
  verifier(!doublon, "un rang déjà publié ne se réécrit pas");
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
console.log("\nLa validation et la republication des textes juridiques tiennent.");
