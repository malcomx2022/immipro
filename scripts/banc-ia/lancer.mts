/**
 * Fait passer le jeu d'essai du banc à un fournisseur d'IA (S.99).
 *
 *     # le fournisseur et le modèle se déclarent comme en production (S.94)
 *     ANTHROPIC_API_KEY=… AI_MODEL=claude-sonnet-5-5 npm run banc:ia -- --fournisseur anthropic
 *     AI_OPENAI_URL=https://api.eu.mistral.ai/v1 AI_OPENAI_API_KEY=… AI_OPENAI_MODEL=mistral-medium-latest \
 *       AI_OPENAI_PDF=document_url npm run banc:ia -- --fournisseur openai_compatible
 *     # Vertex AI : AI_OPENAI_AUTH=compte_de_service_google, AI_OPENAI_COMPTE_DE_SERVICE
 *     # et AI_OPENAI_PDF=image_url — voir docs/IA-benchmark.md §8.1
 *
 *     # vérifier le banc lui-même, sans clé ni réseau
 *     npm run banc:ia -- --simulation parfaite
 *     npm run banc:ia -- --simulation credule
 *
 * Options : `--pieces L01,L07` pour un sous-ensemble, `--sans-redaction`,
 * `--sans-lecture`.
 *
 * ── Le chemin de production, et lui seul ────────────────────────────
 *
 * Les appels passent par les adaptateurs du produit, avec ses consignes
 * et ses schémas, et chaque réponse est relue par le domaine. Seul le
 * stockage est contourné : les octets viennent de `tests/banc-ia/pieces/`
 * au lieu de Garage. Un fournisseur obtient donc ici exactement ce qu'il
 * obtiendrait en production, sans base de données ni compte candidat.
 *
 * ── Ce qui sort ─────────────────────────────────────────────────────
 *
 * Dans `banc-ia-resultats/<fournisseur>-<modèle>-<horodatage>/`, qui
 * n'est pas versionné :
 *
 * - `rapport.md` : la synthèse, la pièce qui disqualifie s'il y en a,
 *   puis chaque pièce et chaque rédaction ;
 * - `resultats.json` : tout, pour comparer les fournisseurs entre eux ;
 * - `lettres/` : les textes produits, que `melanger.mts` anonymise pour
 *   la relecture à l'aveugle.
 *
 * Aucune pièce de candidat n'entre ici. Les clés d'essai n'ont pas de
 * conservation zéro : c'est pour cela que le jeu est entièrement factice.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  CAS_DE_LECTURE,
  CAS_DE_REDACTION,
  type CasDeLecture,
  type CasDeRedaction,
} from "@/domain/banc-ia/jeu-d-essai";
import {
  noterUneLecture,
  noterUneRedaction,
  synthetiser,
  type LectureObtenue,
  type NoteDeLecture,
  type NoteDeRedaction,
  type SyntheseDuBanc,
} from "@/domain/banc-ia/notation";
import { coutMicrosDesJetons } from "@/domain/backoffice/couts";
import { champsDemandes, type DemandeDeLecture, type TypeLisible } from "@/domain/dossiers/extraction";
import { conditionsDeLaPiece, type Condition } from "@/domain/dossiers/verification";
import {
  FOURNISSEURS,
  manqueDuFournisseur,
  modeleDu,
  tarifDu,
  type CodeFournisseur,
} from "@/domain/ia/fournisseurs";
import type { MatiereDeLaPiece, RemarqueProduite } from "@/domain/redaction/commande";
import { PIECES_REDIGEABLES } from "@/lib/contenu/redaction";
import { configurationCompatible, lireDesOctets } from "@/server/dossiers/extracteur";
import {
  critiqueCompatible,
  lireDesOctetsCompatible,
  redacteurCompatible,
} from "@/server/ia/openai-compatible";
import { critiqueClaude, redacteurClaude } from "@/server/redaction/adaptateur";
import { REGLES_DE_REFERENCE } from "../../prisma/seed/visa-rules.data";

/* ------------------------------------------------------------------ *
 * Les options.
 * ------------------------------------------------------------------ */

