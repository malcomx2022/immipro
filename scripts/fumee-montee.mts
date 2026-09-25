/**
 * Le passage d'Essentiel à Dossier, de bout en bout — arbitrage S.88.
 *
 * Ce que le domaine décide seul s'éprouve dans
 * `tests/montee-en-gamme.test.ts`. Ce qui demande une base s'éprouve ici :
 *
 * - le prix est la différence, calculée depuis l'achat Essentiel réel, dans
 *   sa devise, et une recharge n'y change rien ;
 * - la montée est une transaction distincte, liée à son achat d'origine,
 *   et une seule peut être ouverte par achat et par dossier ;
 * - une recharge en attente n'est pas reprise à la place de la montée ;
 * - la notification signée ajoute vingt analyses, jamais trente, et ouvre
 *   la rédaction assistée ; un rejeu ne crédite pas deux fois ;
 * - le remboursement du supplément retire les vingt analyses et le droit,
 *   ou passe en revue manuelle quand elles ont servi ;
 * - un Essentiel remboursé ne sert pas de base.
 *
 * Le fournisseur est simulé : aucun paiement ne quitte la machine.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:montee
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_montee_${process.pid}`;
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

console.log(`Montée en gamme sur une base jetable (${nomBase})`);
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
  ouvrirLeTunnel,
  appliquerLaNotification,
  acheverLeCredit,
  preparerLAchat,
  montantDe,
  ouvrirUnRemboursement,
  initierLeRemboursement,
} = await import("../src/server/acces/paiements");
const { verdictDuDossier, offreDeMontee } = await import("../src/server/acces/montee");
const { compteur, solde, debiterUneAnalyse } = await import("../src/server/acces/quota");
const { redactionAssisteeDuDossier } = await import("../src/server/acces/droits");
const { quotaDuDossier } = await import("../src/server/lecture/dossiers");
const { CODE_MONTEE_DOSSIER, ANALYSES_AJOUTEES } = await import("../src/domain/payments/montee");
type Ouvreur = import("../src/server/paiement/ouvreur").Ouvreur;
type Rembourseur = import("../src/server/paiement/rembourseur").Rembourseur;
type Devise = import("../src/domain/payments/pricing").Devise;

let numero = 0;

/** Un fournisseur simulé, qui ouvre ce qu'on lui demande. */
function ouvreurSimule(devise: Devise): Ouvreur {
  const prefixe = devise === "EUR" ? "stripe" : "fedapay";
  let enregistre = { montant: 0, devise: "" };
  return {
    fournisseur: devise === "EUR" ? "STRIPE" : "FEDAPAY",
    async creer(demande) {
      numero += 1;
      enregistre = { montant: demande.montant, devise: demande.devise };
      return {
        issue: "ouverte",
        session: {
          providerTxId: `${prefixe}:cs_${numero}`,
          url: "https://checkout.stripe.com/c/pay/cs_essai",
          montant: demande.montant,
          devise: demande.devise,
        },
      };
    },
    async retrouver(providerTxId) {
      return {
        issue: "ouverte",
        session: { providerTxId, url: "https://checkout.stripe.com/c/pay/cs_essai", ...enregistre },
      };
    },
  };
}

function rembourseurSimule(): Rembourseur & { demandes: number } {
  const r = {
    fournisseur: "STRIPE" as const,
    operationnel: true,
    demandes: 0,
    async demander() {
      r.demandes += 1;
      return { issue: "acceptee" as const, accepteLe: new Date(), providerRefundId: "stripe:re_1" };
    },
  };
  return r;
}

let rang = 0;
async function candidat(): Promise<{ userId: string; applicationId: string }> {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-m-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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
  const application = await db.application.create({ data: { userId: user.id, visaRuleId: regle.id } });
  return { userId: user.id, applicationId: application.id };
}

let evenement = 0;
/** Confirme une transaction comme le ferait la notification signée. */
async function confirmer(reference: string) {
  const t = await db.transaction.findUniqueOrThrow({ where: { reference } });
  evenement += 1;
  return appliquerLaNotification({
    providerEventId: `evt_${evenement}`,
    providerTxId: t.providerTxId!,
    reference,
    statut: "CONFIRMEE",
  });
}

/** Achète et confirme un achat simple : pack ou recharge. */
async function payer(
  userId: string,
  applicationId: string,
  achat: { type: "pack"; code: string } | { type: "recharge" },
  devise: Devise,
) {
  const ouvert = await ouvrirLeTunnel(userId, { ...achat, applicationId }, devise, ouvreurSimule(devise));
  await confirmer(ouvert.reference);
  return ouvert.reference;
}

const codeDe = (erreur: unknown) =>
  (erreur as { echec?: { code?: string } } | null)?.echec?.code ?? String(erreur);

