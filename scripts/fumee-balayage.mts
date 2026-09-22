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
const { balayerUnePiece, BalayageIndisponible } = await import("../src/server/jobs/balayage");
const { leBalayeur, verifierLeMoteur, sonderLeBalayage, oublierLesEssais } = await import(
  "../src/server/securite/antivirus"
);
const { TENTATIVES_AVANT_INCIDENT, EICAR } = await import("../src/domain/securite/balayage");
const { noterLeConstat, lireLesConstats } = await import("../src/server/exploitation/constats");
const { moteurPrisEnDefaut, FRAICHEUR_DU_CONSTAT_MS } = await import(
  "../src/domain/exploitation/constats"
);
const { constaterLesDependances } = await import("../src/server/exploitation/capacites");
const { sonderLesServices } = await import("../src/server/exploitation/sondes");

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
async function piece(options: { avecQuota?: boolean } = {}) {
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

  return {
    tache: { applicationId: application.id, documentId: document.id, versionId: version.id },
    cle,
    octets,
    application,
    document,
    user,
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

    recusParLeMoteur.length = 0;
    const suite = await balayerUnePiece(p.tache, leBalayeur());
    verifier(suite === "SANS_OBJET", `le rejeu ne décide rien (${suite})`);
    verifier(recusParLeMoteur.length === 0, "et n'appelle pas le moteur une seconde fois");

    const version = await relire(p.tache.versionId);
    verifier(
      version.scanState === "SAINE",
      `une version saine ne redescend pas en quarantaine (${version.scanState})`,
    );
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
} finally {
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
