/** WF-08/R-04 : fournisseur synthétique, vraie route et vrais rendus Next. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { CAS_AVIS_IA } from "../../tests/fixtures/avis-ia";
import { REGLES_DE_REFERENCE } from "../../prisma/seed/visa-rules.data";
import { ouvrirSession } from "../../src/server/securite/session";
import { environnementDuBanc } from "./environnement";

export async function recetteHttpDesAvis(db: PrismaClient, url: string): Promise<void> {
  const exige = (v: boolean, message: string) => {
    if (!v) throw new Error(message);
    console.log(`✓ ${message}`);
  };
  const candidat = await db.user.create({
    data: { email: "candidat-l3@exemple.test", emailVerified: new Date() },
  });
  const modele = REGLES_DE_REFERENCE.find((r) => r.countryCode === "NL")!;
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: modele.visaType,
      category: "ETUDES",
      version: 9903,
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
  const dossier = await db.application.create({
    data: { userId: candidat.id, visaRuleId: regle.id, status: "ACTIF" },
  });
  const document = await db.document.create({
    data: {
      applicationId: dossier.id,
      code: "lettre_motivation",
      label: "Lettre de motivation",
      remedy: "REDIGER",
      status: "ATTENDUE",
    },
  });
  const texte = "Projet familial situé et daté, avec une activité prévue au retour. ".repeat(5);
  const historique = await db.documentVersion.create({
    data: {
      documentId: document.id,
      rank: 1,
      body: texte,
      wordCount: 60,
      critiquedAt: new Date("2026-10-01"),
    },
  });
  // Ancien avis invalide, volontairement conservé : sans réponse source,
  // il est impossible de requalifier les avis historiques avec certitude.
  await db.critiqueFinding.create({
    data: {
      versionId: historique.id,
      kind: "INCOHERENCE",
      title: "Deux dates",
      body: "Ancien constat synthétique.",
    },
  });
  const lireHistorique = () =>
    db.documentVersion.findUniqueOrThrow({
      where: { id: historique.id },
      include: { findings: true },
    });
  const avantHistorique = JSON.stringify(await lireHistorique());
  const transaction = await db.transaction.create({
    data: {
      userId: candidat.id,
      applicationId: dossier.id,
      reference: "IMP-261011-L3HTTP",
      packCode: "dossier",
      packAnalyses: 30,
      packDestinations: 1,
      amountMajor: 40000,
      currency: "XOF",
      provider: "FEDAPAY",
      status: "CONFIRMEE",
      confirmedAt: new Date(),
    },
  });
  await db.analysisCredit.create({
    data: {
      applicationId: dossier.id,
      transactionId: transaction.id,
      delta: 30,
      reason: "ACHAT_PACK",
    },
  });
  const session = await ouvrirSession(candidat.id);
  let charge: unknown;
  let appels = 0;
  const service = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      appels++;
      const contenu = JSON.stringify(charge);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/v1/messages"
            ? {
                id: "msg_l3",
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
    });
  });
  await new Promise<void>((ok) => service.listen(0, "127.0.0.1", ok));
  const origineIA = `http://127.0.0.1:${(service.address() as AddressInfo).port}`;
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  let rang = 1;
  let consommation = 0;
  try {
    for (const fournisseur of ["anthropic", "openai_compatible"] as const) {
      // Six scénarios au plus par processus, soit dix POST avec les rejeux
      // des quatre avis valides. Le limiteur réel reste à 10/minute ; la
      // recette ne le désactive pas et conserve sa base entre processus.
      for (let debut = 0; debut < CAS_AVIS_IA.length; debut += 6) {
        const reservation = createServer();
        await new Promise<void>((ok) => reservation.listen(0, "127.0.0.1", ok));
        const port = (reservation.address() as AddressInfo).port;
        await new Promise<void>((ok) => reservation.close(() => ok()));
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
            ANTHROPIC_BASE_URL: origineIA,
            ANTHROPIC_API_KEY: "synthetique",
            AI_MODEL: "synthetique",
            AI_OPENAI_URL: `${origineIA}/v1`,
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
        app.stderr?.on("data", (bloc: Buffer) => {
          erreurs += bloc.toString();
        });
        try {
          let pret = false;
          for (let i = 0; i < 80; i++) {
            if (app.exitCode !== null) break;
            try {
              if ((await fetch(`${base}/connexion`)).ok) {
                pret = true;
                break;
              }
            } catch {
              /* Démarrage. */
            }
            await new Promise((ok) => setTimeout(ok, 250));
          }
          exige(pret, `${fournisseur} : standalone prêt`);
          const entetes = { cookie: `immipro_session=${session.valeur}`, origin: base };
          const post = () =>
            fetch(`${base}/api/dossiers/${dossier.id}/redaction/lettre-motivation/relecture`, {
              method: "POST",
              headers: entetes,
            });
          for (const cas of CAS_AVIS_IA.slice(debut, debut + 6)) {
            charge = cas.charge;
            const version = await db.documentVersion.create({
              data: { documentId: document.id, rank: ++rang, body: texte, wordCount: 60 },
            });
            const appelsAvant = appels;
            const avantMouvements = await db.analysisCredit.findMany({
              where: { applicationId: dossier.id },
            });
            const idsAvant = new Set(avantMouvements.map((l) => l.id));
            const avant = avantMouvements.filter((l) => l.delta === -1).length;
            const reponse = await post();
            const data = (await reponse.json()) as {
              relue?: boolean;
              remarques?: number | null;
              motif?: string;
            };
            const libelle = `${fournisseur}/${cas.nom}`;
            exige(
              reponse.ok &&
                data.relue === cas.valide &&
                data.remarques === (cas.valide ? cas.nombre : null) &&
                (cas.valide || data.motif === (cas.motif ?? "avis_mal_forme")),
              `${libelle} : contrat POST et motif`,
            );
            exige(appels === appelsAvant + 1, `${libelle} : un appel, aucune relance automatique`);
            const apres = await db.documentVersion.findUniqueOrThrow({ where: { id: version.id } });
            const remarques = await db.critiqueFinding.findMany({
              where: { versionId: version.id },
            });
            exige(
              Boolean(apres.critiquedAt) === cas.valide &&
                remarques.length === (cas.valide ? cas.nombre : 0) &&
                apres.body === texte,
              `${libelle} : date et remarques atomiques, texte intact`,
            );
            if (cas.valide) consommation++;
            const mouvements = await db.analysisCredit.findMany({
              where: { applicationId: dossier.id },
            });
            const nouvelles = mouvements.filter((l) => !idsAvant.has(l.id));
            const debits = nouvelles.filter((l) => l.delta === -1);
            const rendus = nouvelles.filter((l) => l.delta === 1 && l.reason === "ANALYSE_RENDUE");
            exige(
              debits.length === 1 &&
                debits[0]!.reservedUntil === null &&
                debits[0]!.versionId === version.id &&
                rendus.length === (cas.valide ? 0 : 1) &&
                mouvements.reduce((n, l) => n + l.delta, 0) === 30 - consommation,
              `${libelle} : un débit, rendu unique si refus, solde exact`,
            );
            const usages = await db.aiUsage.findMany({
              where: { applicationId: dossier.id },
              orderBy: { createdAt: "asc" },
            });
            const usage = usages[usages.length - 1]!;
            exige(
              usages.length === appels &&
                usage.provider === fournisseur &&
                usage.model === "synthetique" &&
                usage.usageState === "CONNUE" &&
                usage.inputTokens === 120 &&
                usage.outputTokens === 30 &&
                usage.costMicros === 810,
              `${libelle} : consommation et coût conservés même sans avis`,
            );
            if (cas.nom === "vraie liste vide" || cas.nom === "liste mixte") {
              const page = await fetch(
                `${base}/dossiers/${dossier.id}/redaction/lettre-motivation/relecture`,
                { headers: entetes },
              );
              const html = await page.text();
              if (
                !page.ok ||
                html.includes("Rien à reprendre sur cette version.") !== cas.valide ||
                html.includes("relecture automatique ImmiPro") !== cas.valide
              ) {
                console.error({
                  statut: page.status,
                  chemin: new URL(page.url).pathname,
                  titre: /<title>(.*?)<\/title>/.exec(html)?.[1],
                  favorable: html.includes("Rien à reprendre sur cette version."),
                  source: html.includes("relecture automatique ImmiPro"),
                });
                console.error(erreurs);
              }
              exige(
                page.ok &&
                  html.includes("Rien à reprendre sur cette version.") === cas.valide &&
                  html.includes("relecture automatique ImmiPro") === cas.valide,
                `${libelle} : R-04 distingue avis vide et refus`,
              );
            }
            if (cas.valide) {
              const rejeu = await post();
              exige(
                rejeu.ok &&
                  ((await rejeu.json()) as { relue?: boolean }).relue === true &&
                  appels === appelsAvant + 1 &&
                  (await db.analysisCredit.count({
                    where: { applicationId: dossier.id, reason: "ANALYSE" },
                  })) ===
                    avant + 1,
                `${libelle} : rejeu séquentiel sans appel ni débit supplémentaire`,
              );
            }
          }
        } finally {
          if (app.exitCode === null) {
            const arret = new Promise<void>((ok) => app.once("exit", () => ok()));
            app.kill("SIGTERM");
            const delai = setTimeout(() => app.kill("SIGKILL"), 5000);
            await arret;
            clearTimeout(delai);
          }
        }
      }
    }
    const { rendreLesReservationsDeRedactionEchues } = await import("../../src/server/acces/quota");
    await rendreLesReservationsDeRedactionEchues(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const mouvements = await db.analysisCredit.findMany({ where: { applicationId: dossier.id } });
    exige(
      mouvements.reduce((n, l) => n + l.delta, 0) === 30 - consommation,
      "reprise des réservations : aucun double rendu ni restitution d'un avis valide",
    );
    exige(
      JSON.stringify(await lireHistorique()) === avantHistorique,
      "avis historique : ni date ni remarque réécrites sans réponse source",
    );
    const { recetteGardeDesAvis } = await import("./avis-publication");
    await recetteGardeDesAvis(db, dossier.id, document.id, candidat.id);
  } finally {
    await new Promise<void>((ok) => service.close(() => ok()));
  }
}
