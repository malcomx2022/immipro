/**
 * La chaîne d'une pièce rédigée — WF-08 étapes 3 et 4, branchées le
 * 22/09/2026.
 *
 *     entretien → mise en forme → version → relecture → remarques
 *
 * Ce que le domaine juge seul s'éprouve dans
 * `tests/redaction-commande.test.ts`. Ce qui demande **en plus** une base
 * et un vrai client HTTP s'éprouve ici, et d'abord le défaut qui a motivé
 * le lot :
 *
 * - qu'une version non relue ne se lise jamais « rien à reprendre », y
 *   compris quand la clé est posée — ce qui est désormais le cas de toute
 *   installation qui veut la lecture des pièces ;
 * - qu'une relecture qui n'aboutit pas ne date rien, ne débite rien, et
 *   ne laisse aucune remarque orpheline ;
 * - qu'une relecture réelle sans remarque, elle, se lise bien comme un
 *   résultat ;
 * - que les jetons consommés soient écrits même quand rien n'est rendu
 *   (INV-6).
 *
 * Un serveur d'essai sur la boucle locale, devant lequel le **vrai SDK
 * Anthropic** parle pour de bon — `ANTHROPIC_BASE_URL` suffit à l'y
 * amener. Rien ne sort de la machine, aucun jeton n'est facturé.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:redaction
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

const nomBase = `immipro_redaction_${process.pid}`;
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
 * Le service d'essai.
 * ------------------------------------------------------------------ */

type ReponseDuService = { statut: number; corps: string };

const messageDe = (texte: string, entree = 3200, sortie = 780): ReponseDuService => ({
  statut: 200,
  corps: JSON.stringify({
    id: "msg_essai",
    type: "message",
    role: "assistant",
    model: "modele-d-essai",
    content: [{ type: "text", text: texte }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: entree, output_tokens: sortie },
  }),
});

let reponseDuService: ReponseDuService = messageDe("");
const recusParLeService: string[] = [];

const service = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
  const morceaux: Buffer[] = [];
  requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
  requete.on("end", () => {
    const corps = Buffer.concat(morceaux).toString("utf8");
    recusParLeService.push(corps);
    /*
      La mise en forme est diffusée : le SDK envoie `stream: true` et
      attend des événements, pas un corps JSON. Le service d'essai rend
      donc l'un ou l'autre selon ce qui lui est demandé — c'est ce qui
      permet d'éprouver les deux chemins réels plutôt qu'un seul.
    */
    if (reponseDuService.statut === 200 && corps.includes('"stream":true')) {
      const message = JSON.parse(reponseDuService.corps) as {
        content: { text: string }[];
        usage: { input_tokens: number; output_tokens: number };
        stop_reason: string;
      };
      const texte = message.content[0]?.text ?? "";
      const debut = { ...message, content: [], usage: { ...message.usage, output_tokens: 0 } };
      reponse.writeHead(200, { "Content-Type": "text/event-stream" });
      const evenement = (type: string, charge: unknown) =>
        reponse.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...(charge as object) })}\n\n`);
      evenement("message_start", { message: debut });
      evenement("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      evenement("content_block_delta", { index: 0, delta: { type: "text_delta", text: texte } });
      evenement("content_block_stop", { index: 0 });
      evenement("message_delta", {
        delta: { stop_reason: message.stop_reason, stop_sequence: null },
        usage: { output_tokens: message.usage.output_tokens },
      });
      evenement("message_stop", {});
      return reponse.end();
    }
    reponse.writeHead(reponseDuService.statut, { "Content-Type": "application/json" });
    reponse.end(reponseDuService.corps);
  });
});
await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
const portService = (service.address() as AddressInfo).port;

console.log(`Chaîne de rédaction sur une base jetable (${nomBase}), service :${portService}`);
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

/* La clé que toute installation branchée sur la lecture des pièces porte. */
process.env.ANTHROPIC_API_KEY = "cle-d-essai";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${portService}`;

