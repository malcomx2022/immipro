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
const { trancherLaRevue } = await import("../src/server/revue/decision");
const { TITRE_DE_LA_DECISION } = await import("../src/domain/backoffice/revue");
const { enregistrerLAutorisation, etatDeLAutorisation } = await import(
  "../src/server/acces/consentements"
);

let rang = 0;

const CONDITION_PASSEPORT = {
  code: "passeport_validite_min",
  // La pièce qui établit la condition se déclare (22/09/2026). Elle se
  // devinait par préfixe de code, et cette fixture-ci passait par chance :
  // « passeport_validite_min » commence par « passeport ». Une fixture qui
  // tient par chance n'éprouve pas la relation, elle la contourne.
  piece: "passeport",
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
    sansAutorisation?: boolean;
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

  /*
    L'autorisation d'analyse est accordée, comme elle l'est forcément en
    production : RG-02.2 refuse le dépôt sans elle. La fixture ne la posait
    pas, et le jour où l'analyse a commencé à la relire, cette fumée l'a dit
    — rien ne partait plus au service, faute d'un accord que personne
    n'avait donné.
  */
  await enregistrerLAutorisation(user.id, "pieces_identite", !options.sansAutorisation);

  return {
    tache: { applicationId: application.id, documentId: document.id, versionId: version.id },
    cle,
    octets,
    user,
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

  console.log("\nRG-02.1 — l'autorisation retirée arrête la lecture, pas seulement les dépôts");
  {
    /*
      Le cas est banal et il ne se voit qu'ici : le candidat autorise,
      dépose, puis se ravise pendant que le job attend dans la file. Le
      retrait n'arrêtait rien — le fichier partait au service, une analyse
      était débitée, un verdict s'écrivait sur la pièce.

      Ce que la fumée tient, et qu'aucun essai pur ne peut tenir : **rien
      n'est parti**. Le service d'essai compte ce qu'il reçoit.
    */
    recusParLeService.length = 0;
    const p = await piece({ dateCible: "2027-09-01", sansAutorisation: true });

    const avant = await solde(p.application.id);
    const suite = await analyserUnePiece(p.tache, lExtracteur());
    verifier(suite === "TERMINEE", `le job s'achève sans reprise (${suite})`);
    verifier(
      recusParLeService.length === 0,
      `aucun octet ne part au service de lecture (${recusParLeService.length} appel(s))`,
    );
    verifier(
      (await solde(p.application.id)) === avant,
      "aucune analyse n'est débitée : le candidat ne paie pas son propre retrait",
    );
    verifier(
      (await db.aiUsage.count({ where: { applicationId: p.application.id } })) === 0,
      "et aucun jeton n'est enregistré",
    );

    const apres = await relireDocument(p.document.id);
    verifier(
      apres.status === "ATTENDUE" && apres.remedy === "REMPLACER",
      `la pièce est conservée, non vérifiée (${apres.status} / ${apres.remedy})`,
    );
    verifier(
      (apres.feedback ?? "").includes("autorisation"),
      `et l'écran dit pourquoi (${(apres.feedback ?? "").slice(0, 50)}…)`,
    );
    verifier(
      !(apres.feedback ?? "").includes("recharger"),
      "sans l'envoyer recharger des analyses, qui ne répareraient rien",
    );

    // Il redonne son accord : la reprise du job analyse pour de bon.
    await enregistrerLAutorisation(p.user.id, "pieces_identite", true);
    const reprise = await analyserUnePiece(p.tache, lExtracteur());
    verifier(reprise === "TERMINEE", `la reprise aboutit (${reprise})`);
    verifier(
      recusParLeService.length === 1,
      `et le service reçoit enfin la pièce (${recusParLeService.length})`,
    );
    verifier(
      (await solde(p.application.id)) === avant - 1,
      "une analyse est débitée cette fois",
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
    /*
      Et le candidat l'apprend. Ce verdict-là n'en disait rien, alors que
      les trois autres produisent un avis chacun : c'est pourtant celui
      qui ouvre la seule attente qui dépend d'une personne.
    */
    const avis = await db.notification.findMany({ where: { applicationId: p.application.id } });
    verifier(
      avis.length === 1 && avis[0]!.kind === "ANALYSE",
      `un avis part quand la pièce entre en revue (${avis.length})`,
    );
    verifier(
      avis[0]?.body === (await relireDocument(p.document.id)).feedback,
      "et il porte le texte que la checklist affiche, pas un second",
    );
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

  console.log("\nRG-02.1 — « jamais donnée » et « retirée » ne se confondent pas");
  {
    /*
      La distinction ne se voit que sur le registre : elle tient à
      l'existence d'une ligne, pas à sa valeur. Un essai pur ne peut donc
      pas la tenir, et son absence n'avait rien cassé — elle avait fait
      dire à T-06, pour tout compte neuf, « tu as coupé les offres de
      partenaire ».
    */
    const p = await piece({ dateCible: "2027-09-01", sansAutorisation: true });

    verifier(
      (await etatDeLAutorisation(p.user.id, "partenaires")) === "jamais_donnee",
      "un compte neuf n'a rien retiré : l'autorisation n'a jamais été donnée",
    );

    await enregistrerLAutorisation(p.user.id, "partenaires", true);
    verifier(
      (await etatDeLAutorisation(p.user.id, "partenaires")) === "accordee",
      "accordée après l'accord",
    );

    await enregistrerLAutorisation(p.user.id, "partenaires", false);
    verifier(
      (await etatDeLAutorisation(p.user.id, "partenaires")) === "retiree",
      "retirée après le retrait, et non ramenée à « jamais donnée »",
    );

    // Un genre ne répond pas pour un autre : le registre est interrogé par
    // genre, et deux autorisations distinctes ont deux histoires distinctes.
    verifier(
      (await etatDeLAutorisation(p.user.id, "mesure_audience")) === "jamais_donnee",
      "et l'histoire d'un genre ne déteint pas sur les autres",
    );
  }

  /*
    B-05 — le message de la revue est envoyé, et pas seulement écrit.

    `CLAUDE.md` compte « B-05 pour le message **envoyé** après une revue
    manuelle » parmi les quatre points d'application du vocabulaire
    interdit, et `refusDuMessage` s'intitule « validation du message
    envoyé au candidat ». Il était validé, rangé dans `ManualReview` et
    recopié sur la pièce — et aucun avis n'en partait. La décision vit
    désormais hors de `next/headers`, et cette fumée compte ce qui est
    réellement écrit.
  */
  console.log("\nLa décision d'une revue manuelle parvient au candidat");
  {
    reponseDuService = { statut: 401, corps: '{"type":"error","error":{"type":"authentication_error"}}' };
    const p = await piece({ dateCible: "2027-09-01" });
    await analyserUnePiece(p.tache, lExtracteur());

    const analyse = await analyseDe(p.version.id);
    const revue = await db.manualReview.findFirstOrThrow({ where: { analysisId: analyse!.id } });
    const avant = await db.notification.count({ where: { applicationId: p.application.id } });

    const operateur = await db.user.create({
      data: { email: `fumee-op-${process.pid}@exemple.test`, role: "ADMIN" },
    });
    const MESSAGE =
      "Ton passeport est lisible, mais la page des informations est coupée en bas. Reprends la photo en cadrant la page entière, jusqu'aux bords.";

    const suite = await trancherLaRevue(
      revue.id,
      { id: operateur.id },
      { decision: "A_CORRIGER", message: MESSAGE, motif: "Relecture de la pièce en échec technique" },
    );
    verifier(suite.decidee, "la décision est prise");
    verifier(suite.quotaRendu === false, "une pièce à corriger ne rend pas l'analyse");

    const avis = await db.notification.findMany({
      where: { applicationId: p.application.id },
      orderBy: { createdAt: "desc" },
    });
    verifier(
      avis.length === avant + 1,
      `un avis part avec la décision (${avant} avant, ${avis.length} après)`,
    );
    verifier(
      avis[0]?.body === MESSAGE,
      "et il porte le message de l'opérateur, tel qu'il l'a écrit",
    );
    verifier(
      avis[0]?.title === TITRE_DE_LA_DECISION.A_CORRIGER,
      `le titre dit qu'une personne a relu (${avis[0]?.title})`,
    );
    verifier(
      avis[0]?.userId === p.user.id,
      "le destinataire est le candidat, pas l'opérateur qui tranche",
    );
    verifier(
      (await relireDocument(p.document.id)).feedback === MESSAGE,
      "et la checklist porte le même texte que l'avis",
    );

    /* Une décision rejouée est refusée : elle n'envoie pas un second avis. */
    let rejouee = "acceptée";
    try {
      await trancherLaRevue(
        revue.id,
        { id: operateur.id },
        { decision: "CONFORME", message: MESSAGE, motif: "Seconde tentative" },
      );
    } catch {
      rejouee = "refusée";
    }
    verifier(rejouee === "refusée", `une décision déjà prise est ${rejouee}`);
    verifier(
      (await db.notification.count({ where: { applicationId: p.application.id } })) === avis.length,
      "et aucun second avis n'est parti",
    );

    /* Le message refusé ne part pas davantage : rien n'est écrit du tout. */
    const autre = await piece({ dateCible: "2027-09-01" });
    await analyserUnePiece(autre.tache, lExtracteur());
    const analyse2 = await analyseDe(autre.version.id);
    const revue2 = await db.manualReview.findFirstOrThrow({ where: { analysisId: analyse2!.id } });
    const avisAvant = await db.notification.count({ where: { applicationId: autre.application.id } });
    let refuse = "acceptée";
    try {
      await trancherLaRevue(
        revue2.id,
        { id: operateur.id },
        { decision: "A_CORRIGER", message: "Non conforme.", motif: "Relecture" },
      );
    } catch {
      refuse = "refusée";
    }
    verifier(refuse === "refusée", `un constat nu est ${refuse} (RG-06.3)`);
    verifier(
      (await db.notification.count({ where: { applicationId: autre.application.id } })) === avisAvant,
      "et rien n'est envoyé d'un message qui n'a pas passé le contrôle",
    );
    verifier(
      (await db.manualReview.findUniqueOrThrow({ where: { id: revue2.id } })).decidedAt === null,
      "la revue reste ouverte",
    );
  }

  /*
    C-08 — ce que la règle demande de la pièce.

    La lecture de l'écran d'analyse appariait le code d'une condition et
    celui d'une pièce par préfixe : la troisième devinette du genre, que
    le correctif du 22/09/2026 n'avait pas vue. Sur le contrat de travail
    kennismigrant — cinq conditions rattachées, dont quatre en alternative
    — elle n'en trouvait aucune, et l'écran affichait « Exigence : non
    lue », c'est-à-dire que la pièce du candidat était illisible sur un
    point où rien n'avait été cherché.

    Une fumée, et pas seulement un essai du domaine : la règle réelle doit
    traverser Prisma, `payload` et la lecture pour que la relation soit
    éprouvée là où elle sert. Une fixture écrite à la main aurait pu tenir
    par coïncidence de graphie, comme celle de ce fichier le fait pour le
    passeport.
  */
  console.log("\nC-08 — l'exigence vient du référentiel, elle ne se devine pas");
  {
    const { analyseDeLaPiece } = await import("../src/server/lecture/dossiers");
    const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");
    const kennismigrant = REGLES_DE_REFERENCE.find(
      (r) => r.visaType === "emploi_kennismigrant",
    )!;

    rang += 1;
    const user = await db.user.create({
      data: { email: `fumee-exig-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const regle = await db.visaRule.create({
      data: {
        countryCode: kennismigrant.countryCode,
        visaType: kennismigrant.visaType,
        category: "EMPLOI",
        version: 900 + rang,
        effectiveFrom: new Date("2026-01-01"),
        rules: kennismigrant.rules as object,
        sourceUrl: "https://ind.nl/regle",
        sourceTier: "OFFICIEL",
        verifiedAt: new Date("2026-08-01"),
        verifiedBy: "fumée",
        nextReviewAt: new Date("2027-01-01"),
        status: "PUBLISHED",
      },
    });
    const application = await db.application.create({
      data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
    });

    /** Une pièce analysée, telle que l'écran la relit. */
    async function pieceAnalysee(code: string, libelle: string) {
      const document = await db.document.create({
        data: {
          applicationId: application.id,
          code,
          label: libelle,
          status: "A_CORRIGER",
          required: true,
          remedy: "TELEVERSER",
        },
      });
      const version = await db.documentVersion.create({
        data: {
          documentId: document.id,
          rank: 1,
          objectKey: `dossiers/${application.id}/${code}.pdf`,
          scanState: "SAINE",
          scannedAt: new Date(),
        },
      });
      await db.documentAnalysis.create({
        data: {
          versionId: version.id,
          verdict: "A_CORRIGER",
          fields: { salaire_min_moins_30_ans: 4400 },
          title: "Le salaire lu ne correspond pas au seuil",
          body: "Le contrat indique 4 400 € bruts par mois. Vérifie le seuil qui te concerne.",
        },
      });
      return document.id;
    }

    const contrat = await pieceAnalysee("contrat_travail", "Contrat de travail");
    const lue = await analyseDeLaPiece(contrat, application.id, user.id);
    const exigences = lue.analyse?.exigences ?? [];
    const toutes = exigences.flatMap((b) => b.exigences);
    verifier(
      toutes.length === 5,
      `les cinq conditions du contrat de travail sont rendues (${toutes.length})`,
    );
    verifier(
      exigences.filter((b) => b.auChoix).length === 1,
      "dont un seul groupe d'alternatives, resté groupé",
    );
    verifier(
      toutes.some((e) => e.intitule.includes("employeur reconnu")),
      "la condition sans seuil chiffré est là aussi",
    );
    // INV-8 : une exigence citée porte sa source et sa date de vérification.
    verifier(
      lue.analyse?.mention?.source === "ind.nl" &&
        lue.analyse.mention.verifieeLe === "2026-08-01",
      `la source et sa date accompagnent l'exigence (${JSON.stringify(lue.analyse?.mention)})`,
    );

    // Et une pièce qu'aucune condition ne vise ne rend pas une exigence nulle.
    const passeport = await pieceAnalysee("passeport", "Passeport");
    const sans = await analyseDeLaPiece(passeport, application.id, user.id);
    verifier(
      (sans.analyse?.exigences ?? []).length === 0,
      `le passeport de cette procédure ne porte aucun seuil (${(sans.analyse?.exigences ?? []).length})`,
    );
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