const { values: options } = parseArgs({
  options: {
    fournisseur: { type: "string" },
    simulation: { type: "string" },
    pieces: { type: "string" },
    "sans-redaction": { type: "boolean", default: false },
    "sans-lecture": { type: "boolean", default: false },
  },
});

const arreter = (message: string): never => {
  console.error(message);
  process.exit(1);
};

type Simulation = "parfaite" | "credule";
const simulation = options.simulation as Simulation | undefined;
if (simulation !== undefined && simulation !== "parfaite" && simulation !== "credule") {
  arreter("--simulation attend « parfaite » ou « credule ».");
}
const fournisseur = (options.fournisseur ?? (simulation ? "simulation" : "")) as CodeFournisseur | "simulation";
if (fournisseur !== "simulation" && !(fournisseur in FOURNISSEURS)) {
  arreter(
    `Indique le fournisseur à éprouver : --fournisseur ${Object.keys(FOURNISSEURS).join(" ou ")}, ou --simulation parfaite.`,
  );
}

/* ------------------------------------------------------------------ *
 * Les adaptateurs du produit, ou une simulation.
 * ------------------------------------------------------------------ */

interface Mesure {
  jetonsEntree: number;
  jetonsSortie: number;
  millisecondes: number;
}

type Lecteur = (type: TypeLisible, octets: Buffer, demande: DemandeDeLecture, cas: CasDeLecture) => Promise<LectureObtenue & { jetonsEntree: number; jetonsSortie: number }>;
type Ecrivain = (matiere: MatiereDeLaPiece, cas: CasDeRedaction) => Promise<{ texte: string | null; detail: string | null; jetonsEntree: number; jetonsSortie: number }>;
type Relecteur = (texte: string, matiere: MatiereDeLaPiece, cas: CasDeRedaction) => Promise<{ remarques: readonly RemarqueProduite[] | null; detail: string | null; jetonsEntree: number; jetonsSortie: number }>;

function adaptateurs(): { modele: string; lire: Lecteur; ecrire: Ecrivain; relire: Relecteur } {
  if (fournisseur === "simulation") {
    // Un lecteur parfait rend la lecture attendue ; un lecteur crédule
    // remplit chaque champ vide d'une valeur plausible, comme un modèle
    // sommé de remplir un schéma. Le second doit être disqualifié.
    const lire: Lecteur = async (_t, _o, _d, cas) => {
      const base = { jetonsEntree: 0, jetonsSortie: 0 };
      if (cas.attendu.obstacle !== null && simulation === "parfaite") {
        return { etat: "NON_LUE", cause: cas.attendu.obstacle, ...base };
      }
      const bruts: Record<string, string | number | null> = { ...cas.attendu.champs };
      if (simulation === "credule") {
        for (const condition of conditionsDeLaPiece(conditionsDe(cas), cas.codeAttendu)) {
          if (bruts[condition.code] !== null && bruts[condition.code] !== undefined) continue;
          bruts[condition.code] =
            condition.unite === "mois" ? "2031-01-01" : typeof condition.valeur === "number" ? condition.valeur * 2 : String(condition.valeur);
        }
      }
      const pieceIdentifiee = simulation === "credule" ? cas.codeAttendu : cas.attendu.pieceIdentifiee;
      return { etat: "LUE", pieceIdentifiee, bruts, ...base };
    };
    const ecrire: Ecrivain = async (_m, cas) => ({
      texte: Object.values(cas.reponses).join("\n\n"),
      detail: null,
      jetonsEntree: 0,
      jetonsSortie: 0,
    });
    const relire: Relecteur = async (_t, _m, cas) => ({
      remarques:
        cas.incoherenceAttendue && simulation === "parfaite"
          ? [{ genre: "INCOHERENCE", titre: "Simulation", corps: "Simulation." }]
          : [],
      detail: null,
      jetonsEntree: 0,
      jetonsSortie: 0,
    });
    return { modele: simulation!, lire, ecrire, relire };
  }

  const env = process.env;
  if (fournisseur === "anthropic") {
    const cle = (env[FOURNISSEURS.anthropic.variables[0]!] ?? "").trim();
    if (cle === "") arreter(`Renseigne ${FOURNISSEURS.anthropic.variables[0]} pour éprouver Anthropic.`);
    const modele = modeleDu(env, "anthropic")!;
    const redacteur = redacteurClaude(cle, modele);
    const critique = critiqueClaude(cle, modele);
    return {
      modele,
      lire: (type, octets, demande) => lireDesOctets(cle, modele, type, octets, demande).then(versObtenue),
      ecrire: (matiere) => redacteur(matiere).then(versTexte),
      relire: (texte, matiere) => critique(texte, matiere).then(versRemarques),
    };
  }

  const config = configurationCompatible(env);
  if (!config) {
    const manque = manqueDuFournisseur(env, "openai_compatible") ?? "renseigner AI_OPENAI_URL, AI_OPENAI_API_KEY et AI_OPENAI_MODEL";
    return arreter(`Le fournisseur compatible n'est pas configuré : ${manque}.`);
  }
  const redacteur = redacteurCompatible(config);
  const critique = critiqueCompatible(config);
  return {
    modele: config.modele,
    lire: (type, octets, demande) => lireDesOctetsCompatible(config, type, octets, demande).then(versObtenue),
    ecrire: (matiere) => redacteur(matiere).then(versTexte),
    relire: (texte, matiere) => critique(texte, matiere).then(versRemarques),
  };
}

