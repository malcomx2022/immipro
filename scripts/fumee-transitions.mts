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
const { purgerSurDemande, purgerLesPiecesEchues } = await import("../src/server/jobs/purge");
const { traiterLesBrouillonsInactifs } = await import("../src/server/jobs/inactivite");
const { RELANCE_JOURS, ABANDON_JOURS } = await import("../src/domain/dossiers/inactivite");
const { recalculerCompletude, ouvrirDossier, checklistDepuis } = await import(
  "../src/server/acces/dossiers"
);
const { ouvrirLeTunnel, appliquerLaNotification } = await import("../src/server/acces/paiements");
type Ouvreur = Parameters<typeof ouvrirLeTunnel>[3];
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");
const { connecter } = await import("../src/server/acces/comptes");
const { empreinte } = await import("../src/server/securite/secret");
const { enregistrerLeProfil } = await import("../src/server/acces/profil");
const { corpsDuProfil, CHAMPS_PROFIL } = await import("../src/domain/comptes/profil");
const { enregistrerLAutorisation } = await import("../src/server/acces/consentements");
const { ESSAIS_AVANT_BLOCAGE, finDuBlocage } = await import(
  "../src/domain/comptes/connexion"
);

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

/*
  Chaque scénario a **sa** procédure. La propagation vise désormais toutes
  les versions antérieures d'un même pays et type de visa : partager
  `NL/etudes_mvv_vvr` entre les blocs les faisait se compter les uns les
  autres, et c'est le nouveau comportement qui a raison — un dossier resté
  sur v1 est bien concerné par la publication de v3.

  Le code pays sert d'espace de noms. Il n'a pas à être réaliste : ce que
  la fumée éprouve ici est la mécanique des états, pas la géographie.
*/
const PAYS = ["NL", "PT", "ES", "GR", "PL", "CZ", "HU", "RO", "SE", "FI", "DK", "AT"] as const;
let scenario = -1;
/** À appeler au début de chaque bloc : les versions qui suivent sont à lui. */
const nouveauScenario = () => {
  scenario += 1;
  // `rang` ne repart pas à zéro : il numérote les versions **et** les
  // adresses des candidats, qui doivent rester uniques d'un bout à
  // l'autre. Les versions n'ont pas besoin de commencer à 1 — elles
  // n'ont besoin d'être distinctes que pour un même pays.
  return PAYS[scenario % PAYS.length]!;
};
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

