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
const { ouvrirDossier } = await import("../src/server/acces/dossiers");
const { solde } = await import("../src/server/acces/quota");
const { getPack, analysesParDestination } = await import("../src/domain/payments/pricing");
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");
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

/** Ce que le back-office lit sous l'échec — et que le candidat ne voit pas. */
const diagnosticDe = (erreur: unknown): { service?: string; statutAmont?: number; trace?: string } =>
  (erreur as { diagnostic?: { service?: string; statutAmont?: number; trace?: string } })
    .diagnostic ?? {};

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
    verifier(refus === "ouverture_impossible", `le refus est immédiat (${refus})`);
    const lignes = await db.transaction.count({ where: { userId } });
    verifier(lignes === 0, `aucune transaction locale orpheline (${lignes})`);

    // Et il dit lequel des cinq. Le service se déduit de la devise même
    // quand aucun adaptateur n'est branché : c'est celui dont la clé
    // manque, et c'est ce que l'exploitant a besoin de lire.
    let vu: unknown = null;
    try {
      await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", null);
    } catch (erreur) {
      vu = erreur;
    }
    const sans = diagnosticDe(vu);
    verifier(sans.service === "stripe", `le service est nommé (${sans.service})`);
    verifier(
      (sans.trace ?? "").startsWith("sans référence · aucun_adaptateur"),
      `la trace dit qu'aucune transaction n'a été écrite (${sans.trace})`,
    );
  }

  // ── 4 bis. Cinq causes, cinq échecs distincts ───────────────────────
  /*
    Le contrat d'ouverture annonce que « les trois issues ne se traitent
    pas pareil — réessayer, refuser, alerter ». Son unique lecteur les
    traitait toutes pareil : cinq causes, `paiement_indisponible` au
    caractère près, sans diagnostic — et sans ligne de journal, puisque
    `route.ts` ne journalise que ce qui n'est **pas** un échec du
    catalogue. Une clé expirée ne laissait donc aucune trace nulle part.

    Ce bloc le constate là où cela se joue : sur la fonction qui écrit en
    base, avec un vrai enchaînement, et non sur un adaptateur isolé.
  */
  console.log("\nCinq causes, cinq échecs distincts");
  {
    const causes: [string, Ouverture, string, number | undefined][] = [
      ["injoignable", { issue: "injoignable", statut: 503, detail: "le fournisseur est en panne" }, "paiement_indisponible", 503],
      ["refusee", { issue: "refusee", statut: 401, detail: "api_key_expired" }, "ouverture_impossible", 401],
      [
        "reponse_inattendue",
        { issue: "reponse_inattendue", detail: "montant ou devise absents de la session" },
        "ouverture_impossible",
        undefined,
      ],
      [
        "creee_sans_url",
        { issue: "creee_sans_url", providerTxId: "stripe:cs_muette", detail: "url absente" },
        "paiement_indisponible",
        undefined,
      ],
    ];

    const traces = new Set<string>();
    for (const [nom, ouverture, attendu, statut] of causes) {
      const { userId, applicationId } = await candidat();
      let vu: unknown = null;
      try {
        await ouvrirLeTunnel(
          userId,
          ACHAT(applicationId),
          "EUR",
          ouvreurSimule({ creer: () => ouverture }),
        );
      } catch (erreur) {
        vu = erreur;
      }
      const code = messageDe(vu);
      const diagnostic = diagnosticDe(vu);
      verifier(code === attendu, `${nom} rend ${attendu} (${code})`);
      verifier(
        diagnostic.statutAmont === statut,
        `${nom} porte le statut du fournisseur (${String(diagnostic.statutAmont)})`,
      );
      verifier(
        (diagnostic.trace ?? "").includes(nom),
        `${nom} se nomme dans la trace (${diagnostic.trace})`,
      );
      traces.add(diagnostic.trace?.split(" · ")[1] ?? "");
    }
    verifier(traces.size === causes.length, `les quatre traces diffèrent (${traces.size})`);
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

  // ── Un pack qui annonce trois destinations en couvre trois ──────────
  console.log("\nRG-03.1 — un pack couvre le nombre de destinations qu'il annonce");
  {
    /*
      `Pack.destinations` — Essentiel 1, Dossier 1, Pro 3 — était déclaré
      et lu par personne. Un Pro à 45 000 XOF, dont le badge annonce
      « Trois destinations comparées en parallèle », ouvrait ses
      quatre-vingt-dix analyses sur un seul dossier : le candidat payait
      trois fois le prix de Dossier et recevait un seul dossier servi.

      La grille dit l'intention : 90 = 3 × 30, donc une destination de Pro
      ouvre exactement ce qu'ouvre un pack Dossier. Le prix n'est pas
      linéaire — 59 € ne font pas trois fois 29 —, c'est un lot remisé.
    */
    const { userId, applicationId } = await candidat();
    const pro = getPack("pro")!;
    const part = analysesParDestination(pro);
    verifier(part * pro.destinations === pro.analyses, `la part se divise sans reste (${part})`);

    const ouvert = await ouvrirLeTunnel(
      userId,
      { type: "pack", code: "pro", applicationId } as const,
      "XOF",
      ouvreurSimule(),
    );
    const achat = await db.transaction.findFirstOrThrow({ where: { userId } });
    await appliquerLaNotification({
      providerEventId: `stripe:evt_pro_${process.pid}`,
      providerTxId: achat.providerTxId!,
      reference: ouvert.reference,
      statut: "CONFIRMEE" as const,
    });

    const vise = await solde(applicationId);
    verifier(vise === part, `le dossier visé reçoit sa part, pas le pack entier (${vise})`);


    /*
      Et ce que le candidat en apprend. La répartition était juste et
      muette : sondé ici avant correction, l'écran de confirmation
      annonçait « Ton dossier est ouvert. » sur 3 destinations payées et
      1 servie, 90 analyses payées et 30 ouvertes. Les deux tiers de
      l'achat lui étaient réservés, et la couverture ne s'applique qu'à
      l'ouverture d'un dossier — geste que rien ne lui demandait.
    */
    {
      const { couvertureDuPaiement } = await import("../src/server/lecture/paiements");
      const { mentionDeLaCouverture } = await import("../src/domain/paiement/contrepartie");

      const lue = await couvertureDuPaiement(ouvert.reference, userId);
      verifier(
        lue?.destinations === pro.destinations && lue?.servies === 1,
        `l'écran lit la couverture réelle (${lue?.servies} sur ${lue?.destinations})`,
      );

      /*
        Sans repli, une lecture fausse ferait lever cette ligne au lieu de
        la faire échouer : la fumée dirait « erreur » là où elle doit dire
        laquelle des deux assertions tombe.
      */
      const mention = lue ? (mentionDeLaCouverture(lue.destinations, lue.servies) ?? "") : "";
      verifier(
        mention.includes("2 restent à ouvrir") && mention.includes("sans repayer"),
        `et nomme ce qui reste, avec le geste qui le débloque (« ${mention} »)`,
      );
    }

    /*
      Les deux destinations restantes s'ouvrent avec les dossiers, et il
      faut pour cela une vraie règle : `candidat()` fabrique un payload
      vide, que `ouvrirDossier` refuse à juste titre — il en dérive une
      checklist.
    */
    const reference = REGLES_DE_REFERENCE[0]!;
    const regle = await db.visaRule.create({
      data: {
        countryCode: "MA", visaType: reference.visaType, category: reference.category,
        version: 1, effectiveFrom: new Date("2026-01-01"), rules: reference.rules as never,
        sourceUrl: reference.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date("2026-01-01"), verifiedBy: "fumée",
        nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
      },
    });
    const deux = await ouvrirDossier(userId, regle.id, null);
    const trois = await ouvrirDossier(userId, regle.id, null);
    const [s2, s3] = [await solde(deux.id), await solde(trois.id)];
    verifier(s2 === part && s3 === part, `les deux autres destinations sont servies (${s2}, ${s3})`);

    const lignes = await db.analysisCredit.findMany({ where: { transactionId: achat.id } });
    const total = lignes.reduce((n, l) => n + l.delta, 0);
    verifier(total === pro.analyses, `le total ouvert est celui du pack, ni plus ni moins (${total})`);
    const couvertes = new Set(lignes.map((l) => l.applicationId)).size;
    verifier(couvertes === pro.destinations, `sur exactement ${pro.destinations} destinations (${couvertes})`);

    /*
      Et la couverture s'épuise. Sans cette assertion, un quatrième dossier
      servi passerait pour une générosité et coûterait un pack.
    */
    await db.application.update({ where: { id: trois.id }, data: { status: "ARCHIVE" } });
    const quatre = await ouvrirDossier(userId, regle.id, null);
    const s4 = await solde(quatre.id);
    verifier(s4 === 0, `le quatrième dossier n'est pas servi (${s4})`);
  }

  // ── B-07 : la ligne de coût lit le pack, pas le premier paiement ────
  /*
    `coutsParDossier` prenait `transactions[0]` — la première transaction
    confirmée, quelle que soit sa catégorie. Un dossier s'ouvre sans rien
    payer et T-05 propose une consultation sur un dossier déjà ouvert : la
    consultation se règle donc couramment **avant** le pack.
    `getPack("consultation")` ne rend rien, et toute la ligne s'éteignait —
    quota, part du quota, prix, part du prix.

    Le tri lit `?? 0` : le dossier sans quota tombe en bas de la liste
    censée montrer d'abord le plus alarmant. C'est la chute que le
    commentaire du tri dit avoir corrigée pour le tarif manquant, par
    l'autre porte.

    Une fumée, parce que le défaut est dans l'assemblage en base : les
    essais du domaine partent de lignes écrites à la main et restaient
    verts.
  */
  console.log("\nB-07 — la ligne de coût lit le pack du dossier, pas son premier paiement");
  {
    const { coutsParDossier } = await import("../src/server/lecture/backoffice");
    const pack = getPack("essentiel")!;

    /** Un dossier, son pack, et la part de quota qu'il consomme. */
    async function dossierQuiConsomme(consultationDabord: boolean, partDuQuota: number) {
      const { userId, applicationId } = await candidat();
      const base = Date.parse("2026-09-01T08:00:00Z");
      let rang = 0;
      if (consultationDabord) {
        await db.transaction.create({
          data: {
            userId, applicationId,
            reference: `IMP-C-${applicationId.slice(0, 8)}`,
            packCode: "consultation", amount: 35, currency: "EUR", provider: "STRIPE",
            status: "CONFIRMEE", confirmedAt: new Date(base + rang++ * 3_600_000),
          },
        });
      }
      await db.transaction.create({
        data: {
          userId, applicationId,
          reference: `IMP-P-${applicationId.slice(0, 8)}`,
          packCode: pack.code, amount: pack.prix.EUR, currency: "EUR", provider: "STRIPE",
          status: "CONFIRMEE", confirmedAt: new Date(base + rang++ * 3_600_000),
        },
      });
      await db.aiUsage.create({
        data: {
          userId, applicationId, operation: "redaction",
          inputTokens: Math.round(pack.tokensIA * partDuQuota * 0.6),
          outputTokens: Math.round(pack.tokensIA * partDuQuota * 0.4),
          costMicros: 0,
        },
      });
      return applicationId;
    }

    const packSeul = await dossierQuiConsomme(false, 10);
    const consultationAvant = await dossierQuiConsomme(true, 10);
    // Un troisième, sage, pour que le rang ait un sens : sans lui, deux
    // lignes se partagent les deux premières places quoi qu'il arrive.
    const sage = await dossierQuiConsomme(false, 0.1);

    const lignes = await coutsParDossier(null);
    const ligneDe = (id: string) => lignes.find((l) => l.dossierId === id);

    for (const [nom, id] of [
      ["pack seul", packSeul],
      ["consultation payée avant le pack", consultationAvant],
    ] as const) {
      const ligne = ligneDe(id);
      verifier(ligne?.pack === pack.code, `${nom} : le pack est nommé (${String(ligne?.pack)})`);
      verifier(
        ligne?.quotaJetons === pack.tokensIA,
        `${nom} : le quota du pack est lu (${String(ligne?.quotaJetons)})`,
      );
      verifier(
        Math.round((ligne?.partDuQuota ?? 0) * 100) === 1000,
        `${nom} : dix fois le quota (${Math.round((ligne?.partDuQuota ?? 0) * 100)} %)`,
      );
    }

    /*
      Et le tri les remonte tous les deux. Il lit `?? 0` : le dossier dont
      le quota n'était pas trouvé passait derrière un dossier sage, dans la
      liste qui montre d'abord le plus alarmant.
    */
    const rang = (id: string) => lignes.findIndex((l) => l.dossierId === id);
    verifier(
      rang(consultationAvant) < rang(sage),
      `le dossier à dix fois son quota passe avant le dossier sage (${rang(consultationAvant)} contre ${rang(sage)})`,
    );
    verifier(rang(packSeul) < rang(sage), "et l'autre aussi");
  }

  // ── 12. Le rapprochement que personne n'écrivait ────────────────────
  /*
    B-04 lit `reconciledAt` trois fois — l'état d'une ligne, l'état de
    l'opérateur, la caisse du jour — et aucun code de production ne
    l'écrivait. Les trois lectures rendaient donc toujours la même chose :
    « En attente de rapprochement » sur un paiement confirmé, `null` pour
    l'opérateur, une caisse vide un jour où elle avait tourné.

    Une fumée, parce que le défaut est dans l'assemblage : le paiement doit
    traverser le tunnel et la notification signée pour que la colonne soit
    écrite. Un essai partant d'une ligne posée à la main l'aurait déclarée
    rapprochée sans rien prouver.
  */
  console.log("\nB-04 — une confirmation date le rapprochement, et la caisse se remplit");
  {
    const { paiements, etatOperateur } = await import("../src/server/lecture/backoffice");
    const { agreger, totalPubliable, messageIncidentOperateur } = await import(
      "../src/domain/backoffice/reconciliation"
    );
    const { momentEnFrancais } = await import("../src/domain/format/moment");

    const { userId, applicationId } = await candidat();
    const ouvert = await ouvrirLeTunnel(userId, ACHAT(applicationId), "EUR", ouvreurSimule());
    const identifiant = (await db.transaction.findFirstOrThrow({ where: { userId } }))
      .providerTxId!;
    const issue = await appliquerLaNotification({
      providerEventId: "stripe:evt_rapprochement",
      providerTxId: identifiant,
      reference: ouvert.reference,
      statut: "CONFIRMEE",
    });
    verifier(issue.issue === "creditee", `la notification crédite (${issue.issue})`);

    const ligne = await db.transaction.findFirstOrThrow({ where: { userId } });
    verifier(ligne.reconciledAt !== null, "la confirmation date le rapprochement en base");
    verifier(
      ligne.confirmedAt?.getTime() === ligne.reconciledAt?.getTime(),
      "un seul instant pour le reçu et pour le rapprochement",
    );

    const jour = ligne.createdAt.toISOString().slice(0, 10);
    const lignes = await paiements(jour);
    const lue = lignes.find((l) => l.reference === ouvert.reference);
    verifier(lue?.etat === "RAPPROCHE", `la ligne se lit rapprochée (${String(lue?.etat)})`);

    const etat = await etatOperateur();
    verifier(etat !== null, "l'état de l'opérateur cesse d'être introuvable");
    verifier(etat?.disponible === true, "et il répond");
    verifier(etat ? totalPubliable(etat) : false, "le total du jour est publiable");
    const encaisse = agreger(lignes).encaisse;
    verifier((encaisse.EUR ?? 0) > 0, `la caisse du jour n'est plus vide (${JSON.stringify(encaisse)})`);

    /*
      Et le symétrique : trois heures sans le moindre achat ne font pas une
      panne d'opérateur. La règle d'avant — « rien depuis une heure ⇒
      indisponible » — accusait un tiers sur un silence qui était le nôtre,
      tous les matins, et retenait au passage le total de la journée.

      Les transactions restées en attente sont d'abord expirées, comme le
      job le fait au bout d'une heure : sans cela, ce sont elles qui
      attendraient l'opérateur, et la question posée ne serait pas celle-là.
    */
    await db.transaction.updateMany({
      where: { status: { in: ["INITIEE", "EN_ATTENTE"] } },
      data: { status: "EXPIREE", failureCause: "DELAI_DEPASSE", failureCauseAt: new Date() },
    });
    const troisHeuresPlusTard = new Date(Date.now() + 3 * 3_600_000);
    const calme = await etatOperateur(troisHeuresPlusTard);
    verifier(calme?.disponible === true, "trois heures sans achat ne déclarent pas l'opérateur muet");
    verifier(
      calme ? messageIncidentOperateur(calme, momentEnFrancais) === null : false,
      "aucun encadré d'incident sur une journée calme",
    );
    verifier(calme ? totalPubliable(calme) : false, "et le total de la journée reste publiable");

    /*
      En revanche, un paiement que l'opérateur laisse sans réponse au-delà
      du délai de rattrapage : là, le silence est bien le sien.
    */
    const enAttente = await candidat();
    await ouvrirLeTunnel(enAttente.userId, ACHAT(enAttente.applicationId), "EUR", ouvreurSimule());
    const muet = await etatOperateur(troisHeuresPlusTard);
    verifier(muet?.disponible === false, "une ligne laissée sans réponse, et l'incident s'affiche");
    verifier(
      muet ? messageIncidentOperateur(muet, momentEnFrancais) !== null : false,
      "avec son encadré",
    );
    verifier(muet ? !totalPubliable(muet) : false, "et le total du jour n'est plus publiable");
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
