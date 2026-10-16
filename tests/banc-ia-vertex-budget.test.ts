// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  lireCampagneVertex,
  reservationVertexMicrosXof,
  verifierDestinationVertex,
  CAMPAGNE_VERTEX,
  MODELE_VERTEX_DEMANDE,
} from "@/domain/banc-ia/campagne-vertex";
import { BudgetVertex } from "../scripts/banc-ia/budget-vertex";
import type { MesureDuBanc } from "../scripts/banc-ia/resultats";
const charge = {
  id: CAMPAGNE_VERTEX,
  projet: "projetanatt",
  region: "eu",
  modele: MODELE_VERTEX_DEMANDE,
  plafondXof: 5000,
  borneVerifiee: true,
  referenceBorne: "SYNTHETIQUE — aucun tarif réel",
  sourceLimites: "https://exemple.test/limites",
  sourceTarif: "https://exemple.test/tarifs",
  jetonsEntreeMax: 1000,
  jetonsSortieFacturesMax: 4096,
  tarifEntreeMicrosDeviseParMillion: 500_000_000,
  tarifSortieMicrosDeviseParMillion: 0,
  deviseTarif: "USD",
  conversionMajoreeMicrosXofParUnite: 1_000_000_000,
  fraisMajoresMilliemes: 1000,
};
const campagne = () => lireCampagneVertex(charge);
const config = {
  fournisseur: "openai_compatible",
  base: new URL(
    "https://aiplatform.eu.rep.googleapis.com/v1/projects/projetanatt/locations/eu/endpoints/openapi",
  ),
  modele: MODELE_VERTEX_DEMANDE,
  auth: "compte_de_service_google",
  email: "immipro-vertex-ai@projetanatt.iam.gserviceaccount.com",
  pdf: "image_url",
  raisonnement: "low",
};
const connue: MesureDuBanc = {
  etat: "CONNUE",
  jetonsEntree: 1,
  jetonsSortie: 1,
  fournisseur: "openai_compatible",
  modele: MODELE_VERTEX_DEMANDE,
};
async function jetable(f: (dossier: string) => Promise<void>) {
  const d = await mkdtemp(path.join(tmpdir(), "immipro-vertex-budget-"));
  try {
    await f(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}
describe("S.177 — destination et borne de coût Vertex", () => {
  it("seule la destination autorisée passe, v1 et v1beta1", () => {
    expect(() => verifierDestinationVertex(config)).not.toThrow();
    expect(() =>
      verifierDestinationVertex({
        ...config,
        base: new URL(config.base.href.replace("/v1/", "/v1beta1/")),
      }),
    ).not.toThrow();
  });
  it.each([
    { fournisseur: "anthropic" },
    { modele: "google/autre-modele" },
    { auth: "cle" },
    { email: "autre@projetanatt.iam.gserviceaccount.com" },
    { pdf: "file" },
    { raisonnement: null },
    { raisonnement: "medium" },
    // Région simple : le modèle n'y est pas servi, et la décision du 16/10 est le point multi-région.
    {
      base: new URL(
        "https://europe-west1-aiplatform.googleapis.com/v1/projects/projetanatt/locations/europe-west1/endpoints/openapi",
      ),
    },
    { base: new URL("https://aiplatform.us.rep.googleapis.com/v1/projects/projetanatt/locations/us/endpoints/openapi") },
    { base: new URL("https://aiplatform.googleapis.com/v1/projects/projetanatt/locations/global/endpoints/openapi") },
    { base: new URL(config.base.href.replace("projects/projetanatt", "projects/autre")) },
    { base: new URL("https://generativelanguage.googleapis.com/v1") },
    { base: new URL(config.base.href + "?cle=secret") },
    { base: new URL(config.base.href.replace("https://", "http://")) },
  ])("refuse une autre destination/configuration", (patch) => {
    expect(() => verifierDestinationVertex({ ...config, ...patch })).toThrow();
  });
  it.each([
    { borneVerifiee: false },
    { referenceBorne: null },
    { jetonsEntreeMax: null },
    { jetonsSortieFacturesMax: null },
    { conversionMajoreeMicrosXofParUnite: null },
    { plafondXof: 5001 },
    { projet: "autre" },
    { fraisMajoresMilliemes: 999 },
  ])("refuse une borne incomplète ou un plafond changé", (patch) => {
    expect(() => lireCampagneVertex({ ...charge, ...patch })).toThrow();
  });
  it("réserve au supérieur, deux échanges et frais/change majorés inclus", () => {
    expect(reservationVertexMicrosXof(campagne())).toBe(1_000_000_000);
    const c = lireCampagneVertex({
      ...charge,
      jetonsEntreeMax: 1,
      tarifEntreeMicrosDeviseParMillion: 1,
      tarifSortieMicrosDeviseParMillion: 0,
      conversionMajoreeMicrosXofParUnite: 1,
      fraisMajoresMilliemes: 1001,
    });
    expect(reservationVertexMicrosXof(c)).toBe(1);
  });
  it("refuse une invocation qui peut à elle seule dépasser le plafond", () => {
    expect(() =>
      reservationVertexMicrosXof(lireCampagneVertex({ ...charge, jetonsEntreeMax: 6000 })),
    ).toThrow(/plafond/u);
  });
});
describe("budget durable sur vrai système de fichiers", () => {
  it("le sixième appel est bloqué avant HTTP, même après plusieurs passages", async () =>
    jetable(async (d) => {
      let appels = 0;
      const serveur = createServer((req, res) => {
        req.resume();
        appels++;
        res.end("ok");
      });
      await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
      const adresse = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
      try {
        for (let i = 0; i < 5; i++) {
          const b = await BudgetVertex.ouvrir(d, campagne());
          try {
            await b.reserver("L01", "extraction");
            const avant = JSON.parse(await readFile(path.join(d, "budget.json"), "utf8"));
            expect(avant.reserveMicrosXof).toBe((i + 1) * 1_000_000_000);
            expect(avant.enCours).toBe("L01/extraction");
            await fetch(adresse, { method: "POST", body: "synthetique" });
            await b.terminer(connue);
          } finally {
            await b.fermer();
          }
        }
        const b = await BudgetVertex.ouvrir(d, campagne());
        try {
          await expect(b.reserver("L02", "extraction")).rejects.toThrow(/avant réseau/u);
        } finally {
          await b.fermer();
        }
        expect(appels).toBe(5);
        const e = JSON.parse(await readFile(path.join(d, "budget.json"), "utf8"));
        expect(e).toMatchObject({
          reserveMicrosXof: 5_000_000_000,
          blocage: "PLAFOND_AVANT_APPEL",
        });
      } finally {
        serveur.closeAllConnections();
        await new Promise<void>((ok) => serveur.close(() => ok()));
      }
    }));
  it("deux processus/logiques concurrents n'ouvrent pas deux budgets", async () =>
    jetable(async (d) => {
      const rs = await Promise.allSettled([
        BudgetVertex.ouvrir(d, campagne()),
        BudgetVertex.ouvrir(d, campagne()),
      ]);
      expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of rs) if (r.status === "fulfilled") await r.value.fermer();
    }));
  it.each(["PARTIELLE", "INCONNUE", "INVALIDE"] as const)(
    "%s bloque la campagne, sans rendu ni zéro inventé",
    async (etat) =>
      jetable(async (d) => {
        const b = await BudgetVertex.ouvrir(d, campagne());
        await b.reserver("L01", "extraction");
        await b.terminer({ ...connue, etat, jetonsEntree: null });
        expect(() => b.exigerSuite()).toThrow();
        expect(b.etat()).toMatchObject({
          reserveMicrosXof: 1_000_000_000,
          blocage: "MESURE_A_RAPPROCHER",
          derniereMesure: { jetonsEntree: null },
        });
        await b.fermer();
        await expect(BudgetVertex.ouvrir(d, campagne())).rejects.toThrow(/rapprochement/u);
      }),
  );
  it("un usage connu au-delà de la borne bloque aussi", async () =>
    jetable(async (d) => {
      const b = await BudgetVertex.ouvrir(d, campagne());
      await b.reserver("L01", "extraction");
      await b.terminer({ ...connue, jetonsEntree: 1001 });
      expect(b.etat().blocage).toBe("BORNE_FACTUREE_DEPASSEE");
      await b.fermer();
    }));
  it("vrai zéro et absence d'appel ne rendent pas la réservation prudente", async () =>
    jetable(async (d) => {
      const b = await BudgetVertex.ouvrir(d, campagne());
      for (const mesure of [
        { ...connue, jetonsEntree: 0, jetonsSortie: 0 },
        { ...connue, etat: "NON_APPELE" as const, jetonsEntree: null, jetonsSortie: null },
      ]) {
        await b.reserver("L01", "extraction");
        await b.terminer(mesure);
      }
      expect(b.etat()).toMatchObject({ reserveMicrosXof: 2_000_000_000, blocage: null });
      await b.fermer();
      await b.fermer();
    }));
  it("aucune remise à zéro sur corruption ou changement de borne", async () =>
    jetable(async (d) => {
      const b = await BudgetVertex.ouvrir(d, campagne());
      await b.reserver("L01", "extraction");
      await b.terminer(connue);
      await b.fermer();
      await expect(
        BudgetVertex.ouvrir(d, lireCampagneVertex({ ...charge, referenceBorne: "autre" })),
      ).rejects.toThrow(/changé/u);
      await writeFile(path.join(d, "budget.json"), "corrompu");
      await expect(BudgetVertex.ouvrir(d, campagne())).rejects.toThrow(/illisible/u);
      expect(await readFile(path.join(d, "budget.json"), "utf8")).toBe("corrompu");
    }));
  it(
    "arrêt brutal après réservation : aucun nouvel appel à la reprise",
    async () =>
      jetable(async (d) => {
        const programme = path.join(d, "interruption.mts");
        const cheminBudget = path.resolve("scripts/banc-ia/budget-vertex.ts");
        await writeFile(
          programme,
          `import { BudgetVertex } from ${JSON.stringify(cheminBudget)}; const c=JSON.parse(process.argv[3]!); const b=await BudgetVertex.ouvrir(process.argv[2]!,c); await b.reserver('L01','extraction'); process.exit(17);`,
        );
        await expect(
          promisify(execFile)(
            process.execPath,
            [
              "node_modules/tsx/dist/cli.mjs",
              "--tsconfig",
              path.resolve("tsconfig.json"),
              programme,
              d,
              JSON.stringify(charge),
            ],
            { timeout: 15000 },
          ),
        ).rejects.toMatchObject({ code: 17 });
        const e = JSON.parse(await readFile(path.join(d, "budget.json"), "utf8"));
        expect(e).toMatchObject({ reserveMicrosXof: 1_000_000_000, enCours: "L01/extraction" });
        await expect(BudgetVertex.ouvrir(d, campagne())).rejects.toThrow(/verrouillée/u);
        // Seulement le verrou du processus de test déjà terminé ; jamais le budget.
        await unlink(path.join(d, "campagne.lock"));
        await expect(BudgetVertex.ouvrir(d, campagne())).rejects.toThrow(/rapprochement/u);
      }),
    20000,
  );
});

// Le préchargeur reste propre au sous-processus de test : aucune connexion Google.
async function cliVertex(d: string, mode: "connue" | "inconnue") {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const compte = {
    type: "service_account",
    client_email: config.email,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.googleapis.com/token",
  };
  const shim = path.join(d, "transport-synthetique.mjs");
  const trace = path.join(d, "transport.json");
  await writeFile(trace, JSON.stringify({ oauth: 0, modele: 0, raisonnement: null }));
  await writeFile(
    shim,
    `import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module'; import { readFileSync, writeFileSync } from 'node:fs';
const exec = cp.execFileSync;
cp.execFileSync = (cmd,args,opts) => cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel'
  ? ${JSON.stringify(d + "\n")} : exec(cmd,args,opts);
syncBuiltinESMExports();
globalThis.fetch = async (input, init) => {
  const u = new URL(String(input)); const t = JSON.parse(readFileSync(${JSON.stringify(trace)}, 'utf8'));
  let charge;
  if(u.href === 'https://oauth2.googleapis.com/token') { t.oauth++; charge={access_token:'synthetique',expires_in:3600,token_type:'Bearer'}; }
  else if(u.hostname === 'aiplatform.eu.rep.googleapis.com' && u.pathname.endsWith('/chat/completions')) {
    t.modele++; t.raisonnement = JSON.parse(String(init.body)).reasoning_effort ?? null; charge={choices:[{message:{content:JSON.stringify({obstacle:null,pieceIdentifiee:'passeport',champs:{passeport_validite_min:'2031-01-01'}})},finish_reason:'stop'}],
      ...(${JSON.stringify(mode)} === 'connue' ? {usage:{prompt_tokens:1,completion_tokens:1}} : {})};
  } else throw new Error('Aucune destination réseau réelle dans ce test');
  writeFileSync(${JSON.stringify(trace)},JSON.stringify(t)); return new Response(JSON.stringify(charge), {headers:{'Content-Type':'application/json'}});
};`,
  );
  await writeFile(path.join(d, "campagne.json"), JSON.stringify(charge));
  await writeFile(
    path.join(d, "manifeste.json"),
    JSON.stringify({
      societe: "Google Vertex — test synthétique",
      regionDeclaree: "eu",
      modele: config.modele,
      dateVerification: "2026-10-12",
      sourceModele: "https://exemple.test/modeles",
      sourceTarif: "https://exemple.test/tarifs",
      maxAppels: 60,
      budgetCompte: "5000 XOF simulés",
      autorisationEssaiSynthetique: true,
      dpa: "NON_VERIFIE",
      residence: "NON_VERIFIE",
      conservation: "NON_VERIFIE",
    }),
  );
  const args = [
    "--import",
    "tsx",
    "--import",
    shim,
    "scripts/banc-ia/lancer.mts",
    "--fournisseur",
    "openai_compatible",
    "--manifeste",
    path.join(d, "manifeste.json"),
    "--campagne-vertex",
    path.join(d, "campagne.json"),
    "--pieces",
    "L01",
    "--sortie",
    path.join(d, "resultats"),
  ];
  const env = {
    ...process.env,
    AI_OPENAI_URL: config.base.href,
    AI_OPENAI_MODEL: config.modele,
    AI_OPENAI_PDF: "image_url",
    AI_OPENAI_RAISONNEMENT: "low",
    AI_OPENAI_AUTH: "compte_de_service_google",
    AI_OPENAI_COMPTE_DE_SERVICE: JSON.stringify(compte),
    AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION: "500",
    AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION: "0",
    AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "USD",
  };
  let code = 0;
  let stderr = "";
  try {
    await promisify(execFile)(process.execPath, args, { env, timeout: 15000 });
  } catch (e) {
    code = (e as { code: number }).code;
    stderr = (e as { stderr: string }).stderr;
  }
  return {
    code,
    stderr,
    trace: JSON.parse(await readFile(trace, "utf8")),
    budget: JSON.parse(
      await readFile(path.join(d, ".qualification-vertex", CAMPAGNE_VERTEX, "budget.json"), "utf8"),
    ),
  };
}
describe("CLI Vertex budgété avec SDK/OAuth synthétiques", () => {
  it(
    "cinq passages consomment la réserve globale, le sixième ne demande même pas OAuth",
    async () =>
      jetable(async (d) => {
        for (let i = 0; i < 5; i++) {
          const r = await cliVertex(d, "connue");
          expect(r.code).toBe(0);
          expect(r.trace).toEqual({ oauth: 1, modele: 1, raisonnement: "low" });
          expect(r.budget.reserveMicrosXof).toBe((i + 1) * 1_000_000_000);
        }
        const r = await cliVertex(d, "connue");
        expect(r.code).toBe(1);
        expect(r.trace).toEqual({ oauth: 0, modele: 0, raisonnement: null });
        expect(r.budget).toMatchObject({
          reserveMicrosXof: 5_000_000_000,
          blocage: "PLAFOND_AVANT_APPEL",
        });
      }),
    20000,
  );
  it(
    "usage absente : arrêt et reprise refusée avant tout nouveau réseau",
    async () =>
      jetable(async (d) => {
        const r = await cliVertex(d, "inconnue");
        expect(r.code).toBe(1);
        expect(r.trace.modele).toBe(1);
        expect(r.budget).toMatchObject({
          reserveMicrosXof: 1_000_000_000,
          blocage: "MESURE_A_RAPPROCHER",
        });
        const reprise = await cliVertex(d, "connue");
        expect(reprise.code).toBe(1);
        expect(reprise.trace).toEqual({ oauth: 0, modele: 0, raisonnement: null });
      }),
    20000,
  );
});
