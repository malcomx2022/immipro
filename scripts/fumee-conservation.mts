/**
 * La conservation des pièces selon l'état du dossier, contre une vraie base
 * — arbitrage S.78.
 *
 * ── Pourquoi une fumée ──────────────────────────────────────────────
 *
 * Trois choses ne s'éprouvent qu'en base : la garde SQL qui lie l'état
 * `SUSPENDU` à sa date, la purge qui doit laisser un dossier soumis
 * `SOUMIS` et un dossier suspendu `SUSPENDU`, et la conduite des annonces
 * quand le relais de messagerie refuse — aucune échéance ne doit être
 * posée sans que l'avis soit parti.
 *
 * Chaque bloc fixe son horloge : les durées se comptent en mois, et une
 * fumée qui attendrait douze mois n'éprouverait rien.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:conservation
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

const nomBase = `immipro_conservation_${process.pid}`;
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

/* Un vrai serveur de messagerie, sur la boucle locale : c'est lui qui
   rend `451` quand une annonce doit rester sans effet. Aucun message ne
   quitte la machine. */
const recus: string[] = [];
const differees = new Set<string>();
const smtp = new SMTPServer({
  disabledCommands: ["AUTH", "STARTTLS"],
  authOptional: true,
  onData(flux, session, fini) {
    flux.on("data", () => {});
    flux.on("end", () => {
      const vers = session.envelope.rcptTo.map((r) => r.address);
      if (vers.some((a) => differees.has(a))) {
        return fini(new Error("451 boîte momentanément indisponible"));
      }
      recus.push(...vers);
      fini();
    });
  },
});
await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", () => ok()));
const portSmtp = (smtp.server.address() as AddressInfo).port;

console.log(`Conservation des pièces sur une base jetable (${nomBase}), SMTP local :${portSmtp}`);
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

// S.152 : la purge liste le préfixe du dossier dans les deux zones ; sans
// stockage, elle laisserait chaque dossier échu, et elle aurait raison.
const { demarrerUnFauxStockage } = await import("./faux-stockage");
const fauxStockage = await demarrerUnFauxStockage();
const { db } = await import("../src/lib/db");
const { declarerLeDepot, confirmerLInstruction } = await import(
  "../src/server/dossiers/parcours"
);
const { arbitrerLaDivergence } = await import("../src/server/dossiers/migration");
const { propagerLaPublication } = await import("../src/server/jobs/divergence");
const { purgerLesPiecesEchues } = await import("../src/server/jobs/purge");
const { traiterLesBrouillonsInactifs } = await import("../src/server/jobs/inactivite");
const { traiterLesDepots, traiterLesSuspensions } = await import(
  "../src/server/jobs/conservation"
);
const { recalculerCompletude, checklistDepuis } = await import("../src/server/acces/dossiers");
const { conservationDuDepot } = await import("../src/server/vue/dossier");
const { decalerDeMois } = await import("../src/domain/format/mois");
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");
const { enregistrerLAutorisation } = await import("../src/server/acces/consentements");

const brute = REGLES_DE_REFERENCE.find(
  (r) => r.countryCode === "NL" && r.visaType === "etudes_mvv_vvr",
)!;
const CONDITIONS = (brute.rules as never as {
  conditions: { code: string; bloquant: boolean }[];
}).conditions;

const JOUR = 86_400_000;
let rang = 0;
const PAYS = ["NL", "PT", "ES", "GR"] as const;
let paysCourant: string = PAYS[0]!;

