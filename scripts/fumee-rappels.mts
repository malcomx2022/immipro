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
 * - qu'un dossier déposé ou clôturé ne reçoive rien ;
 * - qu'une coupure du serveur ne marque rien, pour que la passe du
 *   lendemain reprenne le rappel au lieu de le perdre.
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
const { CADENCE_JOURS } = await import("../src/domain/dossiers/rappels");

let rang = 0;
const jour = (n: number, depuis = new Date()) => {
  const d = new Date(depuis);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

/** Un candidat, son dossier, et les échéances qu'on lui donne. */
async function dossierAvec(
  echeances: { code: string; jours: number; faite?: boolean }[],
  options: {
    statut?: "ACTIF" | "SOUMIS" | "ARCHIVE";
    dernierRappel?: Date | null;
    /** Compte dont la suppression est demandée mais pas encore achevée. */
    suppressionDemandee?: boolean;
  } = {},
) {
  rang += 1;
  const user = await db.user.create({
    data: {
      email: `fumee-rap-${rang}-${process.pid}@exemple.test`,
      role: "CANDIDAT",
      ...(options.suppressionDemandee ? { deletionRequestedAt: jour(-2) } : {}),
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
      ...(e.faite ? { doneAt: new Date() } : {}),
    })),
  });
  return { user, application };
}

const courriersVers = (email: string) => recus.filter((r) => r.vers.includes(email));
const notifications = (userId: string) =>
  db.notification.count({ where: { userId, kind: "ECHEANCE" } });