const { db } = await import("../src/lib/db");
const { leRedacteur, laCritique } = await import("../src/server/redaction/service");
const { redactionConfiguree } = await import("../src/server/redaction/redacteur");
const { faitsDuDossier, piecesARediger, vueDeLaRelecture } = await import(
  "../src/server/lecture/redaction"
);
const { instructionsDeRedaction } = await import("../src/domain/redaction/commande");
const { etatDeLaRelecture, resumeSelonLEtat } = await import("../src/domain/redaction/relecture");
const { solde } = await import("../src/server/acces/quota");
const { noterLesJetons } = await import("../src/server/redaction/usage");
const { mettreEnForme } = await import("../src/server/redaction/mise-en-forme");

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
  conditions: [],
  pieces_requises: [],
  reserves: [],
};

const MATIERE = {
  // La pièce et la destination sont **nommées** : la matière portait le
  // segment de route et le code ISO, que les instructions recopiaient au
  // modèle — « une pièce : lettre-motivation, pour une demande vers NL ».
  piece: "Lettre de motivation",
  objet: "Motiver la candidature auprès de l'établissement",
  pays: "les Pays-Bas",
  reponses: { 0: "J'ai terminé une licence d'informatique à Cotonou en 2025." },
  questions: [{ rang: 0, section: "PARCOURS", intitule: "Quel est ton parcours ?" }],
};

const LETTRE = [
  "Madame, Monsieur,",
  "",
  "J'ai terminé une licence d'informatique à Cotonou en 2025, et je souhaite poursuivre ma formation dans votre établissement. Mon parcours m'a conduit à travailler sur des projets de développement logiciel que je souhaite approfondir.",
  "",
  "Je vous remercie de l'attention portée à ma candidature.",
].join("\n");

let rang = 0;

/** Un candidat, son dossier, une pièce rédigée et une version enregistrée. */
async function piece(options: { avecTexte?: boolean } = {}) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-r-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL",
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
    data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
  });
  const document = await db.document.create({
    data: {
      applicationId: application.id,
      code: "lettre_motivation",
      label: "Lettre de motivation",
      status: "ATTENDUE",
      required: true,
    },
  });
  const version =
    options.avecTexte === false
      ? null
      : await db.documentVersion.create({
          data: {
            documentId: document.id,
            rank: 1,
            body: LETTRE,
            wordCount: 48,
            changeNote: "Réécriture par toi",
          },
        });
  await db.analysisCredit.create({
    data: { applicationId: application.id, delta: 5, reason: "ACHAT_PACK" },
  });
  return { user, application, document, version };
}

/**
 * Ce que l'écran R-04 conclut — par **la fonction que la page appelle**,
 * et non par une recopie de sa décision.
 *
 * La première version de cette fumée recopiait la garde. Une mutation
 * l'a prise en défaut : remettre dans la page la condition fautive —
 * décider sur la présence de la clé plutôt que sur la version — laissait
 * la fumée entièrement verte. La décision a donc été sortie de la page
 * (`vueDeLaRelecture`), et c'est elle qu'on appelle ici.
 */
async function ceQueLEcranDit(dossier: { id: string; userId: string }, documentId: string) {
  const faits = await faitsDuDossier(dossier.id, dossier.userId);
  // La fumée éprouve le parcours d'un dossier couvert : la garde des
  // droits est éprouvée à part, dans `fumee-redaction` plus bas.
  const vue = await vueDeLaRelecture(documentId, faits, redactionConfiguree(), true);
  const etat = etatDeLaRelecture({
    remarques: vue.remarques,
    texteExistant: vue.texteExistant,
    recoupementsEffectues: vue.recoupements.effectues.length > 0,
    analysePossible: vue.analysePossible,
    redactionAssistee: vue.redactionAssistee,
  });
  return { etat, resume: resumeSelonLEtat(etat, vue.remarques), remarques: vue.remarques };
}

const relireVersion = (id: string) => db.documentVersion.findUniqueOrThrow({ where: { id } });

