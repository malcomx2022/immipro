/**
 * Le rail FedaPay de bout en bout, avec son vrai adaptateur — S.109.
 *
 * `smoke:tunnel` éprouve l'enchaînement avec un ouvreur injecté qui ne
 * parle à personne. C'est ce qui a laissé passer le défaut de la
 * référence : l'adaptateur envoyait la nôtre dans `reference`, que
 * FedaPay génère lui-même, et attendait de la relire au même endroit.
 * Aucun essai ne confrontait l'adaptateur, la route du webhook et la base
 * à des réponses de la forme que FedaPay documente.
 *
 * Ici, rien n'est injecté dans la plateforme :
 *
 * - l'ouverture passe par `lOuvreur`, donc par l'adaptateur réel, devant
 *   un `fetch` qui répond comme FedaPay le documente — `reference` est la
 *   sienne, et la réponse de création ne rend pas nos métadonnées ;
 * - la notification passe par **la route** `POST /api/webhooks/fedapay`,
 *   signée comme le SDK de FedaPay la vérifie (`t=…,s=…`, HMAC-SHA256
 *   de `t.corps`) ;
 * - la base est PostgreSQL, jetable.
 *
 * Aucun appel réseau, aucun débit. Le bac à sable réel s'éprouve avec
 * `npm run sandbox:paiement`, qui demande les clés.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:fedapay
 */
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_fedapay_${process.pid}`;
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

console.log(`Rail FedaPay sur une base jetable (${nomBase})`);
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

// La configuration du pilote : FedaPay seul, Stripe vide. Aucune vraie clé.
const SECRET = "wh_fumee_fedapay";
Object.assign(process.env, {
  PAIEMENT_FOURNISSEURS: "FEDAPAY",
  FEDAPAY_ENVIRONMENT: "sandbox",
  FEDAPAY_API_KEY: "sk_sandbox_fumee",
  FEDAPAY_WEBHOOK_SECRET: SECRET,
  APP_URL: "https://immipro.test",
  STRIPE_API_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
});

const { db } = await import("../src/lib/db");
const { ouvrirLeTunnel } = await import("../src/server/acces/paiements");
const { POST: webhook } = await import("../src/app/api/webhooks/fedapay/route");

/* FedaPay, tel que sa documentation le décrit — et rien de plus. */
let prochainId = 516680;
const creations: Record<string, unknown>[] = [];
const fetchReel = globalThis.fetch;
globalThis.fetch = (async (entree: string | URL | Request, options?: RequestInit) => {
  const url = String(entree);
  if (!url.startsWith("https://sandbox-api.fedapay.com/v1/")) {
    throw new Error(`appel réseau inattendu : ${url}`);
  }
  const chemin = url.replace("https://sandbox-api.fedapay.com/v1", "");
  const json = (statut: number, corps: unknown) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
  if (chemin === "/transactions" && options?.method === "POST") {
    const corps = JSON.parse(String(options.body)) as Record<string, unknown>;
    creations.push(corps);
    prochainId += 1;
    // La réponse de création documentée : leur référence, pas nos métadonnées.
    return json(201, {
      "v1/transaction": {
        id: prochainId,
        reference: `trx_fumee_${prochainId}`,
        amount: corps.amount,
        status: "pending",
        currency_id: 1,
      },
    });
  }
  const jeton = /^\/transactions\/(\d+)\/token$/u.exec(chemin);
  if (jeton) {
    return json(200, { token: "tok", url: `https://sandbox-process.fedapay.com/${jeton[1]}` });
  }
  return json(404, {});
}) as typeof fetch;

/** Un événement tel que FedaPay l'envoie : la transaction entière sous `entity`. */
const evenement = (id: number, statut: string, meta?: Record<string, unknown>) =>
  JSON.stringify({
    name: `transaction.${statut}`,
    object: "transaction",
    entity: {
      id,
      reference: `trx_fumee_${id}`,
      status: statut,
      amount: 10000,
      ...(meta ? { custom_metadata: meta } : {}),
    },
  });

