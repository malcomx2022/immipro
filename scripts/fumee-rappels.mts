/**
 * Les rappels d'échéance, de bout en bout — WF-09 étape 3, RG-09.2.
 *
 * Ce que le domaine décide seul s'éprouve dans
 * `tests/rappels-echeance.test.ts`. Ce qui demande **en plus** une base et
 * un vrai serveur de messagerie s'éprouve ici :
 *
 * - qu'un courrier parte réellement, et une seule fois ;
 * - qu'une urgence déjà rappelée ne reparte pas le lendemain — la marque
 *   est en base, et c'est elle qui tient la promesse ;
 * - que deux passes simultanées n'envoient qu'un courrier : la clé
 *   `echeance:<dossier>:<jour local>` est unique en base (S.87) ;
 * - qu'un dossier déposé ou clôturé, un compte en suppression, des
 *   rappels coupés, une pièce déjà déposée ne reçoivent rien ;
 * - que l'email coupé laisse la notification, sans courrier ;
 * - que le rappel attende huit heures dans le fuseau du candidat ;
 * - qu'une coupure du serveur laisse le courrier **en attente**, jamais
 *   « envoyé », et que l'heure suivante le reprenne ;
 * - qu'un transport absent ne se dise pas parti.
 *
 * Le serveur SMTP est local, sur un port éphémère de la boucle locale.
 * **Aucun message ne quitte la machine.**
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:rappels
 */
import { spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import { SMTPServer } from "smtp-server";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_rappels_${process.pid}`;
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

interface Recu {
  vers: string[];
  contenu: string;
}
const recus: Recu[] = [];
/** Le serveur peut refuser, pour éprouver ce qu'une coupure laisse en base. */
let refuser = false;

const smtp = new SMTPServer({
  disabledCommands: ["AUTH", "STARTTLS"],
  authOptional: true,
  onData(flux, session, fini) {
    let contenu = "";
    flux.on("data", (bloc: Buffer) => (contenu += bloc.toString("utf8")));
    flux.on("end", () => {
      if (refuser) return fini(new Error("451 indisponible"));
      recus.push({ vers: session.envelope.rcptTo.map((r) => r.address), contenu });
      fini();
    });
  },
});
await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", () => ok()));
const portSmtp = (smtp.server.address() as AddressInfo).port;

console.log(`Rappels d'échéance sur une base jetable (${nomBase}), SMTP local :${portSmtp}`);
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

process.env.SMTP_URL = `smtp://127.0.0.1:${portSmtp}`;
process.env.SMTP_FROM = "ne-pas-repondre@immipro.test";

const { db } = await import("../src/lib/db");
const { envoyerLesRappels } = await import("../src/server/jobs/rappels");
const { brancherTransport, TRANSPORT_JOURNAL } = await import("../src/server/courrier");
const { CADENCE_JOURS } = await import("../src/domain/dossiers/rappels");

let rang = 0;
/*
  Toutes les passes partent d'un instant fixe : midi UTC, treize heures à
  Cotonou. Depuis S.87 un rappel attend huit heures chez le candidat, et
  une fumée lancée à minuit ne doit pas conclure à une panne.
*/
const BASE = new Date();
BASE.setUTCHours(12, 0, 0, 0);
const jour = (n: number, depuis = BASE) => {
  const d = new Date(depuis);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const heures = (n: number, depuis = BASE) => new Date(depuis.getTime() + n * 3_600_000);

/** Un candidat, son dossier, et les échéances qu'on lui donne. */
async function dossierAvec(
  echeances: { code: string; jours: number; faite?: boolean }[],
  options: {
    statut?: "ACTIF" | "SOUMIS" | "ARCHIVE";
    dernierRappel?: Date | null;
    /** Compte dont la suppression est demandée mais pas encore achevée. */
    suppressionDemandee?: boolean;
    preferences?: {
      remindersEnabled?: boolean;
      reminderEmail?: boolean;
      reminderTimeZone?: string;
      reminderLeadDays?: number;
    };
    /** Pièces déjà déposées, par code. */
    piecesDeposees?: string[];
  } = {},
) {
  rang += 1;
  const user = await db.user.create({
    data: {
      email: `fumee-rap-${rang}-${process.pid}@exemple.test`,
      role: "CANDIDAT",
      ...(options.suppressionDemandee ? { deletionRequestedAt: jour(-2) } : {}),
      ...(options.preferences ?? {}),
    },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: "etudes_mvv_vvr",
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
  const statut = options.statut ?? "ACTIF";
  const application = await db.application.create({
    data: {
      userId: user.id,
      visaRuleId: regle.id,
      status: statut,
      ...(statut === "SOUMIS" ? { submittedAt: new Date() } : {}),
      ...(options.dernierRappel ? { lastReminderAt: options.dernierRappel } : {}),
    },
  });
  await db.deadline.createMany({
    data: echeances.map((e) => ({
      applicationId: application.id,
      code: e.code,
      label: `Faire ${e.code}`,
      dueAt: jour(e.jours),
      ...(e.faite ? { doneAt: jour(-1) } : {}),
    })),
  });
  for (const code of options.piecesDeposees ?? []) {
    await db.document.create({
      data: { applicationId: application.id, code, label: code, status: "EN_ANALYSE" },
    });
  }
  return { user, application };
}

const courriersVers = (email: string) => recus.filter((r) => r.vers.includes(email));
const notificationsDe = (userId: string) =>
  db.notification.findMany({ where: { userId, kind: "ECHEANCE" }, orderBy: { createdAt: "asc" } });

try {
  console.log("\nUne échéance dépassée part tout de suite, et une seule fois");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "test_langue", jours: -3 }]);

    const premier = await envoyerLesRappels(BASE);
    verifier(premier.urgences === 1, `un rappel d'urgence part (${JSON.stringify(premier)})`);
    verifier(courriersVers(p.user.email).length === 1, "un courrier, et un seul, atteint le candidat");
    const [n] = await notificationsDe(p.user.id);
    verifier(n?.emailStatus === "ENVOYE" && n.emailSentAt !== null, "la notification dit le courrier parti, avec sa date");
    verifier(/^echeance:.+:\d{4}-\d{2}-\d{2}$/u.test(n?.dedupKey ?? ""), `et porte sa clé du jour (${n?.dedupKey})`);

    const contenu = courriersVers(p.user.email)[0]?.contenu ?? "";
    verifier(/d=C3=A9pass|dépass/u.test(contenu), "le courrier dit que l'échéance est dépassée");
    verifier(!/refus|rejet|chances|risque/iu.test(contenu), "et ne dit rien de l'issue de la démarche");
    verifier(/Pays-Bas/u.test(contenu), "il nomme la destination de la règle figée, pas ses codes");

    // Une heure plus tard, puis le lendemain : rien ne repart.
    await envoyerLesRappels(heures(1));
    const second = await envoyerLesRappels(jour(1));
    verifier(second.urgences === 0, `le lendemain, rien ne repart (${second.urgences})`);
    verifier(courriersVers(p.user.email).length === 1, "toujours un seul courrier");
  }

  console.log("\nDeux passes le même jour : un courrier, une notification");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 3 }]);
    /*
      Simultanées : selon l'ordre où elles lisent, la seconde voit le
      dossier déjà marqué ou bute sur la clé. Dans les deux cas, un seul
      rappel. Le courrier peut rester en attente si le serveur a été
      pris de court : la passe suivante le reprend, sans le doubler.
    */
    await Promise.all([envoyerLesRappels(BASE), envoyerLesRappels(BASE)]);
    verifier(courriersVers(p.user.email).length <= 1, "jamais deux courriers");
    verifier((await notificationsDe(p.user.id)).length === 1, "une seule notification est écrite");
    await envoyerLesRappels(heures(1));
    verifier(courriersVers(p.user.email).length === 1, "une passe suivante complète sans doubler");

    /*
      La collision, rendue certaine : une seconde passe qui aurait lu le
      dossier **avant** que la première écrive. On efface les marques pour
      la placer dans cet état ; seule la clé peut alors l'arrêter.
    */
    await db.application.update({ where: { id: p.application.id }, data: { lastReminderAt: null } });
    await db.deadline.updateMany({ where: { applicationId: p.application.id }, data: { remindedAt: null } });
    const rejouee = await envoyerLesRappels(heures(2));
    verifier(rejouee.doublons === 1, `la passe rejouée bute sur la clé (${rejouee.doublons})`);
    verifier(courriersVers(p.user.email).length === 1, "et n'envoie rien");
    verifier((await notificationsDe(p.user.id)).length === 1, "ni n'écrit de seconde alerte");
    const relu = await db.application.findUniqueOrThrow({ where: { id: p.application.id } });
    verifier(relu.lastReminderAt === null, "la transaction refusée n'a rien marqué");
  }

  console.log("\nLa cadence hebdomadaire tient, et l'urgence lui échappe");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "depot", jours: 25 }]);
    await envoyerLesRappels(BASE);
    verifier(courriersVers(p.user.email).length === 1, "la première passe part");
    await envoyerLesRappels(jour(CADENCE_JOURS - 1));
    verifier(courriersVers(p.user.email).length === 1, "rien avant une semaine");
    await envoyerLesRappels(jour(CADENCE_JOURS));
    verifier(courriersVers(p.user.email).length === 2, "la semaine suivante, oui");

    const marquee = await db.deadline.findFirstOrThrow({
      where: { applicationId: p.application.id, code: "depot" },
    });
    verifier(marquee.remindedAt !== null, "la passe a marqué l'échéance lointaine");

    const avant = courriersVers(p.user.email).length;
    const bilan = await envoyerLesRappels(jour(18));
    verifier(courriersVers(p.user.email).length === avant + 1, `un courrier part à l'entrée dans la fenêtre (${JSON.stringify(bilan)})`);
    verifier(bilan.urgences === 1, `le motif est l'urgence (${bilan.urgences})`);
    await envoyerLesRappels(jour(19));
    verifier(courriersVers(p.user.email).length === avant + 1, "le lendemain, l'urgence ne repart pas");
  }

  console.log("\nHuit heures chez le candidat, pas chez le serveur");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 3 }], {
      preferences: { reminderTimeZone: "America/Toronto" },
    });
    // Onze heures UTC : sept heures à Montréal (heure d'été) ou six (hiver).
    const tot = await envoyerLesRappels(heures(-1));
    verifier(courriersVers(p.user.email).length === 0, `rien avant huit heures à Montréal (${tot.avantLHeure} en attente d'heure)`);
    // Quatorze heures UTC : huit ou neuf heures à Montréal — la passe rattrape.
    await envoyerLesRappels(heures(2));
    verifier(courriersVers(p.user.email).length === 1, "la passe suivante rattrape le rappel");
  }

  console.log("\nCe qui ne reçoit rien");
  {
    recus.length = 0;
    const soumis = await dossierAvec([{ code: "depot", jours: -2 }], { statut: "SOUMIS" });
    const archive = await dossierAvec([{ code: "depot", jours: -2 }], { statut: "ARCHIVE" });
    const coupe = await dossierAvec([{ code: "depot", jours: -2 }], {
      preferences: { remindersEnabled: false },
    });
    const faite = await dossierAvec([{ code: "depot", jours: -2, faite: true }]);
    const deposee = await dossierAvec([{ code: "casier", jours: 2 }], { piecesDeposees: ["casier"] });
    const partant = await dossierAvec([{ code: "depot", jours: -5 }], { suppressionDemandee: true });
    await envoyerLesRappels(BASE);
    for (const [nom, d] of Object.entries({ soumis, archive, coupe, faite, deposee, partant })) {
      verifier(
        courriersVers(d.user.email).length === 0 && (await notificationsDe(d.user.id)).length === 0,
        `${nom} : ni courrier ni alerte`,
      );
    }
    for (const d of [soumis, archive, coupe]) {
      const relu = await db.application.findUniqueOrThrow({ where: { id: d.application.id } });
      verifier(relu.lastReminderAt === null, `${relu.status} : rien n'est marqué`);
    }
  }

  console.log("\nL'email coupé : l'alerte reste, aucun courrier");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 2 }], { preferences: { reminderEmail: false } });
    const bilan = await envoyerLesRappels(BASE);
    const [n] = await notificationsDe(p.user.id);
    verifier(courriersVers(p.user.email).length === 0, "aucun courrier ne part");
    verifier(n !== undefined && n.emailStatus === null, "la notification est écrite, sans état de courrier");
    verifier(bilan.alertesSeules >= 1, `le bilan le compte à part (${bilan.alertesSeules})`);
  }

  console.log("\nUne coupure du serveur : en attente, jamais « envoyé », reprise l'heure suivante");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 4 }]);

    refuser = true;
    const rate = await envoyerLesRappels(BASE);
    refuser = false;
    verifier(rate.aReprendre >= 1, `le courrier est compté à reprendre (${JSON.stringify(rate)})`);
    verifier(courriersVers(p.user.email).length === 0, "aucun courrier n'est parti");
    let [n] = await notificationsDe(p.user.id);
    verifier(n?.emailStatus === "EN_ATTENTE" && n.emailSentAt === null, "la notification est là, son courrier en attente");

    const repris = await envoyerLesRappels(heures(1));
    [n] = await notificationsDe(p.user.id);
    verifier(repris.envoyes >= 1, `l'heure suivante, le courrier repart (${JSON.stringify(repris)})`);
    verifier(courriersVers(p.user.email).length === 1, "et atteint le candidat, une fois");
    verifier(n?.emailStatus === "ENVOYE" && n.emailAttempts === 2, `deux tentatives, la seconde acceptée (${n?.emailAttempts})`);
    verifier((await notificationsDe(p.user.id)).length === 1, "toujours une seule notification");
  }

  console.log("\nUne coupure qui dure : le lendemain, le courrier n'est plus repris");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 4 }]);
    refuser = true;
    await envoyerLesRappels(BASE);
    refuser = false;
    // Le lendemain à 7 h 30 à Cotonou : avant l'heure du nouveau rappel,
    // mais le jour du courrier en attente est passé.
    await envoyerLesRappels(new Date(jour(1).getTime() - 5.5 * 3_600_000));
    const [n] = await notificationsDe(p.user.id);
    verifier(n?.emailStatus === "NON_ENVOYE", `le courrier d'hier est abandonné (${n?.emailStatus})`);
    verifier(courriersVers(p.user.email).length === 0, "et son texte d'hier ne part pas aujourd'hui");
  }

  console.log("\nUn transport absent ne se dit pas parti");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 2 }]);
    brancherTransport(TRANSPORT_JOURNAL);
    const bilan = await envoyerLesRappels(BASE);
    brancherTransport(null);
    const [n] = await notificationsDe(p.user.id);
    verifier(n?.emailStatus === "NON_ENVOYE", `le courrier est « non envoyé » (${n?.emailStatus})`);
    verifier(bilan.envoyes === 0 && bilan.sansCourrier >= 1, `le bilan ne compte aucun envoi (${JSON.stringify(bilan)})`);
  }

  console.log("\nLa base refuse ce qui contredirait l'état");
  console.log("  (les erreurs Prisma qui suivent sont les gardes qui se déclenchent — c'est l'attendu)");
  {
    const p = await dossierAvec([{ code: "depot", jours: 10 }]);
    const echeance = await db.deadline.findFirstOrThrow({ where: { applicationId: p.application.id } });
    await db.deadline.update({ where: { id: echeance.id }, data: { doneAt: jour(-5) } });
    const refusee = await db.deadline
      .update({ where: { id: echeance.id }, data: { remindedAt: new Date() } })
      .then(() => false)
      .catch(() => true);
    verifier(refusee, "rappeler une échéance déjà faite est refusé par la base");

    const sansDate = await db.notification
      .create({
        data: { userId: p.user.id, kind: "ECHEANCE", title: "t", body: "b", emailStatus: "ENVOYE" },
      })
      .then(() => false)
      .catch(() => true);
    verifier(sansDate, "un courrier « envoyé » sans date d'envoi est refusé");

    const delai = await db.user
      .update({ where: { id: p.user.id }, data: { reminderLeadDays: 5 } })
      .then(() => false)
      .catch(() => true);
    verifier(delai, "un délai d'alerte hors de trois, sept, quatorze est refusé");
  }
} finally {
  await db.$disconnect().catch(() => undefined);
  smtp.close();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLes rappels partent quand il faut, une seule fois, et ne se disent partis que s'ils le sont.");