/** Un dossier réellement prêt : toutes les pièces obligatoires conformes. */
async function dossierPret(regleId: string) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-tr-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const application = await db.application.create({
    data: { userId: user.id, visaRuleId: regleId, status: "ACTIF" },
  });
  /*
    Le candidat ordinaire a accepté les alertes de règles : c'est cette
    autorisation que RG-11.3 suppose quand il demande un email nominatif.
    Elle était absente de la fixture, et le job ne la lisait pas non plus —
    les deux se sont tus ensemble, et l'email partait pour tout le monde.
  */
  await enregistrerLAutorisation(user.id, "alertes_regles", true);
  /*
    La checklist vient de `checklistDepuis`, comme celle qu'écrit une vraie
    ouverture. La construire à la main omettait `remedy` et
    `validityMonths` : la fixture décrivait un dossier que le produit ne
    sait pas produire, et le réalignement de la migration voyait donc
    changer des pièces qui n'avaient pas changé de version.
  */
  await db.document.createMany({
    data: checklistDepuis(brute.rules as never).map((p) => ({
      ...p,
      applicationId: application.id,
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
  paysCourant = nouveauScenario();
  {
    const r = await regle(brute.rules);
    const { application } = await dossierPret(r.id);
    const maj = await declarerLeDepot(application);
    verifier(maj.status === "SOUMIS", `le dossier passe à SOUMIS (${maj.status})`);
    verifier(maj.submittedAt !== null, "et la date de dépôt est posée");
    verifier(maj.readyAt === null, "la date de mise en état est retirée avec l'état");

    /*
      Et le tableau de bord cesse de lui parler de checklist. La prochaine
      action se déduisait des pièces quel que soit l'état : un dossier
      parti à l'autorité dont une pièce périssable arrive à échéance —
      la date est écrite au dépôt et relue chaque jour — affichait
      « Remplacer ton relevé bancaire » sur ce qu'il ne peut plus toucher.
    */
    const { tableauDeBord } = await import("../src/server/lecture/dossiers");
    const { MENTION_DEPOSE } = await import("../src/domain/dossiers/dossier");
    await db.document.updateMany({
      where: { applicationId: application.id },
      data: { expiresAt: new Date("2026-01-01") },
    });
    const vue = (await tableauDeBord(application.userId)).find((d) => d.id === application.id);
    verifier(
      vue?.prochaineAction === MENTION_DEPOSE,
      `le tableau de bord nomme l'état du dossier déposé (« ${vue?.prochaineAction} »)`,
    );
  }

  console.log("\nWF-10 — la clôture d'un dossier prêt, par quelqu'un qui renonce avant de déposer");
  paysCourant = nouveauScenario();
  {
    const r = await regle(brute.rules);
    const { application } = await dossierPret(r.id);
    const { dossier, purgeLe } = await cloturerLeDossier(application, "RENONCE", "Bourse refusée");
    verifier(dossier.status === "ISSUE_DECLAREE", `l'issue est enregistrée (${dossier.status})`);
    verifier(dossier.readyAt === null, "et la date de mise en état est retirée");
    verifier(purgeLe > new Date(), "la date de purge est annoncée à l'avance (RG-10.2)");
  }

  console.log("\nWF-11 — une divergence critique prévient TOUS les dossiers prêts");
  paysCourant = nouveauScenario();
  {
    const v1 = await regle(brute.rules);
    const perdue = CONDITIONS.find((c) => c.bloquant)!;
    const v2 = await regle({
      ...(brute.rules as object),
      conditions: CONDITIONS.filter((c) => c.code !== perdue.code),
    });

    const trois = [await dossierPret(v1.id), await dossierPret(v1.id), await dossierPret(v1.id)];

    const bilan = await propagerLaPublication(v2.id);
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

      Celui qui n'a rien arbitré est re-sélectionné aussi : il est
      `SUSPENDU`, et cet état est de ceux que la passe prévient depuis
      qu'elle a cessé de perdre le dossier qu'elle met elle-même en pause.
      C'est `alertedAt` qui l'écarte, lui aussi — la marque, et non le
      filtre d'état. La règle se dit donc ainsi, et non par un compte :
      aucun dossier re-sélectionné n'est réalerté.
    */
    const reprise = await propagerLaPublication(v2.id);
    verifier(
      reprise.alertes === 0 && reprise.dejaAlertes === reprise.dossiers,
      `la reprise ne réalerte aucun dossier déjà prévenu (${JSON.stringify(reprise)})`,
    );
    const total = await db.notification.count({
      where: { applicationId: trois[0]!.application.id, kind: "REGLEMENTATION" },
    });
    verifier(total === 1, `et il n'a toujours qu'une notification (${total})`);
  }


  paysCourant = nouveauScenario();
  /*
    A-05 — « Alertes de changement de règles : email quand une exigence
    de ta destination change. » L'interrupteur ne commandait rien : le
    job n'a jamais lu le registre des autorisations, et l'email partait
    pour qui l'avait refusé comme pour qui l'avait accordé.
  */
  console.log("\nA-05 — l'interrupteur « alertes de règles » commande bien l'email");
  {
    const v1 = await regle(brute.rules);
    const bloquante = CONDITIONS.find((c) => c.bloquant)!;
    const refus = await dossierPret(v1.id);
    // Un retrait, et non une absence : la ligne accordée existe, celle-ci
    // la révoque. C'est le geste réel de l'écran des autorisations.
    await enregistrerLAutorisation(refus.user.id, "alertes_regles", false);

    const v2 = await regle({
      ...(brute.rules as object),
      conditions: CONDITIONS.filter((c) => c.code !== bloquante.code),
    });
    await propagerLaPublication(v2.id);

    const apres = await etat(refus.application.id);
    const notifications = await db.notification.count({
      where: { applicationId: refus.application.id, kind: "REGLEMENTATION" },
    });
    const courriers = recus.filter((r) => r.vers.includes(refus.user.email)).length;
    verifier(courriers === 0, `aucun email pour qui a refusé (${courriers})`);
    // Le refus porte sur le courrier, pas sur le dossier : l'alerte reste
    // dans l'application, et la mise en pause a lieu. Un consentement de
    // communication ne décide pas de l'état d'un dossier.
    verifier(notifications >= 1, `l'alerte reste dans l'application (${notifications})`);
    verifier(apres.status === "SUSPENDU", `et le dossier est mis en pause (${apres.status})`);
  }

  console.log("\nWF-11 — un relais saturé ne fait perdre l'alerte de personne");
  paysCourant = nouveauScenario();
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
    const coupure = await propagerLaPublication(v2.id);
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
    const reprise = await propagerLaPublication(v2.id);
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
  paysCourant = nouveauScenario();
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
    const bilan = await propagerLaPublication(v2.id);
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
  paysCourant = nouveauScenario();
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

    const premiere = await propagerLaPublication(v2.id);
    verifier(
      premiere.alertes === 1 && premiere.critiques === 0,
      `le dossier est alerté sans être mis en pause (${JSON.stringify(premiere)})`,
    );
    const apres = await etat(p.application.id);
    verifier(apres.status === "PRET", `il reste prêt (${apres.status})`);

    const reprise = await propagerLaPublication(v2.id);
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
  paysCourant = nouveauScenario();
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
  paysCourant = nouveauScenario();
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
  console.log("\nRG-04.2 — le brouillon laissé de côté est relancé, puis clos");
  paysCourant = nouveauScenario();
  {
    /*
      `ABANDONNE` vivait dans l'enum, dans `EtatStocke`, et l'écran savait
      l'afficher. Rien ne l'écrivait : un brouillon de vingt et un mois
      restait `BROUILLON`, sans la moindre relance.

      Ce qui ne s'éprouve qu'ici : l'horloge. Elle ne peut pas être
      `updatedAt` — c'est `@updatedAt`, déplacé par **toute** écriture, y
      compris celles de la plateforme. La passe de rappels d'échéance
      réveille aussi les brouillons et pose `lastReminderAt`.
    */
    const MAINTENANT = new Date("2027-06-01T08:00:00Z");
    const ilYA = (jours: number) => new Date(MAINTENANT.getTime() - jours * 86400000);
    const v = await regle(brute.rules);

    const ouvrir = async (nom: string, ouvertIlYA: number) => {
      rang += 1;
      const user = await db.user.create({
        data: { email: `fumee-inact-${nom}-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
      });
      const a = await ouvrirDossier(user.id, v.id, null);
      await db.$executeRaw`UPDATE "Application" SET "createdAt" = ${ilYA(ouvertIlYA)} WHERE id = ${a.id}`;
      return a.id;
    };

    /*
      Et celui qui planifie loin. L'échéancier se calcule à rebours depuis
      la date cible : viser 2029 place son premier geste en 2029, et rien
      avant. Le fermer aujourd'hui reviendrait à lui reprocher d'avoir
      suivi le plan que la plateforme lui a fait.
    */
    rang += 1;
    const patient = await db.user.create({
      data: { email: `fumee-inact-patient-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const loin = (await ouvrirDossier(patient.id, v.id, new Date("2029-09-01T00:00:00Z"))).id;
    await db.$executeRaw`UPDATE "Application" SET "createdAt" = ${ilYA(ABANDON_JOURS + 35)} WHERE id = ${loin}`;

    /*
      Et celui qui a coché toutes ses échéances, puis n'est jamais revenu.
      Aucune ne lui reste à tenir : le plan ne suspend donc plus rien, et
      c'est son dernier geste qui compte — il date de plus d'un an.
      Compter une échéance **faite** la ferait passer pour une attente, et
      son dossier ne se fermerait jamais.
    */
    rang += 1;
    const coche = await db.user.create({
      data: { email: `fumee-inact-coche-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const toutFait = (
      await ouvrirDossier(coche.id, v.id, new Date("2029-09-01T00:00:00Z"))
    ).id;
    await db.$executeRaw`UPDATE "Application" SET "createdAt" = ${ilYA(ABANDON_JOURS + 35)} WHERE id = ${toutFait}`;
    await db.deadline.updateMany({
      where: { applicationId: toutFait },
      data: { doneAt: ilYA(ABANDON_JOURS + 30) },
    });

    /*
      Et celui qui a demandé l'oubli. Entre la demande et l'anonymisation,
      son compte existe encore et `deletedAt` est nul — l'état qu'ouvre une
      panne du stockage objet. Le relancer reviendrait à inviter à revenir
      quelqu'un qui vient de demander à partir.
    */
    rang += 1;
    const partant = await db.user.create({
      data: {
        email: `fumee-inact-partant-${rang}-${process.pid}@exemple.test`,
        role: "CANDIDAT",
        deletionRequestedAt: ilYA(2),
      },
    });
    const sonDossier = (await ouvrirDossier(partant.id, v.id, null)).id;
    await db.$executeRaw`UPDATE "Application" SET "createdAt" = ${ilYA(RELANCE_JOURS + 30)} WHERE id = ${sonDossier}`;

    const jeune = await ouvrir("jeune", RELANCE_JOURS - 5);
    const aRelancer = await ouvrir("relance", RELANCE_JOURS + 30);
    /*
      Un candidat dont la boîte refuse temporairement. Le marquage doit
      suivre le courrier et jamais le précéder : marqué sans avoir été
      prévenu, il ne le serait plus jamais — et serait clos neuf mois plus
      tard sans avoir rien reçu.
    */
    const injoignable = await ouvrir("injoignable", RELANCE_JOURS + 30);
    const adresse = (
      await db.application.findUniqueOrThrow({
        where: { id: injoignable },
        select: { user: { select: { email: true } } },
      })
    ).user.email;
    differees.add(adresse);
    const aClore = await ouvrir("abandon", ABANDON_JOURS + 35);
    const actif = await ouvrir("actif", ABANDON_JOURS + 35);

    /* Un dépôt récent sur un dossier ouvert il y a longtemps : le candidat
       est là, et c'est lui l'horloge. */
    const piece = await db.document.findFirstOrThrow({ where: { applicationId: actif } });
    const version = await db.documentVersion.create({
      data: { documentId: piece.id, rank: 1, objectKey: `inact-${process.pid}` },
    });
    await db.$executeRaw`UPDATE "DocumentVersion" SET "uploadedAt" = ${ilYA(10)} WHERE id = ${version.id}`;

    /*
      Et celui qui travaille son entretien de rédaction.

      C'est ici, et pas dans un essai d'unité, que ce cas se tient : le
      domaine était juste, et la requête du job incomplète — elle ne lisait
      que `DocumentVersion`. Une garde montée sur une matière fabriquée à
      la main serait restée verte, parce qu'on lui aurait donné la date que
      la requête ne savait pas aller chercher.

      Le geste est réel et long : un entretien se remplit sur des semaines,
      une réponse par question quittée, et aucune ne produit de version —
      la mise en forme, qui en produirait une, demande un pack qu'un
      brouillon n'a pas. Sans ce bloc, un candidat dont la dernière réponse
      datait de l'avant-veille était clos, ses pièces programmées à la
      purge, et sans même la relance : à quatre cents jours, l'abandon
      passe avant.
    */
    const entretien = await ouvrir("entretien", ABANDON_JOURS + 35);
    const pieceEntretien = await db.document.findFirstOrThrow({
      where: { applicationId: entretien },
    });
    const reponse = await db.interviewAnswer.create({
      data: {
        documentId: pieceEntretien.id,
        rank: 0,
        section: "Parcours",
        question: "Pourquoi cette formation\u202f?",
        answer: "Parce que je prépare ce projet depuis deux ans.",
      },
    });
    await db.$executeRaw`UPDATE "InterviewAnswer" SET "updatedAt" = ${ilYA(2)} WHERE id = ${reponse.id}`;

    /* Et ce que la plateforme écrit d'elle-même sur un brouillon oublié :
       exactement ce que pose le job de rappels d'échéance. */
    await db.application.update({
      where: { id: aClore },
      data: { lastReminderAt: MAINTENANT },
    });

    const bilan = await traiterLesBrouillonsInactifs(MAINTENANT);
    verifier(
      bilan.relances === 1 && bilan.abandons === 2 && bilan.incidents.length === 0,
      `un relancé, deux clos, rien d'autre (${JSON.stringify(bilan)})`,
    );
    verifier(
      bilan.courriersRetenus === 1,
      `et un courrier retenu, compté à part (${bilan.courriersRetenus})`,
    );

    /* Rien n'est marqué tant que le courrier n'est pas parti. */
    verifier(
      (await db.notification.count({
        where: { applicationId: injoignable, kind: "INACTIVITE" },
      })) === 0,
      "le candidat injoignable n'est pas marqué prévenu",
    );
    differees.delete(adresse);
    const reprise = await traiterLesBrouillonsInactifs(
      new Date(MAINTENANT.getTime() + 86400000),
    );
    verifier(
      reprise.relances === 1,
      `et la passe suivante le relance pour de bon (${JSON.stringify(reprise)})`,
    );

    verifier((await etat(jeune)).status === "BROUILLON", "le brouillon récent n'est pas touché");
    verifier(
      (await etat(actif)).status === "BROUILLON",
      "ni celui dont le candidat a déposé une pièce il y a dix jours",
    );
    verifier(
      (await etat(entretien)).status === "BROUILLON",
      `ni celui qui répondait à son entretien avant-hier (${(await etat(entretien)).status})`,
    );
    verifier(
      (await db.notification.count({
        where: { applicationId: entretien, kind: "INACTIVITE" },
      })) === 0,
      "et il n'est ni clos ni relancé : il est là, et l'horloge le voit",
    );
    verifier(
      (await etat(loin)).status === "BROUILLON",
      `ni celui dont la première échéance est en 2029 (${(await etat(loin)).status})`,
    );
    verifier(
      (await db.notification.count({
        where: { applicationId: loin, kind: "INACTIVITE" },
      })) === 0,
      "et il n'est pas même relancé : il n'a rien à faire pour l'instant",
    );
    verifier(
      (await etat(toutFait)).status === "ABANDONNE",
      `celui qui a tout coché puis disparu est clos (${(await etat(toutFait)).status})`,
    );
    verifier(
      (await db.notification.count({ where: { applicationId: sonDossier } })) === 0,
      "et celui qui a demandé l'oubli ne reçoit rien (RG-10.4)",
    );
    verifier(
      (await etat(sonDossier)).status === "BROUILLON",
      "ni ne voit son dossier clos par la plateforme",
    );

    const relance = await db.notification.findFirst({
      where: { applicationId: aRelancer, kind: "INACTIVITE" },
    });
    verifier((await etat(aRelancer)).status === "BROUILLON", "le relancé reste un brouillon");
    verifier(
      relance?.body.includes("sera clos le") === true,
      `et sa relance annonce la date de clôture (${relance?.body.slice(0, 48)}…)`,
    );

    const clos = await etat(aClore);
    verifier(
      clos.status === "ABANDONNE",
      `le brouillon de treize mois est clos (${clos.status}) — l'écriture système ne l'a pas sauvé`,
    );
    verifier(clos.readyAt === null, "et son état passe par miseEnEtat");

    /*
      INV-5. `ABANDONNE` est terminal : sans purge programmée ici, les
      pièces d'identité d'un dossier clos resteraient en stockage pour
      toujours — plus rien ne vient derrière.
    */
    verifier(clos.purgeDueAt !== null, "la purge de ses pièces est programmée (INV-5)");
    const purge = await purgerLesPiecesEchues(new Date("2027-08-01T00:00:00Z"));
    verifier(
      purge.dossiers >= 1,
      `et la purge le reprend le moment venu (${JSON.stringify(purge.dossiers)})`,
    );

    /* La passe du lendemain ne renvoie rien : sans quoi la même relance
       repartirait chaque nuit pendant neuf mois. */
    const lendemain = await traiterLesBrouillonsInactifs(
      new Date(MAINTENANT.getTime() + 2 * 86400000),
    );
    verifier(
      lendemain.relances === 0 && lendemain.abandons === 0,
      `la passe du lendemain ne renvoie rien (${JSON.stringify(lendemain)})`,
    );
    verifier(
      (await db.notification.count({ where: { applicationId: aRelancer } })) === 1,
      "et le candidat n'a reçu qu'une alerte",
    );
  }
  // ── Le temps de réponse d'un refus de connexion ─────────────────────
  console.log("\nUn refus de connexion met le même temps, quoi qu'il refuse");
  {
    /*
      `domain/comptes/connexion` pose la règle : « le serveur doit rendre le
      même message dans les deux cas, et **mettre le même temps à le
      rendre** ». `connecter` la tenait pour l'adresse inconnue — elle
      compare à un leurre — et le compte bloqué sortait **avant**
      l'empreinte. Mesuré avant correction, médiane de cinq appels :

          adresse inconnue        196 ms
          adresse connue          241 ms
          adresse connue, bloquée   1 ms

      Deux cents fois plus vite, et c'est un oracle que l'attaquant
      déclenche lui-même : cinq essais faux sur n'importe quelle adresse,
      puis un sixième. S'il revient en une milliseconde, l'adresse existe —
      une adresse sans compte ne se bloque jamais.

      La borne est **large** et c'est voulu : le défaut valait deux cents
      fois, et les trois chemins sont désormais dominés par le même appel à
      scrypt. Une borne serrée mesurerait la charge de la machine, pas la
      correction.
    */
    const rang = `${process.pid}`;
    await db.user.create({
      data: {
        email: `temps-connu-${rang}@exemple.test`,
        role: "CANDIDAT",
        passwordHash: await empreinte("motdepassejuste"),
      },
    });
    await db.user.create({
      data: {
        email: `temps-bloque-${rang}@exemple.test`,
        role: "CANDIDAT",
        passwordHash: await empreinte("motdepassejuste"),
        failedLogins: ESSAIS_AVANT_BLOCAGE,
        lockedUntil: finDuBlocage(new Date()),
      },
    });

    const mesurer = async (email: string): Promise<number> => {
      const temps: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const depart = process.hrtime.bigint();
        await connecter(email, "mauvaismotdepasse");
        temps.push(Number(process.hrtime.bigint() - depart) / 1e6);
      }
      // La médiane, non la moyenne : un ramasse-miettes au mauvais moment
      // ne doit pas décider d'une vérification.
      return temps.sort((a, b) => a - b)[2]!;
    };

    const inconnue = await mesurer(`temps-inconnu-${rang}@exemple.test`);
    const connue = await mesurer(`temps-connu-${rang}@exemple.test`);
    const bloquee = await mesurer(`temps-bloque-${rang}@exemple.test`);

    const rapport = Math.max(inconnue, connue, bloquee) / Math.min(inconnue, connue, bloquee);
    verifier(
      rapport < 10,
      `les trois refus tiennent dans un facteur 10 (${inconnue.toFixed(0)} / ${connue.toFixed(
        0,
      )} / ${bloquee.toFixed(0)} ms, rapport ${rapport.toFixed(1)})`,
    );
    verifier(
      bloquee > inconnue / 10,
      `un compte bloqué ne se reconnaît pas au chronomètre (${bloquee.toFixed(0)} ms)`,
    );

    /*
      Le **message**, lui, distingue encore les deux, et ce lot ne le
      corrige pas : mesuré au premier essai, une adresse inconnue rend
      « il te reste 5 essais » et une adresse connue « il te reste 4 ».
      Un seul essai suffit donc à savoir si une adresse a un compte.

      La raison du décompte est écrite dans le domaine — « une personne qui
      se trompe de mot de passe a besoin de le savoir avant d'être dehors,
      pas après » — et la parité textuelle demanderait de compter les
      échecs d'adresses qui n'ont pas de compte. Deux biens s'y opposent, et
      trancher appartient au produit : la question est posée dans
      `domain/comptes/connexion`, à côté de la règle qu'elle met en tension.
    */
  }

  // ── C-02 : l'enregistrement du profil n'efface plus ce qu'on ne lui
  //          donne pas ──────────────────────────────────────────────
  /*
    Les colonnes de `Profile` étaient écrites `corps.X ?? null` : une
    valeur absente devenait un effacement. C-02 n'envoie ni objectif, ni
    domaine, ni expérience, ni budget — il les vidait donc à chaque clic
    sur « Enregistrer », alors que l'en-tête de la route dit que ces
    colonnes portent les réponses du simulateur, « pour que le candidat
    ne resaisisse rien ».

    Une fumée, parce qu'un effacement de colonnes ne se voit qu'en
    relisant la ligne après coup — et parce que l'écriture était derrière
    `next/headers`, donc hors de portée de tout essai.
  */
  console.log("\nC-02 — enregistrer son profil n'efface pas ce qu'on n'a pas envoyé");
  {
    const compte = await db.user.create({
      data: {
        email: `profil-${process.pid}@exemple.test`,
        role: "CANDIDAT",
        emailVerified: new Date(),
      },
    });
    const venuDuSimulateur = {
      objectif: "Étudier",
      fieldOfStudy: "Informatique",
      yearsExperience: 3,
      budgetTotal: 4_000_000,
      budgetCurrency: "XOF",
      highestDegree: "Licence",
    };
    await db.profile.create({ data: { userId: compte.id, ...venuDuSimulateur } });

    // Exactement ce que C-02 compose : les trois champs qu'il affiche.
    await enregistrerLeProfil(compte.id, corpsDuProfil({
      nom: "Awa Diallo",
      diplome: "Master",
      anglais: "B2",
    }));

    const apres = await db.profile.findUniqueOrThrow({ where: { userId: compte.id } });
    verifier(apres.objectif === "Étudier", `l'objectif du simulateur survit (${apres.objectif})`);
    verifier(
      apres.fieldOfStudy === "Informatique" && apres.yearsExperience === 3,
      `le domaine et l'expérience survivent (${apres.fieldOfStudy}, ${apres.yearsExperience})`,
    );
    verifier(
      apres.budgetTotal === 4_000_000 && apres.budgetCurrency === "XOF",
      `le budget survit (${apres.budgetTotal} ${apres.budgetCurrency})`,
    );
    verifier(apres.highestDegree === "Master", `le diplôme envoyé est bien écrit (${apres.highestDegree})`);
    verifier(
      JSON.stringify(apres.languages) === '{"en":"B2"}',
      `la langue envoyée est écrite telle quelle (${JSON.stringify(apres.languages)})`,
    );
    const nomme = await db.user.findUniqueOrThrow({ where: { id: compte.id } });
    verifier(
      nomme.firstName === "Awa" && nomme.lastName === "Diallo",
      `le nom se coupe au premier blanc (${nomme.firstName} / ${nomme.lastName})`,
    );

    /*
      Et vider un champ reste un geste qui part. Sans cette seconde règle,
      le correctif rendrait les champs ineffaçables — le défaut inverse.
    */
    await enregistrerLeProfil(compte.id, corpsDuProfil({ nom: "Awa Diallo" }));
    const vide = await db.profile.findUniqueOrThrow({ where: { userId: compte.id } });
    verifier(vide.highestDegree === null, `le diplôme effacé s'efface (${vide.highestDegree})`);
    verifier(vide.languages === null, `la langue effacée s'efface (${JSON.stringify(vide.languages)})`);
    verifier(vide.objectif === "Étudier", `et l'objectif du simulateur survit encore (${vide.objectif})`);

    /*
      Enfin : l'écran n'affiche plus que ce qu'il sait garder. Quatre
      champs — date de naissance, nationalité, personnes à charge, refus
      antérieur — étaient rendus, comptés dans « 4 à renseigner » et
      jetés avant l'envoi, faute de colonne où les ranger.
    */
    const composees = Object.keys(corpsDuProfil({ nom: "x", diplome: "y", anglais: "z" }));
    verifier(
      CHAMPS_PROFIL.length === 3 && composees.length === 4,
      `les trois champs affichés composent quatre clés (${CHAMPS_PROFIL.length} → ${composees.join(", ")})`,
    );
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
