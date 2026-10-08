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
 * Le rail FedaPay (S.91) passe par son **vrai** adaptateur : FedaPay n'a
 * pas d'API de remboursement, il n'y a donc rien à simuler — et surtout
 * pas un succès. `fetch` est remplacé par un piège qui compte : un seul
 * appel réseau sur ce rail ferait échouer la fumée.
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
const {
  initierLeRemboursement,
  ouvrirUnRemboursement,
  appliquerLaNotification,
  declarerLeRemboursementManuel,
} = await import("../src/server/acces/paiements");
const { remboursementFedaPay } = await import("../src/server/paiement/fedapay");
const { dettesFedaPay } = await import("../src/server/lecture/backoffice");
const { EchecHttp } = await import("../src/server/http/echecs");
const { ouvrirDuQuota, debiterUneAnalyse } = await import("../src/server/acces/quota");
const { relancerLesRemboursements } = await import("../src/server/jobs/relances");
const { TENTATIVES_AVANT_HUMAIN, REPOS_AVANT_RELANCE_MINUTES, A_REMBOURSER_A_LA_MAIN } =
  await import("../src/domain/paiement/remboursement");
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

/**
 * L'accusé du fournisseur, daté **au moment où il répond**.
 *
 * Il portait une date fixe, `2026-09-22T10:00:00Z`. La fumée passait le
 * matin et échouait l'après-midi : `refundDueAt` est posée à l'ouverture
 * de la dette, donc à l'heure du run, et la base refuse une demande
 * antérieure à la décision qui l'ouvre
 * (`transaction_demande_apres_la_decision`). Après dix heures UTC, la
 * date figée passait avant l'ouverture, et la garde — qui fait son
 * travail — arrêtait toute la fumée.
 *
 * Une fonction et non une constante : évaluée au chargement du module,
 * même `new Date()` précéderait de quelques millisecondes l'ouverture
 * de la dette, et le défaut reviendrait sous une forme plus difficile à
 * lire.
 */
const acceptee = (): Remboursement => ({
  issue: "acceptee",
  accepteLe: new Date(),
  providerRefundId: "stripe:re_1",
});
const TEMPORAIRE: Remboursement = { issue: "temporaire", detail: "réseau" };

let rang = 0;

