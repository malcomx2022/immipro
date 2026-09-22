/**
 * Le remboursement sortant, de bout en bout, sur une base réelle.
 *
 * Les adaptateurs s'éprouvent contre un `fetch` simulé, dans
 * `tests/remboursement-sortant.test.ts`. Ce qui demande une base — deux
 * reprises à la même milliseconde, le retrait de droits qui ne doit
 * avoir lieu qu'une fois, la dette qui reste visible jusqu'à la
 * notification signée — s'éprouve ici, sur PostgreSQL.
 *
 * **Aucun appel réseau, aucun virement.** Le rembourseur est injecté :
 * ce qui est vérifié, c'est l'enchaînement de la plateforme.
 *
 * La base est jetable : créée et supprimée par ce script.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:remboursement
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_remboursement_${process.pid}`;
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

console.log(`Remboursement sortant sur une base jetable (${nomBase})`);
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
const { initierLeRemboursement, ouvrirUnRemboursement, appliquerLaNotification } = await import(
  "../src/server/acces/paiements"
);
const { ouvrirDuQuota, debiterUneAnalyse } = await import("../src/server/acces/quota");
type Rembourseur = import("../src/server/paiement/rembourseur").Rembourseur;
type Remboursement = import("../src/server/paiement/rembourseur").Remboursement;

/**
 * Un rembourseur simulé qui compte ce qu'on lui demande.
 *
 * Il enregistre **chaque** demande reçue, clé comprise : c'est le point
 * du test de concurrence — deux reprises ne doivent pas produire deux
 * demandes, et c'est ici qu'on le voit. Il ne reconnaît pas les rejeux à
 * la place du fournisseur : ce serait cacher le défaut qu'on cherche.
 */
function rembourseurSimule(
  reponses: Remboursement[] | ((n: number) => Remboursement),
): Rembourseur & { demandes: Array<{ reference: string; cle: string; providerTxId: string }> } {
  const demandes: Array<{ reference: string; cle: string; providerTxId: string }> = [];
  return {
    fournisseur: "STRIPE",
    operationnel: true,
    demandes,
    async demander(demande) {
      const rang = demandes.length;
      demandes.push({
        reference: demande.reference,
        cle: demande.cle,
        providerTxId: demande.providerTxId,
      });
      if (typeof reponses === "function") return reponses(rang);
      return reponses[Math.min(rang, reponses.length - 1)]!;
    },
  };
}

const ACCEPTEE: Remboursement = {
  issue: "acceptee",
  accepteLe: new Date("2026-09-22T10:00:00.000Z"),
  providerRefundId: "stripe:re_1",
};
const TEMPORAIRE: Remboursement = { issue: "temporaire", detail: "réseau" };

let rang = 0;

/** Un candidat, son dossier, et une transaction confirmée et remboursable. */
async function candidatPaye(options: { analyses?: number; providerTxId?: string | null } = {}) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-r-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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
    data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
  });
  const transaction = await db.transaction.create({
    data: {
      reference: `IMP-260922-${String(rang).padStart(6, "0")}`,
      userId: user.id,
      applicationId: application.id,
      packCode: "dossier",
      amount: 29,
      currency: "EUR",
      provider: "STRIPE",
      status: "CONFIRMEE",
      confirmedAt: new Date("2026-09-20T10:00:00.000Z"),
      // Unique en base : chaque candidat de fumée a le sien.
      providerTxId:
        options.providerTxId === undefined
          ? `stripe:cs_${rang}_${process.pid}`
          : options.providerTxId,
    },
  });
  if (options.analyses) {
    await ouvrirDuQuota({
      applicationId: application.id,
      analyses: options.analyses,
      motif: "ACHAT_PACK",
      transactionId: transaction.id,
      note: "Pack Dossier",
    });
  }
  await ouvrirUnRemboursement(transaction.id, "Geste de support — essai de fumée");
  return { user, application, transaction };
}

const solde = async (applicationId: string): Promise<number> => {
  const lignes = await db.analysisCredit.findMany({ where: { applicationId } });
  return lignes.reduce((total, l) => total + l.delta, 0);
};

