/** REV11-L4 : vrais POST authentifiés, fournisseurs HTTP synthétiques.
 * RECETTE_RELECTURE_NAVIGATEUR=1 ajoute Chromium à deux onglets (Playwright installé). */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { REGLES_DE_REFERENCE } from "../../prisma/seed/visa-rules.data";
import { ouvrirSession } from "../../src/server/securite/session";
import { environnementDuBanc } from "./environnement";

export async function recetteRelectureHttp(db: PrismaClient, url: string) {
  let assertions = 0;
  const exige = (v: boolean, message: string) => {
    if (!v) throw Error(message);
    assertions++;
    console.log(`✓ HTTP : ${message}`);
  };
  const modele = REGLES_DE_REFERENCE.find((r) => r.countryCode === "NL")!;
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: modele.visaType,
      category: "ETUDES",
      version: 9914,
      effectiveFrom: new Date(),
      rules: modele.rules,
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date(),
      verifiedBy: "recette",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
  let n = 0;
  const fixture = async (quota = 1, pack = "dossier") => {
    const user = await db.user.create({
      data: { email: `http-l4-${++n}@exemple.test`, emailVerified: new Date() },
    });
    const app = await db.application.create({
      data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
    });
    const paiement = await db.transaction.create({
      data: {
        reference: `IMP-L4HTTP-${n}`,
        userId: user.id,
        applicationId: app.id,
        packCode: pack,
        amountMajor: 29,
        currency: "EUR",
        provider: "STRIPE",
        status: "CONFIRMEE",
        confirmedAt: new Date(),
      },
    });
    await db.analysisCredit.create({
      data: {
        applicationId: app.id,
        delta: quota,
        reason: "ACHAT_PACK",
        transactionId: paiement.id,
      },
    });
    const doc = await db.document.create({
      data: {
        applicationId: app.id,
        code: "lettre_motivation",
        label: "Lettre de motivation",
        remedy: "REDIGER",
      },
    });
    const version = await db.documentVersion.create({
      data: {
        documentId: doc.id,
        rank: 1,
        body: "Projet familial situé et daté, avec une activité prévue au retour. ".repeat(5),
        wordCount: 60,
      },
    });
    const session = await ouvrirSession(user.id);
    return { user, app, doc, version, session };
  };
  let appels = 0,
    retarder = false,
    reponses: (() => void)[] = [],
    signal: () => void = () => {},
    attente: Promise<void> = Promise.resolve(),
    charge: unknown;
  const preparer = (lent = true) => {
    retarder = lent;
    reponses = [];
    attente = new Promise((ok) => (signal = ok));
    charge = {
      remarques: [
        {
          genre: "A_RENFORCER",
          titre: "Préciser le retour",
          corps: "Ajoute la date et l’activité envisagées.",
        },
      ],
    };
  };
  const liberer = () => {
    retarder = false;
    for (const repondre of reponses.splice(0)) repondre();
  };
  const service = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      appels++;
      signal();
      const contenu = JSON.stringify(charge);
      const repondre = () => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(
            req.url === "/v1/messages"
              ? {
                  id: "msg_l4",
                  type: "message",
                  role: "assistant",
                  model: "synthetique",
                  content: [{ type: "text", text: contenu }],
                  stop_reason: "end_turn",
                  stop_sequence: null,
                  usage: { input_tokens: 120, output_tokens: 30 },
                }
              : {
                  choices: [{ message: { content: contenu }, finish_reason: "stop" }],
                  usage: { prompt_tokens: 120, completion_tokens: 30 },
                },
          ),
        );
      };
      if (retarder) reponses.push(repondre);
      else repondre();
    });
  });
  await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
  const origine = `http://127.0.0.1:${(service.address() as AddressInfo).port}`;
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  try {
    for (const fournisseur of ["anthropic", "openai_compatible"] as const) {
      const reserve = createServer();
      await new Promise<void>((ok) => reserve.listen(0, "127.0.0.1", ok));
      const port = (reserve.address() as AddressInfo).port;
      await new Promise<void>((ok) => reserve.close(() => ok()));
      const base = `http://127.0.0.1:${port}`;
      const app = spawn(process.execPath, [".next/standalone/server.js"], {
        env: {
          ...environnementDuBanc(process.env),
          DATABASE_URL: url,
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
          APP_URL: base,
          NODE_ENV: "production",
          AI_FOURNISSEUR_REDACTION: fournisseur,
          ANTHROPIC_BASE_URL: origine,
          ANTHROPIC_API_KEY: "synthetique",
          AI_MODEL: "synthetique",
          AI_OPENAI_URL: `${origine}/v1`,
          AI_OPENAI_API_KEY: "synthetique",
          AI_OPENAI_MODEL: "synthetique",
          AI_TARIF_ENTREE_PAR_MILLION: "3",
          AI_TARIF_SORTIE_PAR_MILLION: "15",
          AI_TARIF_DEVISE: "EUR",
          AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION: "3",
          AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION: "15",
          AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "EUR",
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let erreurs = "";
      app.stderr.on("data", (b) => (erreurs += b));
      try {
        let pret = false;
        for (let i = 0; i < 80; i++) {
          if (app.exitCode !== null) break;
          try {
            if ((await fetch(`${base}/connexion`)).ok) {
              pret = true;
              break;
            }
          } catch {}
          await new Promise((ok) => setTimeout(ok, 250));
        }
        exige(pret, `${fournisseur} prêt (${erreurs})`);
        const endpoint = (f: Awaited<ReturnType<typeof fixture>>) =>
          `${base}/api/dossiers/${f.app.id}/redaction/lettre-motivation/relecture`;
        const entetes = (f: Awaited<ReturnType<typeof fixture>>) => ({
          cookie: `immipro_session=${f.session.valeur}`,
          origin: base,
        });
        const post = (f: Awaited<ReturnType<typeof fixture>>) =>
          fetch(endpoint(f), { method: "POST", headers: entetes(f) });
        const etat = async (f: Awaited<ReturnType<typeof fixture>>) => {
          const l = await db.analysisCredit.findMany({ where: { applicationId: f.app.id } });
          return {
            solde: l.reduce((n, l) => n + l.delta, 0),
            debits: l.filter((l) => l.delta === -1).length,
            rendus: l.filter((l) => l.reason === "ANALYSE_RENDUE").length,
            version: await db.documentVersion.findUniqueOrThrow({
              where: { id: f.version.id },
              include: { findings: true },
            }),
            usages: await db.aiUsage.findMany({ where: { applicationId: f.app.id } }),
          };
        };
        {
          const f = await fixture();
          preparer();
          const avant = appels;
          const premier = post(f);
          await attente;
          const second = await post(f);
          exige(
            second.ok && (await second.json()).enCours === true && appels === avant + 1,
            `${fournisseur} : deuxième POST EN_COURS, un appel`,
          );
          const pendant = await etat(f);
          exige(
            pendant.solde === 0 && pendant.debits === 1 && !pendant.version.critiquedAt,
            "quota 1 : réservé une fois",
          );
          const page = await fetch(
            `${base}/dossiers/${f.app.id}/redaction/lettre-motivation/relecture`,
            { headers: entetes(f) },
          );
          const html = await page.text();
          exige(
            page.ok &&
              html.includes("déjà en cours") &&
              html.includes("Consulter le résultat") &&
              !html.includes("Rien à reprendre sur cette version."),
            "R-04 serveur : attente explicite sans avis favorable",
          );
          liberer();
          exige((await premier).ok, "premier POST abouti");
          const fin = await etat(f);
          exige(
            !!fin.version.critiquedAt &&
              fin.version.findings.length === 1 &&
              fin.solde === 0 &&
              fin.rendus === 0,
            "avis unique, quota net exact",
          );
          exige(
            fin.usages.length === 1 &&
              fin.usages[0]?.provider === fournisseur &&
              fin.usages[0]?.costMicros === 810,
            "usage/coût fournisseur unique",
          );
          const replay = await post(f);
          exige(
            replay.ok && (await replay.json()).relue && appels === avant + 1,
            "réponse perdue/rejeu : pas de dépense supplémentaire",
          );
          exige(
            (await fetch(endpoint(f), { method: "POST" })).status === 401,
            "sans session : refus avant effet",
          );
          exige(
            (
              await fetch(endpoint(f), {
                method: "POST",
                headers: { ...entetes(f), origin: "https://exemple.test" },
              })
            ).status === 403,
            "origine étrangère : refus avant effet",
          );
          const autre = await fixture();
          exige(
            (await fetch(endpoint(f), { method: "POST", headers: entetes(autre) })).status === 404,
            "autre candidat : refus avant effet",
          );
          const essentiel = await fixture(1, "essentiel");
          exige((await post(essentiel)).status === 403, "pack Essentiel : refus avant réservation");
          exige(
            appels === avant + 1 &&
              (await db.relectureReservation.count({
                where: { versionId: essentiel.version.id },
              })) === 0,
            "gardes HTTP conservent les appels et réservations",
          );
        }
        {
          const f = await fixture();
          preparer();
          const avant = appels;
          const premier = post(f);
          await attente;
          await db.documentVersion.create({
            data: { documentId: f.doc.id, rank: 2, body: "Nouvelle version synthétique." },
          });
          liberer();
          const r = await premier;
          exige(
            r.ok && (await r.json()).motif === "version_remplacee",
            `${fournisseur} : remplacement pendant vrai appel`,
          );
          const fin = await etat(f);
          exige(
            fin.solde === 1 &&
              fin.rendus === 1 &&
              !fin.version.critiquedAt &&
              fin.version.findings.length === 0 &&
              fin.usages.length === 1,
            "ancien avis écarté, consommation gardée et quota rendu",
          );
          exige(appels === avant + 1, "pas de relecture automatique de v2");
        }
        if (process.env.RECETTE_RELECTURE_NAVIGATEUR === "1") {
          const f = await fixture();
          preparer();
          const avant = appels;
          const enfant = spawn("python", ["scripts/recette/relecture-deux-onglets.py"], {
            env: {
              ...process.env,
              RECETTE_BASE: base,
              RECETTE_DOSSIER: f.app.id,
              RECETTE_SESSION: f.session.valeur,
            },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let sortie = "",
            err = "";
          enfant.stdout.on("data", (b) => {
            sortie += b.toString();
            if (sortie.includes("LIBERER")) liberer();
          });
          enfant.stderr.on("data", (b) => (err += b.toString()));
          const timeout = setTimeout(() => enfant.kill("SIGKILL"), 60_000);
          const code = await new Promise<number | null>((ok, ko) => {
            enfant.on("error", ko);
            enfant.on("exit", ok);
          });
          clearTimeout(timeout);
          exige(code === 0, `Chromium ${fournisseur} : deux onglets (${err})`);
          console.log(sortie.replace("LIBERER", "").trim());
          const fin = await etat(f);
          exige(
            appels === avant + 1 &&
              fin.debits === 1 &&
              fin.solde === 0 &&
              fin.version.findings.length === 1 &&
              fin.usages.length === 1,
            "navigateur : un appel, un avis, une analyse et un usage",
          );
        }
      } finally {
        liberer();
        if (app.exitCode === null) {
          const fin = new Promise<void>((ok) => app.once("exit", () => ok()));
          app.kill("SIGTERM");
          const t = setTimeout(() => app.kill("SIGKILL"), 5000);
          await fin;
          clearTimeout(t);
        }
      }
    }
    console.log(`✓ HTTP exclusif : ${assertions} assertions positives.`);
  } finally {
    liberer();
    await new Promise<void>((ok) => service.close(() => ok()));
  }
}
