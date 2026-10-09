/**
 * La chaîne complète du dépôt d'une pièce — I.D, WF-06 étape 2.
 *
 *     dépôt → quarantaine → balayage → promotion → analyse
 *
 * Les verdicts s'éprouvent déjà contre un vrai moteur dans
 * `tests/balayage-moteur.test.ts`. Ce qui demande **en plus** une base et
 * un stockage s'éprouve ici, et c'est le plus important : qu'un fichier
 * ne change de zone que sur un verdict « saine », et qu'aucune autre
 * issue ne le déplace.
 *
 * Deux serveurs d'essai, sur la boucle locale :
 *
 * - **le moteur**, qui rend ce qu'on lui fait rendre ;
 * - **le stockage objet**, deux seaux en mémoire devant lesquels le vrai
 *   client MinIO parle pour de bon. C'est ce qui permet de vérifier que
 *   la promotion déplace réellement l'objet d'un seau à l'autre, et non
 *   qu'elle appelle les fonctions qu'on croit — la différence a déjà
 *   coûté cher ailleurs.
 *
 * Rien ne sort de la machine, et aucune pièce réelle n'est lue.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:balayage
 */
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_balayage_${process.pid}`;
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
 * Le moteur d'essai.
 * ------------------------------------------------------------------ */

type ReponseDuMoteur = { statut: number; corps: string };

let reponseDuMoteur: ReponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
const recusParLeMoteur: Buffer[] = [];

const moteur = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
  requete.on("end", () => {
    recusParLeMoteur.push(Buffer.concat(morceaux));
    reponse.writeHead(reponseDuMoteur.statut, { "Content-Type": "application/json" });
    reponse.end(reponseDuMoteur.corps);
  });
});
await new Promise<void>((ok) => moteur.listen(0, "127.0.0.1", ok));
const portMoteur = (moteur.address() as AddressInfo).port;

/* ------------------------------------------------------------------ *
 * Le stockage objet d'essai — deux seaux, en mémoire.
 * ------------------------------------------------------------------ */

const seaux = new Map<string, Map<string, Buffer>>();
const SEAU_CONFIANCE = "immipro-documents";
const SEAU_QUARANTAINE = "immipro-quarantaine";
seaux.set(SEAU_CONFIANCE, new Map());
seaux.set(SEAU_QUARANTAINE, new Map());
const seau = (nom: string) => seaux.get(nom) ?? new Map<string, Buffer>();

/**
 * Refuse les copies : la promotion interrompue s'éprouve ainsi.
 *
 * Un refus unique ne suffirait pas — le client MinIO rejoue de lui-même
 * un 5xx, et la promotion aboutirait. C'est un fait qu'on n'apprend
 * qu'en parlant au vrai client, et il vaut d'être noté : une copie
 * échouée pour de bon est plus rare que ce qu'un faux objet laisserait
 * croire.
 */
let refuserLesCopies = false;

const stockage = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
  requete.on("end", () => {
    const [brut, requeteDUrl] = (requete.url ?? "/").split("?");
    /*
      Le client demande d'abord la région du seau, avant toute opération.
      Sans cette réponse, rien de ce qui suit n'a lieu — et c'est bien la
      preuve qu'on parle au vrai client et non à un objet complaisant.
    */
    if (requeteDUrl === "location") {
      reponse.writeHead(200, { "Content-Type": "application/xml" });
      return reponse.end(
        '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>',
      );
    }

    // Style « chemin » : /<seau>/<clé…>
    const chemin = decodeURIComponent(brut!).replace(/^\//u, "");
    const separation = chemin.indexOf("/");
    const nomDuSeau = separation === -1 ? chemin : chemin.slice(0, separation);
    const cle = separation === -1 ? "" : chemin.slice(separation + 1);
    const objets = seau(nomDuSeau);
    const copieDe = requete.headers["x-amz-copy-source"] as string | undefined;

    const absent = () => {
      reponse.writeHead(404, { "Content-Type": "application/xml" });
      reponse.end("<Error><Code>NoSuchKey</Code></Error>");
    };

    switch (requete.method) {
      case "HEAD": {
        const objet = objets.get(cle);
        if (!objet) return absent();
        reponse.writeHead(200, {
          "Content-Length": String(objet.length),
          ETag: '"essai"',
          "Last-Modified": new Date().toUTCString(),
        });
        return reponse.end();
      }
      case "GET": {
        const objet = objets.get(cle);
        if (!objet) return absent();
        reponse.writeHead(200, { "Content-Length": String(objet.length) });
        return reponse.end(objet);
      }
      case "PUT": {
        if (copieDe) {
          if (refuserLesCopies) {
            reponse.writeHead(500, { "Content-Type": "application/xml" });
            return reponse.end("<Error><Code>InternalError</Code></Error>");
          }
          const depuis = decodeURIComponent(copieDe).replace(/^\//u, "");
          const coupure = depuis.indexOf("/");
          const objet = seau(depuis.slice(0, coupure)).get(depuis.slice(coupure + 1));
          if (!objet) return absent();
          objets.set(cle, objet);
          reponse.writeHead(200, { "Content-Type": "application/xml" });
          return reponse.end(
            `<CopyObjectResult><ETag>"essai"</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
          );
        }
        objets.set(cle, Buffer.concat(morceaux));
        reponse.writeHead(200, { ETag: '"essai"' });
        return reponse.end();
      }
      case "DELETE": {
        objets.delete(cle);
        reponse.writeHead(204);
        return reponse.end();
      }
      default: {
        reponse.writeHead(405);
        return reponse.end();
      }
    }
  });
});
await new Promise<void>((ok) => stockage.listen(0, "127.0.0.1", ok));
const portStockage = (stockage.address() as AddressInfo).port;

console.log(
  `Chaîne de balayage sur une base jetable (${nomBase}), moteur :${portMoteur}, stockage :${portStockage}`,
);
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

/* La configuration est posée avant d'importer les modules serveur. */
process.env.ANTIVIRUS_URL = `http://127.0.0.1:${portMoteur}/scan`;
process.env.MINIO_ENDPOINT = "127.0.0.1";
process.env.MINIO_PORT = String(portStockage);
process.env.MINIO_USE_SSL = "false";
process.env.MINIO_ROOT_USER = "essai";
process.env.MINIO_ROOT_PASSWORD = "essai-mot-de-passe";
process.env.MINIO_BUCKET_DOCUMENTS = SEAU_CONFIANCE;
process.env.MINIO_BUCKET_QUARANTAINE = SEAU_QUARANTAINE;

