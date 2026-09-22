/**
 * La chaîne de lecture d'une pièce — WF-06 étape 5, branchée le
 * 22/09/2026.
 *
 *     pièce promue → octets → service de lecture → mesure → verdict
 *
 * Ce que le domaine sait juger seul s'éprouve dans
 * `tests/extraction-documentaire.test.ts`. Ce qui demande **en plus** une
 * base, un stockage et un vrai client HTTP s'éprouve ici :
 *
 * - que ce sont les **octets** qui partent, et jamais une URL ni une clé
 *   d'objet — la raison d'être des deux seaux ;
 * - qu'une lecture qui n'aboutit pas ne déclare jamais une pièce
 *   conforme, et ne débite jamais le candidat ;
 * - qu'une saturation du service se rejoue au lieu d'accuser le fichier ;
 * - que les jetons consommés sont écrits même quand rien n'a été rendu
 *   (INV-6).
 *
 * Deux serveurs d'essai, sur la boucle locale :
 *
 * - **le service de lecture**, devant lequel le vrai SDK Anthropic parle
 *   pour de bon — `ANTHROPIC_BASE_URL` suffit à l'y amener. C'est ce qui
 *   permet de lire ce qui part réellement dans le corps de l'appel ;
 * - **le stockage objet**, deux seaux en mémoire devant lesquels le vrai
 *   client MinIO parle pour de bon.
 *
 * Rien ne sort de la machine, aucune pièce réelle n'est lue, et aucun
 * jeton n'est facturé.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:extraction
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

const nomBase = `immipro_extraction_${process.pid}`;
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
 * Le service de lecture d'essai.
 * ------------------------------------------------------------------ */

type ReponseDuService = { statut: number; corps: string };

const reponseDeLecture = (charge: unknown, entree = 4210, sortie = 96): ReponseDuService => ({
  statut: 200,
  corps: JSON.stringify({
    id: "msg_essai",
    type: "message",
    role: "assistant",
    model: "modele-d-essai",
    content: [{ type: "text", text: JSON.stringify(charge) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: entree, output_tokens: sortie },
  }),
});

let reponseDuService: ReponseDuService = reponseDeLecture({});
const recusParLeService: string[] = [];

const service = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
  requete.on("end", () => {
    recusParLeService.push(Buffer.concat(morceaux).toString("utf8"));
    reponse.writeHead(reponseDuService.statut, { "Content-Type": "application/json" });
    reponse.end(reponseDuService.corps);
  });
});
await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
const portService = (service.address() as AddressInfo).port;

/* ------------------------------------------------------------------ *
 * Le stockage objet d'essai — deux seaux, en mémoire.
 * ------------------------------------------------------------------ */

const seaux = new Map<string, Map<string, Buffer>>();
const SEAU_CONFIANCE = "immipro-documents";
const SEAU_QUARANTAINE = "immipro-quarantaine";
seaux.set(SEAU_CONFIANCE, new Map());
seaux.set(SEAU_QUARANTAINE, new Map());
const seau = (nom: string) => seaux.get(nom) ?? new Map<string, Buffer>();

/** Ce que `HEAD` annonce, quand on veut autre chose que la vérité. */
let tailleAnnoncee: number | null = null;

