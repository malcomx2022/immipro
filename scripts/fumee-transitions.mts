/**
 * Les transitions d'état d'un dossier, contre une vraie base — RG-07.2.
 *
 * ── Pourquoi une fumée, et pas un test ─────────────────────────────
 *
 * La règle que `domain/dossiers/etat.ts` énonce est tenue par une garde
 * SQL, et une garde SQL ne s'éprouve pas sans PostgreSQL. C'est exactement
 * ce qui a permis à six écritures sur sept d'écrire `status` sans sa date
 * pendant quatre jours : rien, dans la chaîne de vérification, n'écrivait
 * réellement dans une base.
 *
 * Le coût de l'angle mort se lit dans ce que cette fumée couvre : la
 * **déclaration de dépôt** — le dernier geste du parcours candidat, dont
 * `PRET` est le seul état accepté — était refusée par la base à tous les
 * coups, pour tout le monde, depuis le premier jour.
 *
 * Chaque bloc part d'un dossier réellement `PRET` : c'est l'état qui porte
 * une `readyAt`, donc le seul depuis lequel la garde peut mordre.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:transitions
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

const nomBase = `immipro_transitions_${process.pid}`;
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

/* ------------------------------------------------------------------ *
 * Un vrai serveur de messagerie, sur la boucle locale.
 *
 * RG-11.3 double l'alerte critique d'un email nominatif, et c'est le seul
 * envoi dont l'échec est attendu en exploitation ordinaire — un relais
 * sous charge répond `451`. Sans serveur, le transport se dégrade en
 * « journalisé », et le chemin qui compte — la coupure qui ne doit rien
 * marquer — ne s'emprunte jamais.
 *
 * **Aucun message ne quitte la machine.**
 * ------------------------------------------------------------------ */

interface Recu {
  vers: string[];
}
const recus: Recu[] = [];
/** Adresses que le relais refuse temporairement. */
const differees = new Set<string>();
/** Appelé au premier message reçu — de quoi simuler une course. */
let auPremierMessage: (() => Promise<void>) | null = null;

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
      recus.push({ vers });
      const hook = auPremierMessage;
      auPremierMessage = null;
      if (hook) {
        hook().then(
          () => fini(),
          (e) => fini(e as Error),
        );
        return;
      }
      fini();
    });
  },
});
await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", () => ok()));
const portSmtp = (smtp.server.address() as AddressInfo).port;

console.log(`Transitions d'état sur une base jetable (${nomBase}), SMTP local :${portSmtp}`);
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
const { declarerLeDepot, cloturerLeDossier } = await import("../src/server/dossiers/parcours");
const { arbitrerLaDivergence } = await import("../src/server/dossiers/migration");
const { propagerLaPublication, doitRejouer } = await import("../src/server/jobs/divergence");
const { purgerSurDemande } = await import("../src/server/jobs/purge");
const { recalculerCompletude } = await import("../src/server/acces/dossiers");
const { ouvrirLeTunnel, appliquerLaNotification } = await import("../src/server/acces/paiements");
type Ouvreur = Parameters<typeof ouvrirLeTunnel>[3];
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");

/* Le référentiel livré, pour que les pièces et les conditions soient celles
   du produit et non une fixture qui s'arrangerait. */
const brute = REGLES_DE_REFERENCE.find(
  (r) => r.countryCode === "NL" && r.visaType === "etudes_mvv_vvr",
)!;
const PIECES = (brute.rules as never as {
  pieces_requises: { code: string; libelle: string; obligatoire: boolean }[];
  conditions: { code: string; bloquant: boolean }[];
}).pieces_requises;
const CONDITIONS = (brute.rules as never as {
  conditions: { code: string; bloquant: boolean }[];
}).conditions;

let rang = 0;

