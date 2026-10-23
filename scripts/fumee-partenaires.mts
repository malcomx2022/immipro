/**
 * Suites d'une proposition de partenaire, sur une base jetable — WF-13, T-03.
 *
 * La route était tenue par `routes-ecritures` avec un service simulé ;
 * l'écriture elle-même n'avait aucune preuve exécutée. Ce qui se vérifie
 * ici, sur PostgreSQL : la proposition naît de la lecture du dossier, la
 * propriété se lit dans la requête, la redirection rend l'adresse et date
 * le geste, le rejeu ne change rien, deux suites simultanées n'en gardent
 * qu'une — la première —, « ne plus me proposer » retire l'autorisation,
 * et la commission se calcule au taux recopié sur la proposition.
 *
 *     DATABASE_URL=postgresql://… npm run smoke:partenaires
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_partenaires_${process.pid}`;
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

console.log(`Suites d'une proposition de partenaire sur une base jetable (${nomBase})`);
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
const { enregistrerLaSuite, enregistrerLAboutissement } = await import(
  "../src/server/acces/partenaires"
);
const { offresDuDossier } = await import("../src/server/lecture/partenaires");
const { enregistrerLAutorisation, etatDeLAutorisation } = await import(
  "../src/server/acces/consentements"
);
const { COMMISSION_BPS_ANNONCEE } = await import("../src/domain/partenaires/affiliation");
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");
const brute = REGLES_DE_REFERENCE.find((r) => r.countryCode === "NL") ?? REGLES_DE_REFERENCE[0]!;

const codeDe = (erreur: unknown) =>
  (erreur as { echec?: { code?: string } } | null)?.echec?.code ?? String(erreur);

let rang = 0;
/** Un candidat, son dossier, une pièce encore demandée et l'autorisation accordée. */
async function candidat() {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-partenaires-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: brute.countryCode,
      visaType: brute.visaType,
      category: brute.category,
      version: 100 + rang,
      effectiveFrom: new Date("2025-01-01"),
      rules: brute.rules as never,
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date("2025-01-01"),
      verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
  const application = await db.application.create({
    data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
  });
  for (const code of ["assurance_maladie", "logement"]) {
    await db.document.create({
      data: { applicationId: application.id, code, label: code, status: "ATTENDUE" },
    });
  }
  await enregistrerLAutorisation(user.id, "partenaires", true);
  return { user, application };
}