try {
  // ── 1. Deux reprises à la même milliseconde ─────────────────────────
  console.log("\nDeux reprises concurrentes");
  {
    const { application, transaction } = await candidatPaye({ analyses: 30 });
    const rembourseur = rembourseurSimule([ACCEPTEE]);

    /*
      Le cœur du lot. Les deux appels partent ensemble : sans réservation
      préalable, tous deux lisent la même ligne, tous deux appellent le
      fournisseur, et tous deux retirent les droits. La clé d'idempotence
      protège le fournisseur — elle ne protège ni le grand livre, ni le
      compteur, et elle suppose qu'il l'honore.
    */
    const [a, b] = await Promise.all([
      initierLeRemboursement(transaction.reference, rembourseur),
      initierLeRemboursement(transaction.reference, rembourseur),
    ]);

    const issues = [a.issue, b.issue].sort();
    verifier(
      issues.join(",") === "acceptee,deja_en_cours",
      `une seule reprise passe (${issues.join(" / ")})`,
    );
    verifier(
      rembourseur.demandes.length === 1,
      `une seule demande part chez le fournisseur (${rembourseur.demandes.length})`,
    );

    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundAttempts === 1, `une seule tentative comptée (${apres.refundAttempts})`);
    verifier(apres.refundRequestedAt !== null, "la demande est datée comme acceptée");

    const retraits = await db.analysisCredit.count({
      where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
    });
    verifier(retraits === 1, `les droits sont retirés une seule fois (${retraits})`);
    verifier((await solde(application.id)) === 0, `le solde retombe à zéro, pas en dessous`);
  }

  // ── 2. La dette reste due jusqu'à la notification signée ────────────
  console.log("\nLa demande acceptée n'est pas un versement");
  {
    const { transaction } = await candidatPaye({ analyses: 10 });
    const rembourseur = rembourseurSimule([ACCEPTEE]);
    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(issue.issue === "acceptee", `la demande est acceptée (${issue.issue})`);

    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundedAt === null, "aucun versement n'est écrit");
    verifier(apres.status === "CONFIRMEE", `l'état ne bouge pas (${apres.status})`);
    verifier(apres.refundDueAt !== null, "la dette reste due, et visible en B-04");

    /*
      Puis la notification signée arrive, et elle seule écrit le
      versement. C'est la frontière d'INV-7 : tout ce qui précède est une
      demande, y compris un appel API qui a rendu 200.
    */
    const suite = await appliquerLaNotification({
      providerEventId: `stripe:evt_remb_${process.pid}`,
      providerTxId: apres.providerTxId!,
      reference: apres.reference,
      statut: "REMBOURSEE",
    });
    verifier(suite.issue !== "refusee", `la notification s'applique (${suite.issue})`);

    const finale = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(finale.status === "REMBOURSEE", `l'état devient REMBOURSEE (${finale.status})`);
    verifier(finale.refundedAt !== null, "et c'est elle qui date le versement");
  }

  // ── 3. Reprise opérateur après un échec passager ────────────────────
  console.log("\nReprise après un échec passager");
  {
    const { application, transaction } = await candidatPaye({ analyses: 30 });
    const rembourseur = rembourseurSimule([TEMPORAIRE, ACCEPTEE]);

    const premier = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(premier.issue === "temporaire", `le premier envoi échoue (${premier.issue})`);
    const apresUn = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apresUn.refundRequestedAt === null, "rien n'est déclaré demandé");
    verifier(apresUn.refundDueAt !== null, "la dette reste");
    verifier(apresUn.refundAttempts === 1, `la tentative est comptée (${apresUn.refundAttempts})`);

    const second = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(second.issue === "acceptee", `la reprise passe (${second.issue})`);
    verifier(
      rembourseur.demandes.length === 2 &&
        rembourseur.demandes[0]!.cle === rembourseur.demandes[1]!.cle,
      "les deux tentatives portent la même clé d'idempotence",
    );
    const apresDeux = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apresDeux.refundAttempts === 2, `deux tentatives comptées (${apresDeux.refundAttempts})`);
    verifier(
      (await db.analysisCredit.count({
        where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
      })) === 1,
      "les droits ne sont retirés qu'une fois malgré deux tentatives",
    );
    verifier((await solde(application.id)) === 0, "et le solde ne passe pas sous zéro");

    // Une troisième reprise sur une demande déjà acceptée n'envoie rien.
    const troisieme = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(troisieme.issue === "deja_en_cours", `la reprise est sans effet (${troisieme.issue})`);
    verifier(rembourseur.demandes.length === 2, "et aucune troisième demande ne part");
  }

  // ── 4. Refus définitif et réponse illisible ─────────────────────────
  console.log("\nRefus définitif et réponse illisible");
  {
    const { transaction } = await candidatPaye();
    const refus = rembourseurSimule([
      { issue: "refusee_definitivement", detail: "charge_already_refunded" },
    ]);
    const issue = await initierLeRemboursement(transaction.reference, refus);
    verifier(issue.issue === "refusee_definitivement", `le refus est rendu tel quel (${issue.issue})`);
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundDueAt !== null && apres.refundedAt === null, "la dette reste entière");
    verifier(
      (apres.discrepancy ?? "").includes("charge_already_refunded"),
      "l'écart porte la question à un humain",
    );
  }
  {
    const { transaction } = await candidatPaye();
    const illisible = rembourseurSimule([
      { issue: "reponse_illisible", detail: "état de remboursement non reconnu" },
    ]);
    const issue = await initierLeRemboursement(transaction.reference, illisible);
    verifier(issue.issue === "reponse_illisible", `rien n'est conclu (${issue.issue})`);
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundRequestedAt === null, "ni accepté");
    verifier(apres.refundedAt === null, "ni versé");
    verifier((apres.discrepancy ?? "") !== "", "et un humain est appelé");
  }

  // ── 5. Une panne réseau n'ouvre pas d'écart ─────────────────────────
  console.log("\nUne panne n'appelle pas un humain");
  {
    const { transaction } = await candidatPaye();
    await initierLeRemboursement(transaction.reference, rembourseurSimule([TEMPORAIRE]));
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(
      apres.discrepancy === null,
      "aucun écart : une coupure se reprend, elle ne se tranche pas",
    );
  }

  // ── 6. L'identifiant fournisseur ────────────────────────────────────
  console.log("\nL'identifiant fournisseur est vérifié avant tout appel");
  {
    const { transaction } = await candidatPaye({ providerTxId: null });
    const rembourseur = rembourseurSimule([ACCEPTEE]);
    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(
      issue.issue === "identifiant_inutilisable" && issue.detail === "absent",
      `l'absence est reconnue (${issue.issue}/${issue.detail})`,
    );
    verifier(rembourseur.demandes.length === 0, "aucune demande ne part");
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundAttempts === 0, `aucune tentative n'est comptée (${apres.refundAttempts})`);
    verifier((apres.discrepancy ?? "").length > 0, "et l'écart le dit");
  }
  {
    const { transaction } = await candidatPaye({ providerTxId: `fedapay:${rang}_${process.pid}` });
    const rembourseur = rembourseurSimule([ACCEPTEE]);
    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(
      issue.issue === "identifiant_inutilisable" && issue.detail === "autre_fournisseur",
      `l'identifiant de l'autre rail est refusé (${issue.detail})`,
    );
    verifier(rembourseur.demandes.length === 0, "et rien ne part vers un paiement étranger");
  }

  // ── 7. Le pack partiellement consommé ───────────────────────────────
  console.log("\nPack partiellement consommé");
  {
    const { application, transaction } = await candidatPaye({ analyses: 30 });
    await debiterUneAnalyse(application.id);
    const rembourseur = rembourseurSimule([ACCEPTEE]);

    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(issue.issue === "revue_manuelle", `la revue manuelle l'emporte (${issue.issue})`);
    verifier(issue.consommees === 1, `et compte ce qui a servi (${issue.consommees})`);
    verifier(rembourseur.demandes.length === 0, "aucune demande n'est envoyée");

    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundAttempts === 0, "aucune tentative n'est comptée");
    verifier(
      (apres.discrepancy ?? "").includes("à trancher à la main"),
      "l'écart porte la question à un humain",
    );
    verifier(
      (await db.analysisCredit.count({
        where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
      })) === 0,
      "et aucun droit n'est retiré : le solde du candidat ne bouge pas",
    );
    verifier((await solde(application.id)) === 29, `le solde reste celui qu'il était (29)`);
  }

  // ── 8. L'index reste partiel ────────────────────────────────────────
  console.log("\nL'index ne parle que des remboursements");
  {
    const { application, transaction } = await candidatPaye({ analyses: 30 });
    await initierLeRemboursement(transaction.reference, rembourseurSimule([ACCEPTEE]));
    /*
      Un octroi et un retrait citent la même transaction : le pack l'a
      ouverte, le remboursement la referme. L'index ne doit pas les
      confondre — il ne contraint que les lignes de remboursement.
    */
    const octrois = await db.analysisCredit.count({
      where: { transactionId: transaction.id, reason: "ACHAT_PACK" },
    });
    verifier(octrois === 1, "l'octroi du pack coexiste avec le retrait");
    const geste = await db.analysisCredit
      .create({
        data: {
          applicationId: application.id,
          delta: 5,
          reason: "GESTE_COMMERCIAL",
          transactionId: transaction.id,
          note: "Un autre motif sur la même transaction.",
        },
      })
      .catch(() => null);
    verifier(geste !== null, "et un autre motif sur la même transaction passe");

    // Un second remboursement, lui, est refusé — par la base, pas par
    // l'appelant : c'est ce qui tient quand un appelant qu'on n'a pas
    // écrit s'y essaie.
    const second = await db.analysisCredit
      .create({
        data: {
          applicationId: application.id,
          delta: -1,
          reason: "REMBOURSEMENT",
          transactionId: transaction.id,
          note: "Un second retrait, que la base doit refuser.",
        },
      })
      .catch(() => null);
    verifier(second === null, "un second retrait de remboursement est refusé par la base");
  }
} finally {
  await db.$disconnect().catch(() => {});
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

console.log(
  echecs.length === 0
    ? "\nLa demande part une fois, la dette reste, et seule la notification signée la solde."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
