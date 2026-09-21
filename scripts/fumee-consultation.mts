/**
 * Le parcours consultant, sur une base réelle — T-05, WF-12.
 *
 * Ce qui se joue ici ne se simule pas : deux candidats sur le même
 * créneau à la même milliseconde, et une base qui doit n'en laisser
 * passer qu'un. Le reste — la confirmation par notification signée,
 * la libération, la suppression de compte — demande la même base.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:consultation
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_consultation_${process.pid}`;
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

console.log(`Parcours consultant sur une base jetable (${nomBase})`);
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
  tenirLeCreneau,
  rattacherLePaiement,
  confirmerLaConsultation,
  libererLesTenuesEchues,
} = await import("../src/server/acces/consultations");
const { appliquerLaNotification } = await import("../src/server/acces/paiements");
const { demanderLaSuppression, acheverLaSuppression } = await import(
  "../src/server/acces/suppression"
);
const { TENUE_MINUTES } = await import("../src/domain/consultants/tenue");

let rang = 0;
const JOUR = 86_400_000;

async function candidat() {
  rang += 1;
  const user = await db.user.create({
    data: {
      email: `consult-${rang}-${process.pid}@exemple.test`,
      role: "CANDIDAT",
      emailVerified: new Date(),
    },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: "ETUDES",
      category: "ETUDES",
      version: rang,
      effectiveFrom: new Date("2026-01-01"),
      rules: {},
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date("2026-01-01"),
      verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
  const application = await db.application.create({
    data: { userId: user.id, visaRuleId: regle.id },
  });
  return { userId: user.id, applicationId: application.id };
}

async function leConsultant() {
  return db.consultant.create({
    data: {
      name: `Consultant ${rang}-${process.pid}`,
      firm: "Cabinet d'essai",
      city: "Cotonou",
      qualification: "Conseil en mobilité",
      responseHours: 24,
      languages: ["fr"],
      active: true,
    },
  });
}

const tenir = (applicationId: string, consultantId: string, debut: Date, reference: string) =>
  tenirLeCreneau({
    applicationId,
    consultantId,
    reference,
    debut,
    dureeMinutes: 45,
    limiteAnnulation: new Date(debut.getTime() - JOUR),
  });

/** Une transaction de consultation, comme le tunnel en crée une. */
async function transactionDeConsultation(userId: string, applicationId: string) {
  rang += 1;
  return db.transaction.create({
    data: {
      reference: `IMP-CONS-${rang}-${process.pid}`,
      userId,
      applicationId,
      packCode: "consultation",
      amount: 35,
      currency: "EUR",
      provider: "STRIPE",
      status: "EN_ATTENTE",
      providerTxId: `stripe:cs_cons_${rang}_${process.pid}`,
    },
  });
}

const codeDe = (erreur: unknown): string => {
  const porte = erreur as { echec?: { code?: unknown } } | null;
  return porte?.echec?.code ? String(porte.echec.code) : String(erreur);
};

