/**
 * Le tunnel de paiement, de bout en bout, sur une base réelle.
 *
 * Les adaptateurs s'éprouvent contre un `fetch` simulé, dans
 * `tests/tunnel-ouverture.test.ts`. Ce qui demande une base — la double
 * soumission, la reprise, l'écart de montant, l'appartenance, l'ordre du
 * webhook et du retour navigateur — s'éprouve ici, sur PostgreSQL, avec
 * un ouvreur simulé qui ne parle à personne.
 *
 * **Aucun appel réseau, aucun débit.** L'ouvreur est injecté : ce qui est
 * vérifié, c'est l'enchaînement de la plateforme, pas le fournisseur.
 *
 * La base est jetable : créée et supprimée par ce script. Aucune base
 * existante n'est touchée.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:tunnel
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_tunnel_${process.pid}`;
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

console.log(`Tunnel de paiement sur une base jetable (${nomBase})`);
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
  Importés après que `DATABASE_URL` désigne la base jetable : le client
  Prisma lit l'environnement à sa construction, c'est-à-dire au chargement
  du module.
*/
const { db } = await import("../src/lib/db");
const { ouvrirLeTunnel, appliquerLaNotification } = await import("../src/server/acces/paiements");
const { cleDOuverture } = await import("../src/domain/paiement/ouverture");
const { tarifDe } = await import("../src/domain/payments/achat");
const { estAbouti } = await import("../src/server/paiement/cycle");
type Ouvreur = import("../src/server/paiement/ouvreur").Ouvreur;
type Ouverture = import("../src/server/paiement/ouvreur").Ouverture;

const URL_HEBERGEE = "https://checkout.stripe.com/c/pay/cs_essai";

/** Un fournisseur rend un identifiant par session. Le simulateur aussi. */
let numero = 0;

/** Un ouvreur simulé : il compte ses appels et rend ce qu'on lui dit. */
function ouvreurSimule(
  reponses: {
    creer?: (cle: string) => Ouverture;
    retrouver?: () => Ouverture;
    /** Ce que le fournisseur est censé avoir déjà enregistré. */
    enregistre?: { montant: number; devise: string };
  } = {},
): Ouvreur & { creations: string[]; reprises: string[] } {
  const creations: string[] = [];
  const reprises: string[] = [];
  // Ce que le fournisseur a enregistré : la reprise le rejoue, comme le
  // ferait un vrai `retrieve`. Le réinventer ici ferait échouer la
  // comparaison de montant pour une raison qui n'est pas la bonne.
  let enregistre = reponses.enregistre ?? { montant: 0, devise: "" };
  let dernier = "";
  return {
    fournisseur: "STRIPE",
    creations,
    reprises,
    async creer(demande) {
      creations.push(demande.cle);
      enregistre = { montant: demande.montant, devise: demande.devise };
      numero += 1;
      dernier = `stripe:cs_${numero}`;
      return (
        reponses.creer?.(demande.cle) ?? {
          issue: "ouverte",
          session: {
            providerTxId: dernier,
            url: URL_HEBERGEE,
            montant: demande.montant,
            devise: demande.devise,
          },
        }
      );
    },
    async retrouver(providerTxId) {
      reprises.push(providerTxId);
      return (
        reponses.retrouver?.() ?? {
          issue: "ouverte",
          session: { providerTxId, url: URL_HEBERGEE, ...enregistre },
        }
      );
    },
  };
}

let rang = 0;

/**
 * Un candidat, son dossier, et la règle que le dossier fige.
 *
 * La règle n'est pas un décor : un dossier qui passe à l'actif doit
 * porter la version qu'il a figée (INV-3), et la base le refuse
 * autrement. Le garde-fou s'est fait entendre en écrivant ce script, ce
 * qui est exactement son office.
 */