async function regle(rules: unknown) {
  rang += 1;
  return db.visaRule.create({
    data: {
      countryCode: paysCourant,
      visaType: "etudes_mvv_vvr",
      category: "ETUDES",
      version: rang,
      effectiveFrom: new Date("2026-01-01"),
      rules: rules as never,
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date("2026-01-01"),
      verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
}

/** Un dossier réellement prêt, ouvert à `ouvertLe`, qui porte une pièce vivante. */
async function dossierPret(regleId: string, ouvertLe = new Date()) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-cons-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  await enregistrerLAutorisation(user.id, "alertes_regles", true);
  const application = await db.application.create({
    data: { userId: user.id, visaRuleId: regleId, status: "ACTIF", createdAt: ouvertLe },
  });
  await db.document.createMany({
    data: checklistDepuis(brute.rules as never).map((p) => ({
      ...p,
      applicationId: application.id,
      status: "CONFORME" as const,
    })),
  });
  const document = (await db.document.findFirst({ where: { applicationId: application.id } }))!;
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
  await recalculerCompletude(application.id);
  const relu = (await db.application.findUnique({ where: { id: application.id } }))!;
  if (relu.status !== "PRET") throw new Error(`fixture : dossier non prêt (${relu.status}).`);
  return { user, application: relu, document };
}

const etat = async (id: string) => (await db.application.findUnique({ where: { id } }))!;
const vivantes = (applicationId: string) =>
  db.documentVersion.count({ where: { document: { applicationId }, purgedAt: null } });
const codeDe = (e: unknown): string =>
  (e as { echec?: { code?: string } }).echec?.code ?? String(e);

try {
  console.log("\nDossiers payés — RG-04.2 sans exception pour le paiement");
  paysCourant = PAYS[0];
  {
    const maintenant = new Date("2027-03-01T08:00:00Z");
    const il_y_a_13_mois = new Date(maintenant.getTime() - 400 * JOUR);
    const il_y_a_100_jours = new Date(maintenant.getTime() - 100 * JOUR);
    const r = await regle(brute.rules);
    const pret = await dossierPret(r.id, il_y_a_13_mois);
    const actif = await dossierPret(r.id, il_y_a_13_mois);
    await db.application.update({
      where: { id: actif.application.id },
      data: { status: "ACTIF", readyAt: null },
    });
    const aRelancer = await dossierPret(r.id, il_y_a_100_jours);

    const bilan = await traiterLesBrouillonsInactifs(maintenant);
    verifier(bilan.abandons === 2, `les deux dossiers payés inactifs sont clos (${bilan.abandons})`);
    for (const [nom, d] of [["prêt", pret], ["actif", actif]] as const) {
      const apres = await etat(d.application.id);
      verifier(apres.status === "ABANDONNE", `dossier ${nom} : ABANDONNE (${apres.status})`);
      verifier(apres.readyAt === null, `dossier ${nom} : sa date de mise en état est retirée`);
      verifier(
        apres.purgeDueAt !== null &&
          apres.purgeDueAt.getTime() === maintenant.getTime() + 30 * JOUR,
        `dossier ${nom} : purge annoncée sous 30 jours`,
      );
    }
    const relance = await db.notification.findFirst({
      where: { applicationId: aRelancer.application.id, kind: "INACTIVITE" },
    });
    verifier(
      relance?.body.includes("déclare-le dans ton dossier") ?? false,
      "le dossier prêt est invité à déclarer son dépôt, pas à déposer une pièce",
    );
  }

  console.log("\nDossiers soumis — douze mois, confirmation, préavis, purge");
  paysCourant = PAYS[1];
  {
    const r = await regle(brute.rules);
    const deposeLe = new Date("2026-01-31T10:00:00Z");
    const { application, user } = await dossierPret(r.id, deposeLe);
    const soumis = await declarerLeDepot(application, {
      deposeLe: deposeLe.toISOString().slice(0, 10),
      maintenant: deposeLe,
    });
    verifier(
      soumis.retentionUntil?.toISOString() === "2027-01-31T00:00:00.000Z",
      `le dépôt pose douze mois de conservation (${soumis.retentionUntil?.toISOString()})`,
    );

    const tot = new Date("2026-11-01T08:00:00Z");
    const rien = await traiterLesDepots(tot);
    verifier(rien.invitations + rien.preavis === 0, "rien n'est envoyé avant l'invitation");
    const refus = await confirmerLInstruction(soumis, tot).catch((e) => codeDe(e));
    verifier(refus === "etat_incompatible", `confirmer trop tôt est refusé (${String(refus)})`);

    const invitation = new Date("2026-12-02T10:00:00Z");
    const invite = await traiterLesDepots(invitation);
    verifier(invite.invitations === 1, `l'invitation part soixante jours avant (${invite.invitations})`);
    verifier(recus.includes(user.email), "par courrier");
    const rejoue = await traiterLesDepots(invitation);
    verifier(rejoue.invitations === 0, "et une seule fois");

    const { jusquAu } = await confirmerLInstruction(await etat(application.id), new Date("2026-12-10T08:00:00Z"));
    verifier(
      jusquAu.toISOString() === "2027-07-31T00:00:00.000Z",
      `la confirmation prolonge de six mois depuis l'échéance (${jusquAu.toISOString()})`,
    );

    const preavis = await traiterLesDepots(new Date("2027-07-01T10:00:00Z"));
    verifier(preavis.preavis === 1, `le préavis part trente jours avant (${preavis.preavis})`);
    const annonce = await etat(application.id);
    verifier(
      annonce.purgeDueAt?.toISOString() === "2027-07-31T10:00:00.000Z",
      `et pose l'échéance annoncée (${annonce.purgeDueAt?.toISOString()})`,
    );

    const purge = await purgerLesPiecesEchues(new Date("2027-07-31T10:00:01Z"));
    const apres = await etat(application.id);
    verifier(purge.dossiers >= 1, "la purge passe à l'échéance");
    verifier(apres.status === "SOUMIS", `le dossier reste SOUMIS (${apres.status})`);
    verifier(apres.submittedAt?.getTime() === deposeLe.getTime(), "sa date de dépôt reste");
    verifier((await vivantes(application.id)) === 0, "ses pièces sont parties");
    verifier(
      (await db.auditLog.count({ where: { target: `application:${application.id}`, action: "piece.purge" } })) === 1,
      "la purge est journalisée",
    );
    const vue = conservationDuDepot(apres, new Date("2027-08-01T00:00:00Z"));
    verifier(vue.purgeeLe === "2027-07-31" && !vue.confirmable, "l'écran dit la suppression, sans bouton");
    const tardif = await confirmerLInstruction(apres).catch((e) => codeDe(e));
    verifier(tardif === "etat_incompatible", "confirmer après la purge est refusé");
  }

  console.log("\nDossiers soumis — un préavis qui ne part pas ne pose rien");
  paysCourant = PAYS[2];
  {
    const r = await regle(brute.rules);
    const deposeLe = new Date("2025-01-15T10:00:00Z");
    const { application, user } = await dossierPret(r.id, deposeLe);
    await declarerLeDepot(application, {
      deposeLe: deposeLe.toISOString().slice(0, 10),
      maintenant: deposeLe,
    });
    differees.add(user.email);
    // Le stock ancien : l'échéance théorique est passée depuis longtemps.
    const maintenant = new Date("2027-03-01T08:00:00Z");
    const retenu = await traiterLesDepots(maintenant);
    const reste = await etat(application.id);
    verifier(retenu.courriersRetenus >= 1, "le courrier est retenu par le relais");
    verifier(reste.purgeDueAt === null, "et aucune purge n'est programmée sans annonce");
    differees.delete(user.email);
    await traiterLesDepots(maintenant);
    const annonce = await etat(application.id);
    verifier(
      annonce.purgeDueAt?.getTime() === maintenant.getTime() + 30 * JOUR,
      "le relais revenu, la purge d'un stock ancien reçoit ses trente jours",
    );
  }

  console.log("\nDossiers suspendus — date, statut antérieur, avertissement, purge, reprise");
  paysCourant = PAYS[3];
  {
    const suspenduLe = new Date("2026-03-31T09:00:00Z");
    const v1 = await regle(brute.rules);
    const perdue = CONDITIONS.find((c) => c.bloquant)!;
    const v2 = await regle({
      ...(brute.rules as object),
      conditions: CONDITIONS.filter((c) => c.code !== perdue.code),
    });
    const { application } = await dossierPret(v1.id, suspenduLe);
    await propagerLaPublication(v2.id, suspenduLe);
    const suspendu = await etat(application.id);
    verifier(suspendu.status === "SUSPENDU", `la divergence critique suspend (${suspendu.status})`);
    verifier(suspendu.suspendedAt?.getTime() === suspenduLe.getTime(), "et note sa date");
    verifier(suspendu.statusBeforeSuspension === "PRET", `et l'état interrompu (${suspendu.statusBeforeSuspension})`);

    // Une analyse de pièce recalcule la complétude, et réécrit l'état
    // suspendu : la pause ne doit pas repartir pour autant.
    await recalculerCompletude(application.id);
    const recalcule = await etat(application.id);
    verifier(
      recalcule.status === "SUSPENDU" && recalcule.suspendedAt?.getTime() === suspenduLe.getTime(),
      "un recalcul de complétude ne remet pas la pause à zéro",
    );

    const dixMois = await traiterLesSuspensions(decalerDeMois(suspenduLe, 10));
    verifier(dixMois.avertissements === 0, "rien à dix mois");
    const onzeMois = await traiterLesSuspensions(decalerDeMois(suspenduLe, 11));
    verifier(onzeMois.avertissements === 1, "l'avertissement part à onze mois");
    const averti = await etat(application.id);
    verifier(
      averti.purgeDueAt?.getTime() === decalerDeMois(suspenduLe, 12).getTime(),
      `et annonce la purge à douze (${averti.purgeDueAt?.toISOString()})`,
    );

    await purgerLesPiecesEchues(new Date(decalerDeMois(suspenduLe, 12).getTime() + 1000));
    const purge = await etat(application.id);
    verifier(purge.status === "SUSPENDU", `le dossier reste SUSPENDU (${purge.status})`);
    verifier(purge.statusBeforeSuspension === "PRET", "son état antérieur reste");
    verifier(purge.suspendedAt?.getTime() === suspenduLe.getTime(), "sa date de pause reste");
    verifier((await vivantes(application.id)) === 0, "ses pièces sont parties");

    // Une pièce redéposée pendant la pause ressort, et s'annonce à nouveau.
    const document = (await db.document.findFirst({ where: { applicationId: application.id } }))!;
    await db.documentVersion.create({
      data: {
        documentId: document.id,
        rank: 2,
        body: "Redéposée.",
        scanState: "SAINE",
        scannedAt: new Date(),
      },
    });
    const treize = decalerDeMois(suspenduLe, 13);
    const reaverti = await traiterLesSuspensions(treize);
    const reannonce = await etat(application.id);
    verifier(reaverti.avertissements === 1, "une pièce redéposée pendant la pause est annoncée");
    verifier(
      reannonce.purgedAt === null && reannonce.purgeDueAt?.getTime() === treize.getTime() + 30 * JOUR,
      "avec trente jours de préavis, et le dossier ne se dit plus purgé",
    );

    const divergence = (await db.ruleMigration.findFirst({
      where: { applicationId: application.id },
    }))!;
    await arbitrerLaDivergence(reannonce, divergence.id, "CONSERVER");
    const repris = await etat(application.id);
    verifier(repris.status !== "SUSPENDU", `la levée de la pause rend la main (${repris.status})`);
    verifier(repris.suspendedAt === null, "et efface la date de pause");
    verifier(repris.purgeDueAt === null && repris.purgedAt === null, "et annule la purge annoncée");
    verifier(repris.statusBeforeSuspension === "PRET", "l'état interrompu reste noté");
    const aRedemander = await db.document.count({
      where: { applicationId: application.id, status: "PURGEE" },
    });
    verifier(aRedemander > 0, `les pièces purgées restent demandées (${aRedemander})`);
  }

  console.log("\nLa garde : un dossier suspendu porte sa date, aucun autre");
  {
    const quelconque = (await db.application.findFirst({ where: { status: "SOUMIS" } }))!;
    const sansDate = await db.application
      .update({ where: { id: quelconque.id }, data: { status: "SUSPENDU", suspendedAt: null } })
      .then(() => "acceptée", () => "refusée");
    verifier(sansDate === "refusée", `une pause sans date est refusée (${sansDate})`);
    const dateSeule = await db.application
      .update({ where: { id: quelconque.id }, data: { suspendedAt: new Date() } })
      .then(() => "acceptée", () => "refusée");
    verifier(dateSeule === "refusée", `une date de pause hors pause est refusée (${dateSeule})`);
  }

  console.log("\nLe journal : cinq ans, puis la purge — et rien d'autre (revue F11)");
  {
    const { purgerCeQuiEstEchu } = await import("../src/server/jobs/purge");
    const maintenant = new Date();
    const ilYA = (ans: number, jours = 0) => {
      const d = new Date(maintenant);
      d.setUTCFullYear(d.getUTCFullYear() - ans);
      return new Date(d.getTime() - jours * 86_400_000);
    };
    const ecriture = (id: string, createdAt: Date) =>
      db.auditLog.create({
        data: { id: `${id}-${process.pid}`, actorId: "fumee", action: "f11", target: id, reason: "fumée", createdAt },
      });
    await ecriture("echue", ilYA(6));
    // Cinq ans passés d'une heure : échue pour la base, gardée par la marge
    // d'un jour de la purge. Sans marge, une horloge en avance ferait
    // échouer toute la passe sur cette ligne.
    await ecriture("frontiere", new Date(ilYA(5).getTime() - 3_600_000));
    await ecriture("recente", maintenant);

    const passe = await purgerCeQuiEstEchu(maintenant).then(() => "passée", (e: unknown) => String(e));
    const restantes = (await db.auditLog.findMany({ where: { action: "f11" }, select: { target: true } }))
      .map((l) => l.target)
      .sort();
    verifier(passe === "passée", `la purge planifiée passe le déclencheur (${passe})`);
    verifier(
      JSON.stringify(restantes) === JSON.stringify(["frontiere", "recente"]),
      `seule l'écriture de plus de cinq ans et un jour part (${restantes.join(", ")})`,
    );
    const recente = await db.auditLog.findFirstOrThrow({ where: { target: "recente", action: "f11" } });
    const effacee = await db.auditLog.delete({ where: { id: recente.id } }).then(() => "acceptée", () => "refusée");
    verifier(effacee === "refusée", `une écriture de moins de cinq ans ne se supprime pas (${effacee})`);
    const reecrite = await db.auditLog
      .update({ where: { id: recente.id }, data: { reason: "réécrit" } })
      .then(() => "acceptée", () => "refusée");
    verifier(reecrite === "refusée", `une écriture ne se modifie pas (${reecrite})`);
  }
} catch (erreur) {
  console.error(erreur);
  echecs.push(String(erreur));
} finally {
  await db.$disconnect();
  await fauxStockage.arreter();
  await new Promise<void>((ok) => smtp.close(() => ok()));
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nChaque purge est annoncée, et aucune n'efface un dossier.");