/** L'en-tête que FedaPay calcule, tel que son SDK le vérifie. */
const signe = (corps: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},s=${createHmac("sha256", secret).update(`${t}.${corps}`, "utf8").digest("hex")}`;

const poster = (corps: string, entete?: string) =>
  webhook(
    new Request("https://immipro.test/api/webhooks/fedapay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(entete ? { "x-fedapay-signature": entete } : {}),
      },
      body: corps,
    }),
    { params: Promise.resolve({}) },
  );

let rang = 0;
async function candidat(): Promise<{ userId: string; applicationId: string }> {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-fedapay-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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
  return { userId: user.id, applicationId: application.id };
}

const ACHAT = (applicationId: string) => ({ type: "pack", code: "dossier", applicationId }) as const;

try {
  console.log("\nOuverture par l'adaptateur réel");
  const { userId, applicationId } = await candidat();
  const ouvert = await ouvrirLeTunnel(userId, ACHAT(applicationId), "XOF");
  const tx = await db.transaction.findFirstOrThrow({ where: { userId } });
  verifier(ouvert.url.startsWith("https://sandbox-process.fedapay.com/"), "la page hébergée est rendue");
  verifier(tx.providerTxId === `fedapay:${prochainId}`, `l'identifiant FedaPay est enregistré (${tx.providerTxId})`);
  verifier(tx.status !== "CONFIRMEE", `le paiement attend sa notification (${tx.status})`);
  const envoye = creations.at(-1)!;
  verifier(
    JSON.stringify(envoye.custom_metadata) === JSON.stringify({ reference: tx.reference }),
    "notre référence part dans custom_metadata",
  );
  verifier(!("reference" in envoye), "aucun champ `reference` n'est envoyé — FedaPay le génère");

  const id = prochainId;
  const approuvee = evenement(id, "approved", { reference: tx.reference });

  console.log("\nINV-7 — seule une notification signée crédite");
  const sansEntete = await poster(approuvee);
  verifier(sansEntete.status >= 400, `sans signature : refusée (${sansEntete.status})`);
  const mauvaisSecret = await poster(approuvee, signe(approuvee, "wh_autre_secret"));
  verifier(mauvaisSecret.status >= 400, `signée d'un autre secret : refusée (${mauvaisSecret.status})`);
  const alteree = await poster(approuvee.replace("approved", "approved "), signe(approuvee));
  verifier(alteree.status >= 400, `corps modifié après signature : refusée (${alteree.status})`);
  const perimee = await poster(approuvee, signe(approuvee, SECRET, Math.floor(Date.now() / 1000) - 3600));
  verifier(perimee.status >= 400, `horodatage d'il y a une heure : refusée (${perimee.status})`);
  verifier(
    (await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).status === tx.status,
    "après quatre refus, l'état n'a pas bougé",
  );
  verifier((await db.analysisCredit.count({ where: { applicationId } })) === 0, "aucun droit ouvert");

  console.log("\nNotification signée, telle que FedaPay l'envoie");
  const reponse = await poster(approuvee, signe(approuvee));
  verifier(reponse.status === 200, `acceptée (${reponse.status})`);
  const confirmee = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
  verifier(confirmee.status === "CONFIRMEE", "le paiement est confirmé");
  verifier(confirmee.reconciledAt !== null, "et rapproché (INV-7)");
  const credits = await db.analysisCredit.count({ where: { applicationId } });
  verifier(credits > 0, `les droits sont ouverts (${credits} ligne(s))`);
  const rejeu = await poster(approuvee, signe(approuvee));
  verifier(rejeu.status === 200, "le même événement renvoyé est accepté…");
  verifier(
    (await db.analysisCredit.count({ where: { applicationId } })) === credits,
    "… et ne crédite pas deux fois",
  );

  console.log("\nÉvénement sans nos métadonnées : retrouvé par l'identifiant");
  {
    const autre = await candidat();
    await ouvrirLeTunnel(autre.userId, ACHAT(autre.applicationId), "XOF");
    const corps = evenement(prochainId, "approved");
    const vu = await poster(corps, signe(corps));
    verifier(vu.status === 200, `acceptée (${vu.status})`);
    const t = await db.transaction.findFirstOrThrow({ where: { userId: autre.userId } });
    verifier(t.status === "CONFIRMEE", "le bon paiement est confirmé, par fedapay:<id>");
  }

  console.log("\nSans secret configuré, rien ne passe (fail-closed)");
  {
    const autre = await candidat();
    await ouvrirLeTunnel(autre.userId, ACHAT(autre.applicationId), "XOF");
    const t = await db.transaction.findFirstOrThrow({ where: { userId: autre.userId } });
    const corps = evenement(prochainId, "approved", { reference: t.reference });
    process.env.FEDAPAY_WEBHOOK_SECRET = "";
    const vu = await poster(corps, signe(corps));
    process.env.FEDAPAY_WEBHOOK_SECRET = SECRET;
    verifier(vu.status >= 400, `refusée (${vu.status})`);
    verifier(
      (await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).status === t.status,
      "et l'état n'a pas bougé",
    );
  }

  console.log("\nStripe fermé : aucun paiement en euros ne s'ouvre");
  {
    const autre = await candidat();
    const refus = await ouvrirLeTunnel(autre.userId, ACHAT(autre.applicationId), "EUR").then(
      () => null,
      (e: unknown) => e,
    );
    verifier(refus !== null, "l'ouverture en euros est refusée");
    verifier(
      (await db.transaction.count({ where: { userId: autre.userId } })) === 0,
      "sans rien écrire",
    );
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  globalThis.fetch = fetchReel;
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLe rail FedaPay tient de l'ouverture au crédit, et rien de non signé ne crédite.");