async function regle(rules: unknown) {
  rang += 1;
  return db.visaRule.create({
    data: {
      countryCode: "NL",
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

/** Un dossier réellement prêt : toutes les pièces obligatoires conformes. */
async function dossierPret(regleId: string) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-tr-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const application = await db.application.create({
    data: { userId: user.id, visaRuleId: regleId, status: "ACTIF" },
  });
  await db.document.createMany({
    data: PIECES.map((p) => ({
      applicationId: application.id,
      code: p.code,
      label: p.libelle,
      family: p.obligatoire ? ("OBLIGATOIRE" as const) : ("COMPLEMENTAIRE" as const),
      required: p.obligatoire,
      status: "CONFORME" as const,
    })),
  });
  await recalculerCompletude(application.id);
  const relu = (await db.application.findUnique({ where: { id: application.id } }))!;
  if (relu.status !== "PRET" || relu.readyAt === null) {
    throw new Error(`fixture : le dossier n'est pas prêt (${relu.status}).`);
  }
  return { user, application: relu };
}

const etat = async (id: string) => (await db.application.findUnique({ where: { id } }))!;

try {
  console.log("\nWF-10 étape 1 — la déclaration de dépôt, depuis le seul état qu'elle accepte");
  {
    const r = await regle(brute.rules);
    const { application } = await dossierPret(r.id);
    const maj = await declarerLeDepot(application);
    verifier(maj.status === "SOUMIS", `le dossier passe à SOUMIS (${maj.status})`);
    verifier(maj.submittedAt !== null, "et la date de dépôt est posée");
    verifier(maj.readyAt === null, "la date de mise en état est retirée avec l'état");
  }

  console.log("\nWF-10 — la clôture d'un dossier prêt, par quelqu'un qui renonce avant de déposer");
  {
    const r = await regle(brute.rules);
    const { application } = await dossierPret(r.id);
    const { dossier, purgeLe } = await cloturerLeDossier(application, "RENONCE", "Bourse refusée");
    verifier(dossier.status === "ISSUE_DECLAREE", `l'issue est enregistrée (${dossier.status})`);
    verifier(dossier.readyAt === null, "et la date de mise en état est retirée");
    verifier(purgeLe > new Date(), "la date de purge est annoncée à l'avance (RG-10.2)");
  }

  console.log("\nWF-11 — une divergence critique prévient TOUS les dossiers prêts");
  {
    const v1 = await regle(brute.rules);
    const perdue = CONDITIONS.find((c) => c.bloquant)!;
    const v2 = await regle({
      ...(brute.rules as object),
      conditions: CONDITIONS.filter((c) => c.code !== perdue.code),
    });

    const trois = [await dossierPret(v1.id), await dossierPret(v1.id), await dossierPret(v1.id)];

    const bilan = await propagerLaPublication(v1.id, v2.id);
    verifier(
      bilan.alertes === 3 && bilan.critiques === 3,
      `les trois sont alertés et mis en pause (${JSON.stringify(bilan)})`,
    );
    for (const [i, p] of trois.entries()) {
      const a = await etat(p.application.id);
      const notifications = await db.notification.count({
        where: { applicationId: p.application.id, kind: "REGLEMENTATION" },
      });
      const courriers = recus.filter((r) => r.vers.includes(p.user.email)).length;
      verifier(a.status === "SUSPENDU", `dossier ${i + 1} : mis en pause (${a.status})`);
      verifier(a.readyAt === null, `dossier ${i + 1} : la date de mise en état est retirée`);
      verifier(notifications === 1, `dossier ${i + 1} : une notification (${notifications})`);
      verifier(courriers === 1, `dossier ${i + 1} : un email nominatif est parti (RG-11.3)`);
    }

    console.log("\n  T-02 — « je conserve ma version » lève la pause");
    {
      const p = trois[0]!;
      const suspendu = await etat(p.application.id);
      const migration = (await db.ruleMigration.findFirst({
        where: { applicationId: p.application.id },
      }))!;
      const arbitrage = await arbitrerLaDivergence(suspendu, migration.id, "CONSERVER");
      verifier(arbitrage.decision === "CONSERVER", "la décision est enregistrée");
      const apres = await etat(p.application.id);
      verifier(
        apres.status === "PRET" && apres.readyAt !== null,
        `le dossier reprend son cours et redevient prêt (${apres.status})`,
      );
      verifier(
        apres.visaRuleId === v1.id,
        "sur la version qu'il avait figée — INV-3, rien n'a migré",
      );
    }

    console.log("\n  T-02 — « je migre » passe, sur un dossier prêt");
    {
      const p = trois[1]!;
      const suspendu = await etat(p.application.id);
      const migration = (await db.ruleMigration.findFirst({
        where: { applicationId: p.application.id },
      }))!;
      const arbitrage = await arbitrerLaDivergence(suspendu, migration.id, "MIGRER");
      verifier(arbitrage.decision === "MIGRER", "la décision est enregistrée");
      const apres = await etat(p.application.id);
      verifier(apres.visaRuleId === v2.id, "le dossier suit désormais la nouvelle version");
      verifier(
        apres.status === "PRET" && apres.readyAt !== null,
        `et il reprend son cours (${apres.status})`,
      );
      const pieces = await db.document.count({ where: { applicationId: p.application.id } });
      verifier(
        pieces >= PIECES.length,
        `aucune pièce déjà validée n'a été retirée (RG-11.1, ${pieces})`,
      );
    }

    /*
      Et la reprise, maintenant que deux dossiers ont repris leur cours :
      la requête les re-sélectionne — ils sont de nouveau `PRET` — et c'est
      `alertedAt` qui les écarte. Sans elle, arbitrer une divergence
      exposait à la recevoir une seconde fois.
    */
    const reprise = await propagerLaPublication(v1.id, v2.id);
    verifier(
      reprise.alertes === 0 && reprise.dejaAlertes === 1,
      `la reprise ne réalerte pas le dossier qui a arbitré (${JSON.stringify(reprise)})`,
    );
    const total = await db.notification.count({
      where: { applicationId: trois[0]!.application.id, kind: "REGLEMENTATION" },
    });
    verifier(total === 1, `et il n'a toujours qu'une notification (${total})`);
  }

  console.log("\nWF-11 — un relais saturé ne fait perdre l'alerte de personne");
  {
    /*
      La panne attendue : le relais refuse temporairement **un** candidat.
      Deux choses en découlent, et ce sont les deux que le défaut niait.

      La première : rien n'est marqué pour lui. Marquer d'abord ferait
      d'un `451` — la réponse la plus banale d'un relais sous charge — une
      alerte définitivement perdue, sur le message qu'on ne peut pas ne
      pas envoyer.

      La seconde : **les autres sont prévenus quand même**. C'est tout
      l'objet du correctif ; la passe s'arrêtait au premier dossier en
      échec et laissait les suivants sans rien.
    */
    const v1 = await regle(brute.rules);
    const perdue = CONDITIONS.find((c) => c.bloquant)!;
    const v2 = await regle({
      ...(brute.rules as object),
      conditions: CONDITIONS.filter((c) => c.code !== perdue.code),
    });
    const trois = [await dossierPret(v1.id), await dossierPret(v1.id), await dossierPret(v1.id)];

    differees.add(trois[1]!.user.email);
    const coupure = await propagerLaPublication(v1.id, v2.id);
    verifier(
      coupure.alertes === 2 && coupure.aReprendre === 1,
      `deux sont prévenus, un est repris (${JSON.stringify(coupure)})`,
    );
    verifier(doitRejouer(coupure), "et la passe demande à être rejouée");

    const empeche = await etat(trois[1]!.application.id);
    verifier(
      empeche.status === "PRET",
      `celui qu'on n'a pas joint n'est pas mis en pause (${empeche.status})`,
    );
    verifier(
      (await db.notification.count({ where: { applicationId: trois[1]!.application.id } })) === 0,
      "aucune notification ne lui est écrite : rien ne le dit prévenu",
    );
    for (const i of [0, 2]) {
      const a = await etat(trois[i]!.application.id);
      verifier(
        a.status === "SUSPENDU",
        `dossier ${i + 1} : prévenu malgré l'échec du second (${a.status})`,
      );
    }

    // Le relais se dégage : la reprise le joint, et ne réalerte pas les autres.
    differees.clear();
    const reprise = await propagerLaPublication(v1.id, v2.id);
    verifier(
      reprise.alertes === 1 && reprise.aReprendre === 0,
      `la reprise prévient le dernier (${JSON.stringify(reprise)})`,
    );
    verifier(!doitRejouer(reprise), "et ne demande plus rien");
    const joint = await etat(trois[1]!.application.id);
    verifier(joint.status === "SUSPENDU", `il est mis en pause à son tour (${joint.status})`);
    verifier(
      recus.filter((r) => r.vers.includes(trois[1]!.user.email)).length === 1,
      "et reçoit son email une fois, pas deux",
    );
  }

  console.log("\nWF-11 — un dossier qui échoue ne fait plus tomber les autres");
  {
    /*
      L'échec imprévu, et non plus la coupure : le candidat du deuxième
      dossier supprime son compte pendant la passe. La ligne a été lue,
      elle n'existe plus quand on écrit — le genre d'accident qu'aucune
      relecture n'évite, et qui emportait toute la liste.

      La course est provoquée depuis le serveur de messagerie : la
      suppression a lieu pendant l'envoi du courrier du premier dossier,
      donc entre la lecture de la liste et le traitement du deuxième.
    */
    const v1 = await regle(brute.rules);
    const perdue = CONDITIONS.find((c) => c.bloquant)!;
    const v2 = await regle({
      ...(brute.rules as object),
      conditions: CONDITIONS.filter((c) => c.code !== perdue.code),
    });
    const trois = [await dossierPret(v1.id), await dossierPret(v1.id), await dossierPret(v1.id)];

    auPremierMessage = async () => {
      await db.user.delete({ where: { id: trois[1]!.user.id } });
    };
    const bilan = await propagerLaPublication(v1.id, v2.id);
    verifier(
      bilan.alertes === 2 && bilan.aReprendre === 1,
      `le dossier disparu est compté à part (${JSON.stringify(bilan)})`,
    );
    verifier(bilan.incidents.length === 1, "et l'incident est nommé, pas avalé");
    const dernier = await etat(trois[2]!.application.id);
    verifier(
      dernier.status === "SUSPENDU",
      `le troisième est prévenu malgré tout (${dernier.status})`,
    );
  }

  console.log("\nWF-11 — une divergence majeure ne se répète pas quand la file rejoue");
  {
    /*
      Le cas où la reprise mord pour de bon : un impact **majeur** ne met
      pas le dossier en pause, il reste donc `ACTIF` et la passe suivante
      le re-sélectionne. C'est là que le candidat recevait une seconde
      notification identique à chaque reprise — et la file rejouait, parce
      que la passe levait sur le premier dossier prêt.

      La divergence est majeure ici parce qu'une pièce obligatoire
      apparaît : aucune condition bloquante ne disparaît, donc rien n'est
      critique.
    */
    const v1 = await regle(brute.rules);
    const v2 = await regle({
      ...(brute.rules as object),
      pieces_requises: [
        ...PIECES,
        {
          code: "attestation_logement",
          libelle: "Attestation de logement",
          obligatoire: true,
          traduction_assermentee: false,
          legalisation: false,
        },
      ],
    });
    const p = await dossierPret(v1.id);

    const premiere = await propagerLaPublication(v1.id, v2.id);
    verifier(
      premiere.alertes === 1 && premiere.critiques === 0,
      `le dossier est alerté sans être mis en pause (${JSON.stringify(premiere)})`,
    );
    const apres = await etat(p.application.id);
    verifier(apres.status === "PRET", `il reste prêt (${apres.status})`);

    const reprise = await propagerLaPublication(v1.id, v2.id);
    verifier(
      reprise.dossiers === 1 && reprise.alertes === 0 && reprise.dejaAlertes === 1,
      `la reprise le retrouve et ne le réalerte pas (${JSON.stringify(reprise)})`,
    );
    const notifications = await db.notification.count({
      where: { applicationId: p.application.id, kind: "REGLEMENTATION" },
    });
    verifier(notifications === 1, `une seule notification après deux passes (${notifications})`);

    /*
      Et l'arbitrage depuis un dossier réellement **prêt** — l'impact
      majeur ne l'a pas mis en pause, il porte donc toujours sa
      `readyAt`. C'est le cas que « je migre » ne passait pas, et il
      échappe au bloc critique où le dossier est suspendu avant d'être
      arbitré.
    */
    const migration = (await db.ruleMigration.findFirst({
      where: { applicationId: p.application.id },
    }))!;
    const arbitrage = await arbitrerLaDivergence(await etat(p.application.id), migration.id, "MIGRER");
    verifier(arbitrage.decision === "MIGRER", "un dossier prêt peut migrer");
    verifier(
      arbitrage.piecesAjoutees.length === 1,
      `la pièce nouvellement exigée est ajoutée (${arbitrage.piecesAjoutees.join(", ")})`,
    );
    const migre = await etat(p.application.id);
    verifier(migre.visaRuleId === v2.id, "il suit la nouvelle version");
    verifier(
      migre.status === "ACTIF" && migre.readyAt === null,
      `et il n'est plus prêt : une pièce lui manque (${migre.status})`,
    );
  }

  console.log("\nWF-05 — un second pack acheté sur un dossier déjà prêt");
  {
    /*
      Le quota d'analyses s'épuise avant le dossier : acheter un second
      pack une fois la checklist complète est le cas le plus banal, et
      c'est le seul chemin par lequel une transaction confirmée touche
      l'état du dossier. Il écrivait `ACTIF` sans retirer `readyAt`, donc
      la transaction entière était refusée — le pack payé, le crédit
      perdu, et le fournisseur ayant déjà encaissé.
    */
    const r = await regle(brute.rules);
    const { user, application } = await dossierPret(r.id);

    let numero = 0;
    const ouvreur: Ouvreur = {
      fournisseur: "STRIPE",
      async creer(demande) {
        numero += 1;
        return {
          issue: "ouverte",
          session: {
            providerTxId: `stripe:cs_${numero}`,
            url: "https://checkout.exemple.test/session",
            montant: demande.montant,
            devise: demande.devise,
          },
        };
      },
      async retrouver(providerTxId) {
        return {
          issue: "ouverte",
          session: {
            providerTxId,
            url: "https://checkout.exemple.test/session",
            montant: 0,
            devise: "EUR",
          },
        };
      },
    };

    const ouvert = await ouvrirLeTunnel(
      user.id,
      { type: "pack", code: "dossier", applicationId: application.id },
      "EUR",
      ouvreur,
    );
    const ligne = await db.transaction.findFirstOrThrow({ where: { userId: user.id } });
    const issue = await appliquerLaNotification({
      providerEventId: "stripe:evt_transitions",
      providerTxId: ligne.providerTxId!,
      reference: ouvert.reference,
      statut: "CONFIRMEE",
    });
    verifier(issue.issue === "creditee", `la notification crédite (${issue.issue})`);

    const credits = await db.analysisCredit.count({ where: { applicationId: application.id } });
    verifier(credits > 0, `le pack payé est crédité (${credits} ligne(s))`);
    const apres = await etat(application.id);
    verifier(
      apres.status === "PRET" && apres.readyAt !== null,
      `et le dossier reste prêt (${apres.status})`,
    );
  }

  console.log("\nRG-10.4 — la purge sur demande, sur un dossier prêt");
  {
    const r = await regle(brute.rules);
    const { user, application } = await dossierPret(r.id);
    const bilan = await purgerSurDemande(user.id);
    verifier(bilan.dossiers === 1, `le dossier est purgé (${JSON.stringify(bilan)})`);
    const apres = await etat(application.id);
    verifier(apres.status === "ARCHIVE", `il passe à ARCHIVE (${apres.status})`);
    verifier(apres.readyAt === null, "et la date de mise en état est retirée");
    verifier(apres.purgedAt !== null, "la purge est datée : INV-5 est tenu jusqu'au bout");

    /*
      Et le brouillon, qui n'a figé aucune version : INV-3 lui interdit de
      passer au-delà de `BROUILLON`, la base le refuse, et la purge doit
      donc le purger **sans** l'archiver. La garantie était tenue par une
      assertion qui relisait le texte de l'expression ; elle est éprouvée
      ici depuis que l'état passe par `miseEnEtat`.
    */
    const brouillon = await db.user.create({
      data: { email: `fumee-tr-brouillon-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const sansRegle = await db.application.create({
      data: { userId: brouillon.id, status: "BROUILLON" },
    });
    await purgerSurDemande(brouillon.id);
    const reste = await etat(sansRegle.id);
    verifier(reste.status === "BROUILLON", `le brouillon n'est pas archivé (${reste.status})`);
    verifier(reste.purgedAt !== null, "et il est purgé quand même (RG-10.4)");
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  await db.$disconnect();
  await new Promise<void>((ok) => smtp.close(() => ok()));
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nToutes les transitions passent.");