const versObtenue = (lu: Awaited<ReturnType<typeof lireDesOctets>>) =>
  lu.etat === "LUE"
    ? { etat: "LUE" as const, pieceIdentifiee: lu.pieceIdentifiee, bruts: lu.bruts, jetonsEntree: lu.jetonsEntree, jetonsSortie: lu.jetonsSortie }
    : { etat: "NON_LUE" as const, cause: lu.cause, jetonsEntree: lu.jetonsEntree, jetonsSortie: lu.jetonsSortie };

const versTexte = (r: Awaited<ReturnType<ReturnType<typeof redacteurClaude>>>) =>
  r.etat === "ECRITE"
    ? { texte: r.texte, detail: null, jetonsEntree: r.jetonsEntree, jetonsSortie: r.jetonsSortie }
    : { texte: null, detail: `${r.cause} — ${r.detail}`, jetonsEntree: r.jetonsEntree, jetonsSortie: r.jetonsSortie };

const versRemarques = (r: Awaited<ReturnType<ReturnType<typeof critiqueClaude>>>) =>
  r.etat === "RELUE"
    ? { remarques: r.remarques, detail: null, jetonsEntree: r.jetonsEntree, jetonsSortie: r.jetonsSortie }
    : { remarques: null, detail: `${r.cause} — ${r.detail}`, jetonsEntree: r.jetonsEntree, jetonsSortie: r.jetonsSortie };

/* ------------------------------------------------------------------ *
 * Ce que le produit envoie : la demande d'une pièce, la matière d'une lettre.
 * ------------------------------------------------------------------ */

const regleDe = (cas: CasDeLecture) =>
  REGLES_DE_REFERENCE.find((r) => r.countryCode === cas.regle.pays && r.visaType === cas.regle.visaType)!;
const conditionsDe = (cas: CasDeLecture): readonly Condition[] =>
  regleDe(cas).rules.conditions as readonly Condition[];

/** La demande, construite comme `server/jobs/analyse.ts` la construit. */
function demandeDe(cas: CasDeLecture): DemandeDeLecture {
  const pieces = regleDe(cas).rules.pieces_requises;
  return {
    codeAttendu: cas.codeAttendu,
    intituleAttendu: pieces.find((p) => p.code === cas.codeAttendu)!.libelle,
    codesDeLaChecklist: pieces.map((p) => p.code),
    champs: champsDemandes(conditionsDeLaPiece(conditionsDe(cas), cas.codeAttendu)),
  };
}