const { db } = await import("../src/lib/db");
const { enregistrerLAutorisation } = await import("../src/server/acces/consentements");
const { estDeposeeNonVerifiee, LIBELLE_CONSERVEE_NON_VERIFIEE } =
  await import("../src/domain/dossiers/piece");
const { balayerUnePiece, BalayageIndisponible } = await import("../src/server/jobs/balayage");
const { leBalayeur, verifierLeMoteur, sonderLeBalayage, oublierLesEssais } = await import(
  "../src/server/securite/antivirus"
);
const { TENTATIVES_AVANT_INCIDENT, EICAR } = await import("../src/domain/securite/balayage");
const { noterLeConstat, lireLesConstats } = await import("../src/server/exploitation/constats");
const { raisonSansApercu } = await import("../src/server/acces/pieces");
const { MENTION_EN_QUARANTAINE, ATTENTE_ORDINAIRE_MS } = await import(
  "../src/domain/dossiers/quarantaine"
);
const { reprendreLesQuarantaines } = await import("../src/server/jobs/quarantaine");
const { getQueue, JOBS } = await import("../src/lib/queue");
const { REPOS_AVANT_REPRISE_MINUTES } = await import("../src/domain/securite/balayage");
const { moteurPrisEnDefaut, FRAICHEUR_DU_CONSTAT_MS } = await import(
  "../src/domain/exploitation/constats"
);
const { constaterLesDependances } = await import("../src/server/exploitation/capacites");
const { sonderLesServices } = await import("../src/server/exploitation/sondes");
const { exigerUnDepotConforme } = await import("../src/server/acces/pieces");
const { reprendreLesAnalysesEnAttente, analysesEnAttenteDepuis } = await import(
  "../src/server/jobs/quarantaine"
);
const { cleObjet } = await import("../src/server/securite/secret");
const { analyseAnnoncee } = await import("../src/server/dossiers/reprise-gratuite");
const { REFUS_DE_LA_CONFIRMATION } = await import("../src/domain/dossiers/televersement");

let rang = 0;

/**
 * Une règle que le schéma sait relire.
 *
 * `recalculerCompletude` repasse le payload par Zod à chaque lecture ; un
 * objet vide échoue, et la fumée se serait arrêtée sur une erreur de
 * fixture prise pour une erreur de balayage.
 */
const REGLE_MINIMALE = {
  libelle: "Permis d'études",
  langues_acceptees: ["fr", "en"],
  niveau_langue_min: null,
  frais_scolarite: null,
  frais_dossier: null,
  preuve_fonds: null,
  delai_traitement_jours: null,
  travail_autorise: {
    autorise: true,
    limite_hebdomadaire_heures: 20,
    plein_temps_vacances: true,
    delai_carence_mois: null,
    permis_employeur_requis: false,
  },
  apres_etudes: null,
  conditions: [],
  pieces_requises: [
    {
      code: "passeport",
      libelle: "Passeport",
      obligatoire: true,
      traduction_assermentee: false,
      legalisation: false,
      nature: "televerser",
    },
  ],
  reserves: [],
};

/** Un candidat, son dossier, une pièce attendue et sa version en quarantaine. */
async function piece(options: { avecQuota?: boolean; sansAutorisation?: boolean } = {}) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-b-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "CA",
      visaType: "ETUDES",
      category: "ETUDES",
      version: rang,
      effectiveFrom: new Date("2026-01-01"),
      rules: REGLE_MINIMALE,
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
  const document = await db.document.create({
    data: {
      applicationId: application.id,
      code: "passeport",
      label: "Passeport",
      status: "EN_ANALYSE",
      required: true,
      // Ce que la route de dépôt écrit : le fichier est là, il se remplace.
      // Sans cela, une pièce conservée sans analyse se relit « Attendue ·
      // Ajouter » et le candidat renvoie ce qu'il vient d'envoyer.
      remedy: "REMPLACER",
    },
  });

  // Le fichier est écrit là où le navigateur l'écrit : en quarantaine.
  const cle = `dossiers/${application.id}/passeport-${rang}.pdf`;
  const octets = Buffer.from(`%PDF-1.4 pièce numéro ${rang}`);
  seau(SEAU_QUARANTAINE).set(cle, octets);

  const version = await db.documentVersion.create({
    data: {
      documentId: document.id,
      rank: 1,
      objectKey: cle,
      checksum: `somme-${rang}-${process.pid}`,
      mimeType: "application/pdf",
      sizeBytes: octets.length,
    },
  });

  if (options.avecQuota) {
    await db.analysisCredit.create({
      data: { applicationId: application.id, delta: 3, reason: "ACHAT_PACK" },
    });
  }

  /*
    L'autorisation d'analyse est accordée, parce qu'en production elle l'est
    forcément : RG-02.2 refuse le dépôt sans elle, et une pièce à balayer a
    donc été déposée sous accord. La fixture ne la posait pas, et le jour où
    la promotion a commencé à la lire, c'est cette fumée qui l'a dit — un
    fichier promu que rien n'analysait, faute d'un accord que personne
    n'avait jamais donné.
  */
  await enregistrerLAutorisation(user.id, "pieces_identite", !options.sansAutorisation);

  return {
    tache: { applicationId: application.id, documentId: document.id, versionId: version.id },
    cle,
    octets,
    user,
    application,
    document,
  };
}

const enQuarantaine = (cle: string) => seau(SEAU_QUARANTAINE).has(cle);
const enConfiance = (cle: string) => seau(SEAU_CONFIANCE).has(cle);
const relire = (versionId: string) => db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });

/** Capture ce que le job dit au journal, le temps d'un appel. */
async function sousEcoute<T>(action: () => Promise<T>): Promise<{ valeur: T; dit: string[] }> {
  const dit: string[] = [];
  const info = console.info;
  const avertir = console.warn;
  console.info = (...a: unknown[]) => void dit.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void dit.push(a.map(String).join(" "));
  try {
    return { valeur: await action(), dit };
  } finally {
    console.info = info;
    console.warn = avertir;
  }
}