/** Un candidat, son dossier, et une transaction confirmée et remboursable. */
async function candidatPaye(
  options: {
    analyses?: number;
    providerTxId?: string | null;
    fedapay?: boolean;
    /** Analyses consommées avant l'ouverture de la dette (RG-15.2). */
    consommees?: number;
    /** Le dossier est déclaré déposé avant l'ouverture (RG-15.2). */
    depose?: boolean;
  } = {},
) {
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
      amount: options.fedapay ? 25_000 : 29,
      currency: options.fedapay ? "XOF" : "EUR",
      provider: options.fedapay ? "FEDAPAY" : "STRIPE",
      status: "CONFIRMEE",
      confirmedAt: new Date("2026-09-20T10:00:00.000Z"),
      // Unique en base : chaque candidat de fumée a le sien.
      providerTxId:
        options.providerTxId === undefined
          ? options.fedapay
            ? `fedapay:${rang}${process.pid}`
            : `stripe:cs_${rang}_${process.pid}`
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
  for (let n = 0; n < (options.consommees ?? 0); n += 1) await debiterUneAnalyse(application.id);
  if (options.depose) {
    const maintenant = new Date();
    await db.application.update({
      where: { id: application.id },
      data: { status: "SOUMIS", submittedAt: maintenant, depositedOn: maintenant },
    });
  }
  const ouverture = await ouvrirUnRemboursement(transaction.id, "Geste de support — essai de fumée");
  return { user, application, transaction, ouverture };
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
    const rembourseur = rembourseurSimule([acceptee()]);

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
    const rembourseur = rembourseurSimule([acceptee()]);
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
    const rembourseur = rembourseurSimule([TEMPORAIRE, acceptee()]);

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
    const rembourseur = rembourseurSimule([acceptee()]);
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
    const rembourseur = rembourseurSimule([acceptee()]);
    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(
      issue.issue === "identifiant_inutilisable" && issue.detail === "autre_fournisseur",
      `l'identifiant de l'autre rail est refusé (${issue.detail})`,
    );
    verifier(rembourseur.demandes.length === 0, "et rien ne part vers un paiement étranger");
  }

  // ── 7. Le pack entamé — RG-15.2, décision du 06/10/2026 ───────────
  console.log("\nPack entamé : remboursé au prorata des analyses restantes (RG-15.2)");
  {
    /*
      a. Entamé après l'ouverture : la somme se refixe sous le verrou.
      Le pack « dossier » de la fumée est payé 29 € pour 30 analyses.
      Ouverte intacte, la dette porte le prix entier ; une analyse
      consommée avant l'envoi la fait passer à 29 € × 29 ÷ 30 = 28,0333…
      € → 28,03 €, arrondi au centime inférieur. C'est cette somme, et
      non celle de l'ouverture, qui part chez Stripe.
    */
    const { application, transaction } = await candidatPaye({ analyses: 30 });
    const ouverte = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(ouverte.refundAmount === 2900, `ouverte intacte, la dette porte le prix entier (${ouverte.refundAmount})`);
    await debiterUneAnalyse(application.id);

    const montants: number[] = [];
    const rembourseur = rembourseurSimule([acceptee()]);
    const enregistrer = rembourseur.demander.bind(rembourseur);
    rembourseur.demander = async (demande) => {
      montants.push(demande.montant);
      return enregistrer(demande);
    };
    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(issue.issue === "acceptee", `le prorata part sans revue manuelle (${issue.issue})`);
    verifier(
      montants.length === 1 && Math.round(montants[0]! * 100) === 2803,
      `la demande porte 28,03 €, et non 29 € (${montants.join(", ")})`,
    );
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundAmount === 2803, `la somme figée est en centimes (${apres.refundAmount})`);
    verifier(apres.discrepancy === null, "aucun écart : il n'y a rien à trancher");
    verifier((await solde(application.id)) === 0, "les 29 analyses restantes sont retirées");

    // Le rejeu ne refixe rien : les droits sont partis avec la somme.
    await initierLeRemboursement(transaction.reference, rembourseurSimule([acceptee()]));
    verifier(
      (await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } })).refundAmount === 2803,
      "une reprise ne change pas la somme",
    );

    // La notification signée solde la dette partielle comme une autre.
    const retour = await appliquerLaNotification({
      providerEventId: `stripe:evt_prorata_${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "REMBOURSEE",
    });
    const soldee = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(
      retour.issue === "appliquee" && soldee.status === "REMBOURSEE" && soldee.refundedAt !== null,
      `un remboursement partiel finit REMBOURSEE, daté (${retour.issue})`,
    );
    const avoir = await db.invoice.findFirst({ where: { transactionId: transaction.id, kind: "AVOIR" } });
    const facture = await db.invoice.findFirst({ where: { transactionId: transaction.id, kind: "FACTURE" } });
    verifier(
      avoir !== null && facture !== null && avoir.originId === facture.id,
      "l'avoir est émis et cite la facture d'origine",
    );
    verifier(
      avoir?.amountIncl === 2803 && facture?.amountIncl === 2900,
      `l'avoir porte la somme rendue, la facture le prix payé (${avoir?.amountIncl} / ${facture?.amountIncl})`,
    );
    verifier(
      avoir?.amountInWords === "vingt-huit euros et trois centimes",
      `sa somme en lettres suit (${avoir?.amountInWords})`,
    );
    verifier(
      (avoir?.designation ?? "").startsWith("Remboursement partiel de la facture"),
      "et sa désignation le dit partiel",
    );
  }
  {
    // b. L'exemple de la décision, en francs : 5 000 F, 10 analyses, 4 consommées.
    rang += 1;
    const user = await db.user.create({
      data: { email: `fumee-r-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    // La règle d'un dossier précédent : seule compte ici la grille.
    const regle = await db.visaRule.findFirstOrThrow({ select: { id: true } });
    const application = await db.application.create({
      data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
    });
    const transaction = await db.transaction.create({
      data: {
        reference: `IMP-261006-${String(rang).padStart(6, "0")}`,
        userId: user.id,
        applicationId: application.id,
        packCode: "essentiel",
        amount: 5000,
        currency: "XOF",
        provider: "FEDAPAY",
        status: "CONFIRMEE",
        confirmedAt: new Date(),
        providerTxId: `fedapay:${rang}${process.pid}`,
      },
    });
    await ouvrirDuQuota({
      applicationId: application.id,
      analyses: 10,
      motif: "ACHAT_PACK",
      transactionId: transaction.id,
      note: "Pack Essentiel",
    });
    for (let n = 0; n < 4; n += 1) await debiterUneAnalyse(application.id);
    const ouverture = await ouvrirUnRemboursement(transaction.id, "Geste de support — prorata");
    const ouverte = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(ouverture.ouvert && ouverte.refundAmount === 3000, `l'obligation porte 3 000 F (${ouverte.refundAmount})`);
    const envoi = await initierLeRemboursement(transaction.reference, remboursementFedaPay());
    verifier(envoi.issue === "procedure_manuelle", `FedaPay : procédure manuelle (${envoi.issue})`);
    const initiee = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(
      (initiee.discrepancy ?? "")
        .replace(/\s/gu, " ")
        .includes("Montant à rembourser : 3 000 F CFA sur 5 000 F CFA payés"),
      "l'écart dit la somme exacte à rembourser au tableau de bord",
    );
    const dette = (await dettesFedaPay()).find((d) => d.reference === transaction.reference);
    verifier(
      dette?.montant === 5000 && dette.montantARendre === 3000,
      `B-04 montre 3 000 F à rendre sur 5 000 F payés (${dette?.montantARendre})`,
    );
    verifier((await solde(application.id)) === 0, "les 6 analyses restantes sont retirées");
  }
  {
    // c. Dossier déclaré déposé : la règle d'avant, la revue manuelle.
    const { application, transaction } = await candidatPaye({ analyses: 30, consommees: 1, depose: true });
    const ouverte = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(ouverte.refundDueAt !== null && ouverte.refundAmount === null, "l'obligation s'ouvre sans montant fixé");
    const rembourseur = rembourseurSimule([acceptee()]);

    const issue = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(issue.issue === "revue_manuelle", `la revue manuelle l'emporte (${issue.issue})`);
    verifier(issue.consommees === 1, `et compte ce qui a servi (${issue.consommees})`);
    verifier(rembourseur.demandes.length === 0, "aucune demande n'est envoyée");

    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(apres.refundAttempts === 0, "aucune tentative n'est comptée");
    verifier(
      (apres.discrepancy ?? "").includes("déclaré déposé") &&
        (apres.discrepancy ?? "").includes("À trancher à la main"),
      "l'écart porte la question à un humain, et dit pourquoi",
    );
    verifier(
      (await db.analysisCredit.count({
        where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
      })) === 0,
      "et aucun droit n'est retiré : le solde du candidat ne bouge pas",
    );
    verifier((await solde(application.id)) === 29, `le solde reste celui qu'il était (29)`);
  }
  {
    // d. Tout consommé : aucune obligation, et la raison le dit.
    const { transaction, ouverture } = await candidatPaye({ analyses: 30, consommees: 30 });
    verifier(
      !ouverture.ouvert && /ont toutes été consommées/u.test(ouverture.raison),
      `rien à rendre : l'obligation ne s'ouvre pas (${ouverture.ouvert ? "ouverte" : ouverture.raison})`,
    );
    const lue = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(lue.refundDueAt === null && lue.refundAmount === null, "et rien n'est écrit");
  }
  {
    // e. La base refuse une somme supérieure au paiement, nulle, ou sans obligation.
    const { transaction } = await candidatPaye({ analyses: 30 });
    const trop = await db.transaction
      .update({ where: { id: transaction.id }, data: { refundAmount: 2901 } })
      .then(() => true, () => false);
    verifier(!trop, "la base refuse de rendre plus que le paiement");
    const nulle = await db.transaction
      .update({ where: { id: transaction.id }, data: { refundAmount: 0 } })
      .then(() => true, () => false);
    verifier(!nulle, "et une somme nulle");
    const { transaction: sansDette } = await candidatPaye({ analyses: 30, consommees: 30 });
    const orpheline = await db.transaction
      .update({ where: { id: sansDette.id }, data: { refundAmount: 100 } })
      .then(() => true, () => false);
    verifier(!orpheline, "et une somme sans obligation");
  }

  console.log("\nLa base du prorata est celle de la vente (M5, D-12)");
  {
    /*
      Le dénominateur se lisait sur la grille du jour. Reproduit avant
      correction : un Dossier vendu pour 30 analyses, 25 consommées, et la
      grille passée à 20 en cours de processus — le prorata lisait 20 − 25
      et concluait « rien à rendre », alors que 5 analyses payées restaient.
    */
    const { getPack } = await import("../src/domain/payments/pricing");
    const grille = getPack("dossier")!;
    const venduPour = grille.analyses;
    rang += 1;
    const user = await db.user.create({
      data: { email: `fumee-r-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const regle = await db.visaRule.findFirstOrThrow({ select: { id: true } });
    const application = await db.application.create({
      data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
    });
    const transaction = await db.transaction.create({
      data: {
        reference: `IMP-261008-${String(rang).padStart(6, "0")}`,
        userId: user.id,
        applicationId: application.id,
        packCode: "dossier",
        packAnalyses: venduPour,
        packDestinations: 1,
        amount: 15000,
        currency: "XOF",
        provider: "FEDAPAY",
        status: "CONFIRMEE",
        confirmedAt: new Date(),
        providerTxId: `fedapay:${rang}${process.pid}`,
      },
    });
    await ouvrirDuQuota({
      applicationId: application.id,
      analyses: venduPour,
      motif: "ACHAT_PACK",
      transactionId: transaction.id,
      note: "Pack Dossier",
    });
    for (let n = 0; n < 25; n += 1) await debiterUneAnalyse(application.id);
    grille.analyses = 20;
    try {
      const ouverture = await ouvrirUnRemboursement(transaction.id, "Geste de support — grille révisée");
      const lue = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
      verifier(
        ouverture.ouvert && lue.refundAmount === 2500,
        `15 000 × 5 ÷ 30 = 2 500 F, et non « rien à rendre » (${ouverture.ouvert ? lue.refundAmount : ouverture.raison})`,
      );
    } finally {
      grille.analyses = venduPour;
    }
  }

  console.log("\nUne revue manuelle se tranche : somme, zéro, Pro sur trois dossiers (M4, D-11)");
  {
    /*
      Avant correction, une revue manuelle n'avait pas d'issue : la somme
      ne s'écrivait nulle part, la déclaration FedaPay refusait une dette
      jamais initiée (« non_initiee »), et la notification aurait produit un
      avoir du prix entier.
    */
    const module = (await import("../src/server/acces/paiements")) as Record<string, unknown>;
    const trancher = module.trancherLaRevueManuelle as
      | ((
          reference: string,
          saisie: string,
          motif: string,
          acteurId: string,
          maintenant?: Date,
          rembourseur?: unknown,
        ) => Promise<{ issue: string; envoi?: string }>)
      | undefined;
    verifier(typeof trancher === "function", "une action tranche la revue manuelle");
    const admin = await db.user.create({
      data: { email: `fumee-tranche-${process.pid}@exemple.test`, role: "ADMIN" },
    });
    const code = async (geste: () => Promise<unknown>): Promise<string> => {
      try {
        await geste();
        return "aucun";
      } catch (erreur) {
        return erreur instanceof EchecHttp ? erreur.echec.code : `inattendu: ${String(erreur)}`;
      }
    };

    // a. Une somme : 4 000 F sur 15 000, dossier déclaré déposé.
    const a = await candidatPaye({ analyses: 30, consommees: 1, depose: true, fedapay: true });
    await db.transaction.update({ where: { id: a.transaction.id }, data: { amount: 15000 } });
    const revue = await initierLeRemboursement(a.transaction.reference, remboursementFedaPay());
    verifier(revue.issue === "revue_manuelle", `la dette part en revue (${revue.issue})`);
    verifier(
      (await code(() =>
        declarerLeRemboursementManuel(a.transaction.reference, "9901", admin.id),
      )) === "etat_incompatible",
      "sans tranche, la déclaration reste refusée : rien n'a été initié",
    );
    if (trancher) {
      verifier(
        (await code(() => trancher(a.transaction.reference, "15001", "Décision de la direction du 08/10", admin.id))) ===
          "champs_invalides",
        "une somme supérieure au prix payé est refusée",
      );
      const tranche = await trancher(
        a.transaction.reference,
        "4 000",
        "Décision de la direction du 08/10",
        admin.id,
        new Date(),
        remboursementFedaPay(),
      );
      verifier(
        tranche.issue === "decidee" && tranche.envoi === "procedure_manuelle",
        `la tranche fait partir la demande (${tranche.issue}, ${tranche.envoi})`,
      );
      const decidee = await db.transaction.findUniqueOrThrow({ where: { id: a.transaction.id } });
      verifier(decidee.refundAmount === 4000, `la somme décidée est figée (${decidee.refundAmount})`);
      verifier(
        decidee.refundDecidedBy === admin.id && decidee.refundDecidedAt !== null,
        "la décision porte qui l'a prise et quand",
      );
      verifier(
        decidee.discrepancyOutcome === "REMBOURSEMENT_A_INITIER" &&
          (decidee.discrepancyNote ?? "").includes("Décision de la direction du 08/10"),
        "l'écart se referme sur la décision, motif cité",
      );
      verifier((await solde(a.application.id)) === 0, "les 29 analyses restantes sont retirées");
      verifier(
        (await code(() => trancher(a.transaction.reference, "3000", "Seconde décision, refusée", admin.id))) ===
          "etat_incompatible",
        "une revue tranchée ne se retranche pas",
      );
      const declaration = await declarerLeRemboursementManuel(a.transaction.reference, "9901", admin.id);
      verifier(declaration.issue === "declaree", `la déclaration passe ensuite (${declaration.issue})`);
      await appliquerLaNotification({
        providerEventId: `fedapay:evt_tranche_${process.pid}`,
        providerTxId: a.transaction.providerTxId!,
        reference: a.transaction.reference,
        statut: "REMBOURSEE",
      });
      const avoir = await db.invoice.findFirst({
        where: { transactionId: a.transaction.id, kind: "AVOIR" },
      });
      verifier(avoir?.amountIncl === 4000, `l'avoir porte 4 000 F, et non le prix entier (${avoir?.amountIncl})`);

      // b. Zéro : l'obligation se referme, le candidat garde ses analyses.
      const b = await candidatPaye({ analyses: 30, consommees: 1, depose: true });
      await initierLeRemboursement(b.transaction.reference, rembourseurSimule([acceptee()]));
      const zero = await trancher(b.transaction.reference, "0", "Rien à rendre, décision du 08/10", admin.id);
      const refermee = await db.transaction.findUniqueOrThrow({ where: { id: b.transaction.id } });
      verifier(zero.issue === "refermee", `zéro referme la demande (${zero.issue})`);
      verifier(
        refermee.refundDueAt === null && refermee.refundAmount === null && refermee.status === "CONFIRMEE",
        "plus d'obligation, et rien n'est déclaré rendu (INV-7)",
      );
      verifier(
        refermee.discrepancyOutcome === "EXPLIQUE_SANS_CORRECTION" &&
          (refermee.discrepancyNote ?? "").includes("Geste de support"),
        "l'écart garde ce que la dette était et pourquoi elle se referme",
      );
      verifier((await solde(b.application.id)) === 29, "le candidat garde ses 29 analyses");
      const apresZero = await initierLeRemboursement(b.transaction.reference, rembourseurSimule([acceptee()]));
      verifier(apresZero.issue === "sans_objet", `plus rien ne part (${apresZero.issue})`);

      // c. Un Pro sur trois dossiers : les analyses restantes partent des trois.
      rang += 1;
      const user = await db.user.create({
        data: { email: `fumee-r-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
      });
      const regle = await db.visaRule.findFirstOrThrow({ select: { id: true } });
      const dossiers = await Promise.all(
        [0, 1, 2].map(() =>
          db.application.create({ data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" } }),
        ),
      );
      const pro = await db.transaction.create({
        data: {
          reference: `IMP-261008-${String(rang).padStart(6, "0")}`,
          userId: user.id,
          applicationId: dossiers[0]!.id,
          packCode: "pro",
          packAnalyses: 90,
          packDestinations: 3,
          amount: 59,
          currency: "EUR",
          provider: "STRIPE",
          status: "CONFIRMEE",
          confirmedAt: new Date(),
          providerTxId: `stripe:cs_pro_${rang}_${process.pid}`,
        },
      });
      for (const d of dossiers) {
        await ouvrirDuQuota({
          applicationId: d.id,
          analyses: 30,
          motif: "ACHAT_PACK",
          transactionId: pro.id,
          note: "Pack Dossier Pro",
        });
      }
      await debiterUneAnalyse(dossiers[1]!.id);
      await ouvrirUnRemboursement(pro.id, "Geste de support — Pro sur trois dossiers");
      const enRevue = await initierLeRemboursement(pro.reference, rembourseurSimule([acceptee()]));
      verifier(enRevue.issue === "revue_manuelle", `un Pro servi trois fois part en revue (${enRevue.issue})`);
      const rembourseur = rembourseurSimule([acceptee()]);
      const proTranche = await trancher(
        pro.reference,
        "40,00",
        "Décision de la direction : 40 € sur 59",
        admin.id,
        new Date(),
        rembourseur,
      );
      verifier(
        proTranche.issue === "decidee" && proTranche.envoi === "acceptee",
        `la demande part chez Stripe (${proTranche.issue}, ${proTranche.envoi})`,
      );
      const soldes = await Promise.all(dossiers.map((d) => solde(d.id)));
      verifier(
        soldes.every((n) => n === 0),
        `les analyses restantes partent des trois dossiers (${soldes.join(", ")})`,
      );
      verifier(
        (await db.analysisCredit.count({ where: { transactionId: pro.id, reason: "REMBOURSEMENT" } })) === 3,
        "un retrait par dossier servi",
      );
    }
  }

  // ── 8. La passe reprend ce que le premier envoi n'a pas emporté ─────
  console.log("\nLa passe reprend une dette restée décidée");
  {
    const { transaction } = await candidatPaye({ analyses: 30 });
    const rembourseur = rembourseurSimule([TEMPORAIRE, acceptee()]);

    const premier = await initierLeRemboursement(transaction.reference, rembourseur);
    verifier(premier.issue === "temporaire", `le premier envoi échoue (${premier.issue})`);
    const apres = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(
      apres.refundDueAt !== null && apres.refundRequestedAt === null,
      "la dette reste décidée, et la demande n'est pas partie",
    );

    /*
      Les bilans sont globaux — la base porte les dettes des blocs
      précédents. Ce qui s'affirme ici se lit donc sur **cette
      transaction-là**, ce qui est de toute façon la bonne unité : une
      dette est due à quelqu'un.

      Avant ce lot, aucune passe planifiée ne revenait la chercher :
      constaté en exécution, réconciliation, péremption, purge,
      inactivité et rappels laissaient `refundAttempts` à 1.
    */
    const tropTot = new Date(
      apres.refundAttemptedAt!.getTime() + (REPOS_AVANT_RELANCE_MINUTES - 1) * 60_000,
    );
    await relancerLesRemboursements(tropTot, rembourseur);
    verifier(
      (await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }))
        .refundAttempts === 1,
      "le repos retient l'envoi suivant",
    );

    const alHeure = new Date(
      apres.refundAttemptedAt!.getTime() + REPOS_AVANT_RELANCE_MINUTES * 60_000,
    );
    await relancerLesRemboursements(alHeure, rembourseur);
    const final = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(final.refundAttempts === 2, `le repos écoulé, la passe relance (${final.refundAttempts})`);
    verifier(final.refundRequestedAt !== null, "et la demande est déclarée partie");
    /*
      Et la passe ne solde rien : seule la notification signée pose
      `refundedAt` (INV-7). Une passe qui écrirait « remboursé » parce
      qu'elle a envoyé une demande annoncerait un virement que personne
      n'a fait.
    */
    verifier(final.refundedAt === null, "mais la somme n'est pas déclarée rendue (INV-7)");

    /* Et elle ne repart pas sur une demande acceptée. */
    await relancerLesRemboursements(
      new Date(alHeure.getTime() + 600 * 60_000),
      rembourseur,
    );
    verifier(
      (await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }))
        .refundAttempts === 2,
      "une demande acceptée n'est plus relancée",
    );
  }

  // ── 9. Elle s'arrête, et appelle quelqu'un ──────────────────────────
  console.log("\nAu bout de cinq envois, la passe abandonne");
  {
    const { transaction } = await candidatPaye({ analyses: 30 });
    await db.transaction.update({
      where: { id: transaction.id },
      data: { refundDueAt: new Date(), refundBasis: "Fumée : dette qui n'aboutit pas." },
    });
    const rembourseur = rembourseurSimule(
      Array.from({ length: TENTATIVES_AVANT_HUMAIN + 4 }, () => TEMPORAIRE),
    );

    let quand = new Date();
    for (let i = 0; i < TENTATIVES_AVANT_HUMAIN + 2; i += 1) {
      await relancerLesRemboursements(quand, rembourseur);
      quand = new Date(quand.getTime() + REPOS_AVANT_RELANCE_MINUTES * 60_000);
    }

    const final = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(
      final.refundAttempts === TENTATIVES_AVANT_HUMAIN,
      `elle s'arrête à ${TENTATIVES_AVANT_HUMAIN} envois (${final.refundAttempts})`,
    );
    verifier(
      final.discrepancy !== null && final.discrepancy.includes("reste due"),
      `et ouvre un écart qui dit ce qui reste dû (${final.discrepancy?.slice(0, 52)}…)`,
    );
    verifier(final.refundDueAt !== null, "la dette n'est pas éteinte pour autant");

    const apres = await relancerLesRemboursements(
      new Date(quand.getTime() + REPOS_AVANT_RELANCE_MINUTES * 60_000),
      rembourseur,
    );
    verifier(
      (await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }))
        .refundAttempts === TENTATIVES_AVANT_HUMAIN,
      "et la passe ne repart pas par-dessus l'humain",
    );
    verifier(apres.railMuet === false, "le rail est bien celui qu'on lui donne");
  }

  // ── 9 bis. Sans rail, elle ne brûle aucune tentative ────────────────
  console.log("\nSans rail configuré, la passe ne tente rien");
  {
    const { transaction } = await candidatPaye({ analyses: 30 });
    await db.transaction.update({
      where: { id: transaction.id },
      data: { refundDueAt: new Date(), refundBasis: "Fumée : rail absent." },
    });
    /*
      Sans clés, chaque envoi rendrait `non_configure`, le compteur
      monterait quand même, et au bout de cinq la passe ouvrirait un
      écart disant « la demande n'est pas passée après 5 envois » — en
      accusant le fournisseur d'un silence qui est le nôtre, et en
      brûlant les cinq tentatives que la dette aura le jour où le rail
      sera branché.
    */
    const bilan = await relancerLesRemboursements(new Date());
    verifier(bilan.railMuet === true, `la passe le dit (${JSON.stringify(bilan)})`);
    const final = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    verifier(final.refundAttempts === 0, `aucune tentative brûlée (${final.refundAttempts})`);
    verifier(final.discrepancy === null, "et aucun écart ouvert contre le fournisseur");
  }

  // ── 10. L'index reste partiel ───────────────────────────────────────
  console.log("\nL'index ne parle que des remboursements");
  {
    const { application, transaction } = await candidatPaye({ analyses: 30 });
    await initierLeRemboursement(transaction.reference, rembourseurSimule([acceptee()]));
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

  // ── 11. FedaPay : une procédure manuelle, tracée (S.91) ─────────────
  console.log("\nFedaPay : rembourser au tableau de bord, déclarer, attendre la notification");
  {
    /*
      Le piège réseau. FedaPay n'expose aucune API de remboursement : ce
      rail ne doit rien appeler, ni en initiation, ni en relance, ni en
      déclaration. Il remplace `fetch` pour la durée du bloc.
    */
    const fetchDOrigine = globalThis.fetch;
    let appelsReseau = 0;
    globalThis.fetch = (async () => {
      appelsReseau += 1;
      throw new Error("aucun appel réseau n'est attendu sur le rail FedaPay");
    }) as typeof fetch;

    const code = async (geste: () => Promise<unknown>): Promise<string> => {
      try {
        await geste();
        return "aucun";
      } catch (erreur) {
        return erreur instanceof EchecHttp ? erreur.echec.code : `inattendu: ${String(erreur)}`;
      }
    };

    try {
      const admin = await db.user.create({
        data: { email: `fumee-admin-${process.pid}@exemple.test`, role: "ADMIN" },
      });
      const rail = remboursementFedaPay();

      // a. L'initiation : droits retirés une fois, écart avec le geste à faire.
      const { application, transaction } = await candidatPaye({ analyses: 30, fedapay: true });
      const envoi = await initierLeRemboursement(transaction.reference, rail);
      verifier(envoi.issue === "procedure_manuelle", `l'initiation le dit (${envoi.issue})`);
      const initiee = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
      verifier(initiee.refundAttempts === 1, "la tentative est réservée et comptée une fois");
      verifier((await solde(application.id)) === 0, "les droits non consommés sont retirés (K.C)");
      verifier(
        initiee.discrepancy?.startsWith(A_REMBOURSER_A_LA_MAIN) === true,
        "un écart dit le geste à faire au tableau de bord",
      );
      verifier(
        initiee.refundRequestedAt === null && initiee.refundedAt === null,
        "rien n'est déclaré demandé, rien n'est déclaré rendu",
      );

      // b. La passe de relance ne s'y acharne pas : un humain a la main.
      await relancerLesRemboursements(
        new Date(Date.now() + 10 * REPOS_AVANT_RELANCE_MINUTES * 60_000),
        rail,
      );
      verifier(
        (await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }))
          .refundAttempts === 1,
        "la relance ne brûle aucune tentative sur un rail sans API",
      );

      // c. La dette se voit en B-04, toutes dates confondues.
      const visibles = await dettesFedaPay();
      verifier(
        visibles.some((d) => d.reference === transaction.reference && d.etape === "DECIDE"),
        "B-04 montre la dette, décidée et non demandée",
      );

      // d. Une référence mal formée est refusée, avec son champ.
      verifier(
        (await code(() => declarerLeRemboursementManuel(transaction.reference, "88 41", admin.id))) ===
          "champs_invalides",
        "une référence mal formée est refusée",
      );

      // e. La déclaration : demandée, référencée, jamais versée.
      const declaration = await declarerLeRemboursementManuel(transaction.reference, "8841", admin.id);
      verifier(declaration.issue === "declaree", `la déclaration passe (${declaration.issue})`);
      const declaree = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
      verifier(declaree.refundProviderRef === "fedapay:8841", "la référence du fournisseur est gardée");
      verifier(declaree.refundRequestedAt !== null, "la dette passe à « demandée »");
      verifier(
        declaree.status === "CONFIRMEE" && declaree.refundedAt === null,
        "mais rien n'est déclaré rendu (INV-7)",
      );
      verifier(
        declaree.discrepancyOutcome === "ATTENTE_CONFIRMATION" &&
          declaree.discrepancyResolvedBy === admin.id,
        "l'écart se referme en attente du fournisseur, au nom de l'opérateur",
      );

      // f. Le rejeu ne réécrit rien.
      const rejeu = await declarerLeRemboursementManuel(transaction.reference, "fedapay:8841", admin.id);
      const apresRejeu = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
      verifier(rejeu.issue === "deja_declaree", `le rejeu est reconnu (${rejeu.issue})`);
      verifier(
        apresRejeu.refundRequestedAt?.getTime() === declaree.refundRequestedAt?.getTime(),
        "et la date du premier geste reste",
      );

      // g. Une autre référence sur le même paiement : conflit, pas réécriture.
      verifier(
        (await code(() => declarerLeRemboursementManuel(transaction.reference, "9999", admin.id))) ===
          "etat_incompatible",
        "une seconde référence sur le même paiement est refusée",
      );

      // h. La même référence sur un autre paiement : l'unicité refuse.
      const autre = await candidatPaye({ analyses: 30, fedapay: true });
      await initierLeRemboursement(autre.transaction.reference, rail);
      verifier(
        (await code(() => declarerLeRemboursementManuel(autre.transaction.reference, "8841", admin.id))) ===
          "etat_incompatible",
        "un remboursement du fournisseur ne solde pas deux dettes",
      );
      verifier(
        (await db.transaction.findUniqueOrThrow({ where: { id: autre.transaction.id } }))
          .refundRequestedAt === null,
        "et l'autre dette reste décidée",
      );

      // i. Deux déclarations simultanées : une seule passe.
      const course = await Promise.allSettled([
        declarerLeRemboursementManuel(autre.transaction.reference, "7001", admin.id),
        declarerLeRemboursementManuel(autre.transaction.reference, "7002", admin.id),
      ]);
      const passees = course.filter((r) => r.status === "fulfilled").length;
      const courue = await db.transaction.findUniqueOrThrow({ where: { id: autre.transaction.id } });
      verifier(passees === 1, `deux clics simultanés, une seule déclaration (${passees})`);
      verifier(
        courue.refundProviderRef === "fedapay:7001" || courue.refundProviderRef === "fedapay:7002",
        "et c'est la sienne qui reste",
      );

      // j. Non initiée : les droits du pack ne sont pas retirés, on refuse.
      const brute = await candidatPaye({ analyses: 30, fedapay: true });
      verifier(
        (await code(() => declarerLeRemboursementManuel(brute.transaction.reference, "6001", admin.id))) ===
          "etat_incompatible",
        "une dette non initiée ne se déclare pas",
      );
      verifier((await solde(brute.application.id)) === 30, "et ses droits sont intacts");

      // k. Stripe ne passe pas par ce formulaire.
      const euro = await candidatPaye({ analyses: 30 });
      await initierLeRemboursement(euro.transaction.reference, rembourseurSimule([TEMPORAIRE]));
      verifier(
        (await code(() => declarerLeRemboursementManuel(euro.transaction.reference, "5001", admin.id))) ===
          "etat_incompatible",
        "un paiement Stripe ne se déclare pas à la main",
      );

      // l. La base refuse une référence sans demande datée.
      const orpheline = await db.$executeRawUnsafe(
        `UPDATE "Transaction" SET "refundProviderRef" = 'fedapay:orpheline' WHERE id = $1`,
        brute.transaction.id,
      ).catch(() => null);
      verifier(orpheline === null, "la base refuse une référence sans demande datée");

      // m. Seule la notification signée solde la dette.
      const avantNotification = await dettesFedaPay();
      verifier(
        avantNotification.some((d) => d.reference === transaction.reference && d.etape === "DEMANDE"),
        "déclarée, la dette reste visible en B-04",
      );
      const suite = await appliquerLaNotification({
        providerEventId: `fedapay:refunded:${process.pid}`,
        providerTxId: declaree.providerTxId!,
        reference: declaree.reference,
        statut: "REMBOURSEE",
      });
      verifier(suite.issue !== "refusee", `la notification signée s'applique (${suite.issue})`);
      const soldee = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
      verifier(
        soldee.status === "REMBOURSEE" && soldee.refundedAt !== null,
        "et c'est elle qui date le versement",
      );
      verifier(
        !(await dettesFedaPay()).some((d) => d.reference === transaction.reference),
        "la dette sort de B-04 à ce moment-là, pas avant",
      );

      verifier(appelsReseau === 0, `aucun appel réseau sur le rail FedaPay (${appelsReseau})`);
    } finally {
      globalThis.fetch = fetchDOrigine;
    }
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