/** La matière, construite comme la route de rédaction la construit. */
function matiereDe(cas: CasDeRedaction): MatiereDeLaPiece {
  const piece = PIECES_REDIGEABLES.find((p) => p.type === cas.piece)!;
  const reponses: Record<number, string> = {};
  piece.questions.forEach((q, rang) => {
    const r = cas.reponses[q.intitule];
    if (r !== undefined) reponses[rang] = r;
  });
  return {
    piece: piece.libelle,
    objet: piece.objet,
    pays: cas.pays,
    reponses,
    questions: piece.questions.map((q, rang) => ({ rang, section: q.section, intitule: q.intitule })),
  };
}

const TYPES: Record<CasDeLecture["rendu"]["format"], { extension: string; type: TypeLisible }> = {
  jpeg: { extension: "jpg", type: "image/jpeg" },
  png: { extension: "png", type: "image/png" },
  pdf_natif: { extension: "pdf", type: "application/pdf" },
  pdf_scanne: { extension: "pdf", type: "application/pdf" },
};

/* ------------------------------------------------------------------ *
 * Le passage.
 * ------------------------------------------------------------------ */

const chronometrer = async <T,>(f: () => Promise<T>): Promise<[T, number]> => {
  const debut = performance.now();
  const r = await f();
  return [r, Math.round(performance.now() - debut)];
};

