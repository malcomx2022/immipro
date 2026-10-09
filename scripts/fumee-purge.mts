/**
 * La purge de rétention, de bout en bout — INV-5, RG-10.1, RG-10.4.
 *
 * Ce qui s'éprouve ici et nulle part ailleurs : **ce que devient un
 * dossier quand le stockage refuse de supprimer un objet**. La réponse
 * était mauvaise et silencieuse — la version était marquée purgée, sa
 * clé effacée, le dossier déclaré purgé, et le fichier restait dans le
 * stockage sans que rien ne permette plus de le retrouver.
 *
 * Deux serveurs d'essai, sur la boucle locale :
 *
 * - **le stockage objet**, deux seaux en mémoire devant lesquels le vrai
 *   client MinIO parle pour de bon, et qu'on peut faire refuser à
 *   volonté. Un faux objet n'aurait pas appris que `DELETE` sur une clé
 *   absente rend 204 : c'est ce détail qui rendait le `catch` d'origine
 *   trompeur ;
 * - aucun autre : la purge ne parle à personne d'autre.
 *
 * Rien ne sort de la machine, et aucune pièce réelle n'est lue.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:purge
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_purge_${process.pid}`;
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
 * Le stockage objet d'essai — deux seaux, en mémoire.
 * ------------------------------------------------------------------ */

const SEAU_CONFIANCE = "immipro-documents";
const SEAU_QUARANTAINE = "immipro-quarantaine";
const seaux = new Map<string, Map<string, Buffer>>([
  [SEAU_CONFIANCE, new Map()],
  [SEAU_QUARANTAINE, new Map()],
]);
const seau = (nom: string) => seaux.get(nom) ?? new Map<string, Buffer>();
/**
 * La date de dernière écriture, que l'inventaire lit (S.151). Un objet posé
 * directement dans un seau, sans PUT, est daté du moment où on le liste.
 */
const datees = new Map<string, Date>();
const dateDe = (nomDuSeau: string, cle: string) => datees.get(`${nomDuSeau}\u0000${cle}`) ?? new Date();
const dater = (nomDuSeau: string, cle: string, date: Date) => datees.set(`${nomDuSeau}\u0000${cle}`, date);
const echapperXml = (texte: string) =>
  texte.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** Le stockage refuse toute suppression tant que ceci est vrai. */
let refuserLesSuppressions = false;
/** Le stockage refuse les suppressions de ce seau-là seulement. */
let refuserDansLeSeau: string | null = null;

