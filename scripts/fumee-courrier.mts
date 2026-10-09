/**
 * Le transport SMTP, de bout en bout, sur une base réelle et un vrai
 * serveur de messagerie.
 *
 * Les issues de l'adaptateur s'éprouvent dans
 * `tests/courrier-smtp.test.ts`, déjà contre un vrai serveur. Ce qui
 * demande **en plus** une base — le rejeu d'une notification signée ne
 * doit pas produire deux reçus — s'éprouve ici : c'est la seule façon de
 * répondre à « aucun double envoi sur rejeu » par autre chose qu'une
 * lecture de code.
 *
 * Le serveur SMTP est local, en clair, sur un port éphémère de la boucle
 * locale. **Aucun message ne quitte la machine**, et rien n'est envoyé à
 * une adresse réelle.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:courrier
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

const nomBase = `immipro_courrier_${process.pid}`;
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

/* Le serveur de messagerie d'essai, sur la boucle locale. */

interface Recu {
  vers: string[];
  contenu: string;
}
const recus: Recu[] = [];

const smtp = new SMTPServer({
  disabledCommands: ["AUTH", "STARTTLS"],
  authOptional: true,
  onData(flux, session, fini) {
    let contenu = "";
    flux.on("data", (bloc: Buffer) => (contenu += bloc.toString("utf8")));
    flux.on("end", () => {
      recus.push({ vers: session.envelope.rcptTo.map((r) => r.address), contenu });
      fini();
    });
  },
});
await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", () => ok()));
const portSmtp = (smtp.server.address() as AddressInfo).port;

console.log(`Transport SMTP sur une base jetable (${nomBase}), serveur local :${portSmtp}`);
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

/*
  La configuration est posée avant d'importer les modules serveur. Le
  transport se construit paresseusement, mais autant que l'ordre soit
  celui d'un vrai démarrage.
*/
process.env.SMTP_URL = `smtp://127.0.0.1:${portSmtp}`;
process.env.SMTP_FROM = "ne-pas-repondre@immipro.test";

const { db } = await import("../src/lib/db");

/**
 * Ce que le fournisseur annonce avoir encaissé : le montant décidé par la
 * plateforme, en unités mineures (revue du 07/10/2026, E2). Une
 * confirmation sans montant ne crédite plus rien.
 */
const encaisse = async (reference: string) => {
  const { prixPayeMineur } = await import("../src/domain/facturation/montants");
  const t = await db.transaction.findUniqueOrThrow({
    where: { reference },
    select: { amountMajor: true, currency: true },
  });
  return {
    montantMineur: prixPayeMineur(t),
    devise: t.currency,
    rembourseMineur: null,
  };
};
/** Une notification qui ne dit rien de l'argent : un échec, une attente, un remboursement FedaPay. */
const sansMontant = { montantMineur: null, devise: null, rembourseMineur: null };
const { traiterLaNotification } = await import("../src/server/paiement/reception");
const { leTransport, TRANSPORT_JOURNAL, sonderLeCourrier, expedier } = await import(
  "../src/server/courrier"
);
const { lireLesConstats } = await import("../src/server/exploitation/constats");
const { oublierLesFaits } = await import("../src/server/courrier");
const { verifierLaConnexion, oublierLeTransporteur } = await import(
  "../src/server/courrier/smtp"
);

let rang = 0;

/** Un candidat, son dossier, et une transaction prête à être confirmée. */
async function candidat() {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-c-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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
  const transaction = await db.transaction.create({
    data: {
      reference: `IMP-260922-C${String(rang).padStart(5, "0")}`,
      userId: user.id,
      applicationId: application.id,
      packCode: "dossier",
      amountMajor: 29,
      currency: "EUR",
      provider: "STRIPE",
      status: "EN_ATTENTE",
      providerTxId: `stripe:cs_c${rang}_${process.pid}`,
    },
  });
  return { user, application, transaction };
}

/** Capture ce qui atteint `console.info` le temps d'un appel. */
async function sousEcoute<T>(action: () => Promise<T>): Promise<{ valeur: T; dit: string[] }> {
  const dit: string[] = [];
  const info = console.info;
  const avertir = console.warn;
  console.info = (...a: unknown[]) => void dit.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void dit.push(a.map(String).join(" "));
  try {
    return { valeur: await action(), dit };
  } finally {
    console.info = info;
    console.warn = avertir;
  }
}

