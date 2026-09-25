/**
 * La date réelle du dépôt, de bout en bout — arbitrage S.89.
 *
 * Ce que le domaine décide seul s'éprouve dans
 * `tests/date-reelle-du-depot.test.ts`. Ce qui demande une base s'éprouve
 * ici :
 *
 * - la déclaration garde deux faits : la date réelle et l'instant de la
 *   déclaration ; la conservation part de la première ;
 * - la base refuse une date future ou antérieure à l'ouverture ;
 * - une déclaration tardive ne purge jamais sur-le-champ : trente jours de
 *   préavis au moins ;
 * - les relances J+30 et J+60 partent depuis la date réelle, sans rafale,
 *   une seule fois même rejouées, et plus après la clôture ;
 * - une correction passe par le journal, avec l'ancienne et la nouvelle
 *   valeur, et ne rapproche pas une purge annoncée ;
 * - l'export distingue les deux dates.
 *
 * Le transport de courrier est simulé : aucun message ne quitte la machine.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:depot
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_depot_${process.pid}`;
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

console.log(`Date réelle du dépôt sur une base jetable (${nomBase})`);
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
const {
  declarerLeDepot,
  corrigerLeDepot,
  cloturerLeDossier,
  demanderUneCorrectionDuDepot,
  refuserLaCorrectionDuDepot,
} = await import("../src/server/dossiers/parcours");
const { traiterLesDepots } = await import("../src/server/jobs/conservation");
const { relancerLesDepots } = await import("../src/server/jobs/suivi-depot");
const { brancherTransport } = await import("../src/server/courrier");
const { donneesDuCompte } = await import("../src/server/lecture/portabilite");
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");
const brute = REGLES_DE_REFERENCE.find((r) => r.countryCode === "NL") ?? REGLES_DE_REFERENCE[0]!;

/** Un transport qui accepte tout et compte ce qu'il reçoit. */
const recus: { destinataire: string; objet: string }[] = [];
brancherTransport(async (courrier) => {
  recus.push({ destinataire: courrier.destinataire, objet: courrier.objet });
  return { issue: "envoye" };
});

const JOUR = 86_400_000;
const codeDe = (erreur: unknown) =>
  (erreur as { echec?: { code?: string } } | null)?.echec?.code ?? String(erreur);
const champDe = (erreur: unknown) =>
  (erreur as { champs?: Record<string, string> } | null)?.champs?.deposeLe ?? "";

let rang = 0;
/** Un dossier prêt, ouvert à la date donnée. */
async function dossierPret(ouvertLe: Date) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-depot-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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
    data: {
      userId: user.id,
      visaRuleId: regle.id,
      status: "PRET",
      readyAt: ouvertLe,
      createdAt: ouvertLe,
    },
  });
  // Une pièce vivante : sans pièces, il n'y a rien à conserver ni à annoncer.
  const document = await db.document.create({
    data: { applicationId: application.id, code: "passeport", label: "Passeport", status: "CONFORME" },
  });
  await db.documentVersion.create({
    data: {
      documentId: document.id,
      rank: 1,
      body: "Pièce de la fumée.",
      uploadedAt: ouvertLe,
      scanState: "SAINE",
      scannedAt: ouvertLe,
    },
  });
  return { user, application };
}

const aMidi = (jour: string) => new Date(`${jour}T12:00:00.000Z`);
const relancesDe = (applicationId: string) =>
  db.notification.findMany({ where: { applicationId, kind: "SUIVI_DEPOT" }, orderBy: { createdAt: "asc" } });