async function main() {
  const { modele, lire, ecrire, relire } = adaptateurs();
  const filtre = options.pieces ? new Set(options.pieces.split(",").map((s) => s.trim())) : null;
  const casDeLecture = options["sans-lecture"] ? [] : CAS_DE_LECTURE.filter((c) => !filtre || filtre.has(c.id));
  const casDeRedaction = options["sans-redaction"] ? [] : CAS_DE_REDACTION.filter((c) => !filtre || filtre.has(c.id));

  const horodatage = new Date().toISOString().replace(/[:.]/gu, "-").slice(0, 19);
  const nomDuPassage = `${fournisseur}-${modele}-${horodatage}`.replace(/[^\w.-]/gu, "_");
  const dossier = path.resolve("banc-ia-resultats", nomDuPassage);
  await mkdir(path.join(dossier, "lettres"), { recursive: true });

  console.log(`Banc IA — ${fournisseur} · ${modele}`);
  console.log(`${casDeLecture.length} pièces, ${casDeRedaction.length} rédactions.\n`);

  const lectures: { note: NoteDeLecture; mesure: Mesure; cause: string | null }[] = [];
  for (const cas of casDeLecture) {
    const { extension, type } = TYPES[cas.rendu.format];
    const octets = await readFile(path.resolve("tests/banc-ia/pieces", `${cas.id}.${extension}`));
    const [obtenue, ms] = await chronometrer(() => lire(type, octets, demandeDe(cas), cas));
    const note = noterUneLecture(cas, conditionsDe(cas), obtenue);
    lectures.push({
      note,
      mesure: { jetonsEntree: obtenue.jetonsEntree, jetonsSortie: obtenue.jetonsSortie, millisecondes: ms },
      cause: obtenue.etat === "NON_LUE" ? obtenue.cause : null,
    });
    const marque = note.fausseConformite ? "✗ FAUSSE CONFORMITÉ" : note.verdictObtenu === note.verdictAttendu ? "✓" : "·";
    console.log(`  ${cas.id} ${marque} ${note.verdictObtenu} (attendu ${note.verdictAttendu}) · ${ms} ms`);
  }

  const redactions: { note: NoteDeRedaction; mesure: Mesure; texte: string | null; remarques: readonly RemarqueProduite[] | null; incident: string | null }[] = [];
  for (const cas of casDeRedaction) {
    const matiere = matiereDe(cas);
    const [ecrit, msE] = await chronometrer(() => ecrire(matiere, cas));
    const [relu, msR] =
      ecrit.texte === null
        ? [{ remarques: null, detail: "aucun texte à relire", jetonsEntree: 0, jetonsSortie: 0 }, 0]
        : await chronometrer(() => relire(ecrit.texte!, matiere, cas));
    const note = noterUneRedaction(cas, ecrit.texte, relu.remarques);
    redactions.push({
      note,
      mesure: {
        jetonsEntree: ecrit.jetonsEntree + relu.jetonsEntree,
        jetonsSortie: ecrit.jetonsSortie + relu.jetonsSortie,
        millisecondes: msE + msR,
      },
      texte: ecrit.texte,
      remarques: relu.remarques,
      incident: ecrit.detail ?? relu.detail,
    });
    if (ecrit.texte !== null) await writeFile(path.join(dossier, "lettres", `${cas.id}.txt`), ecrit.texte);
    console.log(`  ${cas.id} ${note.aVerifier.length === 0 ? "✓" : "·"} ${note.aVerifier.join(" ") || "rien à signaler mécaniquement"}`);
  }

  const synthese = synthetiser(
    lectures.map((l) => l.note),
    redactions.map((r) => r.note),
  );
  const jetons = (liste: readonly { mesure: Mesure }[]) => ({
    entree: liste.reduce((s, l) => s + l.mesure.jetonsEntree, 0),
    sortie: liste.reduce((s, l) => s + l.mesure.jetonsSortie, 0),
  });
  const tarif = fournisseur === "simulation" ? null : tarifDu(process.env, fournisseur);
  const cout = (j: { entree: number; sortie: number }) => coutMicrosDesJetons(tarif, j.entree, j.sortie);

  const resultat = {
    fournisseur,
    modele,
    horodatage,
    synthese,
    jetons: { lecture: jetons(lectures), redaction: jetons(redactions) },
    tarif,
    coutMicros: { lecture: cout(jetons(lectures)), redaction: cout(jetons(redactions)) },
    lectures,
    redactions,
  };
  await writeFile(path.join(dossier, "resultats.json"), JSON.stringify(resultat, null, 2));
  await writeFile(path.join(dossier, "rapport.md"), rapport(resultat));

  console.log(`\n${resume(synthese)}`);
  console.log(`\nRapport : ${path.relative(process.cwd(), path.join(dossier, "rapport.md"))}`);
  if (synthese.disqualifie) process.exitCode = 2;
}

/* ------------------------------------------------------------------ *
 * Le rapport.
 * ------------------------------------------------------------------ */

const part = (n: number, sur: number) => (sur === 0 ? "—" : `${n} sur ${sur}`);

function resume(s: SyntheseDuBanc): string {
  return [
    s.disqualifie
      ? `DISQUALIFIÉ — fausse conformité sur ${s.fausseConformite.join(", ")}.`
      : "Aucune fausse conformité.",
    `Verdicts justes : ${part(s.verdicts.justes, s.pieces)} · revues humaines : ${s.verdicts.revuesHumaines}.`,
    `Champs justes : ${part(s.champs.justes, s.champs.total)} · inventés : ${s.champs.inventees} · faux : ${s.champs.fausses} · manqués : ${s.champs.manquees}.`,
    `Pièces identifiées : ${part(s.identifications.justes, s.identifications.attendues)} · obstacles reconnus : ${part(s.obstacles.justes, s.obstacles.attendus)} · échecs techniques : ${s.echecsTechniques}.`,
    `Rédactions écrites : ${part(s.redactions.ecrites, s.redactions.total)} · avec nombres ajoutés : ${s.redactions.avecNombresAjoutes} · avec vocabulaire interdit : ${s.redactions.avecVocabulaireInterdit} · incohérences relevées : ${part(s.redactions.incoherences.relevees, s.redactions.incoherences.attendues)}.`,
  ].join("\n");
}