try {
  console.log("\nLe moteur se vérifie avant qu'aucune pièce ne parte");
  {
    oublierLesEssais();
    verifier(sonderLeBalayage() === "ABSENTE", "sans essai, la sonde ne conclut rien");

    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    recusParLeMoteur.length = 0;
    const muet = await verifierLeMoteur();
    verifier(
      muet?.issue === "muet",
      `un moteur qui déclare EICAR sain est une panne (${muet?.issue})`,
    );
    verifier(sonderLeBalayage() === "ECHOUEE", "et l'état de service le dit en panne");

    reponseDuMoteur = {
      statut: 200,
      corps: '{"status":"infected","signature":"Eicar-Test-Signature"}',
    };
    recusParLeMoteur.length = 0;
    const reconnu = await verifierLeMoteur();
    verifier(reconnu?.issue === "reconnu", `un moteur qui signale EICAR conclut (${reconnu?.issue})`);
    verifier(sonderLeBalayage() === "CONCLUANTE", "et l'état de service le tient pour établi");
    verifier(
      recusParLeMoteur[0]?.toString("ascii") === EICAR,
      "c'est bien le fichier d'essai qui est parti, et aucune pièce de candidat",
    );
  }

  console.log("\nUne pièce saine franchit la frontière, et part en analyse");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    recusParLeMoteur.length = 0;
    const p = await piece({ avecQuota: true });

    verifier(enQuarantaine(p.cle) && !enConfiance(p.cle), "avant : l'objet est en quarantaine seule");

    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "ANALYSE", `le quota couvre une analyse (${suite})`);
    verifier(
      recusParLeMoteur.at(-1)?.equals(p.octets) === true,
      "les octets du fichier sont bien ceux qui ont été soumis au moteur",
    );
    verifier(
      !enQuarantaine(p.cle) && enConfiance(p.cle),
      "après : l'objet a changé de seau, et ne reste pas dans les deux",
    );

    const version = await relire(p.tache.versionId);
    verifier(version.scanState === "SAINE", `la version est déclarée saine (${version.scanState})`);
    verifier(version.scannedAt !== null, "et porte sa date de balayage");
    verifier(
      version.scanAttempts === 0 && version.scanIncidentAt === null,
      "aucune attente ne lui reste attachée",
    );
  }

  console.log("\nSans quota, la pièce est promue quand même — seule l'analyse attend");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const p = await piece();
    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "CONSERVEE", `RG-06.5 : conservée sans analyse (${suite})`);
    verifier(enConfiance(p.cle), "le fichier est bien entré dans le stockage de confiance");
    const document = await db.document.findUniqueOrThrow({ where: { id: p.document.id } });
    verifier(document.status === "ATTENDUE", `et la pièce attend son analyse (${document.status})`);
  }

  console.log("\nRG-02.1 — l'autorisation retirée arrête l'analyse, et le dit autrement");
  {
    /*
      Le quota est plein : ce qui retient l'analyse est le retrait, et le
      message doit le dire. Envoyer recharger des analyses quelqu'un qui
      vient de retirer son accord lui ferait payer pour son propre geste.
    */
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const p = await piece({ avecQuota: true, sansAutorisation: true });
    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "CONSERVEE", `la pièce est promue sans être analysée (${suite})`);
    verifier(enConfiance(p.cle), "le fichier entre quand même dans le stockage de confiance");
    const document = await db.document.findUniqueOrThrow({ where: { id: p.document.id } });
    verifier(
      (document.feedback ?? "").includes("autorisation"),
      `et l'écran nomme le motif (${(document.feedback ?? "").slice(0, 45)}…)`,
    );
    verifier(
      !(document.feedback ?? "").includes("recharger"),
      "sans proposer de recharger des analyses, qui ne répareraient rien",
    );
    verifier(
      estDeposeeNonVerifiee({
        id: document.id,
        code: document.code,
        libelle: document.label,
        famille: document.family,
        etat: document.status,
        remede: document.remedy,
      }),
      `et la pastille se lit « ${LIBELLE_CONSERVEE_NON_VERIFIEE} » (${document.status} / ${document.remedy})`,
    );
  }

  console.log("\nUne pièce infectée est détruite, et le candidat lit quoi faire");
  {
    reponseDuMoteur = {
      statut: 200,
      corps: '{"status":"infected","signature":"Eicar-Test-Signature"}',
    };
    const p = await piece({ avecQuota: true });

    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "REFUSEE", `elle est écartée au contrôle (${suite})`);
    verifier(
      !enQuarantaine(p.cle) && !enConfiance(p.cle),
      "les octets sont détruits, et ne sont entrés nulle part",
    );

    const version = await relire(p.tache.versionId);
    verifier(version.scanState === "INFECTEE", `la version est écartée (${version.scanState})`);
    verifier(version.objectKey === null, "et ne garde aucune clé présignable");
    verifier(
      version.scanFinding === "Eicar-Test-Signature",
      `le nom de la menace est écrit pour le back-office (${version.scanFinding})`,
    );

    const document = await db.document.findUniqueOrThrow({ where: { id: p.document.id } });
    verifier(document.status === "A_CORRIGER", `la pièce redevient à déposer (${document.status})`);
    verifier(document.remedy === "TELEVERSER", `et le remède est « téléverser » (${document.remedy})`);

    const notification = await db.notification.findFirst({ where: { userId: p.user.id } });
    verifier(notification !== null, "le candidat est prévenu");
    verifier(
      !/virus|trojan|malware|Eicar/iu.test(`${notification?.title} ${notification?.body}`),
      "sans lire le nom de la menace, qui ne lui apprendrait rien d'actionnable",
    );
  }

  console.log("\nUn moteur qui ne conclut pas ne promeut rien, et se fait reprendre");
  {
    reponseDuMoteur = { statut: 503, corps: "" };
    const p = await piece({ avecQuota: true });

    let leve = false;
    try {
      await balayerUnePiece(p.tache, leBalayeur());
    } catch (erreur) {
      leve = erreur instanceof BalayageIndisponible;
    }
    verifier(leve, "le job lève, ce qui est la façon de demander une reprise à la file");
    verifier(
      enQuarantaine(p.cle) && !enConfiance(p.cle),
      "et surtout : l'objet n'a pas bougé d'un pouce",
    );

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanState === "EN_QUARANTAINE",
      `la version reste en quarantaine (${version.scanState})`,
    );
    verifier(version.scanAttempts === 1, `la tentative est comptée (${version.scanAttempts})`);
    verifier(version.scanLastAttemptAt !== null, "et datée");
    verifier(
      version.scanIncidentAt === null,
      "une première panne passagère n'ouvre pas encore d'incident",
    );
  }

  console.log("\nAu seuil, l'incident devient visible — sans que le fichier soit accepté");
  {
    reponseDuMoteur = { statut: 503, corps: "" };
    const p = await piece({ avecQuota: true });

    for (let n = 0; n < TENTATIVES_AVANT_INCIDENT; n += 1) {
      await balayerUnePiece(p.tache, leBalayeur()).catch(() => undefined);
    }

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanAttempts === TENTATIVES_AVANT_INCIDENT,
      `les tentatives s'accumulent (${version.scanAttempts})`,
    );
    verifier(version.scanIncidentAt !== null, "l'incident est ouvert");
    verifier(
      version.scanIncidentCause === "injoignable",
      `et nommé, pour dire s'il faut attendre ou intervenir (${version.scanIncidentCause})`,
    );
    verifier(
      version.scanState === "EN_QUARANTAINE" && enQuarantaine(p.cle),
      "et le fichier est toujours en quarantaine : signaler n'est pas accepter",
    );

    // La date d'origine ne rajeunit pas : c'est son ancienneté qui dit
    // depuis quand la chaîne est arrêtée.
    const ouvert = version.scanIncidentAt!.getTime();
    await balayerUnePiece(p.tache, leBalayeur()).catch(() => undefined);
    const encore = await relire(p.tache.versionId);
    verifier(
      encore.scanIncidentAt!.getTime() === ouvert,
      "une reprise de plus ne rajeunit pas l'incident",
    );

    // Et quand le moteur revient, l'attente est soldée.
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const suite = await balayerUnePiece(p.tache, leBalayeur());
    const remise = await relire(p.tache.versionId);
    verifier(suite === "ANALYSE", `le moteur revenu, la pièce passe (${suite})`);
    verifier(
      remise.scanIncidentAt === null && remise.scanAttempts === 0,
      "et l'incident est soldé : l'exploitation ne compte que du vivant",
    );
  }

  console.log("\nCe qui se rejouerait à l'identique ne se rejoue pas");
  {
    reponseDuMoteur = { statut: 200, corps: "<html>une passerelle qui répond à sa façon</html>" };
    const p = await piece({ avecQuota: true });

    const { valeur: suite, dit } = await sousEcoute(() =>
      balayerUnePiece(p.tache, leBalayeur()),
    );
    verifier(suite === "BLOQUEE", `la tâche s'achève sans demander de reprise (${suite})`);
    verifier(
      dit.some((l) => /rejouer ne changera rien/u.test(l)),
      "et le journal dit pourquoi, en termes actionnables",
    );

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanIncidentAt !== null && version.scanIncidentCause === "reponse_illisible",
      `l'incident est ouvert dès la première tentative (${version.scanIncidentCause})`,
    );
    verifier(
      enQuarantaine(p.cle) && !enConfiance(p.cle),
      "et le fichier n'a toujours pas bougé",
    );
  }

  console.log("\nCe qui reste sans verdict est repris quand le moteur revient");
  {
    /*
      Quatre causes sur six laissent le fichier en quarantaine en disant
      au candidat « tu n'as rien à faire ». Personne ne reprenait la
      main : `BALAYAGE_PIECE` n'était postée que par la confirmation du
      dépôt, une fois. Exécuté avant correction, moteur revenu :

          état après l'échec : EN_QUARANTAINE, cause reponse_illisible
          ce que le candidat lit : « nous reprenons la main dessus »
          moteur pris en défaut ? false
          état du fichier : EN_QUARANTAINE, en quarantaine true
          ce que le candidat lit toujours : « nous reprenons la main dessus »
    */
    reponseDuMoteur = { statut: 200, corps: "<html>une passerelle</html>" };
    const bloquee = await piece({ avecQuota: true });
    await balayerUnePiece(bloquee.tache, leBalayeur());
    verifier(
      raisonSansApercu(await relire(bloquee.tache.versionId))?.includes(
        "nous reprenons la main",
      ) === true,
      "le candidat lit que la plateforme reprend la main dessus",
    );

    // Et une pièce dont le refus demande un geste au candidat : sa
    // consigne dit de redéposer, et rejouer par-dessus la ferait mentir.
    const sienne = await piece({ avecQuota: true });
    await balayerUnePiece(sienne.tache, leBalayeur());
    await db.documentVersion.update({
      where: { id: sienne.tache.versionId },
      data: { scanIncidentCause: "trop_volumineux" },
    });

    /* Le moteur revient, et le prouve : il reconnaît EICAR. */
    reponseDuMoteur = { statut: 200, corps: '{"status":"infected"}' };
    await sonderLesServices();
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };

    // Les deux tentatives viennent d'avoir lieu : le repos court, et la
    // passe ne double pas une tâche encore en vol.
    const tropTot = await reprendreLesQuarantaines();
    verifier(
      !tropTot.moteurMuet && tropTot.remises === 0,
      `moteur revenu, rien n'est repris tant que le repos court (${JSON.stringify(tropTot)})`,
    );

    const plusTard = new Date(Date.now() + (REPOS_AVANT_REPRISE_MINUTES + 1) * 60 * 1000);

    /*
      Le repos est passé, mais le moteur ne prouve plus rien : la passe
      s'abstient. « Dès que le service revient » n'est pas encore
      arrivé, et rejouer dans le vide rouvrirait l'incident qu'on vient
      d'ouvrir.
    */
    await noterLeConstat("antivirus", false, "le moteur n'a pas signalé le fichier d'essai");
    const muet = await reprendreLesQuarantaines(plusTard);
    verifier(
      muet.moteurMuet && muet.remises === 0,
      `sans sonde concluante, la passe s'abstient (${JSON.stringify(muet)})`,
    );
    verifier(
      (await relire(bloquee.tache.versionId)).scanState === "EN_QUARANTAINE",
      "et le fichier reste où il est",
    );

    /* Le moteur le prouve de nouveau. */
    reponseDuMoteur = { statut: 200, corps: '{"status":"infected"}' };
    await sonderLesServices();
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };

    const reprise = await reprendreLesQuarantaines(plusTard);
    verifier(
      reprise.remises >= 1,
      `le moteur revenu, la passe remet en file (${JSON.stringify(reprise)})`,
    );

    const enFile = await (await getQueue()).getQueueSize(JOBS.BALAYAGE_PIECE);
    verifier(enFile >= 1, `et la tâche est bien dans la file (${enFile})`);

    /*
      Ce que la passe ne reprend pas : la pièce dont la consigne demande
      un nouveau dépôt. `quiPeutAgir` le disait déjà cause par cause, et
      rien n'en découlait.
    */
    verifier(
      (await relire(sienne.tache.versionId)).scanState === "EN_QUARANTAINE" &&
        reprise.laissees >= 1,
      `celle qui attend un geste du candidat n'est pas reprise (laissées ${reprise.laissees})`,
    );

    /*
      Et le contrôle repris conclut pour de bon : c'est `balayerUnePiece`
      qui décide, la passe ne fait que la rappeler.
    */
    const suite = await balayerUnePiece(bloquee.tache, leBalayeur());
    const finie = await relire(bloquee.tache.versionId);
    verifier(
      suite === "ANALYSE" && finie.scanState === "SAINE" && finie.scanIncidentAt === null,
      `le contrôle repris conclut, incident soldé (${suite}, ${finie.scanState})`,
    );
    verifier(
      enConfiance(bloquee.cle) && !enQuarantaine(bloquee.cle),
      "et le fichier a rejoint le stockage de confiance",
    );
  }

  console.log("\nUne promotion interrompue laisse une pièce bloquée, jamais une pièce admise");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const p = await piece({ avecQuota: true });

    refuserLesCopies = true;
    let echoue = false;
    try {
      await balayerUnePiece(p.tache, leBalayeur());
    } catch {
      echoue = true;
    } finally {
      refuserLesCopies = false;
    }
    verifier(echoue, "la copie échoue, et le job ne le cache pas");

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanState === "EN_QUARANTAINE",
      `aucune version n'est déclarée saine sans que l'objet soit passé (${version.scanState})`,
    );
    verifier(
      enQuarantaine(p.cle) && !enConfiance(p.cle),
      "l'objet est resté là où il était",
    );

    // La reprise aboutit : la promotion est rejouable.
    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "ANALYSE", `et la reprise, elle, aboutit (${suite})`);
    verifier(enConfiance(p.cle) && !enQuarantaine(p.cle), "l'objet a fini par changer de seau");
  }

  console.log("\nUne version déjà décidée ne se rebalaie pas");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const p = await piece({ avecQuota: true });
    await balayerUnePiece(p.tache, leBalayeur());

    /*
      Revue du 07/10/2026, E6. Sans analyse écrite, le rejeu reprend la
      suite de la promotion : c'est ce qui rattrape une mise en file
      d'analyse perdue. Il ne rappelle pas le moteur — le verdict est
      acquis.
    */
    recusParLeMoteur.length = 0;
    const reprise = await balayerUnePiece(p.tache, leBalayeur());
    verifier(reprise === "ANALYSE", `sans analyse, le rejeu la redemande (${reprise})`);
    verifier(recusParLeMoteur.length === 0, "et n'appelle pas le moteur une seconde fois");

    // L'analyse est écrite : le rejeu n'a plus rien à faire.
    await db.documentAnalysis.create({
      data: { versionId: p.tache.versionId, verdict: "CONFORME", title: "Lu", body: "Pièce lue." },
    });
    await db.document.update({ where: { id: p.tache.documentId }, data: { status: "CONFORME" } });
    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "SANS_OBJET", `une fois analysée, le rejeu ne décide rien (${suite})`);
    verifier(recusParLeMoteur.length === 0, "et le moteur n'est toujours pas rappelé");

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanState === "SAINE",
      `une version saine ne redescend pas en quarantaine (${version.scanState})`,
    );
  }

  console.log("\nUne analyse perdue à la mise en file est reprise dans l'heure (E6)");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const perdue = await piece({ avecQuota: true });
    await balayerUnePiece(perdue.tache, leBalayeur());
    const servie = await piece({ avecQuota: true });
    await balayerUnePiece(servie.tache, leBalayeur());
    await db.documentAnalysis.create({
      data: { versionId: servie.tache.versionId, verdict: "CONFORME", title: "Lu", body: "Pièce lue." },
    });
    await db.document.update({ where: { id: servie.tache.documentId }, data: { status: "CONFORME" } });
    // Saines depuis une heure, sans que l'analyse de la première soit jamais partie.
    await db.documentVersion.updateMany({
      where: { id: { in: [perdue.tache.versionId, servie.tache.versionId] } },
      data: { scannedAt: new Date(Date.now() - 60 * 60_000) },
    });

    const bilan = await reprendreLesAnalysesEnAttente();
    verifier(bilan.remises >= 1, `la passe remet la pièce en file (${bilan.remises})`);
    const enFile = async (versionId: string) =>
      Number(
        (
          await db.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pgboss.job WHERE name = $1 AND data->>'versionId' = $2`,
            JOBS.BALAYAGE_PIECE,
            versionId,
          )
        )[0]!.n,
      );
    verifier((await enFile(perdue.tache.versionId)) === 1, "la pièce perdue a son balayage en file");
    verifier((await enFile(servie.tache.versionId)) === 0, "une pièce déjà analysée est laissée");
    verifier(
      (await balayerUnePiece(perdue.tache, leBalayeur())) === "ANALYSE",
      "et ce balayage redemande l'analyse",
    );
  }

  console.log("\nLe dépôt annonce la lecture sans connaître le rang à venir (S.155)");
  {
    /*
      La préparation d'un dépôt demande, avant qu'aucune version n'existe,
      si la pièce sera lue. Sans rang, la version « à venir » passait
      Number.MAX_SAFE_INTEGER à la base, qui le refusait (INT4) : toute
      préparation de dépôt répondait 503 depuis S.148. Trouvé par la
      recette (RF-5).
    */
    const p = await piece({ avecQuota: true });
    let annonce: boolean | string;
    try {
      annonce = await analyseAnnoncee(p.tache.applicationId, p.tache.documentId);
    } catch (erreur) {
      annonce = erreur instanceof Error ? erreur.message.split("\n").find((l) => l.includes("INT4")) ?? erreur.name : "erreur";
    }
    verifier(annonce === true, `sans rang, l'annonce se lit (${annonce})`);

    // Après une lecture illisible, la reprise s'annonce gratuite même à solde nul.
    await db.documentAnalysis.create({
      data: { versionId: p.tache.versionId, verdict: "ILLISIBLE", title: "Illisible", body: "Pièce illisible." },
    });
    await db.analysisCredit.create({ data: { applicationId: p.tache.applicationId, delta: -3, reason: "ANALYSE" } });
    verifier(
      (await analyseAnnoncee(p.tache.applicationId, p.tache.documentId)) === true,
      "après « illisible », la reprise s'annonce lue, à solde nul",
    );
  }

  console.log("\nL'état de service compte les analyses que la reprise ne fait pas lire (RF-4, S.150)");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const ilYADeuxHeures = new Date(Date.now() - 2 * 3_600_000);
    const saine = async () => {
      const p = await piece({ avecQuota: true });
      await balayerUnePiece(p.tache, leBalayeur());
      return p;
    };
    const attend = await saine();
    const recente = await saine();
    const figee = await saine();
    const remplacee = await saine();
    await db.documentVersion.updateMany({
      where: { id: { in: [attend, figee, remplacee].map((p) => p.tache.versionId) } },
      data: { scannedAt: ilYADeuxHeures },
    });
    // Un dossier déposé garde l'état de ses pièces : sa version ne sera jamais lue.
    await db.application.update({ where: { id: figee.tache.applicationId }, data: { status: "SOUMIS" } });
    // Une version remplacée n'a plus rien à attendre (RG-06.8).
    await db.documentVersion.create({
      data: {
        documentId: remplacee.tache.documentId,
        rank: 2,
        objectKey: `${remplacee.cle}.v2`,
        checksum: `somme-v2-${rang}-${process.pid}`,
        mimeType: "application/pdf",
        sizeBytes: 10,
      },
    });

    const comptees = new Set(
      (await analysesEnAttenteDepuis(new Date(Date.now() - 3_600_000))).map((v) => v.id),
    );
    verifier(comptees.has(attend.tache.versionId), "une pièce saine sans analyse depuis deux heures est comptée");
    verifier(!comptees.has(recente.tache.versionId), "une pièce qui vient d'être promue ne l'est pas");
    verifier(!comptees.has(figee.tache.versionId), "un dossier déposé ne fait pas d'alerte qui ne s'éteint pas");
    verifier(!comptees.has(remplacee.tache.versionId), "une version remplacée n'est pas comptée");

    // La reprise lit la même définition : elle ne relance pas ce que l'état de service tait.
    await reprendreLesAnalysesEnAttente();
    const enFile = async (versionId: string) =>
      Number(
        (
          await db.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pgboss.job WHERE name = $1 AND data->>'versionId' = $2`,
            JOBS.BALAYAGE_PIECE,
            versionId,
          )
        )[0]!.n,
      );
    verifier((await enFile(attend.tache.versionId)) === 1, "la reprise remet en file la pièce comptée");
    verifier((await enFile(figee.tache.versionId)) === 0, "et laisse celle d'un dossier déposé");
    verifier((await enFile(remplacee.tache.versionId)) === 0, "et celle qu'une version plus récente remplace");
  }

  console.log("\nUn objet promu que la file rejoue ne promeut rien une seconde fois");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const p = await piece({ avecQuota: true });

    // L'objet a été promu, et l'écriture en base n'a pas eu lieu : c'est
    // l'état exact d'une interruption entre les deux gestes d'`admettre`.
    seau(SEAU_CONFIANCE).set(p.cle, seau(SEAU_QUARANTAINE).get(p.cle)!);
    seau(SEAU_QUARANTAINE).delete(p.cle);

    const { valeur: suite } = await sousEcoute(() => balayerUnePiece(p.tache, leBalayeur()));
    verifier(suite === "BLOQUEE", `la pièce est bloquée, et le dit (${suite})`);

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanState === "EN_QUARANTAINE" && version.scanIncidentCause === "objet_absent",
      `elle attend une main, sans être déclarée saine (${version.scanIncidentCause})`,
    );
  }

  console.log("\nCe que le candidat lit d'une pièce bloquée");
  {
    reponseDuMoteur = { statut: 200, corps: "<html>une passerelle qui répond à sa façon</html>" };
    const p = await piece({ avecQuota: true });

    // Avant toute tentative : l'attente est ordinaire, et le message vrai.
    let version = await relire(p.tache.versionId);
    verifier(
      raisonSansApercu(version) === MENTION_EN_QUARANTAINE,
      "à l'arrivée, la pièce annonce quelques instants — ce qui est vrai",
    );

    await sousEcoute(() => balayerUnePiece(p.tache, leBalayeur()));
    version = await relire(p.tache.versionId);
    verifier(
      version.scanIncidentCause === "reponse_illisible",
      `l'incident est ouvert (${version.scanIncidentCause})`,
    );

    /*
      Le défaut corrigé : la pièce ne passera pas, l'exploitation le
      sait, et le candidat lisait toujours « dans quelques instants, tu
      n'as rien à faire ».
    */
    const message = raisonSansApercu(version)!;
    verifier(
      !message.includes("quelques instants"),
      "et le message cesse de promettre une durée",
    );
    verifier(
      message.includes("tu n'as rien à faire"),
      "sans rien demander : la panne est de notre côté",
    );

    // Un fichier trop lourd, lui, se redépose — et le message le dit.
    await db.documentVersion.update({
      where: { id: p.tache.versionId },
      data: { scanIncidentCause: "trop_volumineux" },
    });
    const lourd = raisonSansApercu(await relire(p.tache.versionId))!;
    verifier(lourd.includes("Dépose une version plus légère"), "un fichier trop lourd dit quoi faire");
    verifier(!lourd.includes("rien à faire"), "et ne fait plus attendre pour rien");
  }

  console.log("\nUne attente sans incident finit par se dire");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const p = await piece({ avecQuota: true });
    // Rien n'a été tenté — un worker arrêté, une file qui n'a pas
    // démarré : aucune tentative, donc aucun incident, donc aucun signal.
    const version = await relire(p.tache.versionId);
    verifier(version.scanAttempts === 0, "aucune tentative n'a eu lieu");

    const tard = new Date(version.uploadedAt.getTime() + ATTENTE_ORDINAIRE_MS + 60_000);
    const message = raisonSansApercu(version, tard)!;
    verifier(
      !message.includes("quelques instants"),
      "passé le délai ordinaire, la promesse de durée tombe",
    );
    verifier(
      raisonSansApercu(version, version.uploadedAt) === MENTION_EN_QUARANTAINE,
      "alors qu'à l'instant du dépôt, elle tient",
    );
  }

  console.log("\nLe constat franchit la frontière des processus");
  {
    /*
      Le worker sonde, le processus web lit. Ici, un seul processus joue
      les deux rôles — mais l'écriture et la lecture passent par la
      base, qui est précisément ce qui manquait : `oublierLesEssais`
      vide la mémoire du module, comme un autre processus l'aurait
      toujours eue vide.
    */
    reponseDuMoteur = {
      statut: 200,
      corps: '{"status":"infected","signature":"Eicar-Test-Signature"}',
    };
    /*
      Le chemin du worker, pas une recopie : `sonderLesServices` est la
      fonction que le service de production exécute au démarrage et à
      chaque passe horaire. Une recopie aurait éprouvé un enchaînement
      que personne n'emprunte.
    */
    await sonderLesServices();
    oublierLesEssais();

    verifier(
      sonderLeBalayage() === "ABSENTE",
      "la mémoire du processus vidée, la sonde locale ne sait plus rien",
    );

    const relus = await lireLesConstats();
    verifier(relus.antivirus?.reussi === true, "mais le constat est en base, et il est lu");
    verifier(
      sonderLeBalayage(process.env, relus.antivirus) === "CONCLUANTE",
      "et la sonde conclut dessus — ce qu'une variable de module ne permettait pas",
    );

    const capacite = constaterLesDependances(process.env, relus).find(
      (c) => c.cle === "antivirus",
    );
    verifier(
      capacite?.capacite === "OPERATIONNELLE",
      `la capacité devient opérationnelle (${capacite?.capacite})`,
    );
  }

  console.log("\nUn moteur qui ne détecte rien ferme le dépôt");
  {
    // Le moteur répond « sain » à tout, EICAR compris : il répond sans
    // détecter, et c'est la seule panne qui ne se remarquerait pas.
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    await sonderLesServices();

    const relus = await lireLesConstats();
    verifier(relus.antivirus?.reussi === false, "le constat enregistre la défaillance");
    verifier(
      moteurPrisEnDefaut(relus.antivirus),
      "et le dépôt la lit comme une fermeture, pas comme un avertissement",
    );

    const capacite = constaterLesDependances(process.env, relus).find(
      (c) => c.cle === "antivirus",
    );
    verifier(
      capacite?.capacite === "EN_PANNE",
      `la capacité se lit en panne, pas « non vérifiée » (${capacite?.capacite})`,
    );

    // Un constat périmé rouvre : le moteur a pu être remplacé depuis.
    await noterLeConstat(
      "antivirus",
      false,
      "constat volontairement ancien",
      new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS - 60_000),
    );
    verifier(
      !moteurPrisEnDefaut((await lireLesConstats()).antivirus),
      "un échec périmé ne ferme plus : une panne réparée n'est pas permanente",
    );
  }

  console.log("\nLa base refuse un constat qu'aucun code ne doit écrire");
  {
    const client = new Client({ connectionString: cible.toString() });
    await client.connect();
    try {
      let refuse = false;
      try {
        await client.query(
          `INSERT INTO "ServiceProbe" (service, succeeded, "observedAt")
             VALUES ('inventé', true, now())`,
        );
      } catch {
        refuse = true;
      }
      verifier(refuse, "un service que le code ne connaît pas est refusé");

      refuse = false;
      try {
        // Une horloge déréglée rendrait un constat éternellement frais.
        await client.query(
          `UPDATE "ServiceProbe" SET "observedAt" = now() + interval '2 days'
             WHERE service = 'antivirus'`,
        );
      } catch {
        refuse = true;
      }
      verifier(refuse, "et un constat daté du futur aussi");
    } finally {
      await client.end();
    }
  }

  /*
    Revue du 07/10/2026, M1. La confirmation d'un dépôt écrivait la clé
    que le navigateur renvoyait. Avec la clé d'un autre candidat, le
    balayage promouvait son fichier sous ce dossier-ci et le rendait
    lisible ; la purge de ce dossier-ci l'effaçait ensuite.
  */
  console.log("\nUne confirmation ne désigne que le dépôt de sa pièce (M1)");
  {
    const refusDe = async (appel: Promise<unknown>): Promise<string> =>
      appel.then(
        () => "acceptée",
        (e: unknown) => String((e as { echec?: { corps?: unknown } }).echec?.corps ?? e),
      );

    const mien = await piece();
    const autre = await piece();
    const cleDeLAutre = cleObjet(autre.application.id, "passeport");
    seau(SEAU_QUARANTAINE).set(cleDeLAutre, Buffer.from("%PDF pièce d'un autre candidat"));
    verifier(
      (await refusDe(exigerUnDepotConforme(cleDeLAutre, 30, mien.application.id, { code: "passeport" }))) ===
        REFUS_DE_LA_CONFIRMATION.cle,
      "la clé d'un autre dossier est refusée",
    );
    verifier(seau(SEAU_QUARANTAINE).has(cleDeLAutre), "et son fichier n'est pas touché");

    const absente = cleObjet(mien.application.id, "passeport");
    verifier(
      (await refusDe(exigerUnDepotConforme(absente, 30, mien.application.id, { code: "passeport" }))) ===
        REFUS_DE_LA_CONFIRMATION.absent,
      "un dépôt qui n'est jamais arrivé est refusé",
    );

    const tronquee = cleObjet(mien.application.id, "passeport");
    seau(SEAU_QUARANTAINE).set(tronquee, Buffer.alloc(10, 1));
    verifier(
      (await refusDe(exigerUnDepotConforme(tronquee, 2048, mien.application.id, { code: "passeport" }))).startsWith(
        "Le fichier reçu fait",
      ),
      "un envoi tronqué est refusé, avec les deux tailles",
    );
    verifier(!seau(SEAU_QUARANTAINE).has(tronquee), "et l'objet tronqué quitte la quarantaine");

    const conforme = cleObjet(mien.application.id, "passeport");
    seau(SEAU_QUARANTAINE).set(conforme, Buffer.alloc(2048, 1));
    verifier(
      (await refusDe(exigerUnDepotConforme(conforme, 2048, mien.application.id, { code: "passeport" }))) ===
        "acceptée",
      "le dépôt préparé pour cette pièce, arrivé entier, passe",
    );
  }

  console.log("\nLes garde-fous de la base refusent ce qu'aucun code ne doit écrire");
  {
    const p = await piece();
    const client = new Client({ connectionString: cible.toString() });
    await client.connect();
    try {
      let refuse = false;
      try {
        // Une version promue qui garderait son incident : l'exploitation
        // compterait des pièces qui ne sont plus bloquées.
        await client.query(
          `UPDATE "DocumentVersion" SET "scanState" = 'SAINE', "scannedAt" = now(),
             "scanIncidentAt" = now(), "scanIncidentCause" = 'injoignable' WHERE id = $1`,
          [p.tache.versionId],
        );
      } catch {
        refuse = true;
      }
      verifier(refuse, "un incident ouvert sur une version décidée est refusé par la base");

      refuse = false;
      try {
        // Un incident anonyme ne dirait pas s'il faut attendre ou agir.
        await client.query(
          `UPDATE "DocumentVersion" SET "scanIncidentAt" = now() WHERE id = $1`,
          [p.tache.versionId],
        );
      } catch {
        refuse = true;
      }
      verifier(refuse, "un incident sans cause l'est aussi");

      refuse = false;
      try {
        await client.query(
          `UPDATE "DocumentVersion" SET "scanAttempts" = 3 WHERE id = $1`,
          [p.tache.versionId],
        );
      } catch {
        refuse = true;
      }
      verifier(refuse, "et une tentative comptée sans date également");
    } finally {
      await client.end();
    }
  }

  /*
    En dernier : les nouvelles versions déposées ici restent en quarantaine,
    et les passes de reprise plus haut les compteraient.

    RF-2, FON-02 — 09/10/2026. Le balayage d'une version remplacée depuis
    son dépôt écrivait sur la pièce : un fichier infecté déjà remplacé la
    faisait redemander, avec un avis ; une version saine remplacée partait
    en analyse.
  */
  console.log("\nRF-2 — le balayage d'une version remplacée n'écrit pas sur la pièce (FON-02)");
  {
    const remplacer = async (p: Awaited<ReturnType<typeof piece>>) => {
      const cle = `dossiers/${p.application.id}/passeport-v2-${rang}.pdf`;
      seau(SEAU_QUARANTAINE).set(cle, Buffer.from("%PDF-1.4 v2"));
      await db.documentVersion.create({
        data: {
          documentId: p.document.id,
          rank: 2,
          objectKey: cle,
          checksum: `somme-v2-${rang}-${process.pid}`,
          mimeType: "application/pdf",
          sizeBytes: 11,
        },
      });
      await db.document.update({ where: { id: p.document.id }, data: { status: "EN_ANALYSE" } });
    };

    reponseDuMoteur = {
      statut: 200,
      corps: '{"status":"infected","signature":"Eicar-Test-Signature"}',
    };
    const infectee = await piece({ avecQuota: true });
    await remplacer(infectee);
    await balayerUnePiece(infectee.tache, leBalayeur());
    const version = await relire(infectee.tache.versionId);
    const document = await db.document.findUniqueOrThrow({ where: { id: infectee.document.id } });
    const avis = await db.notification.count({ where: { userId: infectee.user.id } });
    verifier(
      version.scanState === "INFECTEE" && version.objectKey === null,
      "l'ancien fichier infecté est quand même détruit",
    );
    verifier(
      document.status === "EN_ANALYSE",
      `la pièce reste celle du nouveau fichier (${document.status})`,
    );
    verifier(avis === 0, `aucun avis sur un fichier déjà remplacé (${avis})`);

    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const saine = await piece({ avecQuota: true });
    await remplacer(saine);
    const suite = await balayerUnePiece(saine.tache, leBalayeur());
    verifier(suite === "SANS_OBJET", `une version saine remplacée ne part pas en analyse (${suite})`);
    verifier(enConfiance(saine.cle), "elle est promue tout de même, et reste à l'historique");
  }

  /*
    RF-3, FON-03 — 09/10/2026. La reprise après une lecture illisible ne
    se paie pas (WF-06) ; le worker le sait, mais la promotion ne lançait
    l'analyse qu'avec un solde positif, sans regarder le verdict d'avant.
    Une meilleure photo déposée à solde nul était conservée sans lecture.
  */
  console.log("\nRF-3 — la reprise gratuite passe à solde nul, la première lecture non (FON-03)");
  {
    reponseDuMoteur = { statut: 200, corps: '{"status":"clean"}' };
    const reprise = await piece({ avecQuota: false });
    // La v1 a été lue et déclarée illisible ; son analyse a été rendue.
    const v1 = await db.documentVersion.findUniqueOrThrow({ where: { id: reprise.tache.versionId } });
    await db.documentVersion.update({
      where: { id: v1.id },
      data: { scanState: "SAINE", scannedAt: new Date() },
    });
    await db.documentAnalysis.create({
      data: {
        versionId: v1.id,
        verdict: "ILLISIBLE",
        title: "Cette pièce demande une relecture",
        body: "Reprends la photo.",
        creditConsumed: false,
      },
    });
    // Un pack existe, mais son solde est nul : tout a servi ailleurs.
    await db.analysisCredit.createMany({
      data: [
        { applicationId: reprise.application.id, delta: 1, reason: "ACHAT_PACK" },
        { applicationId: reprise.application.id, delta: -1, reason: "ANALYSE" },
      ],
    });
    const cle = `dossiers/${reprise.application.id}/passeport-reprise-${rang}.pdf`;
    seau(SEAU_QUARANTAINE).set(cle, Buffer.from("%PDF-1.4 meilleure photo"));
    const v2 = await db.documentVersion.create({
      data: {
        documentId: reprise.document.id,
        rank: 2,
        objectKey: cle,
        checksum: `somme-reprise-${rang}-${process.pid}`,
        mimeType: "application/pdf",
        sizeBytes: 22,
      },
    });
    const suite = await balayerUnePiece(
      { ...reprise.tache, versionId: v2.id },
      leBalayeur(),
    );
    verifier(suite === "ANALYSE", `la reprise après « illisible » part en analyse à solde nul (${suite})`);

    const premiere = await piece({ avecQuota: false });
    await db.analysisCredit.createMany({
      data: [
        { applicationId: premiere.application.id, delta: 1, reason: "ACHAT_PACK" },
        { applicationId: premiere.application.id, delta: -1, reason: "ANALYSE" },
      ],
    });
    const refus = await balayerUnePiece(premiere.tache, leBalayeur());
    verifier(refus === "CONSERVEE", `une première lecture à solde nul reste conservée (${refus})`);
  }
} finally {
  /*
    La reprise poste un job : pg-boss tient ses propres connexions sur la
    base jetable, et les laisser ouvertes fait échouer le `DROP`.
  */
  await (await getQueue()).stop({ wait: true }).catch(() => {});
  await new Promise<void>((ok) => {
    moteur.closeAllConnections();
    moteur.close(() => ok());
  });
  await new Promise<void>((ok) => {
    stockage.closeAllConnections();
    stockage.close(() => ok());
  });
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nUn fichier ne sort de la quarantaine que si un moteur réel l'a déclaré sain.");