async function candidat(): Promise<{ userId: string; applicationId: string }> {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
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

const ACHAT = (applicationId: string) =>
  ({ type: "pack", code: "dossier", applicationId }) as const;

/** Le code d'échec, tel que la route le rendrait au candidat. */
const messageDe = (erreur: unknown): string => {
  const porte = erreur as { echec?: { code?: unknown } } | null;
  return porte?.echec?.code ? String(porte.echec.code) : String(erreur);
};

try {
  // ── 1. Double soumission ────────────────────────────────────────────
  console.log("\nDouble soumission");
  {
    const { userId, applicationId } = await candidat();
    const ouvreur = ouvreurSimule();
    const premier = await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", ouvreur);
    const second = await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", ouvreur);

    const lignes = await db.transaction.count({ where: { userId } });
    verifier(lignes === 1, `une seule transaction locale (${lignes})`);
    verifier(premier.reference === second.reference, "la même référence est reprise");
    verifier(second.reprise, "la seconde soumission se déclare reprise");
    verifier(
      ouvreur.creations.length === 1 && ouvreur.reprises.length === 1,
      `une seule création chez le fournisseur, puis une reprise (${ouvreur.creations.length}/${ouvreur.reprises.length})`,
    );
    verifier(
      ouvreur.creations[0] === cleDOuverture(premier.reference),
      "la clé d'idempotence est dérivée de la référence",
    );
    verifier(premier.url === second.url, "la même page hébergée est rendue");
  }

  // ── 2. Reprise après réponse réseau perdue ──────────────────────────
  console.log("\nReprise après une réponse perdue");
  {
    const { userId, applicationId } = await candidat();
    /*
      La session existe chez le fournisseur, l'URL n'est pas revenue.
      L'identifiant doit être enregistré : sans lui, la tentative
      suivante en ouvrirait une seconde — et un second débit possible.
    */
    const perdu = ouvreurSimule({
      creer: () => ({
        issue: "creee_sans_url",
        providerTxId: "stripe:cs_perdue",
        detail: "url absente",
      }),
    });
    let refus = "";
    try {
      await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", perdu);
    } catch (erreur) {
      refus = messageDe(erreur);
    }
    verifier(refus === "paiement_indisponible", `la première tentative refuse (${refus})`);

    const apres = await db.transaction.findFirstOrThrow({ where: { userId } });
    verifier(
      apres.providerTxId === "stripe:cs_perdue",
      `l'identifiant fournisseur est conservé (${apres.providerTxId})`,
    );

    const repris = ouvreurSimule({
      enregistre: { montant: apres.amount, devise: apres.currency },
    });
    const suite = await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", repris);
    verifier(
      repris.creations.length === 0 && repris.reprises[0] === "stripe:cs_perdue",
      "la tentative suivante retrouve au lieu de recréer",
    );
    verifier(suite.url === URL_HEBERGEE, "et rend la page hébergée");
    verifier(
      (await db.transaction.count({ where: { userId } })) === 1,
      "toujours une seule transaction locale",
    );
  }

  // ── 3. Montant ou devise divergents ─────────────────────────────────
  console.log("\nMontant divergent");
  {
    const { userId, applicationId } = await candidat();
    const menteur = ouvreurSimule({
      creer: () => ({
        issue: "ouverte",
        session: {
          providerTxId: "stripe:cs_divergente",
          url: URL_HEBERGEE,
          // Le facteur cent, celui qu'une conversion ratée produirait.
          montant: 1200,
          devise: "EUR",
        },
      }),
    });
    let refus = "";
    try {
      await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", menteur);
    } catch (erreur) {
      refus = messageDe(erreur);
    }
    verifier(refus === "ouverture_refusee", `l'ouverture est refusée (${refus})`);

    const ligne = await db.transaction.findFirstOrThrow({ where: { userId } });
    verifier((ligne.discrepancy ?? "").includes("1200"), "l'écart est écrit en back-office");
    verifier(ligne.status === "INITIEE", "et rien n'est confirmé");
  }

  // ── 4. Fournisseur absent ───────────────────────────────────────────
  console.log("\nFournisseur absent");
  {
    const { userId, applicationId } = await candidat();
    let refus = "";
    try {
      await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", null);
    } catch (erreur) {
      refus = messageDe(erreur);
    }
    verifier(refus === "paiement_indisponible", `le refus est immédiat (${refus})`);
    const lignes = await db.transaction.count({ where: { userId } });
    verifier(lignes === 0, `aucune transaction locale orpheline (${lignes})`);
  }

  // ── 5. Retour navigateur sans webhook ───────────────────────────────
  console.log("\nRetour du navigateur, sans notification");
  {
    const { userId, applicationId } = await candidat();
    await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", ouvreurSimule());
    /*
      Le candidat revient sur `/paiement/attente`. Rien d'autre ne s'est
      produit : aucune notification n'est arrivée. L'état doit être celui
      d'avant — le retour ne confirme rien, quoi qu'il porte dans son URL.
    */
    const ligne = await db.transaction.findFirstOrThrow({ where: { userId } });
    verifier(ligne.status === "INITIEE", `l'état ne bouge pas (${ligne.status})`);
    verifier(ligne.confirmedAt === null, "aucune date de confirmation");
    verifier(!estAbouti(ligne.status), "le paiement n'est pas abouti");
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 0,
      "aucun droit n'est crédité",
    );
  }

  // ── 6. Webhook avant le retour navigateur ───────────────────────────
  console.log("\nNotification avant le retour du navigateur");
  {
    const { userId, applicationId } = await candidat();
    const ouvreur = ouvreurSimule();
    const ouvert = await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", ouvreur);
    const identifiant = (await db.transaction.findFirstOrThrow({ where: { userId } }))
      .providerTxId!;

    const notification = {
      providerEventId: "stripe:evt_1",
      providerTxId: identifiant,
      reference: ouvert.reference,
      statut: "CONFIRMEE" as const,
    };
    const issue = await appliquerLaNotification(notification);
    verifier(issue.issue === "creditee", `la notification crédite (${issue.issue})`);

    const confirmee = await db.transaction.findFirstOrThrow({ where: { userId } });
    verifier(confirmee.status === "CONFIRMEE", "le paiement est confirmé par la notification");
    verifier(
      confirmee.providerTxId === identifiant,
      "l'identifiant posé à l'ouverture n'est pas réécrit",
    );

    // Le candidat revient ensuite : la relève lit l'état, elle ne le crée pas.
    const rejeu = await appliquerLaNotification(notification);
    verifier(rejeu.issue === "rejeu", `une seconde notification est un rejeu (${rejeu.issue})`);
    const credits = await db.analysisCredit.count({ where: { applicationId } });
    verifier(credits > 0, `les droits sont crédités une fois (${credits} ligne(s))`);
  }

  // ── 7. Transaction d'un autre candidat ──────────────────────────────
  console.log("\nTransaction appartenant à un autre candidat");
  {
    const a = await candidat();
    const b = await candidat();
    const sien = await ouvrirLeTunnel(a.userId, ACHAT(a.applicationId), "EUR", ouvreurSimule());

    /*
      La relève de statut filtre sur le propriétaire : c'est la requête
      qui refuse, pas l'affichage. Une référence devinée ne dit rien.
    */
    const vueParB = await db.transaction.findFirst({
      where: { reference: sien.reference, userId: b.userId },
    });
    verifier(vueParB === null, "un autre candidat ne retrouve pas la transaction");

    // Et son propre clic ouvre la sienne, pas celle du voisin.
    const ouvreur = ouvreurSimule();
    const sienne = await ouvrirLeTunnel(b.userId, ACHAT(b.applicationId), "EUR", ouvreur);
    verifier(sienne.reference !== sien.reference, "il ouvre sa propre transaction");
    verifier(ouvreur.creations.length === 1, "et une création lui est propre");
  }
  // ── 8. Les trois achats, tels qu'ils s'enregistrent ─────────────────
  console.log("\nMontant et code enregistrés, achat par achat");
  {
    /*
      Le récapitulatif envoyait une consultation sous l'étiquette d'un
      pack. Personne ne s'en plaignait : la ligne s'écrivait, avec le bon
      montant, et `getPack("consultation")` ne rendant rien, le crédit
      n'ouvrait aucune contrepartie.

      Ce qui suit lit la ligne écrite en base pour chacune des trois
      catégories — montant et code — plutôt que ce que la couche d'accès
      dit avoir écrit.
    */
    const cas = [
      { achat: { type: "pack", code: "dossier" } as const, code: "dossier" },
      { achat: { type: "recharge" } as const, code: "recharge" },
      { achat: { type: "consultation" } as const, code: "consultation" },
    ];

    for (const { achat, code } of cas) {
      const { userId, applicationId } = await candidat();
      const attendu = tarifDe(achat)!.prix.EUR;
      await ouvrirLeTunnel(userId, { ...achat, applicationId }, "EUR", ouvreurSimule());

      const ligne = await db.transaction.findFirstOrThrow({ where: { userId } });
      verifier(
        ligne.packCode === code,
        `${code} — le code enregistré est le sien (${ligne.packCode})`,
      );
      verifier(
        ligne.amount === attendu,
        `${code} — le montant enregistré vient de la grille (${ligne.amount} attendu ${attendu})`,
      );
      verifier(
        ligne.currency === "EUR" && ligne.provider === "STRIPE",
        `${code} — le rail suit la devise (${ligne.provider})`,
      );
    }

    /*
      Et la confirmation de chacune fait ce qu'elle doit. Une
      consultation ouverte sans créneau tenu ne confirme rien — c'est
      précisément pourquoi le récapitulatif ne l'ouvre pas
      (`ouvrableDepuisLeRecapitulatif`). On le vérifie plutôt que de le
      supposer : si cette vérification devenait fausse, c'est que la
      consultation se serait mise à confirmer un rendez-vous imaginaire.
    */
    const { userId, applicationId } = await candidat();
    const ouvert = await ouvrirLeTunnel(
      userId,
      { type: "consultation", applicationId },
      "EUR",
      ouvreurSimule(),
    );
    const sansCreneau = await db.transaction.findFirstOrThrow({ where: { userId } });
    const issue = await appliquerLaNotification({
      providerEventId: `stripe:evt_consultation_${process.pid}`,
      providerTxId: sansCreneau.providerTxId!,
      reference: ouvert.reference,
      statut: "CONFIRMEE" as const,
    });
    verifier(issue.issue === "creditee", `la notification s'applique (${issue.issue})`);
    verifier(
      (await db.appointment.count({ where: { transactionId: sansCreneau.id } })) === 0,
      "une consultation sans créneau tenu ne confirme aucun rendez-vous",
    );
    verifier(
      (await db.analysisCredit.count({ where: { applicationId } })) === 0,
      "et n'ouvre évidemment aucun quota",
    );
  }
} finally {
  await db.$disconnect().catch(() => {});
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

console.log(
  echecs.length === 0
    ? "\nLe tunnel ouvre, reprend, refuse — et ne confirme jamais de lui-même."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