type Resultat = {
  fournisseur: string;
  modele: string;
  horodatage: string;
  synthese: SyntheseDuBanc;
  jetons: { lecture: { entree: number; sortie: number }; redaction: { entree: number; sortie: number } };
  tarif: { devise: string } | null;
  coutMicros: { lecture: number | null; redaction: number | null };
  lectures: readonly { note: NoteDeLecture; mesure: Mesure; cause: string | null }[];
  redactions: readonly { note: NoteDeRedaction; mesure: Mesure; incident: string | null }[];
};

function rapport(r: Resultat): string {
  const cout = (micros: number | null) =>
    micros === null || r.tarif === null ? "tarif non renseigné" : `${(micros / 1_000_000).toFixed(4)} ${r.tarif.devise}`;
  const moyenne = (liste: readonly { mesure: Mesure }[]) =>
    liste.length === 0 ? 0 : Math.round(liste.reduce((s, l) => s + l.mesure.millisecondes, 0) / liste.length);
  const lignesLecture = r.lectures.map(({ note, mesure, cause }) => {
    const champs = note.champs
      .filter((c) => c.issue !== "juste")
      .map((c) => `${c.code} ${c.issue} (lu ${JSON.stringify(c.obtenu)}, écrit ${JSON.stringify(c.attendu)})`)
      .join(" ; ");
    const remarque = [
      note.fausseConformite ? "**FAUSSE CONFORMITÉ**" : "",
      note.identificationJuste === false ? "pièce mal identifiée" : "",
      note.obstacle === "manque" ? "obstacle non signalé" : note.obstacle === "signale_a_tort" ? `obstacle signalé à tort (${cause})` : "",
      note.echecTechnique ? `échec technique (${cause})` : "",
      champs,
    ]
      .filter(Boolean)
      .join(" · ");
    return `| ${note.id} | ${note.verdictAttendu} | ${note.verdictObtenu} | ${mesure.jetonsEntree} / ${mesure.jetonsSortie} | ${mesure.millisecondes} | ${remarque || "—"} |`;
  });
  const lignesRedaction = r.redactions.map(({ note, mesure, incident }) =>
    `| ${note.id} | ${note.ecrite ? "oui" : "non"} | ${note.incoherenceAttendue ? (note.incoherenceRelevee ? "relevée" : "**manquée**") : "—"} | ${mesure.jetonsEntree} / ${mesure.jetonsSortie} | ${[...note.aVerifier, incident ?? ""].filter(Boolean).join(" ") || "—"} |`,
  );

  return `# Banc IA — ${r.fournisseur} · ${r.modele}

Passage du ${r.horodatage}. Jeu d'essai : \`src/domain/banc-ia/jeu-d-essai.ts\` ; méthode : \`docs/IA-benchmark.md\` §8.

## Synthèse

${resume(r.synthese)
  .split("\n")
  .map((l) => `- ${l}`)
  .join("\n")}

| | Jetons entrée / sortie | Coût | Durée moyenne |
|---|---|---|---|
| Lecture des pièces | ${r.jetons.lecture.entree} / ${r.jetons.lecture.sortie} | ${cout(r.coutMicros.lecture)} | ${moyenne(r.lectures)} ms |
| Rédaction et relecture | ${r.jetons.redaction.entree} / ${r.jetons.redaction.sortie} | ${cout(r.coutMicros.redaction)} | ${moyenne(r.redactions)} ms |

## Pièces

| Cas | Verdict attendu | Verdict obtenu | Jetons | ms | Écarts |
|---|---|---|---|---|---|
${lignesLecture.join("\n")}

## Rédactions

La qualité d'écriture se juge à l'aveugle, par deux relecteurs, sur les lettres anonymisées par \`scripts/banc-ia/melanger.mts\`. Ce tableau ne relève que ce qui se vérifie mécaniquement.

| Cas | Écrite | Incohérence | Jetons | À vérifier |
|---|---|---|---|---|
${lignesRedaction.join("\n")}
`;
}

await main();
