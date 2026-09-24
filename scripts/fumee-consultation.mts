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
const { consultationDuPaiement } = await import("../src/server/lecture/paiements");
const { annulerLeRendezVous } = await import("../src/server/consultations/annulation");
const { rendezVousDuCandidat } = await import("../src/server/lecture/consultants");
const { brancherTransport } = await import("../src/server/courrier");

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
  return { userId: user.id, applicationId: application.id, courriel: user.email };
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
  // ── 8. Ce que l'écran d'attente lit — arbitrage du 22/09/2026 ───────
  console.log("\nCe que l'écran d'attente lit du rendez-vous");
  {
    /*
      $-03 annonçait « ton pack s'ouvre » à qui payait une consultation,
      et ne nommait ni le créneau, ni le consultant, ni l'heure jusqu'à
      laquelle le créneau est tenu. Il les lit maintenant — et la lecture
      se vérifie sur une base, parce que c'est une jointure sur
      `Appointment.transactionId` et non une mise en forme.
    */
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 5 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-L-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    const pendant = await consultationDuPaiement(transaction.reference, c.userId);
    verifier(pendant !== null, "la consultation d'un paiement en attente se lit");
    verifier(
      pendant?.consultant === consultant.name,
      `le consultant est nommé (${pendant?.consultant})`,
    );
    verifier(
      pendant?.debut === debut.toISOString(),
      "l'heure est celle que la base a écrite, pas une recomposition",
    );
    verifier(pendant?.tenuJusqua !== null, "et la tenue porte son échéance");
    verifier(pendant?.confirme === false, "rien n'est confirmé avant la notification signée");

    // Après la notification signée : plus rien n'est tenu, tout est réservé.
    await appliquerLaNotification({
      providerEventId: `stripe:evt_lecture_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE",
    });
    const apres = await consultationDuPaiement(transaction.reference, c.userId);
    verifier(apres?.confirme === true, "la confirmation se lit une fois la notification passée");
    verifier(apres?.tenuJusqua === null, "et plus rien n'est tenu : tout est réservé");

    /*
      Trois absences, et aucune ne doit faire planter l'écran : un
      paiement qui n'est pas une consultation, une référence qui
      n'existe pas, et la transaction d'un autre candidat.
    */
    const pack = await db.transaction.create({
      data: {
        reference: `IMP-PACK-${process.pid}`,
        userId: c.userId,
        applicationId: c.applicationId,
        packCode: "dossier",
        amount: 29,
        currency: "EUR",
        provider: "STRIPE",
        status: "CONFIRMEE",
      },
    });
    verifier(
      (await consultationDuPaiement(pack.reference, c.userId)) === null,
      "un paiement de pack ne rend aucune consultation",
    );
    verifier(
      (await consultationDuPaiement("IMP-INVENTEE", c.userId)) === null,
      "une référence inconnue rend l'absence",
    );
    const autre = await candidat();
    verifier(
      (await consultationDuPaiement(transaction.reference, autre.userId)) === null,
      "et un autre candidat ne lit pas le rendez-vous de celui-ci",
    );
  }

  // ── Le candidat annule lui-même ─────────────────────────────────────
  console.log("\nLe candidat annule son rendez-vous, et la limite décide");
  {
    /*
      Trois surfaces promettaient « annulation ou report sans frais jusqu'au
      […] » : les conditions sous les créneaux, l'écran de confirmation, le
      courrier. `issueDeLAnnulation` n'avait que deux appelants — une lecture
      d'écran et `acheverLaSuppression` —, si bien que le seul moyen
      d'annuler une consultation était de supprimer son compte.
    */
    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 9 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-X-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMEE", confirmedAt: new Date() },
    });
    await confirmerLaConsultation(
      await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
    );

    // La surface qui manquait : le rendez-vous se lit ailleurs que dans le
    // courrier de confirmation.
    const liste = await rendezVousDuCandidat(c.userId);
    verifier(liste.length === 1, `son rendez-vous se lit (${liste.length})`);
    verifier(
      liste[0]!.reference === tenue.reference && liste[0]!.issue === "REMBOURSABLE",
      `avec sa référence et son issue (${liste[0]?.issue})`,
    );
    verifier(
      liste[0]!.avertissement.includes("remboursée"),
      "et l'avertissement à lire avant de confirmer",
    );

    const fait = await annulerLeRendezVous(tenue.reference, c.userId);
    verifier(fait.issue === "REMBOURSABLE", `annulé dans la limite (${fait.issue})`);
    verifier(fait.remboursementOuvert, "et le remboursement est ouvert");

    const apres = await db.appointment.findUniqueOrThrow({
      where: { reference: tenue.reference },
    });
    verifier(apres.status === "ANNULE", `le rendez-vous est annulé (${apres.status})`);

    // Le créneau est libre : un autre candidat le prend.
    const autre = await candidat();
    const repris = await tenir(
      autre.applicationId,
      consultant.id,
      debut,
      `RDV-X2-${process.pid}`,
    ).catch(() => null);
    verifier(repris !== null, "et le créneau est repris par quelqu'un d'autre");

    // L'accès du consultant ne survit pas au dernier rendez-vous (RG-12.2).
    verifier(
      (await db.consultantAccess.count({
        where: {
          applicationId: c.applicationId,
          consultantId: consultant.id,
          revokedAt: null,
        },
      })) === 0,
      "l'accès du consultant est retiré",
    );

    const dette = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(
      dette.refundDueAt !== null && dette.refundedAt === null,
      "la dette est ouverte et non réglée : la notification signée fera foi",
    );
    verifier(
      (await db.auditLog.count({
        where: { action: "paiement.remboursement", target: `transaction:${transaction.id}` },
      })) === 1,
      "et le mouvement d'argent porte sa ligne au journal",
    );

    // Second appui : rien ne s'ouvre deux fois.
    const second = await annulerLeRendezVous(tenue.reference, c.userId)
      .then(() => "acceptée")
      .catch((e: unknown) => codeDe(e));
    verifier(second === "etat_incompatible", `un second appui est refusé (${second})`);
    verifier(
      (await db.auditLog.count({
        where: { action: "paiement.remboursement", target: `transaction:${transaction.id}` },
      })) === 1,
      "et n'ouvre pas un second remboursement",
    );

    verifier(
      (await rendezVousDuCandidat(c.userId)).length === 0,
      "la liste ne montre plus ce rendez-vous",
    );
  }

  console.log("\nPassé la limite, le créneau se libère et la somme reste due");
  {
    const c = await candidat();
    const consultant = await leConsultant();
    // Dans les vingt-quatre heures : la limite stockée est déjà passée.
    const debut = new Date(Date.now() + 3 * 3_600_000);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-D-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMEE", confirmedAt: new Date() },
    });
    await confirmerLaConsultation(
      await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
    );

    const fait = await annulerLeRendezVous(tenue.reference, c.userId);
    verifier(fait.issue === "FRAIS_DUS", `les frais restent dus (${fait.issue})`);
    verifier(!fait.remboursementOuvert, "et aucun remboursement n'est ouvert");
    verifier(
      (await db.appointment.findUniqueOrThrow({ where: { reference: tenue.reference } }))
        .status === "ANNULE",
      "le créneau se libère quand même : un consultant qui attend perd son heure",
    );
    verifier(
      (await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }))
        .refundDueAt === null,
      "et la somme n'est pas rendue",
    );

    // Et deux repreneurs simultanés du créneau libéré : un seul passe.
    const [x, y] = [await candidat(), await candidat()];
    const course = await Promise.allSettled([
      tenir(x.applicationId, consultant.id, debut, `RDV-D1-${process.pid}`),
      tenir(y.applicationId, consultant.id, debut, `RDV-D2-${process.pid}`),
    ]);
    const gagnants = course.filter((r) => r.status === "fulfilled").length;
    verifier(
      gagnants === 1,
      `un seul reprend le créneau libéré, malgré la simultanéité (${gagnants})`,
    );

    // Le rendez-vous de quelqu'un d'autre ne s'annule pas.
    const tiers = await candidat();
    const vole = await annulerLeRendezVous(tenue.reference, tiers.userId)
      .then(() => "acceptée")
      .catch((e: unknown) => codeDe(e));
    verifier(vole === "introuvable", `ni celui d'un autre candidat (${vole})`);
  }

  console.log("\nLa suppression de compte libère le créneau, pour de bon");
  {
    /*
      RG-12.5, K.C : « une suppression de compte annule les rendez-vous à
      venir et **libère les créneaux immédiatement** ».
      `acheverLaSuppression` écrit `ANNULE` en le croyant, mais l'unicité
      ne connaissait pas les états : la ligne annulée gelait le créneau
      pour toujours. `creneaux()` l'affichait libre — elle lit `RESERVE`,
      `REPORTE` et les tenues en cours —, et `tenirLeCreneau` butait.
      Le candidat remplissait l'accord de partage pour lire un refus.
    */
    const partant = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 13 * JOUR);
    const tenue = await tenir(
      partant.applicationId,
      consultant.id,
      debut,
      `RDV-S-${process.pid}`,
    );
    const transaction = await transactionDeConsultation(
      partant.userId,
      partant.applicationId,
    );
    await rattacherLePaiement(tenue.reference, transaction.id);
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMEE", confirmedAt: new Date() },
    });
    await confirmerLaConsultation(
      await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
    );

    await demanderLaSuppression(partant.userId);
    await acheverLaSuppression(partant.userId);

    verifier(
      (await db.appointment.findUniqueOrThrow({ where: { reference: tenue.reference } }))
        .status === "ANNULE",
      "le rendez-vous est annulé, et sa ligne reste",
    );

    const suivant = await candidat();
    const repris = await tenir(
      suivant.applicationId,
      consultant.id,
      debut,
      `RDV-S2-${process.pid}`,
    )
      .then(() => "repris")
      .catch((e: unknown) => codeDe(e));
    verifier(repris === "repris", `et le créneau est bien libre (${repris})`);
  }

  // ── Ce que reçoit un candidat qui vient de payer ────────────────────
  console.log("\nLe candidat qui vient de payer reçoit sa confirmation");
  {
    /*
      `envoyerConfirmationEntretien` existe dans `server/courrier`, avec six
      essais sur son contenu et cet en-tête : « Aucun courrier ne partait :
      le candidat réservait quarante-cinq minutes payantes et ne recevait
      rien, alors que l'écran lui annonçait le contraire. » Le défaut y
      était écrit au passé, et **aucun appelant de production ne
      l'appelait** — seuls les essais. Aucune notification en base non
      plus. Exécuté avant correction :

          rendez-vous : RESERVE
          courriels partis : 0 []
          notifications en base : 0
    */
    const courriers: { objet: string; destinataire: string; corps: string }[] = [];
    brancherTransport(async (c: { objet: string; destinataire: string; corps: string }) => {
      courriers.push({ objet: c.objet, destinataire: c.destinataire, corps: c.corps });
      return { issue: "envoye" as const };
    });

    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 17 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-Z-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    await appliquerLaNotification({
      providerEventId: `stripe:evt_conf_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE",
    });

    verifier(courriers.length === 1, `un courrier part (${courriers.length})`);
    verifier(
      courriers[0]?.destinataire === c.courriel,
      "à l'adresse du candidat, lue sur le dossier",
    );
    verifier(
      courriers[0]?.corps.includes(tenue.reference) === true,
      "et il porte la référence du rendez-vous",
    );
    verifier(
      courriers[0]?.corps.includes("autorisations") === true,
      "et l'endroit où l'annulation se prend",
    );

    // Le canal durable : il survit à un relais muet.
    const avis = await db.notification.findMany({ where: { applicationId: c.applicationId } });
    verifier(avis.length === 1, `une notification est écrite (${avis.length})`);
    verifier(avis[0]?.kind === "PAIEMENT", `du genre PAIEMENT (${avis[0]?.kind})`);
    verifier(
      avis[0]?.body.includes(tenue.reference) === true,
      "et elle porte la référence, pas seulement un titre",
    );

    // Rejeu de la notification signée : rien ne se double.
    await appliquerLaNotification({
      providerEventId: `stripe:evt_conf_bis_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE",
    });
    verifier(courriers.length === 1, `un rejeu ne renvoie rien (${courriers.length})`);
    verifier(
      (await db.notification.count({ where: { applicationId: c.applicationId } })) === 1,
      "et n'écrit pas un second avis",
    );

    brancherTransport(null);
  }

  console.log("\nUn relais muet ne défait pas un rendez-vous payé");
  {
    /*
      L'inverse de la passe de divergence, et pour une raison : là-bas le
      courrier part avant la marque parce qu'une passe rejoue. Ici rien ne
      rejoue, et un courrier annonçant un rendez-vous que la transaction
      n'aurait pas retenu serait pire qu'un courrier manquant.
    */
    brancherTransport(async () => {
      throw new Error("SMTP injoignable");
    });

    const c = await candidat();
    const consultant = await leConsultant();
    const debut = new Date(Date.now() + 19 * JOUR);
    const tenue = await tenir(c.applicationId, consultant.id, debut, `RDV-M-${process.pid}`);
    const transaction = await transactionDeConsultation(c.userId, c.applicationId);
    await rattacherLePaiement(tenue.reference, transaction.id);

    await appliquerLaNotification({
      providerEventId: `stripe:evt_muet_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE",
    });

    const rdv = await db.appointment.findUniqueOrThrow({ where: { reference: tenue.reference } });
    verifier(rdv.status === "RESERVE", `le rendez-vous est confirmé quand même (${rdv.status})`);
    verifier(
      (await db.consultantAccess.count({
        where: { applicationId: c.applicationId, revokedAt: null },
      })) === 1,
      "l'accès du consultant est ouvert",
    );
    verifier(
      (await db.notification.count({ where: { applicationId: c.applicationId } })) === 1,
      "et le candidat a son avis : le canal durable ne dépend pas du relais",
    );

    brancherTransport(null);
  }

  /*
    T-05 — l'heure écrite dans la grille est celle que le candidat lit.

    `HEURES_PROPOSEES` se lit comme des heures de bureau, et les créneaux
    étaient posés par `setUTCHours` pendant que les formateurs de T-05 les
    rendent dans le fuseau d'affichage. Constaté en exécution : neuf,
    onze, quinze et dix-sept devenaient dix heures, midi, seize heures et
    dix-huit heures — jamais de créneau à neuf, un en plein midi, un après
    la journée d'un consultant du même fuseau.

    Une fumée, parce que la grille est produite par une lecture serveur :
    la liste des heures, le fuseau et les formateurs ne se rencontrent
    qu'ici.
  */
  console.log("\nT-05 — chaque créneau proposé s'affiche à l'heure où il est écrit");
  {
    const { creneaux, HEURES_PROPOSEES, JOURS_PROPOSES } = await import(
      "../src/server/lecture/consultants"
    );
    const { libelleHeure, jourDuFuseau } = await import(
      "../src/domain/consultants/rendez-vous"
    );
    const consultant = await leConsultant();

    /* Minuit passé dans le fuseau d'affichage, et pas encore en UTC. */
    const minuitLocal = new Date("2026-10-04T23:30:00Z");
    const grille = await creneaux(consultant.id, minuitLocal);

    const attendues = HEURES_PROPOSEES.map((h) => `${String(h).padStart(2, "0")} h 00`);
    const lues = [...new Set(grille.map((c) => libelleHeure(c)))].sort();
    verifier(
      lues.join(", ") === [...attendues].sort().join(", "),
      `les heures lues sont celles de la grille (${lues.join(", ")})`,
    );
    verifier(
      grille.length === HEURES_PROPOSEES.length * JOURS_PROPOSES,
      `la grille porte ${JOURS_PROPOSES} jours (${grille.length} créneaux)`,
    );

    /*
      Et « les trois prochains jours » compte des jours du fuseau : entre
      vingt-trois heures et minuit UTC, le jour local est déjà le suivant,
      et la grille partait du jour d'hier.
    */
    const demain = jourDuFuseau(new Date(minuitLocal.getTime() + 86_400_000));
    const premier = jourDuFuseau(new Date(grille[0]!.debut));
    verifier(
      premier.annee === demain.annee && premier.mois === demain.mois && premier.jour === demain.jour,
      `le premier jour proposé est demain, au calendrier du candidat (${JSON.stringify(premier)})`,
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
