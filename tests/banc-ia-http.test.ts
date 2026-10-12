// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { appelerCompatible } from "@/server/ia/openai-compatible";
import { avisDeReference } from "@/domain/banc-ia/lettres-reference";
const executer = promisify(execFile);
let serveur: Server;
let base: string;
let dossier: string;
let mode = "valide";
let appels = 0;
const lecture = {
  obstacle: null,
  pieceIdentifiee: "passeport",
  champs: { passeport_validite_min: "2031-01-01" },
};
const evenement = (type: string, corps: object) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...corps })}\n\n`;
beforeAll(async () => {
  dossier = await mkdtemp(path.join(tmpdir(), "immipro-l5-"));
  await writeFile(
    path.join(dossier, "manifeste.json"),
    JSON.stringify({
      societe: "Serveur synthétique local",
      regionDeclaree: "boucle locale",
      modele: "synthetique",
      dateVerification: "2026-10-11",
      sourceModele: "https://exemple.test/modeles",
      sourceTarif: "https://exemple.test/tarifs",
      maxAppels: 60,
      budgetCompte: "aucun appel commercial",
      autorisationEssaiSynthetique: true,
      dpa: "NON_VERIFIE",
      residence: "NON_VERIFIE",
      conservation: "NON_VERIFIE",
    }),
  );
  serveur = createServer(async (req, res) => {
    let brut = "";
    for await (const morceau of req) brut += String(morceau);
    appels++;
    if (mode === "timeout") return;
    const statut = Number(mode);
    if ([401, 429, 503].includes(statut)) {
      res.statusCode = statut;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: {
            type:
              statut === 429
                ? "rate_limit_error"
                : statut === 401
                  ? "authentication_error"
                  : "api_error",
            message: "incident synthétique",
          },
        }),
      );
      return;
    }
    const body = JSON.parse(brut);
    const anthropic = req.url?.endsWith("/messages");
    const schema = anthropic
      ? body.output_config?.format?.schema
      : body.response_format?.json_schema?.name;
    const estCritique = anthropic ? Boolean(schema?.properties?.remarques) : schema === "critique";
    const estLecture = anthropic ? !estCritique && !body.stream : schema === "lecture";
    const texte = estLecture
      ? JSON.stringify(lecture)
      : estCritique
        ? JSON.stringify({
            remarques:
              mode === "avis_invalide"
                ? [{ genre: "INCOHERENCE", titre: "sans sources", corps: "sans sources" }]
                : avisDeReference("R03"),
          })
        : "Madame, Monsieur, je souhaite poursuivre mon projet d'études. Mon parcours correspond aux études décrites dans mes réponses. Je souhaite approfondir cette formation et rester fidèle aux faits présentés dans mon entretien. Veuillez recevoir mes salutations respectueuses.";
    const usage =
      mode === "sans_usage"
        ? undefined
        : mode === "partielle"
          ? anthropic
            ? { input_tokens: 12 }
            : { prompt_tokens: 12 }
          : anthropic
            ? { input_tokens: 12, output_tokens: 3 }
            : { prompt_tokens: 12, completion_tokens: 3 };
    if (anthropic && body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.end(
        evenement("message_start", {
          message: {
            id: "msg_synthetique",
            type: "message",
            role: "assistant",
            model: "synthetique",
            content: [],
            stop_reason: null,
            usage,
          },
        }) +
          evenement("content_block_start", {
            index: 0,
            content_block: { type: "text", text: "" },
          }) +
          evenement("content_block_delta", {
            index: 0,
            delta: { type: "text_delta", text: texte },
          }) +
          evenement("content_block_stop", { index: 0 }) +
          evenement("message_delta", {
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: mode === "sans_usage" || mode === "partielle" ? {} : { output_tokens: 3 },
          }) +
          evenement("message_stop", {}),
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        anthropic
          ? {
              id: "msg_synthetique",
              type: "message",
              role: "assistant",
              model: "synthetique",
              content: [{ type: "text", text: texte }],
              usage,
              stop_reason: mode === "refus" ? "refusal" : "end_turn",
            }
          : {
              choices: [
                {
                  message: {
                    content: texte,
                    ...(mode === "refus" ? { refusal: "refus synthétique" } : {}),
                  },
                  finish_reason: "stop",
                },
              ],
              usage,
            },
      ),
    );
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});
afterAll(async () => {
  serveur.closeAllConnections();
  await new Promise<void>((ok) => serveur.close(() => ok()));
  await rm(dossier, { recursive: true, force: true });
});
async function passage(fournisseur: string, args: string[] = []) {
  appels = 0;
  const sortie = await mkdtemp(path.join(dossier, "passage-"));
  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: "synthetique",
    ANTHROPIC_BASE_URL: base,
    AI_MODEL: "synthetique",
    AI_OPENAI_URL: `${base}/v1`,
    AI_OPENAI_API_KEY: "synthetique",
    AI_OPENAI_MODEL: "synthetique",
    AI_OPENAI_AUTH: "cle",
    AI_OPENAI_PDF: "file",
    AI_TARIF_ENTREE_PAR_MILLION: "1",
    AI_TARIF_SORTIE_PAR_MILLION: "2",
    AI_TARIF_DEVISE: "USD",
    AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION: "1",
    AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION: "2",
    AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "USD",
  };
  const command = [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/banc-ia/lancer.mts",
    "--fournisseur",
    fournisseur,
    "--manifeste",
    path.join(dossier, "manifeste.json"),
    "--sortie",
    sortie,
    "--pieces",
    "L01,R03",
    ...args,
  ];
  let code = 0;
  let stdout = "";
  let stderr = "";
  try {
    ({ stdout, stderr } = await executer(process.execPath, command, { env, timeout: 15000 }));
  } catch (e) {
    const erreur = e as { code: number; stdout: string; stderr: string };
    code = erreur.code;
    stdout = erreur.stdout;
    stderr = erreur.stderr;
  }
  const dirs = await readdir(sortie);
  const r = dirs[0]
    ? JSON.parse(await readFile(path.join(sortie, dirs[0], "resultats.json"), "utf8"))
    : null;
  return { code, stdout, stderr, r };
}
describe("REV11-L5 — vrai CLI, vrais adaptateurs, HTTP local", () => {
  for (const fournisseur of ["anthropic", "openai_compatible"]) {
    it(`${fournisseur} : quatre appels distincts, modèles, coûts et avis de référence`, async () => {
      mode = "valide";
      const { code, r } = await passage(fournisseur);
      expect(code).toBe(0);
      expect(appels).toBe(4);
      expect(r.qualification).toMatchObject({
        nature: "SERVEUR_LOCAL",
        fournisseurQualifie: false,
      });
      expect(r.appels.map((a: { fonction: string }) => a.fonction)).toEqual([
        "extraction",
        "redaction",
        "relecture",
        "avis_reference",
      ]);
      expect(
        r.appels.every(
          (a: { mesure: { etat: string; modele: string } }) =>
            a.mesure.etat === "CONNUE" && a.mesure.modele === "synthetique",
        ),
      ).toBe(true);
      expect(r.references[0]).toMatchObject({
        id: "R03",
        avisValide: true,
        incoherenceRelevee: true,
      });
      expect(r.mesureTotale).toMatchObject({
        entree: 48,
        sortie: 12,
        coutMicros: 72,
        rapprochementFournisseur: "NON_EFFECTUE",
      });
      expect(r.provenance.pieces[0].sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(JSON.stringify(r)).not.toContain("API_KEY");
    }, 20000);
    it.each(["sans_usage", "partielle", "401", "429", "503", "refus"])(
      `${fournisseur} : garde l'incident %s sans publication ni rejeu`,
      async (incident) => {
        mode = incident;
        const { code, r } = await passage(fournisseur, ["--sans-redaction"]);
        expect(code).toBe(0);
        expect(appels).toBe(1);
        expect(r.lectures[0].note.verdictObtenu).toBe("ILLISIBLE");
        expect(r.qualification.fournisseurQualifie).toBe(false);
        expect(r.appels[0].incident).not.toBeNull();
        if (incident !== "refus") {
          expect(r.appels[0].mesure.etat).not.toBe("CONNUE");
          expect(r.mesureTotale.appelsARapprocher).toBe(1);
        } else {
          expect(r.appels[0].mesure.etat).toBe("CONNUE");
          expect(r.mesureTotale.entree).toBe(12);
        }
      },
      20000,
    );
    it(`${fournisseur} : un avis invalide reste refusé avec sa consommation`, async () => {
      mode = "avis_invalide";
      const { r } = await passage(fournisseur, ["--sans-lecture"]);
      expect(appels).toBe(3);
      expect(r.references[0]).toMatchObject({ avisValide: false, incoherenceRelevee: null });
      expect(r.appels[2]).toMatchObject({ mesure: { etat: "CONNUE" } });
      expect(r.appels[2].incident).toContain("avis_mal_forme");
    }, 20000);
  }
  it("un cas inconnu est refusé avant réseau", async () => {
    mode = "valide";
    const { code, r, stderr } = await passage("openai_compatible", ["--pieces", "INEXISTANT"]);
    expect(code).toBe(1);
    expect(r).toBeNull();
    expect(appels).toBe(0);
    expect(stderr).toContain("inconnu");
  });
  it("une pièce absente arrête le passage avant tout appel payant", async () => {
    mode = "valide";
    appels = 0;
    const repo = process.cwd();
    const env = {
      ...process.env,
      AI_OPENAI_URL: `${base}/v1`,
      AI_OPENAI_API_KEY: "synthetique",
      AI_OPENAI_MODEL: "synthetique",
      AI_OPENAI_AUTH: "cle",
    };
    await expect(
      executer(
        process.execPath,
        [
          path.join(repo, "node_modules/tsx/dist/cli.mjs"),
          "--tsconfig",
          path.join(repo, "tsconfig.json"),
          path.join(repo, "scripts/banc-ia/lancer.mts"),
          "--fournisseur",
          "openai_compatible",
          "--pieces",
          "L01",
          "--manifeste",
          path.join(dossier, "manifeste.json"),
        ],
        { env, cwd: dossier, timeout: 15000 },
      ),
    ).rejects.toMatchObject({ code: 1 });
    expect(appels).toBe(0);
  });
  it.each(["parfaite", "credule"])(
    "le passage complet simulé %s porte sa nature et ses soixante appels",
    async (simulation) => {
      const sortie = await mkdtemp(path.join(dossier, "simulation-"));
      let code = 0;
      try {
        await executer(
          process.execPath,
          [
            "node_modules/tsx/dist/cli.mjs",
            "scripts/banc-ia/lancer.mts",
            "--simulation",
            simulation,
            "--sortie",
            sortie,
          ],
          { timeout: 15000 },
        );
      } catch (e) {
        code = (e as { code: number }).code;
      }
      const dirs = await readdir(sortie);
      const r = JSON.parse(await readFile(path.join(sortie, dirs[0]!, "resultats.json"), "utf8"));
      expect(code).toBe(simulation === "credule" ? 2 : 0);
      expect(r.qualification).toMatchObject({ nature: "SIMULATION", fournisseurQualifie: false });
      expect(r.lectures).toHaveLength(30);
      expect(r.references).toHaveLength(10);
      expect(r.appels).toHaveLength(60);
      expect(r.references.every((a: { avisValide: boolean }) => a.avisValide)).toBe(true);
      if (simulation === "credule") expect(r.synthese.fausseConformite.length).toBeGreaterThan(0);
      else expect(r.synthese.verdicts.justes).toBe(30);
    },
  );
  it("le timeout réel du transport conserve la mesure inconnue", async () => {
    mode = "timeout";
    appels = 0;
    const r = await appelerCompatible(
      {
        base: new URL(`${base}/v1`),
        authentification: { mode: "cle", cle: "synthetique" },
        modele: "synthetique",
        pdf: null,
      },
      {},
      30,
    );
    expect(r).toMatchObject({
      ok: false,
      cause: "delai_depasse",
      mesure: { etat: "INCONNUE", jetonsEntree: null },
    });
    expect(appels).toBe(1);
  });
});