try {
  console.log("\nLa déclaration garde deux faits, et la conservation part de la date réelle");
  {
    const { application } = await dossierPret(aMidi("2026-06-01"));
    const maintenant = aMidi("2026-09-20");
    const maj = await declarerLeDepot(application, { deposeLe: "2026-09-01", maintenant });
    verifier(maj.depositedOn?.toISOString().slice(0, 10) === "2026-09-01", "date réelle : 1er septembre");
    verifier(maj.submittedAt?.getTime() === maintenant.getTime(), "déclarée le 20 septembre");
    verifier(
      maj.retentionUntil?.toISOString().slice(0, 10) === "2027-09-01",
      `conservée douze mois après le dépôt réel (${maj.retentionUntil?.toISOString().slice(0, 10)})`,
    );
  }

  console.log("\nLes dates refusées, et celles qui passent");
  {
    const { application } = await dossierPret(aMidi("2026-06-01"));
    const maintenant = aMidi("2026-09-20");
    const futur = await declarerLeDepot(application, { deposeLe: "2026-09-21", maintenant }).catch((e) => e);
    verifier(codeDe(futur) === "champs_invalides" && /pas encore arrivé/u.test(champDe(futur)), "une date future est refusée, avec sa raison");
    const avant = await declarerLeDepot(application, { deposeLe: "2026-05-31", maintenant }).catch((e) => e);
    verifier(/ne peut pas le précéder/u.test(champDe(avant)), "une date antérieure à l'ouverture est refusée");
    const relu = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    verifier(relu.status === "PRET" && relu.depositedOn === null, "un refus n'écrit rien");

    // Montréal, 21 h le 20 septembre : Cotonou est déjà au 21, le candidat non.
    const tard = new Date("2026-09-21T01:00:00.000Z");
    const aCotonou = await declarerLeDepot(application, { deposeLe: "2026-09-21", maintenant: tard, fuseau: "America/Toronto" }).catch((e) => e);
    verifier(/pas encore arrivé/u.test(champDe(aCotonou)), "« aujourd'hui » se lit dans le fuseau du candidat");

    console.log("  (l'erreur Prisma qui suit est la garde qui se déclenche — c'est l'attendu)");
    const brut = await db.application
      .update({
        where: { id: application.id },
        data: { status: "SOUMIS", readyAt: null, submittedAt: maintenant, depositedOn: new Date("2026-12-01") },
      })
      .then(() => false)
      .catch(() => true);
    verifier(brut, "la base refuse elle aussi une date de dépôt future");
  }

  console.log("\nUne déclaration tardive ne purge jamais sur-le-champ");
  {
    const { application } = await dossierPret(aMidi("2025-01-10"));
    const maintenant = aMidi("2026-09-20");
    await declarerLeDepot(application, { deposeLe: "2025-02-01", maintenant });
    const bilan = await traiterLesDepots(maintenant);
    const relu = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    const preavis = relu.purgeDueAt ? (relu.purgeDueAt.getTime() - maintenant.getTime()) / JOUR : 0;
    verifier(bilan.preavis >= 1, `le préavis part (${JSON.stringify(bilan)})`);
    verifier(preavis >= 30, `purge au plus tôt dans trente jours (${preavis.toFixed(0)} j)`);
    verifier(relu.purgedAt === null, "rien n'est supprimé aujourd'hui");
  }

  console.log("\nRelances : J+30 dépassé à la déclaration ne part pas ; J+60 une fois");
  {
    const { application, user } = await dossierPret(aMidi("2026-06-01"));
    // Déposé le 1er août, déclaré le 15 septembre (J+45).
    await declarerLeDepot(application, { deposeLe: "2026-08-01", maintenant: aMidi("2026-09-15") });
    await relancerLesDepots(aMidi("2026-09-15"));
    verifier((await relancesDe(application.id)).length === 0, "rien le jour de la déclaration : J+30 est derrière");
    await relancerLesDepots(aMidi("2026-09-29"));
    verifier((await relancesDe(application.id)).length === 0, "rien avant J+60");
    recus.length = 0;
    const [a, b] = await Promise.all([relancerLesDepots(aMidi("2026-09-30")), relancerLesDepots(aMidi("2026-09-30"))]);
    const relances = await relancesDe(application.id);
    verifier(relances.length === 1 && relances[0]!.dedupKey?.endsWith(":60") === true, `une relance J+60 (${relances.map((r) => r.dedupKey).join(", ")})`);
    verifier(recus.filter((r) => r.destinataire === user.email).length === 1, `un seul courrier malgré deux passes (${a.relances}+${b.relances})`);
    verifier(relances[0]!.emailStatus === "ENVOYE", "le courrier est dit envoyé parce qu'il l'est");
    await relancerLesDepots(aMidi("2026-10-30"));
    verifier((await relancesDe(application.id)).length === 1, "et plus rien ensuite");
  }

  console.log("\nRelances : un rattrapage n'envoie que la plus récente");
  {
    const { application } = await dossierPret(aMidi("2026-06-01"));
    await declarerLeDepot(application, { deposeLe: "2026-07-01", maintenant: aMidi("2026-07-01") });
    // Le worker n'a pas tourné entre fin juillet et septembre.
    await relancerLesDepots(aMidi("2026-09-10"));
    const relances = await relancesDe(application.id);
    verifier(relances.length === 1 && relances[0]!.dedupKey?.endsWith(":60") === true, `seulement J+60 (${relances.map((r) => r.dedupKey).join(", ")})`);
  }

  console.log("\nRelances : ni avant huit heures chez le candidat, ni après la clôture");
  {
    const { application } = await dossierPret(aMidi("2026-06-01"));
    await declarerLeDepot(application, { deposeLe: "2026-07-01", maintenant: aMidi("2026-07-01") });
    await relancerLesDepots(new Date("2026-07-31T05:00:00.000Z")); // 6 h à Cotonou
    verifier((await relancesDe(application.id)).length === 0, "rien à six heures");
    const soumis = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    await cloturerLeDossier(soumis, "ACCEPTE", null, aMidi("2026-07-20")).catch(() => undefined);
    const clos = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    await relancerLesDepots(aMidi("2026-07-31"));
    verifier(
      clos.status !== "SOUMIS" && (await relancesDe(application.id)).length === 0,
      `un dossier clôturé n'est plus relancé (${clos.status})`,
    );
  }

  console.log("\nLa correction : auditée, recalculée, sans rapprocher une purge annoncée");
  {
    const { application, user } = await dossierPret(aMidi("2025-01-10"));
    const admin = await db.user.create({ data: { email: `admin-${process.pid}@exemple.test`, role: "ADMIN" } });
    await declarerLeDepot(application, { deposeLe: "2025-10-15", maintenant: aMidi("2025-10-20") });
    // Préavis parti : purge annoncée.
    await traiterLesDepots(aMidi("2026-10-01"));
    const annonce = (await db.application.findUniqueOrThrow({ where: { id: application.id } })).purgeDueAt;
    verifier(annonce !== null, `une purge est annoncée (${annonce?.toISOString().slice(0, 10)})`);

    const sansMotif = await corrigerLeDepot(application.id, {
      deposeLe: "2025-10-15",
      motif: "Aucun changement de date en réalité.",
      acteurId: admin.id,
      maintenant: aMidi("2026-10-02"),
    }).catch((e) => e);
    verifier(/est déjà le/u.test(champDe(sansMotif)), "une correction sans changement est refusée");

    const r = await corrigerLeDepot(application.id, {
      deposeLe: "2025-09-01",
      motif: "Le candidat a joint son récépissé : dépôt du 1er septembre.",
      acteurId: admin.id,
      maintenant: aMidi("2026-10-02"),
    });
    verifier(r.ancienne === "2025-10-15" && r.nouvelle === "2025-09-01", "ancienne et nouvelle valeur");
    verifier(r.dossier.retentionUntil?.toISOString().slice(0, 10) === "2026-09-01", "l'échéance suit la nouvelle date");
    verifier(r.dossier.purgeDueAt?.getTime() === annonce?.getTime(), "la purge annoncée garde son jour");
    const trace = await db.auditLog.findFirst({ where: { action: "dossier.depot.correction", target: `application:${application.id}` } });
    const details = (trace?.metadata ?? {}) as Record<string, unknown>;
    verifier(
      trace?.actorId === admin.id && details.ancienne === "2025-10-15" && details.nouvelle === "2025-09-01" && (trace?.reason.length ?? 0) > 10,
      "le journal porte l'acteur, le motif, l'ancienne et la nouvelle valeur",
    );

    const futur = await corrigerLeDepot(application.id, {
      deposeLe: "2025-10-25",
      motif: "Correction erronée vers une date après la déclaration.",
      acteurId: admin.id,
      maintenant: aMidi("2026-10-02"),
    }).catch((e) => e);
    verifier(/ne peut pas avoir eu lieu après/u.test(champDe(futur)), "une date postérieure à la déclaration est refusée");

    console.log("\nL'export distingue les deux dates");
    const donnees = (await donneesDuCompte(user.id)) as unknown as { dossiers: Array<Record<string, unknown>> };
    const ligne = donnees.dossiers.find((d) => d.dateReelleDuDepot !== undefined) ?? {};
    verifier(ligne.dateReelleDuDepot === "2025-09-01", `date réelle exportée (${String(ligne.dateReelleDuDepot)})`);
    verifier(
      typeof ligne.depotDeclareDansImmiProLe === "string" && String(ligne.depotDeclareDansImmiProLe).startsWith("2025-10-20"),
      `date de déclaration exportée (${String(ligne.depotDeclareDansImmiProLe)})`,
    );
  }
  console.log("\nLa demande de correction du candidat (S.90)");
  {
    const { application, user } = await dossierPret(aMidi("2026-06-01"));
    const admin = await db.user.create({ data: { email: `admin2-${process.pid}@exemple.test`, role: "ADMIN" } });
    const soumis = await declarerLeDepot(application, { deposeLe: "2026-09-10", maintenant: aMidi("2026-09-12") });
    const maintenant = aMidi("2026-09-25");
    const demande = (d: string, explication = "Mon récépissé porte une autre date.") =>
      demanderUneCorrectionDuDepot(soumis, { deposeLe: d, explication, maintenant }).catch((e) => e);

    verifier(/est déjà le/u.test(champDe(await demande("2026-09-10"))), "une date identique est refusée");
    verifier(/après/u.test(champDe(await demande("2026-09-15"))), "une date postérieure à la déclaration est refusée");
    const courte = await demande("2026-09-01", "oups");
    verifier(
      codeDe(courte) === "champs_invalides" &&
        /d'où vient l'erreur/u.test((courte as { champs?: Record<string, string> }).champs?.explication ?? ""),
      "une explication vide est refusée, sur son champ",
    );
    const faite = await demande("2026-09-01");
    verifier(faite.status === "EN_ATTENTE", "la demande est enregistrée, en attente");
    const doublon = await demande("2026-09-02");
    verifier(codeDe(doublon) === "etat_incompatible", "une seconde demande en attente est refusée");
    const inchangee = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    verifier(inchangee.depositedOn?.toISOString().slice(0, 10) === "2026-09-10", "la date enregistrée ne bouge pas");

    // L'opérateur l'applique : la demande est tranchée par la correction.
    await corrigerLeDepot(application.id, {
      deposeLe: "2026-09-01",
      motif: "Demande du candidat, récépissé vérifié.",
      acteurId: admin.id,
      maintenant: aMidi("2026-09-26"),
    });
    const tranchee = await db.depositCorrectionRequest.findUniqueOrThrow({ where: { id: faite.id } });
    verifier(tranchee.status === "APPLIQUEE" && tranchee.resolvedBy === admin.id, "la demande est appliquée, et par qui");
    const avis = await db.notification.findFirst({ where: { userId: user.id, title: "Date de dépôt corrigée" } });
    verifier(avis?.body.includes("1er septembre 2026") === true, "le candidat est prévenu de la nouvelle date");

    // Une nouvelle demande, non retenue.
    const corrigee = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    const seconde = await demanderUneCorrectionDuDepot(corrigee, {
      deposeLe: "2026-08-20",
      explication: "Je crois que c'était plutôt en août.",
      maintenant: aMidi("2026-09-27"),
    });
    const promesse = await refuserLaCorrectionDuDepot(seconde.id, {
      reponse: "Pas d'inquiétude, visa garanti de toute façon.",
      acteurId: admin.id,
    }).catch((e) => e);
    verifier(codeDe(promesse) === "champs_invalides", "une réponse qui promet un résultat ne part pas");
    await refuserLaCorrectionDuDepot(seconde.id, {
      reponse: "Le récépissé que tu as joint porte le 1er septembre : la date reste celle-ci.",
      acteurId: admin.id,
    });
    const refusee = await db.depositCorrectionRequest.findUniqueOrThrow({ where: { id: seconde.id } });
    verifier(refusee.status === "REFUSEE" && refusee.answer !== null, "la demande est refusée, avec sa réponse");
    const recu = await db.notification.findFirst({ where: { userId: user.id, title: "Date de dépôt inchangée" } });
    verifier(recu?.body.includes("porte le 1er septembre") === true, "le candidat lit la réponse dans ses alertes");
    const trace = await db.auditLog.count({ where: { action: "dossier.depot.correction.refus" } });
    verifier(trace === 1, "le refus est au journal");
    const final = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    verifier(final.depositedOn?.toISOString().slice(0, 10) === "2026-09-01", "la date reste celle corrigée");

    const donnees = (await donneesDuCompte(user.id)) as unknown as { dossiers: Array<Record<string, unknown>> };
    const demandes = (donnees.dossiers[0]?.demandesDeCorrectionDuDepot ?? []) as unknown[];
    verifier(demandes.length === 2, `l'export rend ses deux demandes (${demandes.length})`);
  }
} finally {
  brancherTransport(null);
  await db.$disconnect().catch(() => undefined);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa date réelle commande la suite, la déclaration reste une trace.");