try {
  console.log("\nLe transport suit la configuration");
  {
    verifier(leTransport() !== TRANSPORT_JOURNAL, "SMTP_URL lue : le transport SMTP est choisi");
    verifier(
      leTransport({}) === TRANSPORT_JOURNAL,
      "sans configuration : le repli au journal, qui n'expédie rien",
    );

    const sonde = await verifierLaConnexion();
    verifier(sonde.issue === "envoye", `la connexion se vérifie (${sonde.issue})`);
    verifier(recus.length === 0, `et la vérification n'envoie aucun message (${recus.length})`);
  }

  console.log("\nUn courrier part pour de bon");
  {
    recus.length = 0;
    const { valeur: issue } = await sousEcoute(() =>
      expedier({
        destinataire: "awa@exemple.test",
        objet: "Essai de fumée",
        corps: "Ce message part vers un serveur local, et nulle part ailleurs.",
        genre: "essai_de_fumee",
      }),
    );
    verifier(issue.issue === "envoye", `l'issue est « envoyé » (${issue.issue})`);
    verifier(recus.length === 1, `le serveur a reçu le message (${recus.length})`);
    verifier(
      recus[0]?.vers.join(",") === "awa@exemple.test",
      `à la bonne adresse (${recus[0]?.vers.join(",")})`,
    );
    verifier(
      sonderLeCourrier() === "CONCLUANTE",
      "et l'état de service le tient pour un fait établi",
    );

    /*
      Et le fait franchit la frontière des processus — 22/09/2026.

      Un courrier réel part du **processus web** ; l'état de service est
      lu par la même adresse, mais après un redémarrage, ou depuis une
      autre instance. Tant que le fait tenait dans une variable de
      module, il mourait avec le processus. `oublierLesFaits` joue ici ce
      qu'un autre processus aurait toujours eu : rien en mémoire.
    */
    const constats = await lireLesConstats();
    verifier(
      constats.messagerie?.reussi === true,
      "l'envoi réel a laissé un constat en base",
    );

    oublierLesFaits();
    verifier(
      sonderLeCourrier() === "ABSENTE",
      "la mémoire vidée, la sonde locale ne sait plus rien",
    );
    verifier(
      sonderLeCourrier(process.env, constats.messagerie) === "CONCLUANTE",
      "mais le constat lu en base la fait conclure — ce que la mémoire seule ne permettait pas",
    );
  }

  console.log("\nRejeu d'une notification signée");
  {
    recus.length = 0;
    const { user, transaction } = await candidat();
    const notification = {
      providerEventId: `stripe:evt_courrier_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE" as const,
      ...(await encaisse(transaction.reference)),
    };

    const { valeur: premier } = await sousEcoute(() =>
      traiterLaNotification(notification, "stripe"),
    );
    verifier(premier.issue === "creditee", `la première crédite (${premier.issue})`);
    verifier(recus.length === 1, `un reçu part (${recus.length})`);
    verifier(
      recus[0]?.vers.join(",") === user.email,
      "au candidat qui a payé, et à personne d'autre",
    );

    /*
      Le rejeu. L'idempotence est en amont — `PaymentEvent.providerEventId`
      est unique, et la notification rejouée n'atteint jamais le crédit —
      si bien qu'aucun second reçu n'est composé. C'est cette chaîne-là
      qu'on éprouve : un garde-fou dans le module de courrier protégerait
      le symptôme et laisserait passer le double crédit.
    */
    const { valeur: second } = await sousEcoute(() =>
      traiterLaNotification(notification, "stripe"),
    );
    verifier(second.issue === "rejeu", `la seconde est un rejeu (${second.issue})`);
    verifier(recus.length === 1, `et aucun second reçu ne part (${recus.length})`);

    // Quatre passages : un fournisseur rejoue longtemps.
    await sousEcoute(() => traiterLaNotification(notification, "stripe"));
    await sousEcoute(() => traiterLaNotification(notification, "stripe"));
    verifier(recus.length === 1, `toujours un seul reçu après quatre passages (${recus.length})`);
  }

  console.log("\nUn reçu qui ne part pas est repris par la passe (F3)");
  {
    /*
      Reproduit avant correction : le relais injoignable au moment de la
      confirmation, le reçu ne partait pas et rien ne le reprenait — la
      réception ignorait l'issue de l'envoi.
    */
    recus.length = 0;
    const url = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    oublierLeTransporteur();
    const { user, transaction } = await candidat();
    const confirmation = {
      providerEventId: `stripe:evt_recu_repris_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE" as const,
      ...(await encaisse(transaction.reference)),
    };
    const { valeur: issue } = await sousEcoute(() => traiterLaNotification(confirmation, "stripe"));
    verifier(issue.issue === "creditee", `la confirmation est acquittée malgré le relais (${issue.issue})`);
    verifier(recus.length === 0, `rien n'est parti (${recus.length})`);

    process.env.SMTP_URL = url;
    oublierLeTransporteur();
    const module = (await import("../src/server/paiement/recu").catch(() => null)) as
      | { reprendreLesRecus?: (maintenant?: Date) => Promise<number> }
      | null;
    const reprise = module?.reprendreLesRecus;
    verifier(typeof reprise === "function", "une passe reprend les reçus en attente");
    if (reprise) {
      // Le bail de la première tentative passé, la passe la reprend.
      const { valeur: partis } = await sousEcoute(() => reprise(new Date(Date.now() + 11 * 60_000)));
      verifier(partis === 1 && recus.length === 1, `le reçu part à la passe suivante (${partis}, ${recus.length})`);
      verifier(recus[0]?.vers.join(",") === user.email, "au candidat qui a payé");
      const { valeur: encore } = await sousEcoute(() => reprise(new Date(Date.now() + 22 * 60_000)));
      verifier(encore === 0 && recus.length === 1, "et ne repart pas une seconde fois");
    }
  }

  console.log("\nCe qui atteint le journal");
  {
    recus.length = 0;
    const { dit } = await sousEcoute(() =>
      expedier({
        destinataire: "awa@exemple.test",
        objet: "481920 — ton code de vérification ImmiPro",
        corps: "Ton code de vérification est 481920.",
        genre: "code_verification",
      }),
    );

    verifier(recus.length === 1, "le message est bien parti");
    verifier(
      dit.some((l) => l.includes("code_verification")),
      "le journal dit de quel courrier il s'agit",
    );
    verifier(
      !dit.some((l) => l.includes("481920")),
      "et ne porte ni le code, ni l'objet qui le contient",
    );
    verifier(
      !dit.some((l) => l.includes("awa@exemple.test")),
      "ni l'adresse complète du destinataire",
    );
    // Le corps est bien arrivé chez le destinataire, lui — ce n'est pas
    // le message qui est amputé, c'est le journal qui se tait.
    verifier(
      (recus[0]?.contenu ?? "").includes("481920"),
      "tandis que le destinataire, lui, reçoit bien son code",
    );
  }

  console.log("\nSans configuration, rien ne part et rien ne ment");
  {
    recus.length = 0;
    const url = process.env.SMTP_URL;
    delete process.env.SMTP_URL;
    oublierLeTransporteur();

    const { valeur: issue } = await sousEcoute(() =>
      expedier({
        destinataire: "awa@exemple.test",
        objet: "Essai sans transport",
        corps: "Rien ne doit partir.",
        genre: "essai_de_fumee",
      }),
    );

    verifier(
      issue.issue === "journalise",
      `l'appelant apprend que rien n'est parti (${issue.issue})`,
    );
    verifier(recus.length === 0, `et le serveur n'a rien reçu (${recus.length})`);
    verifier(
      sonderLeCourrier({}) !== "CONCLUANTE",
      "l'état de service ne déclare pas la messagerie vérifiée",
    );

    process.env.SMTP_URL = url;
    oublierLeTransporteur();
  }

  console.log("\nLe courrier de remboursement suit la même règle");
  {
    const { user, transaction } = await candidat();
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "CONFIRMEE",
        confirmedAt: new Date(),
        refundDueAt: new Date(),
        // Le garde-fou l'exige, et il a raison : une obligation de
        // rembourser sans motif ne se relit pas.
        refundBasis: "Essai de fumée — courrier de remboursement",
        // Initié : seul un remboursement décidé et demandé se solde (E3).
        refundAttemptedAt: new Date(),
        refundAttempts: 1,
      },
    });

    recus.length = 0;
    const notification = {
      providerEventId: `stripe:evt_remb_courrier_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "REMBOURSEE" as const,
      ...sansMontant,
    };

    const { valeur: premier } = await sousEcoute(() =>
      traiterLaNotification(notification, "stripe"),
    );
    verifier(premier.issue === "appliquee", `la notification s'applique (${premier.issue})`);
    verifier(recus.length === 1, `un courrier de remboursement part (${recus.length})`);
    verifier(
      recus[0]?.vers.join(",") === user.email,
      "au candidat remboursé, et à personne d'autre",
    );

    // Et c'est la notification signée qui l'a déclenché, pas la décision
    // ni la demande : la transaction porte maintenant `refundedAt`.
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundedAt !== null, "le versement est daté par la notification");

    const { valeur: second } = await sousEcoute(() =>
      traiterLaNotification(notification, "stripe"),
    );
    verifier(second.issue === "rejeu", `le rejeu est reconnu (${second.issue})`);
    verifier(recus.length === 1, `et n'envoie pas un second courrier (${recus.length})`);
  }
} finally {
  await db.$disconnect().catch(() => {});
  await new Promise<void>((ok) => smtp.close(() => ok()));
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

console.log(
  echecs.length === 0
    ? "\nLe courrier part une fois, le rejeu n'en produit pas un second, et le journal ne porte aucun code."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