try {
  for (const kind of ["ASSURANCE_SANTE", "LOGEMENT"] as const) {
    await db.partner.create({
      data: {
        name: `Partenaire ${kind}`,
        kind,
        url: `https://partenaire.exemple.test/${kind.toLowerCase()}`,
        commissionBps: COMMISSION_BPS_ANNONCEE,
        activations: {
          create: {
            countryCode: brute.countryCode,
            basis: "contrat de fumée",
            verifiedAt: new Date("2026-01-01"),
            verifiedBy: "fumée",
          },
        },
      },
    });
  }

  console.log("\nLa proposition naît de la lecture, la propriété se lit dans la requête");
  const a = await candidat();
  const b = await candidat();
  const offres = await offresDuDossier(a.application.id, a.user.id);
  verifier(offres.offres.length === 2, `deux pièces demandées, deux propositions (${offres.offres.length})`);
  const [assurance, logement] = offres.offres;
  const relue = await offresDuDossier(a.application.id, a.user.id);
  verifier(
    relue.offres.map((o) => o.id).join() === offres.offres.map((o) => o.id).join() &&
      (await db.partnerReferral.count({ where: { applicationId: a.application.id } })) === 2,
    "relire le dossier ne double aucune proposition",
  );
  const autrui = await enregistrerLaSuite(assurance!.id, b.user.id, "CRENEAUX", a.application.id).catch((e) => e);
  verifier(codeDe(autrui) === "introuvable", "la proposition d'un autre candidat est introuvable");
  const ailleurs = await enregistrerLaSuite(assurance!.id, a.user.id, "CRENEAUX", b.application.id).catch((e) => e);
  verifier(codeDe(ailleurs) === "introuvable", "sous l'adresse d'un autre dossier, elle est introuvable");
  const intacte = await db.partnerReferral.findUniqueOrThrow({ where: { id: assurance!.id } });
  verifier(intacte.status === "PROPOSEE" && intacte.redirectedAt === null, "un refus n'écrit rien");

  console.log("\nLa redirection rend l'adresse et date le geste ; le rejeu ne change rien");
  const maintenant = new Date("2026-10-23T10:00:00.000Z");
  const redirigee = await enregistrerLaSuite(assurance!.id, a.user.id, "CRENEAUX", a.application.id, maintenant);
  verifier(
    redirigee.etat === "REDIRIGEE" && redirigee.url === assurance!.url,
    `REDIRIGEE, avec l'adresse du partenaire (${redirigee.etat})`,
  );
  const rejouee = await enregistrerLaSuite(
    assurance!.id,
    a.user.id,
    "CRENEAUX",
    a.application.id,
    new Date("2026-10-23T11:00:00.000Z"),
  );
  const apresRejeu = await db.partnerReferral.findUniqueOrThrow({ where: { id: assurance!.id } });
  verifier(
    rejouee.etat === "REDIRIGEE" && apresRejeu.redirectedAt?.getTime() === maintenant.getTime(),
    "le rejeu rend le même état et garde l'heure de la première redirection",
  );
  const tardive = await enregistrerLaSuite(assurance!.id, a.user.id, "CONTINUER_SEUL", a.application.id);
  verifier(tardive.etat === "REDIRIGEE", "une suite différente arrive trop tard : la première tient");

  console.log("\nO-5 — une proposition close ne se propose plus");
  {
    const d = await candidat();
    const [premiere, seconde] = (await offresDuDossier(d.application.id, d.user.id)).offres;
    await enregistrerLaSuite(premiere!.id, d.user.id, "CONTINUER_SEUL", d.application.id);
    const restantes = await offresDuDossier(d.application.id, d.user.id);
    verifier(
      restantes.offres.map((o) => o.id).join() === seconde!.id,
      `« continuer seul » clôt la proposition pour ce dossier (${restantes.offres.length} offre restante)`,
    );
    const rouverte = await enregistrerLaSuite(premiere!.id, d.user.id, "CRENEAUX", d.application.id);
    const close = await db.partnerReferral.findUniqueOrThrow({ where: { id: premiere!.id } });
    verifier(
      rouverte.etat === "SANS_SUITE" && rouverte.url === undefined && close.redirectedAt === null,
      "un clic tardif rend « sans suite », sans adresse ni redirection",
    );
    await enregistrerLaSuite(seconde!.id, d.user.id, "CRENEAUX", d.application.id);
    const redirigee = await offresDuDossier(d.application.id, d.user.id);
    verifier(
      redirigee.offres.some((o) => o.id === seconde!.id),
      "une proposition redirigée reste listée : le candidat peut y retourner",
    );
  }

  console.log("\nDeux suites simultanées : une seule est prise, et les deux réponses la disent");
  let divergences = 0;
  for (let essai = 0; essai < 10; essai += 1) {
    const c = await candidat();
    const [offre] = (await offresDuDossier(c.application.id, c.user.id)).offres;
    const [r1, r2] = await Promise.all([
      enregistrerLaSuite(offre!.id, c.user.id, "CRENEAUX", c.application.id),
      enregistrerLaSuite(offre!.id, c.user.id, "CONTINUER_SEUL", c.application.id),
    ]);
    const finale = await db.partnerReferral.findUniqueOrThrow({ where: { id: offre!.id } });
    if (r1.etat !== finale.status || r2.etat !== finale.status) divergences += 1;
    if (finale.status === "SANS_SUITE" && finale.redirectedAt !== null) divergences += 1;
  }
  verifier(divergences === 0, `sur dix courses, aucune réponse ne contredit l'état retenu (${divergences})`);

  console.log("\n« Ne plus me proposer » retire l'autorisation, et les offres avec elle");
  const declinee = await enregistrerLaSuite(logement!.id, a.user.id, "NE_PLUS_PROPOSER", a.application.id);
  verifier(declinee.etat === "DECLINEE" && declinee.url === undefined, "DECLINEE, sans adresse");
  verifier(
    (await etatDeLAutorisation(a.user.id, "partenaires")) === "retiree",
    "l'autorisation est retirée au profil",
  );
  const apres = await offresDuDossier(a.application.id, a.user.id);
  verifier(apres.autorisation === "retiree" && apres.offres.length === 0, "plus aucune offre n'est faite");

  console.log("\nLa commission se calcule au taux recopié sur la proposition");
  await db.partner.updateMany({ data: { commissionBps: COMMISSION_BPS_ANNONCEE * 2 } });
  const { commission } = await enregistrerLAboutissement(assurance!.id, 100_000, "XOF");
  verifier(
    commission === Math.floor((100_000 * COMMISSION_BPS_ANNONCEE) / 10_000),
    `commission au taux annoncé le jour de la proposition (${commission})`,
  );
  const deux = await enregistrerLAboutissement(assurance!.id, 999_999, "XOF").catch((e) => e);
  const aboutie = await db.partnerReferral.findUniqueOrThrow({ where: { id: assurance!.id } });
  verifier(
    codeDe(deux) === "etat_incompatible" && aboutie.commissionAmount === commission,
    "un second aboutissement est refusé, la commission reste",
  );
  const sansRedirection = await enregistrerLAboutissement(logement!.id, 1_000, "XOF").catch((e) => e);
  verifier(codeDe(sansRedirection) === "etat_incompatible", "sans redirection, aucune commission");
} finally {
  await db.$disconnect().catch(() => undefined);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa première suite tient, l'autorisation suit le refus, la commission suit l'annonce.");