try {
  // ── 1. Deux candidats, un créneau, à la même milliseconde ───────────
  console.log("\nDeux candidats sur le même créneau");
  {
    const a = await candidat();
    const b = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 3 * JOUR);

    const [premier, second] = await Promise.allSettled([
      tenir(a.applicationId, consultant.id, debut, `RDV-A-${process.pid}`),
      tenir(b.applicationId, consultant.id, debut, `RDV-B-${process.pid}`),
    ]);

    const gagnants = [premier, second].filter((r) => r.status === "fulfilled").length;
    const perdants = [premier, second].filter((r) => r.status === "rejected");
    verifier(gagnants === 1, `un seul candidat tient le créneau (${gagnants})`);
    verifier(
      perdants.length === 1 && codeDe((perdants[0] as PromiseRejectedResult).reason) === "creneau_indisponible",
      "l'autre l'apprend, au lieu de croire avoir réservé",
    );
    verifier(
      (await db.appointment.count({ where: { consultantId: consultant.id } })) === 1,
      "une seule ligne en base",
    );
    verifier(
      (await db.consultantAccess.count()) === 0,
      "et aucun accès au dossier n'est ouvert par une tenue",
    );
  }

  // ── 2. Rien n'est confirmé sans paiement ────────────────────────────
  console.log("\nRien n'est confirmé sans paiement");
  {
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 4 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-T-${process.pid}`);

    const rv = await db.appointment.findUniqueOrThrow({ where: { reference: tenue.reference } });
    verifier(rv.status === "TENU", `le rendez-vous est tenu, pas réservé (${rv.status})`);
    verifier(rv.transactionId === null, "aucun paiement ne lui est encore rattaché");
    verifier(rv.consentAt !== null, "l'accord de partage est daté dès la tenue");
    verifier(rv.heldUntil !== null, "et la tenue porte son échéance");
    verifier(
      (await db.consultantAccess.count({ where: { applicationId: c.applicationId } })) === 0,
      "le consultant n'a aucun accès au dossier",
    );

    // Et la base refuse qu'on force le passage, quel que soit l'appelant.
    let refus = "";
    await db.appointment
      .update({ where: { id: rv.id }, data: { status: "RESERVE" } })
      .catch((e: unknown) => {
        refus = String(e).includes("appointment_reserve_exige_un_paiement") ? "garde-fou" : String(e);
      });
    verifier(refus === "garde-fou", `la base refuse un RESERVE sans paiement (${refus.slice(0, 40)})`);
  }

  // ── 3. La notification signée confirme, et elle seule ───────────────
  console.log("\nLa notification signée confirme");
  {
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 5 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-P-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    const issue = await appliquerLaNotification({
      providerEventId: `stripe:evt_cons_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE",
    });
    verifier(issue.issue === "creditee", `la notification est appliquée (${issue.issue})`);

    const rv = await db.appointment.findUniqueOrThrow({ where: { reference: tenue.reference } });
    verifier(rv.status === "RESERVE", `le rendez-vous est confirmé (${rv.status})`);
    verifier(rv.transactionId === transaction.id, "et cite le paiement qui l'a payé");
    verifier(rv.heldUntil === null, "la tenue est levée");
    const acces = await db.consultantAccess.count({
      where: { applicationId: c.applicationId, consultantId: consultant.id, revokedAt: null },
    });
    verifier(acces === 1, `l'accès consultant naît ici, une fois (${acces})`);

    // Rejeu : ni second rendez-vous, ni second accès.
    await confirmerLaConsultation(transaction);
    verifier(
      (await db.consultantAccess.count({ where: { applicationId: c.applicationId } })) === 1,
      "un rejeu n'ouvre pas un second accès",
    );
  }

  // ── 3 bis. Deux notifications à la même milliseconde ────────────────
  console.log("\nDeux notifications confirment en même temps");
  {
    /*
      La garde précoce — « déjà RESERVE, rien à faire » — ne couvre pas
      ce cas : les deux lisent `TENU` avant que l'une ait écrit. Ce qui
      les départage est la condition d'état de la mise à jour, et c'est
      elle que ce scénario éprouve. Sans lui, la retirer ne faisait
      rougir aucune vérification.
    */
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 11 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-C-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    const [une, deux] = await Promise.all([
      confirmerLaConsultation(transaction),
      confirmerLaConsultation(transaction),
    ]);
    const gagnantes = [une, deux].filter((r) => r.confirme).length;
    verifier(gagnantes === 1, `une seule confirme (${gagnantes})`);
    verifier(
      (await db.consultantAccess.count({
        where: { applicationId: c.applicationId, consultantId: consultant.id },
      })) === 1,
      "et un seul accès au dossier est ouvert",
    );
  }

  // ── 4. Un paiement échoué libère le créneau ─────────────────────────
  console.log("\nUn paiement échoué libère le créneau");
  {
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 6 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-E-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    await appliquerLaNotification({
      providerEventId: `stripe:evt_echec_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "ECHOUEE",
      cause: "SOLDE_INSUFFISANT",
    });

    verifier(
      (await db.appointment.count({ where: { reference: tenue.reference } })) === 0,
      "la tenue est libérée",
    );
    // Et le créneau se reprend : c'est la preuve que la libération sert.
    const autre = await candidat();
    const reprise = await tenir(autre.applicationId, consultant.id, debut, `RDV-E2-${process.pid}`);
    verifier(reprise.confirme === false, "un autre candidat peut le tenir à son tour");
  }

  // ── 5. Une tenue abandonnée s'efface ────────────────────────────────
  console.log("\nUne tenue abandonnée s'efface");
  {
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 7 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-X-${process.pid}`);

    // Rien ne bouge tant que l'échéance n'est pas passée.
    verifier(
      (await libererLesTenuesEchues(new Date())) === 0,
      `une tenue en cours n'est pas balayée (${TENUE_MINUTES} minutes)`,
    );
    /*
      Le balayage porte sur toutes les tenues échues, pas seulement sur
      celle du scénario : les précédentes en laissent derrière elles.
      Ce qui compte est qu'il en efface au moins une, et que ce soit
      celle-ci — la ligne suivante le vérifie nommément.
    */
    const apres = new Date(Date.now() + (TENUE_MINUTES + 1) * 60_000);
    verifier((await libererLesTenuesEchues(apres)) >= 1, "une tenue échue est balayée");
    verifier(
      (await db.appointment.count({ where: { reference: tenue.reference } })) === 0,
      "et le créneau est libre",
    );
  }

  // ── 6. La transaction et la tenue ne se prêtent pas ─────────────────
  console.log("\nLa transaction et la tenue ne se prêtent pas");
  {
    const a = await candidat();
    const b = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 8 * JOUR);
    const tenue = await tenir(a.applicationId, consultant.id, debut, `RDV-V-${process.pid}`);
    const transaction = await transactionDeConsultation(a.userId, a.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    // B tente de faire payer son rendez-vous par la transaction de A.
    const debutB = new Date(Date.now() + 9 * JOUR);
    const sienne = await tenir(b.applicationId, consultant.id, debutB, `RDV-W-${process.pid}`);
    let refus = "";
    await rattacherLePaiement(sienne.reference, transaction.id).catch((e: unknown) => {
      refus = codeDe(e);
    });
    const rvB = await db.appointment.findUniqueOrThrow({ where: { reference: sienne.reference } });
    verifier(
      rvB.transactionId !== transaction.id,
      `la transaction d'un autre n'est pas rattachée (${refus || "unicité"})`,
    );

    // Et B ne peut pas tenir le créneau que A tient.
    let pris = "";
    await tenir(b.applicationId, consultant.id, debut, `RDV-V2-${process.pid}`).catch(
      (e: unknown) => {
        pris = codeDe(e);
      },
    );
    verifier(pris === "creneau_indisponible", `ni tenir le créneau d'un autre (${pris})`);
  }

  // ── 7. K.C — la suppression de compte ───────────────────────────────
  console.log("\nSuppression de compte (K.C)");
  {
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 10 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-K-${process.pid}`);

    await demanderLaSuppression(c.userId);
    await acheverLaSuppression(c.userId);
    verifier(
      (await db.appointment.count({ where: { reference: tenue.reference } })) === 0,
      "une tenue non payée est libérée, sans annulation ni remboursement",
    );
    verifier(
      (await db.transaction.count({ where: { userId: c.userId, refundDueAt: { not: null } } })) === 0,
      "et aucune obligation de remboursement n'est ouverte pour rien",
    );
  }
} finally {
  await db.$disconnect().catch(() => {});
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

console.log(
  echecs.length === 0
    ? "\nUn créneau se tient, se paie, puis se confirme — jamais l'inverse."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
