/**
 * La réconciliation des paiements, sur une base réelle — RG-05.4.
 *
 * Les adaptateurs de consultation s'éprouvent contre un `fetch` simulé
 * dans `tests/consultation-paiement.test.ts`. Ce qui demande une base —
 * l'application de l'état retrouvé, l'idempotence, et la course entre le
 * webhook et la réconciliation — s'éprouve ici, avec un consultant
 * simulé qui ne parle à personne.
 *
 * La base est jetable : créée et supprimée par ce script.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:reconciliation
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_reconciliation_${process.pid}`;
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

console.log(`Réconciliation sur une base jetable (${nomBase})`);
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
const { reconcilierLesPaiements } = await import("../src/server/jobs/reconciliation");
const { appliquerLaNotification, acheverLeCredit } = await import(
  "../src/server/acces/paiements"
);
const { cleDEvenementDeReconciliation } = await import("../src/domain/paiement/ouverture");
const { solde } = await import("../src/server/acces/quota");
const { appliquerLaCouverture } = await import("../src/server/acces/couverture");

type Consultant = import("../src/server/paiement/consultation").Consultant;
type EtatConsulte = import("../src/server/paiement/consultation").EtatConsulte;

/**
 * Un consultant simulé, qui ne répond que pour **une** référence.
 *
 * Le job balaie toutes les transactions en attente, pas seulement celle
 * du scénario en cours : un consultant qui répondrait la même chose à
 * tout le monde appliquerait l'état d'un paiement à celui d'un autre.
 * Vu en exécutant — le premier jet écrivait l'identifiant de session du
 * scénario cinq sur la transaction du scénario trois, et la contrainte
 * d'unicité l'a dit. Un vrai fournisseur répond par transaction ; le
 * simulateur aussi.
 */
function consultantSimule(reference: string, etat: EtatConsulte): Consultant & { appels: number } {
  const objet = {
    fournisseur: "STRIPE" as const,
    appels: 0,
    async consulter(_providerTxId: string | null, demandee: string): Promise<EtatConsulte> {
      if (demandee !== reference) {
        return { issue: "indisponible", detail: "hors du scénario en cours" };
      }
      objet.appels += 1;
      return etat;
    },
  };
  return objet;
}

let rang = 0;
const MINUTE = 60_000;

/**
 * Une transaction en attente, ouverte il y a `ilYA` minutes.
 *
 * Le dossier porte la règle qu'il a figée : un dossier qui passe à
 * l'actif l'exige (INV-3), et la base le refuse autrement.
 */