try {
  console.log("\nUn dossier Essentiel en euros : 29 − 12 = 17 €");
  const a = await candidat();
  await payer(a.userId, a.applicationId, { type: "pack", code: "essentiel" }, "EUR");
  {
    const c = await compteur(a.applicationId);
    verifier(c.total === 10, `Essentiel ouvre 10 analyses (${c.total})`);
    verifier(!(await redactionAssisteeDuDossier(a.applicationId)), "la rédaction assistée est fermée");
    const offre = await offreDeMontee(a.applicationId, a.userId);
    verifier(
      offre.ouverte && offre.detail.montant === 17 && offre.detail.devise === "EUR",
      `le passage coûte 17 € (${JSON.stringify(offre)})`,
    );
  }

  console.log("\nUne recharge ne change ni le prix ni les vingt analyses");
  await payer(a.userId, a.applicationId, { type: "recharge" }, "EUR");
  {
    const offre = await offreDeMontee(a.applicationId, a.userId);
    verifier(offre.ouverte && offre.detail.montant === 17, "toujours 17 €");
    // L'écran de dépôt lisait le dernier achat confirmé : une recharge, donc « sans pack ».
    const q = await quotaDuDossier(a.applicationId);
    verifier(q.pack === "Essentiel", `après une recharge, le dossier reste « Essentiel » (${q.pack})`);
  }

  console.log("\nLa montée est une transaction distincte, liée à l'achat Essentiel");
  const essentiel = await db.transaction.findFirstOrThrow({
    where: { applicationId: a.applicationId, packCode: "essentiel" },
  });
  // Une recharge en attente sur le même dossier : la montée ne doit pas la reprendre.
  const ouvreurRecharge = ouvreurSimule("EUR");
  const rechargeEnAttente = await ouvrirLeTunnel(
    a.userId,
    { type: "recharge", applicationId: a.applicationId },
    "EUR",
    ouvreurRecharge,
  );
  const achat = await preparerLAchat({ type: "montee" }, a.applicationId, a.userId);
  verifier(montantDe(achat, "EUR").montant === 17, "le montant se calcule côté serveur : 17");
  const dEUR = await Promise.resolve()
    .then(() => montantDe(achat, "XOF"))
    .then(() => "accepté")
    .catch(codeDe);
  verifier(dEUR === "devise_figee", `une autre devise est refusée (${dEUR})`);
  const ouvreurMontee = ouvreurSimule("EUR");
  const ouverte = await ouvrirLeTunnel(a.userId, achat, "EUR", ouvreurMontee);
  verifier(ouverte.reference !== rechargeEnAttente.reference, "la recharge en attente n'est pas reprise à sa place");
  const montee = await db.transaction.findUniqueOrThrow({ where: { reference: ouverte.reference } });
  verifier(montee.packCode === CODE_MONTEE_DOSSIER, `code ${montee.packCode}`);
  verifier(montee.amount === 17 && montee.currency === "EUR", `17 EUR enregistrés (${montee.amount} ${montee.currency})`);
  verifier(montee.sourceTransactionId === essentiel.id, "elle cite l'achat Essentiel");

  const reprise = await ouvrirLeTunnel(
    a.userId,
    await preparerLAchat({ type: "montee" }, a.applicationId, a.userId),
    "EUR",
    ouvreurMontee,
  );
  verifier(reprise.reference === ouverte.reference && reprise.reprise, "un second clic reprend la même montée");
  const recharge = await ouvrirLeTunnel(
    a.userId,
    { type: "recharge", applicationId: a.applicationId },
    "EUR",
    ouvreurRecharge,
  );
  verifier(
    recharge.reference === rechargeEnAttente.reference,
    "et une recharge reprend la recharge en attente, pas la montée",
  );

  console.log("\nLa base n'accepte qu'une montée ouverte par achat et par dossier");
  console.log("  (l'erreur Prisma qui suit est la garde qui se déclenche — c'est l'attendu)");
  {
    const doublon = await db.transaction
      .create({
        data: {
          reference: `IMP-DOUBLON-${process.pid}`,
          userId: a.userId,
          applicationId: a.applicationId,
          packCode: CODE_MONTEE_DOSSIER,
          amount: 17,
          currency: "EUR",
          provider: "STRIPE",
          sourceTransactionId: essentiel.id,
        },
      })
      .then(() => false)
      .catch(() => true);
    verifier(doublon, "une seconde montée ouverte est refusée par la base");
    const sansSource = await db.transaction
      .create({
        data: {
          reference: `IMP-SANSSRC-${process.pid}`,
          userId: a.userId,
          applicationId: a.applicationId,
          packCode: CODE_MONTEE_DOSSIER,
          amount: 17,
          currency: "EUR",
          provider: "STRIPE",
        },
      })
      .then(() => false)
      .catch(() => true);
    verifier(sansSource, "une montée sans achat d'origine est refusée par la base");
  }

  console.log("\nLa notification signée : vingt analyses, la rédaction assistée, et pas de double crédit");
  {
    const issue = await confirmer(ouverte.reference);
    verifier(issue.issue === "creditee", `la montée est créditée (${issue.issue})`);
    const octrois = await db.analysisCredit.findMany({ where: { transactionId: montee.id } });
    verifier(
      octrois.length === 1 && octrois[0]!.delta === ANALYSES_AJOUTEES && octrois[0]!.reason === "ACHAT_PACK",
      `un octroi de ${ANALYSES_AJOUTEES}, motif ACHAT_PACK (${JSON.stringify(octrois.map((o) => o.delta))})`,
    );
    const packs = await db.analysisCredit.aggregate({
      where: { applicationId: a.applicationId, reason: "ACHAT_PACK" },
      _sum: { delta: true },
    });
    verifier(packs._sum.delta === 30, `le quota issu du pack passe à 30 (${packs._sum.delta})`);
    const c = await compteur(a.applicationId);
    verifier(c.total === 40, `recharge comprise : 40 analyses au total (${c.total})`);
    verifier(await redactionAssisteeDuDossier(a.applicationId), "la rédaction assistée est ouverte");
    verifier((await quotaDuDossier(a.applicationId)).pack === "Dossier", "l'écran de dépôt nomme Dossier");

    // Rejeux : la même notification, une nouvelle, et deux achèvements simultanés.
    const t = await db.transaction.findUniqueOrThrow({ where: { reference: ouverte.reference } });
    const rejeu = await appliquerLaNotification({
      providerEventId: `evt_${evenement}`,
      providerTxId: t.providerTxId!,
      reference: t.reference,
      statut: "CONFIRMEE",
    });
    await confirmer(ouverte.reference);
    await Promise.all([acheverLeCredit(t), acheverLeCredit(t)]);
    const apres = await db.analysisCredit.count({ where: { transactionId: montee.id } });
    verifier(rejeu.issue === "rejeu" && apres === 1, `un rejeu ne crédite pas deux fois (${rejeu.issue}, ${apres})`);
  }

  console.log("\nUne seule montée : le dossier ne remonte pas");
  {
    const verdict = await verdictDuDossier(a.applicationId, a.userId);
    verifier(!verdict.ouverte && verdict.raison === "DEJA_MONTE", `refus DEJA_MONTE (${JSON.stringify(verdict)})`);
    const code = await preparerLAchat({ type: "montee" }, a.applicationId, a.userId)
      .then(() => "accepté")
      .catch(codeDe);
    verifier(code === "montee_indisponible", `la route refuse (${code})`);
  }

  console.log("\nRemboursement du supplément : les vingt analyses et le droit, rien d'écrit");
  {
    const avant = await solde(a.applicationId);
    await ouvrirUnRemboursement(montee.id, "Geste de support — essai de fumée");
    verifier(!(await redactionAssisteeDuDossier(a.applicationId)), "le droit à la rédaction assistée tombe dès la décision");
    const rembourseur = rembourseurSimule();
    const issue = await initierLeRemboursement(ouverte.reference, rembourseur);
    verifier(issue.issue === "acceptee", `la demande part (${issue.issue})`);
    const apres = await solde(a.applicationId);
    verifier(avant - apres === ANALYSES_AJOUTEES, `seules les ${ANALYSES_AJOUTEES} analyses ajoutées sont retirées (${avant} → ${apres})`);
    const essentielIntact = await db.analysisCredit.count({
      where: { transactionId: essentiel.id, reason: "REMBOURSEMENT" },
    });
    verifier(essentielIntact === 0, "l'achat Essentiel n'est pas touché");
    verifier((await quotaDuDossier(a.applicationId)).pack === "Essentiel", "le dossier redevient Essentiel");
    const verdict = await verdictDuDossier(a.applicationId, a.userId);
    verifier(
      !verdict.ouverte && verdict.raison === "MONTEE_EN_REMBOURSEMENT",
      `tant que le remboursement n'est pas versé, pas de nouvelle montée (${JSON.stringify(verdict)})`,
    );
  }

  console.log("\nDes analyses ajoutées déjà consommées : revue manuelle");
  {
    const b = await candidat();
    await payer(b.userId, b.applicationId, { type: "pack", code: "essentiel" }, "EUR");
    const achatB = await preparerLAchat({ type: "montee" }, b.applicationId, b.userId);
    const o = await ouvrirLeTunnel(b.userId, achatB, "EUR", ouvreurSimule("EUR"));
    await confirmer(o.reference);
    // 30 ouvertes ; 15 consommées : 5 des 20 ajoutées ont servi.
    for (let i = 0; i < 15; i += 1) await debiterUneAnalyse(b.applicationId);
    const t = await db.transaction.findUniqueOrThrow({ where: { reference: o.reference } });
    await ouvrirUnRemboursement(t.id, "Geste de support — essai de fumée");
    const rembourseur = rembourseurSimule();
    const issue = await initierLeRemboursement(o.reference, rembourseur);
    verifier(issue.issue === "revue_manuelle" && issue.consommees === 5, `revue manuelle, 5 consommées (${JSON.stringify(issue)})`);
    verifier(rembourseur.demandes === 0, "aucune demande ne part");
    const relu = await db.transaction.findUniqueOrThrow({ where: { reference: o.reference } });
    verifier(relu.discrepancy !== null, "l'écart porte la question à un humain");
    const retrait = await db.analysisCredit.count({ where: { transactionId: t.id, reason: "REMBOURSEMENT" } });
    verifier(retrait === 0, "rien n'est retiré avant la décision humaine");
  }

  console.log("\nDix analyses d'Essentiel consommées : le supplément se rembourse sans humain");
  {
    const c = await candidat();
    await payer(c.userId, c.applicationId, { type: "pack", code: "essentiel" }, "EUR");
    const o = await ouvrirLeTunnel(
      c.userId,
      await preparerLAchat({ type: "montee" }, c.applicationId, c.userId),
      "EUR",
      ouvreurSimule("EUR"),
    );
    await confirmer(o.reference);
    for (let i = 0; i < 10; i += 1) await debiterUneAnalyse(c.applicationId);
    const t = await db.transaction.findUniqueOrThrow({ where: { reference: o.reference } });
    await ouvrirUnRemboursement(t.id, "Geste de support — essai de fumée");
    const issue = await initierLeRemboursement(o.reference, rembourseurSimule());
    verifier(issue.issue === "acceptee", `retrait intégral (${issue.issue})`);
    verifier((await solde(c.applicationId)) === 0, "le solde retombe à zéro, pas en dessous");
  }

  console.log("\nUn Essentiel remboursé ne sert pas de base ; le franc CFA garde sa grille");
  {
    const d = await candidat();
    const ref = await payer(d.userId, d.applicationId, { type: "pack", code: "essentiel" }, "XOF");
    const offre = await offreDeMontee(d.applicationId, d.userId);
    verifier(
      offre.ouverte && offre.detail.montant === 10_000 && offre.detail.devise === "XOF",
      `15 000 − 5 000 = 10 000 F (${JSON.stringify(offre)})`,
    );
    const t = await db.transaction.findUniqueOrThrow({ where: { reference: ref } });
    await ouvrirUnRemboursement(t.id, "Geste de support — essai de fumée");
    const verdict = await verdictDuDossier(d.applicationId, d.userId);
    verifier(!verdict.ouverte && verdict.raison === "REMBOURSEMENT", `refus REMBOURSEMENT (${JSON.stringify(verdict)})`);
  }

  console.log("\nUn dossier sans Essentiel, ou déjà en Dossier, ne monte pas");
  {
    const e = await candidat();
    const sans = await verdictDuDossier(e.applicationId, e.userId);
    verifier(!sans.ouverte && sans.raison === "SANS_ESSENTIEL", `brouillon : SANS_ESSENTIEL (${JSON.stringify(sans)})`);
    await payer(e.userId, e.applicationId, { type: "pack", code: "dossier" }, "EUR");
    const deja = await verdictDuDossier(e.applicationId, e.userId);
    verifier(!deja.ouverte && deja.raison === "DEJA_DOSSIER", `Dossier payé : DEJA_DOSSIER (${JSON.stringify(deja)})`);
  }

  console.log("\nDeux clics simultanés sur « Payer » : une seule montée");
  {
    const f = await candidat();
    await payer(f.userId, f.applicationId, { type: "pack", code: "essentiel" }, "EUR");
    const ouvreur = ouvreurSimule("EUR");
    const [x, y] = await Promise.all([
      preparerLAchat({ type: "montee" }, f.applicationId, f.userId).then((m) =>
        ouvrirLeTunnel(f.userId, m, "EUR", ouvreur),
      ),
      preparerLAchat({ type: "montee" }, f.applicationId, f.userId).then((m) =>
        ouvrirLeTunnel(f.userId, m, "EUR", ouvreur),
      ),
    ]);
    const lignes = await db.transaction.count({
      where: { applicationId: f.applicationId, packCode: CODE_MONTEE_DOSSIER },
    });
    verifier(lignes === 1 && x.reference === y.reference, `une seule transaction, reprise par le second (${lignes})`);
  }
} finally {
  await db.$disconnect().catch(() => undefined);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLe passage à Dossier se paie la différence, une fois, et se rembourse sans rien effacer.");