try {
  console.log("\nLe défaut : une version jamais relue, devant une clé posée");
  {
    const p = await piece();
    verifier(redactionConfiguree(), "la clé est posée, comme sur toute installation qui lit les pièces");
    verifier(
      (await db.critiqueFinding.count({ where: { versionId: p.version!.id } })) === 0,
      "aucune remarque n'existe : rien n'a jamais analysé ce texte",
    );

    const vu = await ceQueLEcranDit(
      { id: p.application.id, userId: p.user.id },
      p.document.id,
    );
    verifier(vu.etat === "A_ANALYSER", `l'écran ne conclut pas (${vu.etat})`);
    verifier(
      !vu.resume.includes("Rien à reprendre"),
      `et ne dit plus « rien à reprendre » sur un texte non lu (${vu.resume.slice(0, 60)}…)`,
    );
    // RG-08.4 : le geste coûte, et il l'annonce avant le clic.
    verifier(vu.resume.includes("quota"), "il annonce ce que l'analyse coûtera");
  }

  console.log("\nUne mise en forme réelle part des réponses, et rien d'autre");
  {
    recusParLeService.length = 0;
    reponseDuService = messageDe(LETTRE, 3200, 780);
    const produit = await leRedacteur()(MATIERE);
    verifier(produit.etat === "ECRITE", `un texte est rendu (${produit.etat})`);

    const corps = recusParLeService.at(-1) ?? "";
    verifier(corps.includes('"stream":true'), "la mise en forme est diffusée, pas attendue en bloc");
    verifier(
      corps.includes("licence d'informatique à Cotonou"),
      "la réponse du candidat est bien ce qui part",
    );
    verifier(
      corps.includes("N'ajoute aucun fait"),
      "et la consigne interdit d'en ajouter un autre",
    );
    verifier(corps.includes("Ne promets aucun résultat"), "et INV-2 y figure en toutes lettres");
    verifier(
      produit.etat === "ECRITE" && produit.jetonsEntree === 3200 && produit.jetonsSortie === 780,
      "les jetons sont mesurés, pas supposés",
    );
  }

  console.log("\nUn texte qui promet ne devient pas une version (revue M7)");
  {
    const p = await piece({ avecTexte: false });
    const avant = await solde(p.application.id);
    const PIECE = {
      type: "lettre-motivation",
      libelle: MATIERE.piece,
      objet: MATIERE.objet,
      pays: MATIERE.pays,
      questions: [{ section: "PARCOURS", intitule: "Quel est ton parcours ?" }],
    } as never;
    const versions = () => db.documentVersion.count({ where: { documentId: p.document.id } });

    reponseDuService = messageDe(`${LETTRE}\n\nAvec ce parcours, mon visa est garanti.`, 3000, 700);
    const ecartee = await mettreEnForme(p.application.id, p.user.id, PIECE, MATIERE.reponses);
    verifier(
      !ecartee.produite && ecartee.motif === "formulation_refusee",
      `le texte est écarté, et le motif nommé (${JSON.stringify(ecartee)})`,
    );
    verifier((await solde(p.application.id)) === avant, "l'analyse est rendue : rien n'est décompté");
    verifier((await versions()) === 0, "aucune version n'est créée");
    const jetons = await db.aiUsage.count({ where: { applicationId: p.application.id } });
    verifier(jetons === 1, "les jetons consommés restent écrits (INV-6)");

    reponseDuService = messageDe(`${LETTRE}\n\nImmiPro ne garantit pas l'obtention du visa, et je le sais.`, 3000, 700);
    const gardee = await mettreEnForme(p.application.id, p.user.id, PIECE, MATIERE.reponses);
    verifier(gardee.produite, "une négation passe : elle ne promet rien");
    verifier((await solde(p.application.id)) === avant - 1, "et cette mise en forme-là est décomptée");
  }

  console.log("\nUn texte tronqué n'est pas une version");
  {
    const tronque = JSON.parse(messageDe("Madame, Monsieur,").corps) as Record<string, unknown>;
    tronque.stop_reason = "max_tokens";
    reponseDuService = { statut: 200, corps: JSON.stringify(tronque) };
    const produit = await leRedacteur()(MATIERE);
    verifier(produit.etat === "SANS_TEXTE", `rien n'est rendu (${produit.etat})`);
    verifier(
      produit.etat === "SANS_TEXTE" && produit.cause === "reponse_illisible",
      "et la cause est nommée",
    );
    /*
      Les jetons ont bien été consommés : INV-6 veut qu'ils soient
      écrits quand même. C'est la route qui le fait, avec cette valeur.
    */
    verifier(produit.jetonsSortie > 0, "les jetons consommés restent comptés");
  }

  console.log("\nUne relecture réelle date la version et écrit ses remarques");
  {
    const p = await piece();
    reponseDuService = messageDe(
      JSON.stringify({
        remarques: [
          {
            genre: "A_RENFORCER",
            titre: "Le projet de retour n'est pas dit",
            corps: "Tu n'indiques pas ce que tu comptes faire après tes études. Ajoute une phrase sur ton projet au retour.",
            ecarts: null,
          },
        ],
      }),
      2100,
      160,
    );
    const avis = await laCritique()(LETTRE, MATIERE);
    verifier(avis.etat === "RELUE", `l'avis est rendu (${avis.etat})`);
    verifier(avis.etat === "RELUE" && avis.remarques.length === 1, "une remarque est relue");

    // Ce que la route écrit, dans la même transaction.
    if (avis.etat === "RELUE") {
      await noterLesJetons(p.user.id, p.application.id, "relecture:lettre-motivation", avis.jetonsEntree, avis.jetonsSortie);
      await db.$transaction([
        ...avis.remarques.map((r) =>
          db.critiqueFinding.create({
            data: { versionId: p.version!.id, kind: r.genre, title: r.titre, body: r.corps },
          }),
        ),
        db.documentVersion.update({
          where: { id: p.version!.id },
          data: { critiquedAt: new Date() },
        }),
      ]);
    }

    const vu = await ceQueLEcranDit(
      { id: p.application.id, userId: p.user.id },
      p.document.id,
    );
    verifier(vu.etat === "RELUE", `l'écran rend enfin un avis réel (${vu.etat})`);
    verifier(vu.resume.includes("1 point à traiter"), `et le compte (${vu.resume.slice(0, 50)}…)`);

    const usages = await db.aiUsage.findMany({ where: { applicationId: p.application.id } });
    verifier(
      usages.length === 1 && usages[0]!.inputTokens === 2100,
      "les jetons de la relecture sont enregistrés (INV-6)",
    );
  }

  console.log("\nUne relecture qui ne trouve rien est un résultat, et le dit");
  {
    const p = await piece();
    reponseDuService = messageDe(JSON.stringify({ remarques: [] }), 2000, 40);
    const avis = await laCritique()(LETTRE, MATIERE);
    verifier(
      avis.etat === "RELUE" && avis.remarques.length === 0,
      `une liste vide est rendue telle quelle (${avis.etat})`,
    );
    await db.documentVersion.update({
      where: { id: p.version!.id },
      data: { critiquedAt: new Date() },
    });
    const vu = await ceQueLEcranDit(
      { id: p.application.id, userId: p.user.id },
      p.document.id,
    );
    verifier(vu.etat === "RELUE_SANS_REMARQUE", `l'état est bien « relu, rien à reprendre » (${vu.etat})`);
    verifier(
      vu.resume.includes("Rien à reprendre"),
      "et la phrase rassurante est enfin méritée",
    );
  }

  console.log("\nUne relecture qui n'aboutit pas ne date rien");
  {
    const p = await piece();
    reponseDuService = { statut: 429, corps: '{"type":"error","error":{"type":"rate_limit_error"}}' };
    const avis = await laCritique()(LETTRE, MATIERE);
    verifier(avis.etat === "SANS_AVIS", `aucun avis n'est rendu (${avis.etat})`);
    verifier(avis.etat === "SANS_AVIS" && avis.cause === "service_sature", "la saturation est nommée");

    const apres = await relireVersion(p.version!.id);
    verifier(apres.critiquedAt === null, "la version reste non relue");
    const vu = await ceQueLEcranDit(
      { id: p.application.id, userId: p.user.id },
      p.document.id,
    );
    verifier(
      vu.etat === "A_ANALYSER" && !vu.resume.includes("Rien à reprendre"),
      `et l'écran ne conclut toujours pas (${vu.etat})`,
    );
    verifier(await solde(p.application.id) === 5, "rien n'est débité tant que rien n'a été rendu");
  }

  console.log("\nUne réponse que le service n'a pas formée ne devient pas un avis vide");
  {
    reponseDuService = messageDe(JSON.stringify({ autre_chose: true }), 2000, 30);
    const avis = await laCritique()(LETTRE, MATIERE);
    /*
      C'est le défaut pris par son autre bout : une charge illisible qui
      retomberait sur `remarques: []` se lirait « relu, rien à
      reprendre » — l'avis rassurant, rendu sur une réponse que nous
      n'avons pas su lire.
    */
    verifier(avis.etat === "SANS_AVIS", `elle n'est pas prise pour une liste vide (${avis.etat})`);
    verifier(
      avis.etat === "SANS_AVIS" && avis.cause === "reponse_illisible",
      "et la cause le dit",
    );
  }

  console.log("\nLa base refuse une relecture sur une pièce qui n'a pas de texte");
  console.log("  (l'erreur Prisma qui suit est la garde qui se déclenche — c'est l'attendu)");
  {
    const p = await piece({ avecTexte: false });
    const televersee = await db.documentVersion.create({
      data: {
        documentId: p.document.id,
        rank: 1,
        objectKey: `dossiers/${p.application.id}/scan.pdf`,
        checksum: `somme-r-${rang}`,
        mimeType: "application/pdf",
        sizeBytes: 12,
      },
    });
    const refusee = await db.documentVersion
      .update({ where: { id: televersee.id }, data: { critiquedAt: new Date() } })
      .then(() => false)
      .catch(() => true);
    verifier(refusee, "dater une relecture sur un fichier scanné est refusé par la base");
  }

  console.log("\nSans clé, rien n'est simulé");
  {
    recusParLeService.length = 0;
    const sansCle = leRedacteur({});
    const produit = await sansCle(MATIERE);
    verifier(produit.etat === "SANS_TEXTE", `aucun texte n'est fabriqué (${produit.etat})`);
    const avis = await laCritique({})(LETTRE, MATIERE);
    verifier(avis.etat === "SANS_AVIS", `aucun avis n'est fabriqué (${avis.etat})`);
    verifier(recusParLeService.length === 0, "et aucun appel n'est parti");
  }

  // ── WF-08 : ce qu'on donne au modèle est nommé, jamais codé ────────
  /*
    `piecesARediger` posait `pays: visaRule.countryCode`, et les deux
    instructions recopiaient le code tel quel :

        Destination du dossier : NL. Les attendus d'une administration à
        l'autre diffèrent — écris pour celle-là.

    Ce que cette ligne existe pour dire tient au nom, et le nom était dans
    `domain/redaction/coherence`, à quelques lignes de l'appel. Une fumée,
    parce que le défaut est dans la **lecture** : les essais de la commande
    partent d'une matière écrite à la main, et restaient verts.
  */
  console.log("\nWF-08 — la destination donnée au modèle est nommée, pas codée");
  {
    const { application, user, document } = await piece({ avecTexte: false });
    // `piecesARediger` ne retient que les pièces dont le remède est
    // « rédiger » : c'est ce qui distingue une lettre d'un téléversement.
    await db.document.update({ where: { id: document.id }, data: { remedy: "REDIGER" } });

    const pieces = await piecesARediger(application.id, user.id);
    const lettre = pieces[0];
    verifier(pieces.length === 1, `la pièce à rédiger est lue (${pieces.length})`);
    verifier(
      lettre?.pays === "les Pays-Bas",
      `la destination est nommée (${String(lettre?.pays)})`,
    );

    // Et le prompt qui en découle ne porte ni le code, ni le segment de route.
    const consigne = instructionsDeRedaction({
      piece: lettre!.libelle,
      objet: lettre!.objet,
      pays: lettre!.pays!,
      reponses: {},
      questions: [],
    });
    verifier(
      consigne.includes("Destination du dossier : les Pays-Bas."),
      "et l'instruction la nomme",
    );
    verifier(
      !/(?<!\p{L})NL(?!\p{L})/u.test(consigne) && !consigne.includes("lettre-motivation"),
      "sans code ISO ni segment de route",
    );
  }

  console.log("\nArbitrage S.80 — la rédaction assistée se lit sur la couverture du dossier");
  {
    const { appliquerLaCouverture } = await import("../src/server/acces/couverture");
    const { redactionAssisteeDuDossier, exigerRedactionAssistee } = await import(
      "../src/server/acces/droits"
    );
    rang += 1;
    const candidat = await db.user.create({
      data: { email: `fumee-droits-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const regle = (await db.visaRule.findFirst({ where: { status: "PUBLISHED" } }))!;
    const ouvrir = () =>
      db.application.create({
        data: { userId: candidat.id, visaRuleId: regle.id, status: "ACTIF" },
      });
    let n = 0;
    const payer = async (packCode: string, applicationId: string) => {
      n += 1;
      return db.transaction.create({
        data: {
          reference: `IMP-DROITS-${n}-${process.pid}`,
          userId: candidat.id,
          applicationId,
          packCode,
          amountMajor: 29,
          currency: "EUR",
          provider: "STRIPE",
          providerTxId: `stripe:droits_${n}_${process.pid}`,
          status: "CONFIRMEE",
          confirmedAt: new Date(),
        },
      });
    };

    const essentiel = await ouvrir();
    const tx = await payer("essentiel", essentiel.id);
    await appliquerLaCouverture(candidat.id, { applicationId: essentiel.id, transactionId: tx.id });
    verifier(!(await redactionAssisteeDuDossier(essentiel.id)), "un dossier Essentiel n'ouvre pas l'assistance");

    // Une recharge n'est pas une couverture.
    const recharge = await payer("recharge-10", essentiel.id);
    await db.analysisCredit.create({
      data: { applicationId: essentiel.id, delta: 10, reason: "RECHARGE", transactionId: recharge.id },
    });
    verifier(!(await redactionAssisteeDuDossier(essentiel.id)), "une recharge ne l'ouvre pas non plus");

    // Le compte achète ensuite un Dossier pour un autre dossier : le droit
    // suit la couverture, pas le dernier achat du compte.
    const couvert = await ouvrir();
    const txDossier = await payer("dossier", couvert.id);
    await appliquerLaCouverture(candidat.id, { applicationId: couvert.id, transactionId: txDossier.id });
    verifier(await redactionAssisteeDuDossier(couvert.id), "le dossier couvert par Dossier l'ouvre");
    verifier(
      !(await redactionAssisteeDuDossier(essentiel.id)),
      "et le dossier Essentiel ne l'hérite pas du dernier achat du compte",
    );

    const refus = await exigerRedactionAssistee(essentiel.id).then(
      () => "accepté",
      (e: { echec?: { code?: string } }) => e.echec?.code ?? String(e),
    );
    verifier(refus === "redaction_non_couverte", `la garde refuse avec son code (${refus})`);

    // Un remboursement engagé retire le droit avec les analyses.
    await db.transaction.update({
      where: { id: txDossier.id },
      data: { refundDueAt: new Date(), refundBasis: "fumée" },
    });
    verifier(!(await redactionAssisteeDuDossier(couvert.id)), "un remboursement engagé le retire");

    // Pro : trois couvertures Dossier, chacune ouvre l'assistance ; un
    // quatrième dossier n'hérite de rien.
    rang += 1;
    const pro = await db.user.create({
      data: { email: `fumee-pro-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const ouvrirPro = () =>
      db.application.create({ data: { userId: pro.id, visaRuleId: regle.id, status: "ACTIF" } });
    const [p1, p2, p3] = [await ouvrirPro(), await ouvrirPro(), await ouvrirPro()];
    n += 1;
    const txPro = await db.transaction.create({
      data: {
        reference: `IMP-DROITS-${n}-${process.pid}`,
        userId: pro.id,
        applicationId: p1.id,
        packCode: "pro",
        amountMajor: 59,
        currency: "EUR",
        provider: "STRIPE",
        providerTxId: `stripe:droits_${n}_${process.pid}`,
        status: "CONFIRMEE",
        confirmedAt: new Date(),
      },
    });
    await appliquerLaCouverture(pro.id, { applicationId: p1.id, transactionId: txPro.id });
    const ouverts = await Promise.all([p1, p2, p3].map((d) => redactionAssisteeDuDossier(d.id)));
    verifier(ouverts.every(Boolean), `les trois destinations Pro l'ouvrent (${ouverts.join(", ")})`);
    const quatrieme = await ouvrirPro();
    await appliquerLaCouverture(pro.id);
    verifier(
      !(await redactionAssisteeDuDossier(quatrieme.id)),
      "un quatrième dossier, que Pro ne couvre plus, ne l'ouvre pas",
    );
  }
} finally {
  await db.$disconnect().catch(() => undefined);
  service.close();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa chaîne de rédaction tient.");