const stockage = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
  requete.on("end", () => {
    const [brut, requeteDUrl] = (requete.url ?? "/").split("?");
    // Le client demande d'abord la région du seau ; sans cette réponse,
    // rien de ce qui suit n'a lieu.
    if (requeteDUrl === "location") {
      reponse.writeHead(200, { "Content-Type": "application/xml" });
      return reponse.end(
        '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>',
      );
    }

    const chemin = decodeURIComponent(brut!).replace(/^\//u, "");
    const separation = chemin.indexOf("/");
    const nomDuSeau = separation === -1 ? chemin : chemin.slice(0, separation);
    const cle = separation === -1 ? "" : chemin.slice(separation + 1);
    const objets = seau(nomDuSeau);

    const absent = () => {
      reponse.writeHead(404, { "Content-Type": "application/xml" });
      reponse.end("<Error><Code>NoSuchKey</Code></Error>");
    };

    switch (requete.method) {
      case "HEAD": {
        const objet = objets.get(cle);
        if (!objet) return absent();
        reponse.writeHead(200, {
          // La taille annoncée est celle que le stockage veut bien
          // donner : c'est sur elle que le plafond se décide, avant tout
          // transfert. La faire mentir est la seule façon d'éprouver
          // cette décision-là sans écrire trente-deux mégaoctets.
          "Content-Length": String(tailleAnnoncee ?? objet.length),
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
  `Chaîne d'extraction sur une base jetable (${nomBase}), lecture :${portService}, stockage :${portStockage}`,
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
process.env.ANTHROPIC_API_KEY = "cle-d-essai";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${portService}`;
process.env.MINIO_ENDPOINT = "127.0.0.1";
process.env.MINIO_PORT = String(portStockage);
process.env.MINIO_USE_SSL = "false";
process.env.MINIO_ROOT_USER = "essai";
process.env.MINIO_ROOT_PASSWORD = "essai-mot-de-passe";
process.env.MINIO_BUCKET_DOCUMENTS = SEAU_CONFIANCE;
process.env.MINIO_BUCKET_QUARANTAINE = SEAU_QUARANTAINE;

const { db } = await import("../src/lib/db");
const { analyserUnePiece, TENTATIVES_AVANT_REVUE } = await import("../src/server/jobs/analyse");
const { lExtracteur, EXTRACTEUR_NON_BRANCHE } = await import("../src/server/dossiers/extracteur");
const { GESTE_SANS_DATE_CIBLE } = await import("../src/domain/dossiers/extraction");
const { solde } = await import("../src/server/acces/quota");

let rang = 0;

const CONDITION_PASSEPORT = {
  code: "passeport_validite_min",
  operateur: "gte",
  valeur: 6,
  unite: "mois",
  message_echec:
    "Ton passeport doit rester valable 6 mois après la date de départ. Fais-le renouveler, puis remplace le fichier.",
  bloquant: true,
};

const REGLE = {
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
  conditions: [CONDITION_PASSEPORT],
  pieces_requises: [
    {
      code: "passeport",
      libelle: "Passeport",
      obligatoire: true,
      traduction_assermentee: false,
      legalisation: false,
      nature: "televerser",
    },
    {
      code: "releve_bancaire",
      libelle: "Relevé bancaire",
      obligatoire: true,
      traduction_assermentee: false,
      legalisation: false,
      nature: "televerser",
    },
  ],
  reserves: [],
};

/** Un candidat, son dossier, une pièce promue et prête à être lue. */
async function piece(
  options: {
    dateCible?: string | null;
    sansObjet?: boolean;
    statut?: "BROUILLON" | "ACTIF" | "SUSPENDU";
  } = {},
) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-x-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "CA",
      visaType: "ETUDES",
      category: "ETUDES",
      version: rang,
      effectiveFrom: new Date("2026-01-01"),
      rules: REGLE,
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date("2026-01-01"),
      verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
  const application = await db.application.create({
    data: {
      userId: user.id,
      visaRuleId: regle.id,
      status: options.statut ?? "ACTIF",
      ...(options.dateCible ? { targetDate: new Date(options.dateCible) } : {}),
    },
  });
  const document = await db.document.create({
    data: {
      applicationId: application.id,
      code: "passeport",
      label: "Passeport",
      status: "EN_ANALYSE",
      required: true,
      remedy: "TELEVERSER",
    },
  });

  // La pièce a été balayée et promue : elle vit dans le seau de confiance.
  const cle = `dossiers/${application.id}/passeport-${rang}.pdf`;
  const octets = Buffer.from(`%PDF-1.4 pièce numéro ${rang}`);
  if (!options.sansObjet) seau(SEAU_CONFIANCE).set(cle, octets);

  const version = await db.documentVersion.create({
    data: {
      documentId: document.id,
      rank: 1,
      objectKey: cle,
      checksum: `somme-${rang}-${process.pid}`,
      mimeType: "application/pdf",
      sizeBytes: octets.length,
      scanState: "SAINE",
      scannedAt: new Date(),
    },
  });

  await db.analysisCredit.create({
    data: { applicationId: application.id, delta: 5, reason: "ACHAT_PACK" },
  });

  return {
    tache: { applicationId: application.id, documentId: document.id, versionId: version.id },
    cle,
    octets,
    application,
    document,
    version,
  };
}

const relireDocument = (id: string) => db.document.findUniqueOrThrow({ where: { id } });
const relireVersion = (id: string) => db.documentVersion.findUniqueOrThrow({ where: { id } });
const analyseDe = (versionId: string) =>
  db.documentAnalysis.findFirst({ where: { versionId }, orderBy: { analyzedAt: "desc" } });

let premiere!: Awaited<ReturnType<typeof piece>>;

try {
  console.log("\nCe qui part au service de lecture : des octets, et rien d'autre");
  {
    recusParLeService.length = 0;
    reponseDuService = reponseDeLecture({
      piece_identifiee: "passeport",
      obstacle: null,
      champs: { passeport_validite_min: "2029-03-01" },
    });
    const p = await piece({ dateCible: "2027-09-01" });
    premiere = p;

    const suite = await analyserUnePiece(p.tache, lExtracteur());
    verifier(suite === "TERMINEE", `la lecture s'achève (${suite})`);

    const corps = recusParLeService.at(-1) ?? "";
    verifier(
      corps.includes(p.octets.toString("base64")),
      "les octets du fichier sont bien ceux qui ont été transmis",
    );
    verifier(
      !corps.includes(p.cle),
      "la clé de l'objet ne part pas — ni elle, ni aucune URL signée",
    );
    verifier(!/https?:\/\/[^"]*minio|X-Amz-Signature/iu.test(corps), "aucune adresse de stockage ne part");
    /*
      L'ordre compte : l'API demande que le document précède la consigne
      qui porte dessus. Le vérifier sur ce qui est réellement sérialisé,
      et non sur l'ordre du tableau en TypeScript, parce que c'est le
      corps qui est envoyé.
    */
    verifier(
      corps.indexOf('"document"') < corps.indexOf('"text"'),
      "la pièce précède la consigne dans le corps de l'appel",
    );
    verifier(
      corps.includes("passeport_validite_min") && corps.includes("releve_bancaire"),
      "le schéma annoncé porte la condition du référentiel et la checklist du dossier",
    );
  }

  console.log("\nUne pièce lue, mesurée contre la date de départ, est conforme");
  {
    const apres = await relireDocument(premiere.document.id);
    verifier(apres.status === "CONFORME", `le passeport de 2029 passe pour un départ en 2027 (${apres.status})`);
    verifier(
      !(apres.feedback ?? "").includes("renouveler"),
      "et personne n'est envoyé renouveler un passeport qui n'a rien",
    );
    /*
      Ce sont les **faits bruts** qui sont conservés, et non la durée
      calculée : la date lue reste utile le jour où la date cible change,
      et c'est elle qu'un opérateur relit sur la pièce.
    */
    const champs = apres.extracted as Record<string, unknown> | null;
    verifier(
      champs?.passeport_validite_min === "2029-03-01",
      "la date lue est conservée telle qu'elle figure sur la pièce",
    );

    const usages = await db.aiUsage.findMany({
      where: { applicationId: premiere.application.id },
    });
    verifier(
      usages.length === 1 && usages[0]!.inputTokens === 4210 && usages[0]!.outputTokens === 96,
      "les jetons consommés sont enregistrés (INV-6)",
    );
    verifier(
      (await solde(premiere.application.id)) === 4,
      "une analyse, et une seule, a été débitée",
    );
  }

  console.log("\nUn dossier qui n'est pas ACTIF ne casse pas l'analyse");
  {
    /*
      Trouvé en exécutant cette fumée. `recalculerCompletude` posait
      `readyAt` dès que le calcul rendait « prêt », sans regarder si la
      transition avait lieu : seul un dossier ACTIF passe à PRET. Sur un
      dossier suspendu — ce qu'une divergence réglementaire produit, et
      qui n'est pas figé —, la base refusait la ligne entière, et
      l'analyse mourait après avoir écrit son verdict et débité le
      quota. La file rejouait alors sur une pièce déjà analysée.
    */
    reponseDuService = reponseDeLecture({
      piece_identifiee: "passeport",
      obstacle: null,
      champs: { passeport_validite_min: "2029-03-01" },
    });
    const p = await piece({ dateCible: "2027-09-01", statut: "SUSPENDU" });
    const suite = await analyserUnePiece(p.tache, lExtracteur());
    verifier(suite === "TERMINEE", `l'analyse aboutit sur un dossier suspendu (${suite})`);

    const dossier = await db.application.findUniqueOrThrow({ where: { id: p.application.id } });
    verifier(dossier.status === "SUSPENDU", `le dossier garde son état (${dossier.status})`);
    verifier(
      dossier.readyAt === null,
      "et ne reçoit pas une date de « prêt » que son état contredirait",
    );
    verifier((await relireDocument(p.document.id)).status === "CONFORME", "la pièce, elle, est jugée");
  }

  console.log("\nSans date de départ, la validité n'est pas jugée : elle est mise en réserve");
  {
    reponseDuService = reponseDeLecture({
      piece_identifiee: "passeport",
      obstacle: null,
      champs: { passeport_validite_min: "2029-03-01" },
    });
    const p = await piece({ dateCible: null });
    await analyserUnePiece(p.tache, lExtracteur());

    const apres = await relireDocument(p.document.id);
    verifier(apres.status === "A_CORRIGER", `la pièce n'est pas déclarée conforme (${apres.status})`);
    verifier(apres.feedback === GESTE_SANS_DATE_CIBLE, "le message demande le renseignement qui manque");
    /*
      Et surtout : le bouton ne propose pas de remplacer le fichier. Le
      geste porte sur le dossier ; envoyer redéposer une pièce qui n'a
      rien est exactement le défaut que ce lot corrige.
    */
    verifier(apres.remedy === "TELEVERSER", `le remède ne bascule pas sur « remplacer » (${apres.remedy})`);
    const champs = apres.extracted as Record<string, unknown> | null;
    verifier(
      champs?.passeport_validite_min === "2029-03-01",
      "la date lue est conservée : elle vaudra dès que le départ sera connu",
    );
  }

  console.log("\nUn obstacle signalé par le modèle part en revue, et ne coûte rien");
  {
    reponseDuService = reponseDeLecture(
      { piece_identifiee: null, obstacle: "scan_illisible", champs: { passeport_validite_min: null } },
      3100,
      40,
    );
    const p = await piece({ dateCible: "2027-09-01" });
    const suite = await analyserUnePiece(p.tache, lExtracteur());
    verifier(suite === "TERMINEE", `un obstacle de la pièce ne se rejoue pas (${suite})`);

    const apres = await relireDocument(p.document.id);
    verifier(apres.status === "ILLISIBLE", `la pièce est illisible, pas conforme (${apres.status})`);
    verifier(
      /reprends la photo/iu.test(apres.feedback ?? ""),
      "le message dit le geste : cadrage, lumière, page entière",
    );

    const analyse = await analyseDe(p.version.id);
    verifier(
      (analyse?.engineLog ?? "").includes("ne déchiffre pas"),
      `le journal porte la cause réelle et non « non branché » (${analyse?.engineLog})`,
    );
    const revue = await db.manualReview.findFirst({ where: { analysisId: analyse!.id } });
    verifier(revue?.reason === "NETTETE_INSUFFISANTE", `la revue porte le bon motif (${revue?.reason})`);

    verifier(await solde(p.application.id) === 5, "l'analyse est rendue : la lecture n'a rien rendu");
    const usages = await db.aiUsage.findMany({ where: { applicationId: p.application.id } });
    verifier(
      usages.length === 1 && usages[0]!.inputTokens === 3100,
      "les jetons sont enregistrés quand même : l'appel a bien coûté",
    );
  }

  console.log("\nUne saturation du service se rejoue, elle n'accuse pas le fichier");
  {
    reponseDuService = { statut: 429, corps: '{"type":"error","error":{"type":"rate_limit_error"}}' };
    const p = await piece({ dateCible: "2027-09-01" });

    const premiere = await analyserUnePiece(p.tache, lExtracteur());
    verifier(premiere === "A_REPRENDRE", `la première saturation se rejoue (${premiere})`);
    verifier(
      (await analyseDe(p.version.id)) === null,
      "rien n'est écrit sur la pièce : elle n'a pas été lue, elle n'est pas illisible",
    );
    verifier((await relireDocument(p.document.id)).status === "EN_ANALYSE", "elle reste en analyse");
    verifier((await relireVersion(p.version.id)).analysisAttempts === 1, "la tentative est comptée");
    verifier(await solde(p.application.id) === 5, "et le quota débité est rendu tout de suite");

    const deuxieme = await analyserUnePiece(p.tache, lExtracteur());
    verifier(deuxieme === "A_REPRENDRE", `la deuxième aussi (${deuxieme})`);
    verifier((await relireVersion(p.version.id)).analysisAttempts === 2, "deux tentatives comptées");

    const troisieme = await analyserUnePiece(p.tache, lExtracteur());
    verifier(
      troisieme === "TERMINEE",
      `au-delà de ${TENTATIVES_AVANT_REVUE} tentatives, la pièce part en revue (${troisieme})`,
    );
    const analyse = await analyseDe(p.version.id);
    const revue = await db.manualReview.findFirst({ where: { analysisId: analyse!.id } });
    verifier(revue?.reason === "ECHEC_TECHNIQUE", `la revue dit un échec technique (${revue?.reason})`);
    /*
      Une cadence dépassée et un service muet se rejouent tous les deux :
      seul le journal les distingue, et c'est lui qui dit à l'exploitant
      s'il doit demander un relèvement de quota ou aller voir le réseau.
    */
    verifier(
      (analyse?.engineLog ?? "").includes("capacité"),
      `le journal nomme la saturation, et pas une panne réseau (${analyse?.engineLog})`,
    );
    verifier(
      !/reprends|remplace/iu.test((await relireDocument(p.document.id)).feedback ?? ""),
      "et le candidat ne se voit demander aucun geste pour une panne qui n'est pas la sienne",
    );
    /*
      Le compteur est soldé dès qu'un verdict tombe. Le laisser ferait
      basculer en revue la prochaine pièce dont la première tentative
      échoue.
    */
    verifier((await relireVersion(p.version.id)).analysisAttempts === 0, "le compteur est soldé");
    verifier(await solde(p.application.id) === 5, "aucune des trois tentatives n'est facturée");
  }

  console.log("\nUne clé refusée ne se rejoue pas : elle se répare");
  {
    reponseDuService = {
      statut: 401,
      corps: '{"type":"error","error":{"type":"authentication_error"}}',
    };
    const p = await piece({ dateCible: "2027-09-01" });
    const suite = await analyserUnePiece(p.tache, lExtracteur());
    /*
      Rejouer six fois une clé refusée encombre la file et retarde
      d'autant la revue humaine, sans que rien ne change. La distinction
      tient à l'ordre du rattrapage dans l'adaptateur : les sous-types
      d'`APIError` se rangeraient sinon sous le cas le plus large, et une
      clé refusée se lirait « service injoignable » — un message qui
      envoie chercher une panne réseau là où il faut poser un secret.
    */
    verifier(suite === "TERMINEE", `elle ne se rejoue pas (${suite})`);
    const analyse = await analyseDe(p.version.id);
    verifier(
      (analyse?.engineLog ?? "").includes("clé d'extraction est refusée"),
      `le journal nomme la clé, pas le réseau (${analyse?.engineLog})`,
    );
    verifier(await solde(p.application.id) === 5, "et le candidat n'a rien payé");
  }

  console.log("\nUn fichier déposé sur la mauvaise ligne nomme la bonne");
  {
    reponseDuService = reponseDeLecture({
      piece_identifiee: "releve_bancaire",
      obstacle: null,
      champs: { passeport_validite_min: null },
    });
    const p = await piece({ dateCible: "2027-09-01" });
    await analyserUnePiece(p.tache, lExtracteur());

    const apres = await relireDocument(p.document.id);
    verifier(apres.status === "HORS_SUJET", `le fichier n'est pas la pièce attendue (${apres.status})`);
    verifier(
      (apres.feedback ?? "").includes("Relevé bancaire"),
      `le message nomme la ligne où le reclasser (${apres.feedback})`,
    );
  }

  console.log("\nCe qui ne part pas au service, et ne coûte donc rien");
  {
    recusParLeService.length = 0;
    const p = await piece({ dateCible: "2027-09-01", sansObjet: true });
    await analyserUnePiece(p.tache, lExtracteur());
    verifier(recusParLeService.length === 0, "un objet introuvable n'est pas transmis");
    const analyse = await analyseDe(p.version.id);
    verifier(
      (analyse?.engineLog ?? "").includes("introuvable"),
      `le journal dit pourquoi (${analyse?.engineLog})`,
    );
    /*
      Le détail distingue les deux chemins, et c'est ce qui prouve
      l'ordre : la taille est demandée **avant** le flux. Sans cette
      distinction, retirer la mesure préalable ne se verrait pas — le
      flux échouerait à son tour et la cause serait la même.
    */
    verifier(
      (analyse?.engineLog ?? "").includes("aucune taille"),
      "et il dit que c'est la mesure préalable qui n'a rien trouvé, pas la lecture",
    );
    verifier(
      (analyse?.inputTokens ?? 0) === 0,
      "aucun jeton n'est compté pour un appel qui n'a pas eu lieu",
    );
    verifier(await solde(p.application.id) === 5, "et l'analyse est rendue");
  }

  console.log("\nUne pièce trop lourde est refusée sans être transférée");
  {
    recusParLeService.length = 0;
    const p = await piece({ dateCible: "2027-09-01" });
    tailleAnnoncee = 64 * 1024 * 1024;
    try {
      await analyserUnePiece(p.tache, lExtracteur());
    } finally {
      tailleAnnoncee = null;
    }
    verifier(recusParLeService.length === 0, "rien ne part au service");
    const analyse = await analyseDe(p.version.id);
    verifier(
      (analyse?.engineLog ?? "").includes("limite de transmission"),
      `le journal dit la limite (${analyse?.engineLog})`,
    );
    verifier(await solde(p.application.id) === 5, "et l'analyse est rendue");
  }

  console.log("\nSans clé, rien n'est simulé : la pièce part en revue");
  {
    recusParLeService.length = 0;
    const sansCle = lExtracteur({});
    verifier(sansCle === EXTRACTEUR_NON_BRANCHE, "le résolveur ne rend aucun adaptateur");

    const p = await piece({ dateCible: "2027-09-01" });
    await analyserUnePiece(p.tache, sansCle);
    verifier(recusParLeService.length === 0, "aucun appel n'est parti");

    const apres = await relireDocument(p.document.id);
    verifier(apres.status === "ILLISIBLE", `la pièce n'est pas déclarée conforme (${apres.status})`);
    const analyse = await analyseDe(p.version.id);
    /*
      Le motif est celui que tout appel partage ; le détail, lui, nomme la
      variable à renseigner. C'est le détail qui rend la ligne
      actionnable : « aucune clé » envoie chercher, `ANTHROPIC_API_KEY`
      dit où.
    */
    verifier(
      (analyse?.engineLog ?? "").includes("ANTHROPIC_API_KEY"),
      `le journal nomme la variable à renseigner (${analyse?.engineLog})`,
    );
    verifier(await solde(p.application.id) === 5, "et le candidat n'a rien payé");
  }
} finally {
  await db.$disconnect().catch(() => undefined);
  service.close();
  stockage.close();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa chaîne d'extraction tient.");