try {
  console.log("\nUne échéance dépassée part tout de suite, et une seule fois");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "test_langue", jours: -3 }]);

    const premier = await envoyerLesRappels();
    verifier(premier.urgences === 1, `un rappel d'urgence part (${JSON.stringify(premier)})`);
    verifier(courriersVers(p.user.email).length === 1, "un courrier, et un seul, atteint le candidat");
    verifier((await notifications(p.user.id)) === 1, "et une notification l'attend à l'écran");

    const contenu = courriersVers(p.user.email)[0]?.contenu ?? "";
    verifier(/d=C3=A9pass|dépass/u.test(contenu), "le courrier dit que l'échéance est dépassée");
    /*
      INV-1 et INV-2 : un rappel informe d'une date. Il ne dit pas ce
      qu'une date manquée coûterait — c'est précisément ce qu'un courrier
      d'échéance est tenté de faire pour obtenir une réaction.
    */
    verifier(
      !/refus|rejet|chances|risque/iu.test(contenu),
      "et ne dit rien de l'issue de la démarche",
    );

    // Le lendemain : la marque est en base, rien ne repart.
    const second = await envoyerLesRappels(jour(1));
    verifier(second.urgences === 0, `le lendemain, rien ne repart (${second.urgences})`);
    verifier(courriersVers(p.user.email).length === 1, "toujours un seul courrier");
  }

  console.log("\nLa cadence hebdomadaire tient, et l'urgence lui échappe");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "depot", jours: 25 }]);

    /*
      Les bilans sont globaux — la base porte les dossiers des blocs
      précédents. Ce qui s'affirme ici se compte donc sur **ce
      candidat-là**, ce qui est de toute façon la bonne unité : la
      cadence est une promesse faite à une personne.
    */
    await envoyerLesRappels();
    verifier(courriersVers(p.user.email).length === 1, "la première passe part");
    await envoyerLesRappels(jour(CADENCE_JOURS - 1));
    verifier(courriersVers(p.user.email).length === 1, "rien avant une semaine");
    await envoyerLesRappels(jour(CADENCE_JOURS));
    verifier(courriersVers(p.user.email).length === 2, "la semaine suivante, oui");
  }

  console.log("\nUn dossier déposé ou clôturé ne reçoit rien");
  {
    recus.length = 0;
    const soumis = await dossierAvec([{ code: "depot", jours: -2 }], { statut: "SOUMIS" });
    const archive = await dossierAvec([{ code: "depot", jours: -2 }], { statut: "ARCHIVE" });
    await envoyerLesRappels();
    verifier(
      courriersVers(soumis.user.email).length === 0 &&
        courriersVers(archive.user.email).length === 0,
      "aucun courrier ne part vers eux",
    );
    /*
      Et rien n'est marqué : un dossier hors du périmètre n'est pas
      « déjà rappelé », il est hors du périmètre. La nuance compte le
      jour où il y rentre — un dossier repassé de SUSPENDU à ACTIF doit
      recevoir sa passe, pas attendre une semaine de plus.
    */
    for (const d of [soumis, archive]) {
      const relu = await db.application.findUniqueOrThrow({ where: { id: d.application.id } });
      verifier(relu.lastReminderAt === null, `${relu.status} : rien n'est marqué`);
    }
  }

  console.log("\nUne échéance faite ne se rappelle pas");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "depot", jours: -2, faite: true }]);
    const bilan = await envoyerLesRappels();
    verifier(bilan.urgences === 0 && bilan.hebdomadaires === 0, "rien ne part");
    verifier(courriersVers(p.user.email).length === 0, "et le candidat n'est pas dérangé");
  }

  console.log("\nUne coupure du serveur ne marque rien : la passe du lendemain reprend");
  {
    recus.length = 0;
    const p = await dossierAvec([{ code: "rdv", jours: 4 }]);

    refuser = true;
    const rate = await envoyerLesRappels();
    refuser = false;
    verifier(rate.aReprendre === 1, `l'envoi est compté à reprendre (${JSON.stringify(rate)})`);
    verifier(courriersVers(p.user.email).length === 0, "aucun courrier n'est parti");
    /*
      La marque n'est pas posée : marquer d'abord ferait d'une panne de
      messagerie un rappel définitivement perdu, et c'est la panne la
      plus banale de la chaîne.
    */
    const dossier = await db.application.findUniqueOrThrow({ where: { id: p.application.id } });
    verifier(dossier.lastReminderAt === null, "et rien n'est marqué en base");
    verifier((await notifications(p.user.id)) === 0, "aucune notification non plus");

    const repris = await envoyerLesRappels(jour(1));
    verifier(repris.urgences === 1, `le lendemain, le rappel repart (${repris.urgences})`);
    verifier(courriersVers(p.user.email).length === 1, "et le courrier atteint le candidat");
  }

  console.log("\nLa base refuse un rappel postérieur à l'accomplissement");
  console.log("  (l'erreur Prisma qui suit est la garde qui se déclenche — c'est l'attendu)");
  {
    const p = await dossierAvec([{ code: "depot", jours: 10 }]);
    const echeance = await db.deadline.findFirstOrThrow({
      where: { applicationId: p.application.id },
    });
    await db.deadline.update({
      where: { id: echeance.id },
      data: { doneAt: jour(-5) },
    });
    const refusee = await db.deadline
      .update({ where: { id: echeance.id }, data: { remindedAt: new Date() } })
      .then(() => false)
      .catch(() => true);
    verifier(refusee, "rappeler une échéance déjà faite est refusé par la base");
  }
  console.log("\nRG-10.4 — on n'écrit pas à qui a demandé l'oubli");
  {
    /*
      Entre la demande de suppression et l'anonymisation, le compte existe
      encore et `deletedAt` est nul — c'est l'état qu'ouvre une panne du
      stockage objet, et il dure jusqu'à la reprise du lendemain. La passe
      ne regardait que `deletedAt` : elle relançait donc quelqu'un qui
      venait de demander à partir.
    */
    const partant = await dossierAvec([{ code: "depot", jours: -5 }], {
      suppressionDemandee: true,
    });
    const bilan = await envoyerLesRappels();
    verifier(
      bilan.urgences === 0,
      `aucun rappel ne part pour lui (${JSON.stringify(bilan)})`,
    );
    verifier(
      courriersVers(partant.user.email).length === 0,
      "aucun courrier ne l'atteint",
    );
    verifier(
      (await notifications(partant.user.id)) === 0,
      "et aucune alerte ne l'attend à l'écran",
    );
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
console.log("\nLes rappels partent quand il faut, et une seule fois.");