const stockage = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
  requete.on("end", () => {
    const [brut, requeteDUrl] = (requete.url ?? "/").split("?");
    if (requeteDUrl === "location") {
      reponse.writeHead(200, { "Content-Type": "application/xml" });
      return reponse.end(
        '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>',
      );
    }

    const chemin = decodeURIComponent(brut!).replace(/^\//u, "");
    const separation = chemin.indexOf("/");
    const nomDuSeau = separation === -1 ? chemin : chemin.slice(0, separation);
    const objets = seau(nomDuSeau);
    const cle = separation === -1 ? "" : chemin.slice(separation + 1);

    switch (requete.method) {
      case "GET": {
        /*
          La liste d'un seau (ListObjectsV2), en une page : l'inventaire
          du stockage (RF-4, S.151) la lit, et rien d'autre ici.
        */
        if (cle === "" && new URLSearchParams(requeteDUrl ?? "").get("list-type") === "2") {
          const contenus = [...objets.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(
              ([k, octets]) =>
                `<Contents><Key>${echapperXml(k)}</Key><LastModified>${dateDe(nomDuSeau, k).toISOString()}</LastModified><ETag>"essai"</ETag><Size>${octets.length}</Size></Contents>`,
            )
            .join("");
          reponse.writeHead(200, { "Content-Type": "application/xml" });
          return reponse.end(
            `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${nomDuSeau}</Name><IsTruncated>false</IsTruncated>${contenus}</ListBucketResult>`,
          );
        }
        reponse.writeHead(405);
        return reponse.end();
      }
      case "PUT": {
        objets.set(cle, Buffer.concat(morceaux));
        dater(nomDuSeau, cle, new Date());
        reponse.writeHead(200, { ETag: '"essai"' });
        return reponse.end();
      }
      case "DELETE": {
        if (refuserLesSuppressions || refuserDansLeSeau === nomDuSeau) {
          reponse.writeHead(500, { "Content-Type": "application/xml" });
          return reponse.end("<Error><Code>InternalError</Code></Error>");
        }
        /*
          Une clé absente rend 204, comme S3 et MinIO. C'est ce fait-là
          qui rendait le `catch` d'origine trompeur : il annonçait
          couvrir l'objet déjà supprimé, et ne voyait passer que des
          pannes.
        */
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

console.log(`Purge de rétention sur une base jetable (${nomBase}), stockage :${portStockage}`);
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

process.env.MINIO_ENDPOINT = "127.0.0.1";
process.env.MINIO_PORT = String(portStockage);
process.env.MINIO_USE_SSL = "false";
process.env.MINIO_ROOT_USER = "essai";
process.env.MINIO_ROOT_PASSWORD = "essai-mot-de-passe";
process.env.MINIO_BUCKET_DOCUMENTS = SEAU_CONFIANCE;
process.env.MINIO_BUCKET_QUARANTAINE = SEAU_QUARANTAINE;

const { db } = await import("../src/lib/db");
const { purgerLesPiecesEchues, ANALYSE_PURGEE_CORPS } = await import("../src/server/jobs/purge");
const { donneesDuCompte } = await import("../src/server/lecture/portabilite");
const { inventorierLeStockage } = await import("../src/server/exploitation/inventaire-stockage");
const { demanderLaSuppression, acheverLesSuppressionsEnAttente } = await import(
  "../src/server/acces/suppression"
);

const HIER = new Date(Date.now() - 24 * 3_600_000);
let rang = 0;

/** Un dossier échu, avec une pièce déposée, son analyse et son entretien. */
async function dossierEchu(nombreDePieces = 1) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-p-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const application = await db.application.create({
    data: { userId: user.id, purgeDueAt: HIER },
  });

  const cles: string[] = [];
  for (let n = 0; n < nombreDePieces; n += 1) {
    const document = await db.document.create({
      data: {
        applicationId: application.id,
        code: `PIECE_${n}`,
        label: "Passeport",
        status: "CONFORME",
        required: true,
      },
    });
    const cle = `dossiers/${application.id}/piece-${n}.pdf`;
    seau(SEAU_CONFIANCE).set(cle, Buffer.from(`%PDF pièce ${n} du dossier ${rang}`));
    cles.push(cle);

    const version = await db.documentVersion.create({
      data: {
        documentId: document.id,
        rank: 1,
        objectKey: cle,
        checksum: `somme-${rang}-${n}-${process.pid}`,
        mimeType: "application/pdf",
        sizeBytes: 42,
        scanState: "SAINE",
        scannedAt: new Date(),
      },
    });
    await db.documentAnalysis.create({
      data: {
        versionId: version.id,
        verdict: "CONFORME",
        title: "Passeport lisible",
        body: "Ton passeport expire le 12 avril 2031.",
        fields: { numero: "A1234567", naissance: "1998-03-04" },
      },
    });
    await db.interviewAnswer.create({
      data: {
        documentId: document.id,
        rank: 1,
        section: "motivation",
        question: "Pourquoi ce pays ?",
        answer: "Je souhaite étudier à Montréal, près de ma sœur.",
      },
    });
  }

  return { user, application, cles };
}

/**
 * Un compte qui a **un de chaque**, pour que la garde sur l'export ait
 * quelque chose à mesurer : une liste vide y est alors un champ qui ne se
 * remplit jamais, et non un compte qui n'a rien fait.
 */
async function unCompteComplet() {
  const { user, application } = await dossierEchu(1);
  const regleA = await db.visaRule.create({
    data: {
      countryCode: "NL", visaType: "ETUDES", category: "ETUDES", version: 1,
      effectiveFrom: new Date("2026-01-01"), rules: {},
      sourceUrl: "https://ind.nl/regle", sourceTier: "OFFICIEL",
      verifiedAt: new Date("2026-01-01"), verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
    },
  });
  const regleB = await db.visaRule.create({
    data: {
      countryCode: "NL", visaType: "ETUDES", category: "ETUDES", version: 2,
      effectiveFrom: new Date("2026-06-01"), rules: {},
      sourceUrl: "https://ind.nl/regle", sourceTier: "OFFICIEL",
      verifiedAt: new Date("2026-06-01"), verifiedBy: "fumée",
      nextReviewAt: new Date("2027-06-01"), status: "PUBLISHED",
    },
  });
  await db.application.update({
    where: { id: application.id },
    data: { visaRuleId: regleA.id, targetDate: new Date("2027-09-01") },
  });

  /*
    Une pièce qui manque, pour que `completude.manques` ait de quoi se
    remplir : un compte « qui a un de chaque » doit aussi avoir un manque,
    sans quoi la garde ne saurait pas distinguer une liste vide parce que
    rien ne l'écrit d'une liste vide parce qu'il n'y a rien à dire.
  */
  await db.document.create({
    data: {
      applicationId: application.id, code: "RELEVE", label: "Relevé bancaire",
      status: "ATTENDUE", required: true, remedy: "TELEVERSER",
    },
  });

  await db.profile.create({
    data: { userId: user.id, objectif: "Étudier", highestDegree: "Licence" },
  });
  await db.consent.create({
    data: { userId: user.id, kind: "PIECES_IDENTITE", granted: true, version: "1.0" },
  });
  await db.transaction.create({
    data: {
      userId: user.id, applicationId: application.id,
      reference: `IMP-EXP-${process.pid}`, packCode: "dossier",
      amountMajor: 29, currency: "EUR", provider: "STRIPE", status: "CONFIRMEE",
      confirmedAt: new Date(),
    },
  });
  await db.notification.create({
    data: {
      userId: user.id, applicationId: application.id, kind: "REGLEMENTATION",
      title: "Une exigence a changé", body: "Le montant à prouver augmente.",
    },
  });
  await db.deadline.create({
    data: {
      applicationId: application.id, code: "depot", label: "Dépôt du dossier",
      dueAt: new Date("2027-06-01"),
    },
  });
  await db.analysisCredit.create({
    data: { applicationId: application.id, delta: 30, reason: "ACHAT_PACK" },
  });
  // RG-10.8 (S.90) : une demande de correction de la date de dépôt.
  await db.depositCorrectionRequest.create({
    data: {
      applicationId: application.id, requestedDate: new Date("2027-05-20"),
      explanation: "La date enregistrée est celle du rendez-vous, pas du dépôt.",
    },
  });
  // L.A (S.113) : une demande de relecture humaine de la complétude.
  await db.completenessReviewRequest.create({
    data: {
      applicationId: application.id,
      explanation: "Mon justificatif de ressources est bien déposé, il n'apparaît pas.",
    },
  });
  await db.documentVersion.updateMany({
    where: { document: { applicationId: application.id } },
    data: { body: "Lettre de motivation." },
  });
  const version = await db.documentVersion.findFirstOrThrow({
    where: { document: { applicationId: application.id } },
  });
  await db.critiqueFinding.create({
    data: {
      versionId: version.id, kind: "INCOHERENCE", title: "Une date diverge",
      body: "La date de naissance du passeport et celle du diplôme diffèrent.",
      gaps: [{ champ: "naissance" }] as never,
    },
  });

  // Les deux décisions du candidat, qui n'étaient pas dans l'export.
  await db.ruleMigration.create({
    data: {
      applicationId: application.id, fromRuleId: regleA.id, toRuleId: regleB.id,
      impact: "MAJEUR", diff: [] as never, alertedAt: new Date(),
      decision: "CONSERVER", decidedAt: new Date(),
    },
  });
  const partenaire = await db.partner.create({
    data: {
      name: "Agence de logement", kind: "LOGEMENT", url: "https://exemple.test",
      commissionBps: 1000, active: true,
    },
  });
  await db.partnerReferral.create({
    data: {
      partnerId: partenaire.id, applicationId: application.id,
      step: "PIECE_0", motive: "logement à l'arrivée",
      commissionBps: 1000, status: "DECLINEE",
    },
  });

  const consultant = await db.consultant.create({
    data: {
      name: "Mme Koffi", firm: "Cabinet Koffi", city: "Cotonou",
      qualification: "Conseil en mobilité", responseHours: 24,
      languages: ["fr"], active: true,
    },
  });
  await db.appointment.create({
    data: {
      reference: `RDV-EXP-${process.pid}`, applicationId: application.id,
      consultantId: consultant.id, startsAt: new Date("2026-10-01T09:00:00Z"),
      durationMin: 45, freeUntil: new Date("2026-09-29T09:00:00Z"),
      heldUntil: new Date("2026-09-25T09:00:00Z"), status: "TENU",
    },
  });

  return { userId: user.id, applicationId: application.id };
}

const enStockage = (cle: string) => seau(SEAU_CONFIANCE).has(cle);

try {
  console.log("\nUne purge ordinaire emporte le fichier et ses copies");
  {
    refuserLesSuppressions = false;
    const d = await dossierEchu();
    verifier(enStockage(d.cles[0]!), "avant : le fichier est dans le stockage de confiance");

    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.dossiers === 1, `un dossier purgé (${bilan.dossiers})`);
    verifier(bilan.objetsSupprimes === 1, `un objet supprimé (${bilan.objetsSupprimes})`);
    verifier(bilan.objetsEnEchec === 0, `aucun échec (${bilan.objetsEnEchec})`);
    verifier(!enStockage(d.cles[0]!), "le fichier a quitté le stockage");

    const version = await db.documentVersion.findFirstOrThrow({
      where: { document: { applicationId: d.application.id } },
    });
    verifier(version.purgedAt !== null, "la version est datée purgée");
    verifier(version.objectKey === null, "et ne garde aucune clé");

    // INV-5 ne distingue pas l'original de la copie.
    const analyse = await db.documentAnalysis.findFirstOrThrow({
      where: { versionId: version.id },
    });
    verifier(analyse.fields === null, "les champs lus dans la pièce sont effacés");
    verifier(
      analyse.body === ANALYSE_PURGEE_CORPS,
      "le message qui les citait aussi",
    );
    verifier(
      (await db.interviewAnswer.count({ where: { document: { applicationId: d.application.id } } })) ===
        0,
      "et les réponses d'entretien ne survivent pas à la pièce",
    );
  }

  console.log("\nUn objet déjà absent n'est pas un incident");
  {
    refuserLesSuppressions = false;
    const d = await dossierEchu();
    // Le fichier a disparu du stockage entre deux passes : c'est l'état visé.
    seau(SEAU_CONFIANCE).delete(d.cles[0]!);

    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.dossiers === 1, `le dossier est purgé quand même (${bilan.dossiers})`);
    verifier(
      bilan.objetsEnEchec === 0,
      `et aucun échec n'est compté (${bilan.objetsEnEchec})`,
    );
  }

  /*
    Revue du 07/10/2026, E4. Une pièce dont le balayage n'a jamais conclu
    a ses octets en quarantaine. La purge ne supprimait que dans la zone
    de confiance : `DELETE` y rendait 204 sur une clé absente, la version
    se déclarait purgée, et la pièce d'identité restait dans le stockage,
    orpheline.
  */
  console.log("\nUne pièce restée en quarantaine part aussi (E4)");
  {
    refuserLesSuppressions = false;
    const d = await dossierEchu();
    const cle = d.cles[0]!;
    const octets = seau(SEAU_CONFIANCE).get(cle)!;
    seau(SEAU_CONFIANCE).delete(cle);
    seau(SEAU_QUARANTAINE).set(cle, octets);
    await db.documentVersion.updateMany({
      where: { objectKey: cle },
      data: { scanState: "EN_QUARANTAINE", scannedAt: null },
    });

    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.dossiers === 1, `le dossier est purgé (${bilan.dossiers})`);
    verifier(
      !seau(SEAU_QUARANTAINE).has(cle),
      "et la pièce a quitté la quarantaine — INV-5",
    );
  }

  console.log("\nUn double laissé par une promotion interrompue part des deux côtés");
  {
    refuserLesSuppressions = false;
    const d = await dossierEchu();
    const cle = d.cles[0]!;
    // Copiée en confiance, pas encore supprimée de la quarantaine.
    seau(SEAU_QUARANTAINE).set(cle, seau(SEAU_CONFIANCE).get(cle)!);

    await purgerLesPiecesEchues();
    verifier(
      !enStockage(cle) && !seau(SEAU_QUARANTAINE).has(cle),
      "aucune des deux copies ne survit",
    );
  }

  console.log("\nUn refus de la seule quarantaine garde la clé");
  {
    refuserLesSuppressions = false;
    const d = await dossierEchu();
    const cle = d.cles[0]!;
    seau(SEAU_QUARANTAINE).set(cle, seau(SEAU_CONFIANCE).get(cle)!);
    refuserDansLeSeau = SEAU_QUARANTAINE;

    const bilan = await purgerLesPiecesEchues();
    refuserDansLeSeau = null;
    verifier(bilan.objetsEnEchec === 1, `l'échec est compté (${bilan.objetsEnEchec})`);
    const version = await db.documentVersion.findFirstOrThrow({
      where: { document: { applicationId: d.application.id } },
    });
    verifier(
      version.objectKey === cle && version.purgedAt === null,
      "la version garde sa clé : la copie restante se retrouve à la passe suivante",
    );

    const reprise = await purgerLesPiecesEchues();
    verifier(
      reprise.dossiers === 1 && !seau(SEAU_QUARANTAINE).has(cle),
      "et la passe suivante l'emporte",
    );
  }

  console.log("\nUn stockage qui refuse ne fait pas disparaître la clé");
  {
    const d = await dossierEchu();
    refuserLesSuppressions = true;

    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.objetsEnEchec === 1, `l'échec est compté comme tel (${bilan.objetsEnEchec})`);
    verifier(bilan.dossiers === 0, `et aucun dossier n'est déclaré purgé (${bilan.dossiers})`);
    verifier(
      bilan.dossiersIncomplets === 1,
      `le dossier est compté incomplet (${bilan.dossiersIncomplets})`,
    );

    const version = await db.documentVersion.findFirstOrThrow({
      where: { document: { applicationId: d.application.id } },
    });
    verifier(
      version.objectKey === d.cles[0],
      "la clé est conservée : sans elle, le fichier serait introuvable",
    );
    verifier(version.purgedAt === null, "et la version ne se déclare pas purgée");
    verifier(enStockage(d.cles[0]!), "le fichier est toujours là, et on sait où");

    const application = await db.application.findUniqueOrThrow({
      where: { id: d.application.id },
    });
    verifier(application.purgedAt === null, "le dossier reste échu, donc repris demain");

    /*
      Le garde-fou de RG-10.4, qui était un chemin mort :
      `acheverLaSuppression` n'anonymise que si plus rien ne reste. Tant
      que le dossier se déclarait purgé quoi qu'il arrive, ce compte
      valait toujours zéro — et le compte était anonymisé par-dessus un
      fichier survivant, devenu orphelin et introuvable.
    */
    verifier(
      (await db.application.count({ where: { userId: d.user.id, purgedAt: null } })) === 1,
      "et la suppression de compte voit qu'une pièce n'a pas pu partir",
    );

    // Les copies ne partent pas non plus : une purge à moitié faite ne
    // doit pas se lire comme une purge entière.
    const analyse = await db.documentAnalysis.findFirstOrThrow({
      where: { versionId: version.id },
    });
    verifier(analyse.fields !== null, "les champs lus restent, comme le fichier");
  }

  console.log("\nLa passe suivante rattrape ce que le stockage avait refusé");
  {
    refuserLesSuppressions = false;
    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.dossiers === 1, `le dossier passe enfin (${bilan.dossiers})`);
    verifier(bilan.objetsEnEchec === 0, "sans échec cette fois");
    verifier(
      (await db.documentVersion.count({ where: { objectKey: { not: null }, purgedAt: null } })) === 0,
      "et plus aucune version n'attend sa purge",
    );
  }

  console.log("\nUn dossier à plusieurs pièces ne se purge pas à moitié");
  {
    const d = await dossierEchu(2);
    // Le stockage refuse tout : les deux pièces résistent.
    refuserLesSuppressions = true;
    await purgerLesPiecesEchues();

    const restantes = await db.documentVersion.count({
      where: { document: { applicationId: d.application.id }, purgedAt: null },
    });
    verifier(restantes === 2, `les deux versions restent à purger (${restantes})`);
    const documentsPurges = await db.document.count({
      where: { applicationId: d.application.id, status: "PURGEE" },
    });
    verifier(
      documentsPurges === 0,
      `et aucun document ne se déclare purgé (${documentsPurges})`,
    );

    refuserLesSuppressions = false;
    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.versions === 2, `la reprise emporte les deux (${bilan.versions})`);
    verifier(
      (await db.document.count({
        where: { applicationId: d.application.id, status: "PURGEE" },
      })) === 2,
      "et les deux documents sont enfin purgés",
    );
  }

  console.log("\nCe qui n'est pas échu n'est pas touché");
  {
    refuserLesSuppressions = false;
    const user = await db.user.create({
      data: { email: `fumee-p-vif-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const application = await db.application.create({
      data: { userId: user.id, purgeDueAt: new Date(Date.now() + 30 * 24 * 3_600_000) },
    });
    const document = await db.document.create({
      data: { applicationId: application.id, code: "P", label: "Passeport", required: true },
    });
    const cle = `dossiers/${application.id}/vivant.pdf`;
    seau(SEAU_CONFIANCE).set(cle, Buffer.from("%PDF vivant"));
    await db.documentVersion.create({
      data: {
        documentId: document.id,
        rank: 1,
        objectKey: cle,
        checksum: `vif-${process.pid}`,
        scanState: "SAINE",
        scannedAt: new Date(),
      },
    });

    const bilan = await purgerLesPiecesEchues();
    verifier(bilan.dossiers === 0, `aucun dossier purgé (${bilan.dossiers})`);
    verifier(enStockage(cle), "et le fichier d'un dossier vivant ne bouge pas");
  }

  console.log("\nUne suppression de compte n'anonymise pas par-dessus un fichier survivant");
  {
    /*
      RG-10.4, et le garde-fou qui était un chemin mort.

      `acheverLaSuppression` n'anonymise que si plus aucun dossier ne
      reste à purger — « anonymiser ici rendrait le fichier orphelin et
      introuvable », disait son commentaire. Tant que la purge se
      déclarait complète quoi qu'il arrive, ce compte valait toujours
      zéro : le compte était anonymisé, le fichier restait, et sa clé
      partait avec la version.
    */
    const d = await dossierEchu();
    refuserLesSuppressions = true;

    const bilan = await demanderLaSuppression(d.user.id);
    verifier(bilan.anonymise === false, "le compte n'est pas anonymisé");
    verifier(enStockage(d.cles[0]!), "parce que le fichier n'a pas pu partir");

    const compte = await db.user.findUniqueOrThrow({ where: { id: d.user.id } });
    verifier(compte.deletedAt === null, "le compte reste « suppression demandée »");
    verifier(
      compte.deletionRequestedAt !== null,
      "et la demande est datée : elle sera reprise",
    );

    // L'accès, lui, est fermé tout de suite : la reprise ne rouvre rien.
    verifier(
      (await db.session.count({ where: { userId: d.user.id } })) === 0,
      "les sessions sont fermées sans attendre l'issue de la purge",
    );

    console.log("  — le stockage revient, la reprise s'achève —");
    refuserLesSuppressions = false;
    const reprises = await acheverLesSuppressionsEnAttente();
    verifier(reprises.reprises === 1, `la reprise trouve le compte (${reprises.reprises})`);
    verifier(!enStockage(d.cles[0]!), "le fichier part enfin");

    const apres = await db.user.findUniqueOrThrow({ where: { id: d.user.id } });
    verifier(apres.deletedAt !== null, "et le compte est anonymisé, une fois seulement");
  }

  console.log("\nLa base refuse ce qu'aucun code ne doit écrire");
  {
    const d = await dossierEchu();
    const client = new Client({ connectionString: cible.toString() });
    await client.connect();
    try {
      let refuse = false;
      try {
        // Une version purgée qui garderait sa clé est une URL présignable.
        await client.query(
          `UPDATE "DocumentVersion" SET "purgedAt" = now()
             WHERE "documentId" IN (SELECT id FROM "Document" WHERE "applicationId" = $1)`,
          [d.application.id],
        );
      } catch {
        refuse = true;
      }
      verifier(refuse, "une version datée purgée qui garde sa clé d'objet est refusée");
    } finally {
      await client.end();
    }
  }

  /* ── INV-5 : un dossier sans échéance n'est purgé par personne ────── */
  console.log("\nUn dossier qu'aucune échéance ne vise reste entier, et se voit");
  {
    /*
      Établi par exécution avant d'être signalé : cinq dossiers inactifs
      depuis vingt mois, chacun portant un passeport déposé, un par statut.
      Après deux passes du job d'inactivité —

        BROUILLON   ABANDONNE   purge prévue : 2026-10-23
        ACTIF       ACTIF       purge prévue : — JAMAIS —
        PRET        PRET        purge prévue : — JAMAIS —
        SOUMIS      SOUMIS      purge prévue : — JAMAIS —
        SUSPENDU    SUSPENDU    purge prévue : — JAMAIS —

      `traiterLesBrouillonsInactifs` ne regarde que les brouillons — son nom
      le dit — et rien d'autre ne pose `purgeDueAt` hors d'une clôture
      déclarée. Combien de temps garder un dossier soumis dont
      l'administration n'a pas encore répondu est une décision de
      rétention, pas un correctif. Ce que ce lot tient, c'est que le
      silence cesse d'être silencieux.
    */
    const { ABANDON_JOURS } = await import("../src/domain/dossiers/inactivite");
    const vieux = new Date(Date.now() - (ABANDON_JOURS + 30) * 24 * 3_600_000);

    const user = await db.user.create({
      data: { email: `fumee-p-sans-echeance-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    /* INV-3 : un dossier non brouillon fige sa version de règle, et la base
       le fait respecter. C'est la contrainte qui l'a rappelé ici. */
    const regle = await db.visaRule.create({
      data: {
        countryCode: "NL",
        visaType: `purge_${process.pid}`,
        category: "ETUDES",
        version: 1,
        effectiveFrom: new Date("2020-01-01"),
        rules: { conditions: [], pieces_requises: [], reserves: [] } as never,
        sourceUrl: "https://ind.nl",
        sourceTier: "OFFICIEL",
        verifiedAt: new Date("2026-01-01"),
        verifiedBy: "fumée",
        nextReviewAt: new Date("2027-01-01"),
        status: "PUBLISHED",
        publishedAt: new Date("2020-01-01"),
      },
    });
    const orphelin = await db.application.create({
      data: {
        userId: user.id,
        visaRuleId: regle.id,
        status: "SOUMIS",
        createdAt: vieux,
        updatedAt: vieux,
      },
    });
    const doc = await db.document.create({
      data: {
        applicationId: orphelin.id,
        code: "passeport",
        label: "Passeport",
        status: "CONFORME",
        required: true,
      },
    });
    await db.documentVersion.create({
      data: {
        documentId: doc.id,
        rank: 1,
        objectKey: `dossiers/${orphelin.id}/passeport.pdf`,
        checksum: `somme-orpheline-${process.pid}`,
        mimeType: "application/pdf",
        sizeBytes: 42,
        uploadedAt: vieux,
      },
    });

    await purgerLesPiecesEchues(new Date());
    const apres = await db.application.findUniqueOrThrow({ where: { id: orphelin.id } });
    verifier(
      apres.purgeDueAt === null && apres.purgedAt === null,
      "la purge ne le voit pas : il n'a aucune échéance à dépasser",
    );

    /*
      Ce que la sonde de santé compte désormais. Elle ne supprime rien et ne
      décide rien : elle refuse seulement que ce dossier n'existe pour
      personne.
    */
    const sansEcheance = await db.application.count({
      where: {
        purgedAt: null,
        purgeDueAt: null,
        updatedAt: { lte: new Date(Date.now() - ABANDON_JOURS * 24 * 3_600_000) },
        documents: { some: { versions: { some: { purgedAt: null } } } },
      },
    });
    verifier(sansEcheance >= 1, `mais la sonde de rétention le compte (${sansEcheance})`);
  }

  // ── C-10 : l'export rend ce que le compte porte ────────────────────
  /*
    Le champ `rendezVous` de la racine valait `[]`, avec pour commentaire
    qu'il « reste pour qu'un lecteur qui cherche rendezVous à la racine
    trouve où regarder plutôt que de conclure qu'il n'y en a pas ». Une
    liste vide ne dit pas cela : elle dit qu'il n'y en a aucun. Et deux
    décisions du candidat — son arbitrage quand une règle change (T-02),
    sa réponse à une proposition de partenaire (T-03) — n'étaient dans
    aucune des deux listes de l'écran, ni dans le fichier.

    La garde porte sur la forme : **sur un compte qui a un de chaque,
    aucune liste de l'export n'est vide.** Une liste constamment vide est
    un champ qui ne se remplit jamais, et c'est exactement ce qu'était
    `rendezVous`.
  */
  console.log("\nC-10 — sur un compte qui a un de chaque, aucune liste de l'export n'est vide");
  {
    const compte = await unCompteComplet();
    const exporte = await donneesDuCompte(compte.userId);

    /*
      Deux niveaux, et deux seulement : les listes de la racine et celles
      d'un dossier. Ce sont celles que l'export produit toujours, et dont
      une constamment vide est un champ que rien ne remplit — ce qu'était
      `rendezVous`.

      Plus bas, le vide est légitime et fréquent : une pièce jamais
      déposée n'a ni version ni entretien, et l'exiger ferait décrire à
      cette garde un compte que le produit ne sait pas produire.
    */
    const vides: string[] = [];
    const listesVides = (objet: object, chemin: string): void => {
      for (const [cle, valeur] of Object.entries(objet)) {
        if (Array.isArray(valeur) && valeur.length === 0) vides.push(`${chemin}.${cle}`);
      }
    };
    listesVides(exporte, "export");
    for (const [i, dossier] of (exporte.dossiers as object[]).entries()) {
      listesVides(dossier, `export.dossiers[${i}]`);
    }
    verifier(vides.length === 0, `aucune liste vide (${vides.join(", ") || "—"})`);

    const texte = JSON.stringify(exporte);
    verifier(texte.includes("CONSERVER"), "l'arbitrage rendu par le candidat y est (T-02)");
    verifier(texte.includes("DECLINEE"), "sa réponse à une proposition de partenaire y est (T-03)");
    verifier(
      (exporte.rendezVous as unknown[]).length === 1,
      `et la racine porte ses rendez-vous (${(exporte.rendezVous as unknown[]).length})`,
    );
  }

  console.log("\nL'inventaire du stockage classe chaque objet, et ne supprime rien (RF-4, S.151)");
  {
    const IL_Y_A_DEUX_JOURS = new Date(Date.now() - 48 * 3_600_000);
    const candidat = await db.user.create({
      data: { email: `fumee-p-inventaire-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const purge = await db.application.create({
      data: { userId: candidat.id, purgeDueAt: HIER, purgedAt: HIER },
    });
    const echu = await db.application.create({ data: { userId: candidat.id, purgeDueAt: HIER } });
    const vivant = await db.application.create({ data: { userId: candidat.id } });
    const document = await db.document.create({
      data: { applicationId: vivant.id, code: "passeport", label: "Passeport", status: "CONFORME", required: true },
    });

    const cle = (dossier: string, suffixe: string) => `dossiers/${dossier}/passeport/${suffixe}`;
    const poser = (nomDuSeau: string, k: string, date = new Date()) => {
      seau(nomDuSeau).set(k, Buffer.from(`octets de ${k}`));
      dater(nomDuSeau, k, date);
    };
    // Une pièce restée en quarantaine, que la purge d'avant S.125 a laissée.
    const apresPurge = cle(purge.id, "1700000000000-apres-purge");
    poser(SEAU_QUARANTAINE, apresPurge, IL_Y_A_DEUX_JOURS);
    // Un objet sans version sous un dossier échu : sa purge ne le verra pas.
    const sousEchu = cle(echu.id, "1700000000000-sous-echu");
    poser(SEAU_CONFIANCE, sousEchu, IL_Y_A_DEUX_JOURS);
    // Une version saine, dans sa zone, et son double resté en quarantaine.
    const rattache = cle(vivant.id, "1700000000000-rattache");
    poser(SEAU_CONFIANCE, rattache, IL_Y_A_DEUX_JOURS);
    poser(SEAU_QUARANTAINE, rattache, IL_Y_A_DEUX_JOURS);
    await db.documentVersion.create({
      data: {
        documentId: document.id, rank: 1, objectKey: rattache, checksum: `inv-1-${process.pid}`,
        mimeType: "application/pdf", sizeBytes: 10, scanState: "SAINE", scannedAt: IL_Y_A_DEUX_JOURS,
      },
    });
    // Une version en quarantaine dont l'objet n'existe nulle part.
    const manquante = await db.documentVersion.create({
      data: {
        documentId: document.id, rank: 2, objectKey: cle(vivant.id, "1700000000000-manquante"),
        checksum: `inv-2-${process.pid}`, mimeType: "application/pdf", sizeBytes: 10,
      },
    });
    // Un dépôt de l'instant, et un dépôt jamais confirmé.
    const enCours = cle(vivant.id, `${Date.now()}-en-cours`);
    poser(SEAU_QUARANTAINE, enCours);
    const jamaisConfirme = cle(vivant.id, "1700000000000-jamais-confirme");
    poser(SEAU_QUARANTAINE, jamaisConfirme, IL_Y_A_DEUX_JOURS);
    // Ni l'un ni l'autre n'a d'appartenance démontrée.
    const inconnu = `dossiers/${randomUUID()}/passeport/1700000000000-inconnu`;
    poser(SEAU_CONFIANCE, inconnu, IL_Y_A_DEUX_JOURS);
    const horsSchema = `divers/inventaire-${process.pid}.pdf`;
    poser(SEAU_CONFIANCE, horsSchema, IL_Y_A_DEUX_JOURS);

    const photo = async () => ({
      objets: [...seaux.entries()].map(([nom, m]) => `${nom}:${[...m.keys()].sort().join(",")}`).join("|"),
      lignes: [
        await db.application.count(),
        await db.document.count(),
        await db.documentVersion.count(),
        await db.auditLog.count(),
      ].join(","),
    });
    const avant = await photo();
    const inventaire = await inventorierLeStockage({ limite: 1000 });
    const apres = await photo();

    const classe = (code: string) => inventaire.classes.find((c) => c.code === code)!;
    const dans = (code: string, zone: string, k: string) => classe(code).identifiants.includes(`${zone} ${k}`);
    verifier(dans("APRES_PURGE", "QUARANTAINE", apresPurge), "un objet resté sous un dossier purgé est nommé");
    verifier(dans("DOSSIER_ECHU", "CONFIANCE", sousEchu), "un objet sans version sous un dossier échu aussi");
    verifier(dans("RATTACHE", "CONFIANCE", rattache), "une version dans sa zone est rattachée");
    verifier(dans("DOUBLON", "QUARANTAINE", rattache), "et son double dans l'autre zone est un doublon");
    verifier(dans("DEPOT_EN_COURS", "QUARANTAINE", enCours), "un dépôt de l'instant attend sa confirmation");
    verifier(dans("DOSSIER_VIVANT", "QUARANTAINE", jamaisConfirme), "un dépôt jamais confirmé se relit");
    verifier(dans("DOSSIER_INCONNU", "CONFIANCE", inconnu), "un dossier que la base ignore se relit");
    verifier(dans("HORS_SCHEMA", "CONFIANCE", horsSchema), "une clé hors schéma se relit");
    verifier(
      classe("MANQUANT").identifiants.includes(manquante.id),
      "une version dont l'objet manque est nommée par son identifiant",
    );

    const perimetre = new Set(inventaire.perimetre.lignes);
    verifier(
      perimetre.has(`QUARANTAINE ${apresPurge}`) && perimetre.has(`CONFIANCE ${sousEchu}`),
      `le périmètre candidat tient l'appartenance démontrée et la rétention échue (${inventaire.perimetre.nombre})`,
    );
    verifier(
      [rattache, enCours, jamaisConfirme, inconnu, horsSchema].every(
        (k) => !perimetre.has(`CONFIANCE ${k}`) && !perimetre.has(`QUARANTAINE ${k}`),
      ),
      "et rien d'autre : ni pièce vivante, ni doute",
    );
    verifier(
      (await inventorierLeStockage({ limite: 1 })).perimetre.empreinte === inventaire.perimetre.empreinte,
      "l'empreinte du périmètre ne dépend que de la liste, pas de la limite d'affichage",
    );
    verifier(avant.objets === apres.objets, "aucun objet n'a été supprimé ni ajouté");
    verifier(avant.lignes === apres.lignes, `aucune ligne n'a été écrite en base (${apres.lignes})`);
    verifier(
      !JSON.stringify(inventaire).includes(candidat.email),
      "la sortie ne porte aucun courriel",
    );

    /*
      Le défaut qu'il rend visible (revue E4) : la purge part des versions.
      Un objet sans version sous un dossier échu survit à la purge de son
      dossier, et plus rien en base ne le désigne.
    */
    await purgerLesPiecesEchues();
    verifier(
      (await db.application.findUniqueOrThrow({ where: { id: echu.id } })).purgedAt !== null,
      "le dossier échu se déclare purgé",
    );
    verifier(seau(SEAU_CONFIANCE).has(sousEchu), "et l'objet sans version est toujours dans le stockage");
    const ensuite = await inventorierLeStockage({ limite: 1000 });
    verifier(
      ensuite.classes.find((c) => c.code === "APRES_PURGE")!.identifiants.includes(`CONFIANCE ${sousEchu}`),
      "l'inventaire le retrouve sous un dossier purgé",
    );
  }

} finally {
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
console.log("\nRien ne se déclare purgé tant que les octets n'ont pas quitté le stockage.");