async function transactionEnAttente(options: {
  ilYAMinutes: number;
  providerTxId?: string | null;
  statut?: "INITIEE" | "EN_ATTENTE";
}) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `recon-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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
      reference: `IMP-RECON-${rang}-${process.pid}`,
      userId: user.id,
      applicationId: application.id,
      packCode: "dossier",
      amount: 29,
      currency: "EUR",
      provider: "STRIPE",
      status: options.statut ?? "EN_ATTENTE",
      createdAt: new Date(Date.now() - options.ilYAMinutes * MINUTE),
      ...(options.providerTxId === undefined
        ? { providerTxId: `stripe:cs_${rang}_${process.pid}` }
        : options.providerTxId === null
          ? {}
          : { providerTxId: options.providerTxId }),
    },
  });
  return { transaction, applicationId: application.id };
}

const relire = (id: string) => db.transaction.findUniqueOrThrow({ where: { id } });

try {
  // ── 1. La consultation retrouve un paiement confirmé ────────────────
  console.log("\nElle retrouve un paiement confirmé");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 15 });
    const consultant = consultantSimule(transaction.reference, {
      issue: "connu",
      statut: "CONFIRMEE",
      providerTxId: transaction.providerTxId!,
    });
    const bilan = await reconcilierLesPaiements(new Date(), () => consultant);

    const apres = await relire(transaction.id);
    verifier(consultant.appels === 1, `le fournisseur est interrogé une fois (${consultant.appels})`);
    verifier(apres.status === "CONFIRMEE", `le paiement est rattrapé (${apres.status})`);
    verifier(apres.confirmedAt !== null, "et daté");
    verifier(bilan.rattrapees === 1, `le bilan le compte (${bilan.rattrapees})`);
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) > 0,
      "les droits sont crédités",
    );
    verifier(
      (await db.paymentEvent.count({
        where: { providerEventId: cleDEvenementDeReconciliation(transaction.reference, "CONFIRMEE") },
      })) === 1,
      "l'événement de réconciliation est écrit, avec sa clé déterministe",
    );

    // Une seconde passe lit le même état : rejeu, et rien de plus.
    const seconde = await reconcilierLesPaiements(new Date(), () => consultant);
    verifier(seconde.examinees === 0, "la transaction aboutie n'est plus examinée");
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 1,
      "les droits ne sont pas crédités deux fois",
    );
  }

  // ── 2. Elle retrouve un refus ───────────────────────────────────────
  console.log("\nElle retrouve un refus");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 15 });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(transaction.reference, {
        issue: "connu",
        statut: "ECHOUEE",
        providerTxId: transaction.providerTxId!,
        cause: "SOLDE_INSUFFISANT",
      }),
    );
    const apres = await relire(transaction.id);
    verifier(apres.status === "ECHOUEE", `le refus est appliqué (${apres.status})`);
    verifier(apres.failureCause === "SOLDE_INSUFFISANT", "avec la cause que le fournisseur a donnée");
    verifier(apres.failureCauseAt !== null, "et sa date");
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 0,
      "aucun droit n'est crédité sur un refus",
    );
  }

  // ── 3. Elle ne trouve rien ──────────────────────────────────────────
  console.log("\nElle ne trouve rien");
  {
    const ouverte = await transactionEnAttente({ ilYAMinutes: 15 });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(ouverte.transaction.reference, { issue: "introuvable" }),
    );
    const apres = await relire(ouverte.transaction.id);
    verifier(apres.status === "EN_ATTENTE", `l'état ne bouge pas (${apres.status})`);
    verifier(
      (apres.discrepancy ?? "").includes(ouverte.transaction.providerTxId!),
      "une session ouverte que le fournisseur ignore ouvre un écart",
    );

    // Sans session ouverte, il n'y a rien à ignorer : pas d'anomalie.
    const jamaisOuverte = await transactionEnAttente({ ilYAMinutes: 15, providerTxId: null });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(jamaisOuverte.transaction.reference, { issue: "introuvable" }),
    );
    const neuve = await relire(jamaisOuverte.transaction.id);
    verifier(neuve.discrepancy === null, "une transaction sans session n'ouvre pas d'écart");
  }

  // ── 4. Elle échoue temporairement ───────────────────────────────────
  console.log("\nElle échoue temporairement");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 15 });
    const bilan = await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(transaction.reference, {
        issue: "indisponible",
        detail: "fournisseur injoignable",
      }),
    );
    const apres = await relire(transaction.id);
    /*
      La frontière qui compte : pas de réponse n'est pas un refus. Ni
      état, ni motif, ni écart tant que le délai de vingt-quatre heures
      n'est pas atteint.
    */
    verifier(apres.status === "EN_ATTENTE", `l'état ne bouge pas (${apres.status})`);
    verifier(apres.failureCause === null, "aucun motif d'échec n'est écrit");
    verifier(apres.discrepancy === null, "aucun écart avant le délai prévu");
    verifier(bilan.rattrapees === 0, "rien n'est rattrapé");
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 0,
      "et rien n'est crédité",
    );
    // Et surtout : aucune date de rapprochement. C'est cette date que B-04
    // lit pour dire si l'opérateur répond ; l'écrire ici ferait passer un
    // appel en erreur pour une réponse.
    verifier(apres.reconciledAt === null, "et le rapprochement n'est pas daté");
  }

  // ── 4 bis. Elle répond, et ne change rien ───────────────────────────
  /*
    Le cas le plus fréquent du job : un panier abandonné que le fournisseur
    annonce toujours en attente. Rien ne bouge — et c'est pourtant la seule
    preuve que la plateforme ait que l'opérateur répond. B-04 s'en sert
    pour ne pas déclarer une panne sur une heure sans achat.
  */
  console.log("\nElle répond, et ne change rien");
  {
    const { transaction } = await transactionEnAttente({ ilYAMinutes: 15 });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(transaction.reference, {
        issue: "connu",
        statut: "EN_ATTENTE",
        providerTxId: transaction.providerTxId!,
      }),
    );
    const apres = await relire(transaction.id);
    verifier(apres.status === "EN_ATTENTE", `l'état ne bouge pas (${apres.status})`);
    verifier(apres.confirmedAt === null, "rien n'est confirmé");
    verifier(apres.reconciledAt !== null, "et pourtant la ligne vient d'être rapprochée");
  }

  // ── 5. Le webhook arrive en même temps ──────────────────────────────
  console.log("\nLe webhook arrive en même temps");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 15 });
    const consultant = consultantSimule(transaction.reference, {
      issue: "connu",
      statut: "CONFIRMEE",
      providerTxId: transaction.providerTxId!,
    });

    /*
      Les deux annoncent la même chose, en même temps, par deux chemins
      et deux clés d'événement différentes. Ce qui les départage n'est
      pas la clé : c'est la table des transitions, qui exige que l'état
      lu n'ait pas bougé. Le perdant n'écrit rien.
    */
    const [parLeWebhook] = await Promise.all([
      appliquerLaNotification({
        providerEventId: "stripe:evt_course",
        providerTxId: transaction.providerTxId!,
        reference: transaction.reference,
        statut: "CONFIRMEE",
      }),
      reconcilierLesPaiements(new Date(), () => consultant),
    ]);

    const apres = await relire(transaction.id);
    verifier(apres.status === "CONFIRMEE", `le paiement est confirmé une fois (${apres.status})`);
    const credits = await db.analysisCredit.count({ where: { applicationId } });
    verifier(credits === 1, `les droits sont crédités exactement une fois (${credits})`);
    console.log(`    (webhook : ${parLeWebhook.issue})`);

    // Et une passe de plus, après coup, ne rouvre rien.
    await reconcilierLesPaiements(new Date(), () => consultant);
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 1,
      "une passe de plus ne crédite pas davantage",
    );
  }

  // ── 6. Le fournisseur renvoie un identifiant incohérent ─────────────
  console.log("\nLe fournisseur renvoie un identifiant incohérent");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 15 });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(transaction.reference, {
        issue: "incoherent",
        detail: "la session rendue n'est pas celle demandée",
      }),
    );
    const apres = await relire(transaction.id);
    verifier(apres.status === "EN_ATTENTE", `rien n'est appliqué (${apres.status})`);
    verifier(
      (apres.discrepancy ?? "").includes("incohérente"),
      "l'écart s'ouvre tout de suite, pas dans vingt-quatre heures",
    );
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 0,
      "et rien n'est crédité sur une réponse qui parle d'autre chose",
    );
  }

  // ── 7. L'expiration reste celle de la plateforme ────────────────────
  console.log("\nL'expiration reste celle de la plateforme");
  {
    // Sous le délai d'expiration : même sans paiement, rien n'expire.
    const jeune = await transactionEnAttente({ ilYAMinutes: 15 });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(jeune.transaction.reference, { issue: "sans_paiement" }),
    );
    verifier(
      (await relire(jeune.transaction.id)).status === "EN_ATTENTE",
      "une session sans paiement n'expire pas avant l'heure",
    );

    // Au-delà : la règle de la plateforme s'applique, comme avant.
    const vieille = await transactionEnAttente({ ilYAMinutes: 90 });
    await reconcilierLesPaiements(new Date(), () =>
      consultantSimule(vieille.transaction.reference, { issue: "sans_paiement" }),
    );
    const apres = await relire(vieille.transaction.id);
    verifier(apres.status === "EXPIREE", `passé l'heure, elle expire (${apres.status})`);
    verifier(
      apres.failureCause === "DELAI_DEPASSE",
      "avec le seul motif que la plateforme peut prononcer",
    );
  }
  /*
    ── Le crédit interrompu ────────────────────────────────────────────

    `crediterLAchat` court hors de la transaction qui pose `CONFIRMEE` :
    un arrêt entre les deux laisse un paiement encaissé et rien d'ouvert.
    Le rejeu du webhook rend « rejeu » — juste pour l'état, faux pour la
    contrepartie — et cette passe ne lisait que `INITIEE | EN_ATTENTE`.
  */
  console.log("\nUn paiement confirmé sans contrepartie est achevé, une fois");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 5 });
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMEE", confirmedAt: new Date(), packCode: "essentiel" },
    });

    verifier(await solde(applicationId) === 0, "le paiement est encaissé et rien n'est ouvert");

    const rejeu = await appliquerLaNotification({
      providerEventId: `evt-rejeu-${process.pid}`,
      providerTxId: transaction.providerTxId!,
      reference: transaction.reference,
      statut: "CONFIRMEE",
    });
    verifier(rejeu.issue === "rejeu", `le rejeu du webhook n'y change rien (${rejeu.issue})`);
    verifier(await solde(applicationId) === 0, "et n'ouvre toujours rien");

    const premiere = await reconcilierLesPaiements(new Date(), () => null);
    verifier(premiere.creditsAcheves === 1, `la passe l'achève (${premiere.creditsAcheves})`);
    const ouvert = await solde(applicationId);
    verifier(ouvert > 0, `la contrepartie est ouverte (${ouvert} analyses)`);
    verifier(
      (await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status === "ACTIF",
      "et le dossier s'ouvre, comme il l'aurait fait au paiement",
    );

    const seconde = await reconcilierLesPaiements(new Date(), () => null);
    verifier(seconde.creditsAcheves === 0, `une seconde passe n'achève rien (${seconde.creditsAcheves})`);
    verifier(await solde(applicationId) === ouvert, "et ne crédite pas deux fois");
  }

  // ── 8 bis. Deux achèvements simultanés du même paiement ────────────
  /*
    La lecture de la contrepartie rend l'achèvement rejouable ; elle ne le
    rendait pas sûr à deux. La notification signée l'appelle juste après
    avoir commité `CONFIRMEE`, la passe de réconciliation balaie les
    paiements confirmés et appelle la même : entre le commit et le crédit,
    les deux lisaient « rien d'ouvert ».

    Constaté en exécution avant la garde — un pack payé une fois, deux
    fois crédité, quota doublé. Une fumée, parce que la course n'existe
    qu'en base : c'est le verrou de ligne du `UPDATE` conditionnel qui
    arbitre, et rien d'autre ne peut le simuler.
  */
  console.log("\nDeux achèvements simultanés n'ouvrent qu'une contrepartie");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 5 });
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMEE", confirmedAt: new Date(), packCode: "essentiel" },
    });
    const confirmee = await relire(transaction.id);

    const retours = await Promise.all([acheverLeCredit(confirmee), acheverLeCredit(confirmee)]);
    /*
      C'est ici que la vérification porte, et pas sur le nombre de lignes
      écrites : combien d'argent le second appelant ouvre dépend de
      l'entrelacement — parfois deux crédits, parfois un, selon que sa
      lecture tombe avant ou après l'écriture du premier. Ce qui ne dépend
      d'aucun entrelacement, c'est qu'un seul appelant obtienne le bail.
    */
    verifier(
      retours.filter(Boolean).length === 1,
      `un seul appelant ouvre la contrepartie (${JSON.stringify(retours)})`,
    );
    const lignes = await db.analysisCredit.count({ where: { transactionId: transaction.id } });
    verifier(lignes === 1, `et une seule ligne de crédit est écrite (${lignes})`);
    const ouvert = await solde(applicationId);

    /*
      Et le bail se reprend : un processus arrêté entre la prise et le
      crédit laisserait la ligne tenue pour toujours, et le filet qui
      rattrape un crédit interrompu ne reviendrait jamais.
    */
    const perime = await transactionEnAttente({ ilYAMinutes: 5 });
    await db.transaction.update({
      where: { id: perime.transaction.id },
      data: {
        status: "CONFIRMEE",
        confirmedAt: new Date(),
        packCode: "essentiel",
        creditingAt: new Date(Date.now() - 10 * MINUTE),
      },
    });
    const reprise = await reconcilierLesPaiements(new Date(), () => null);
    verifier(reprise.creditsAcheves === 1, `un bail périmé se reprend (${reprise.creditsAcheves})`);
    verifier(await solde(perime.applicationId) > 0, "et la contrepartie s'ouvre");
    verifier(await solde(applicationId) === ouvert, "sans toucher au dossier déjà servi");
  }

  /* Une couverture partielle est un état normal : elle n'est pas reprise. */
  console.log("\nUne couverture partielle n'est pas un crédit manquant");
  {
    const { transaction, applicationId } = await transactionEnAttente({ ilYAMinutes: 5 });
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMEE", confirmedAt: new Date(), packCode: "pro" },
    });
    // Un Pro couvre trois destinations ; un seul dossier existe, donc une
    // seule est servie. C'est ce que le paiement a réellement produit.
    await appliquerLaCouverture(transaction.userId, {
      applicationId,
      transactionId: transaction.id,
    });
    const servi = await solde(applicationId);
    verifier(servi > 0, `une destination est servie (${servi} analyses)`);

    const passe = await reconcilierLesPaiements(new Date(), () => null);
    verifier(
      passe.creditsAcheves === 0,
      `la passe n'y touche pas (${passe.creditsAcheves}) : il manque des destinations, pas un crédit`,
    );
    verifier(await solde(applicationId) === servi, "et le quota ne bouge pas");
  }

  /*
    S.122 — la passe lancée à la main (B-04) et celle du worker passent par
    le même verrou. On en tient un autre exemplaire dans une transaction
    ouverte : la passe ne doit alors rien faire et rendre `null`, puis
    redevenir possible dès que le verrou est relâché.
  */
  console.log("\nPasse sans recouvrement (verrou consultatif)");
  {
    const { reconcilierSansRecouvrement, CLE_DU_VERROU_DE_RECONCILIATION } = await import(
      "../src/server/jobs/reconciliation"
    );
    const libre = await reconcilierSansRecouvrement(new Date(), () => null);
    verifier(libre !== null, "sans autre passe, elle s'exécute et rend un bilan");
    verifier(
      libre !== null && libre.indisponibles === libre.examinees,
      "sans consultant, toute transaction examinée est comptée indisponible",
    );

    let relacher: () => void = () => {};
    const tenu = new Promise<void>((fin) => {
      relacher = fin;
    });
    let verrouPose: () => void = () => {};
    const pose = new Promise<void>((fin) => {
      verrouPose = fin;
    });
    const autrePasse = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CLE_DU_VERROU_DE_RECONCILIATION}, 0))`;
        verrouPose();
        await tenu;
      },
      { timeout: 30_000 },
    );
    await pose;
    const bloquee = await reconcilierSansRecouvrement(new Date(), () => null);
    verifier(bloquee === null, "pendant qu'une autre passe tient le verrou, elle rend null sans rien faire");
    relacher();
    await autrePasse;
    const reprise = await reconcilierSansRecouvrement(new Date(), () => null);
    verifier(reprise !== null, "le verrou relâché, la passe suivante s'exécute");
  }
} finally {
  await db.$disconnect().catch(() => {});
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

console.log(
  echecs.length === 0
    ? "\nLa réconciliation rattrape, refuse de conclure, et ne crédite jamais deux fois."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
