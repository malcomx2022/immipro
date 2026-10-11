/** Recette HTTP L2 : vrai serveur Next, fournisseur local, aucun service réel. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { REGLES_DE_REFERENCE } from "../../prisma/seed/visa-rules.data";
import { ouvrirSession } from "../../src/server/securite/session";
import { jourCivil } from "../../src/domain/format/fuseau";
import { environnementDuBanc } from "./environnement";

export async function recetteHttpDesUsages(db: PrismaClient, url: string): Promise<void> {
  const admin = await db.user.create({ data: { email: "admin-l2@exemple.test", role: "ADMIN" } });
  const candidat = await db.user.create({ data: { email: "candidat-l2@exemple.test", emailVerified: new Date() } });
  const modele = REGLES_DE_REFERENCE.find(r => r.countryCode === "NL")!;
  const regle = await db.visaRule.create({ data: {
    countryCode: "NL", visaType: "ETUDES", category: "ETUDES", version: 9900,
    effectiveFrom: new Date(), rules: modele.rules,
    sourceUrl: "https://exemple.test/regle", sourceTier: "OFFICIEL", verifiedAt: new Date(),
    verifiedBy: "recette", nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
  } });
  const dossier = await db.application.create({ data: { userId: candidat.id, visaRuleId: regle.id, status: "ACTIF" } });
  const document = await db.document.create({ data: {
    applicationId: dossier.id, code: "lettre_motivation", label: "Lettre de motivation", remedy: "REDIGER", status: "ATTENDUE",
  } });
  const version = await db.documentVersion.create({ data: {
    documentId: document.id, rank: 1, body: "Projet familial situé et daté, avec une activité prévue au retour. ".repeat(5), wordCount: 60,
  } });
  const transaction = await db.transaction.create({ data: {
    userId: candidat.id, applicationId: dossier.id, reference: "IMP-261011-L2HTTP", packCode: "dossier",
    packAnalyses: 30, packDestinations: 1, amountMajor: 40000, currency: "XOF", provider: "FEDAPAY", status: "CONFIRMEE", confirmedAt: new Date(),
  } });
  await db.analysisCredit.create({ data: { applicationId: dossier.id, transactionId: transaction.id, delta: 30, reason: "ACHAT_PACK" } });
  const sessionAdmin = await ouvrirSession(admin.id);
  const sessionCandidat = await ouvrirSession(candidat.id);
  let appels = 0;
  const service = createServer((req, res) => {
    req.resume(); req.on("end", () => {
      appels++; res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ remarques: [] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 120 } }));
    });
  });
  await new Promise<void>(ok => service.listen(0, "127.0.0.1", ok));
  const portIA = (service.address() as AddressInfo).port;
  const reservation = createServer();
  await new Promise<void>(ok => reservation.listen(0, "127.0.0.1", ok));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>(ok => reservation.close(() => ok()));
  const base = `http://127.0.0.1:${port}`;
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  const app = spawn(process.execPath, [".next/standalone/server.js"], { env: {
    ...environnementDuBanc(process.env), DATABASE_URL: url, PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: base, NODE_ENV: "production",
    AI_FOURNISSEUR_REDACTION: "openai_compatible", AI_OPENAI_URL: `http://127.0.0.1:${portIA}/v1`,
    AI_OPENAI_API_KEY: "synthetique", AI_OPENAI_MODEL: "synthetique",
    AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION: "3", AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION: "15", AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "EUR",
  }, stdio: "ignore" });
  const exige = (v: boolean, message: string) => { if (!v) throw new Error(message); console.log(`✓ ${message}`); };
  try {
    let pret = false;
    for (let i = 0; i < 40; i++) {
      if (app.exitCode !== null) break;
      try { if ((await fetch(`${base}/connexion`)).ok) { pret = true; break; } } catch { /* Démarrage. */ }
      await new Promise(ok => setTimeout(ok, 250));
    }
    exige(pret, "recette HTTP : le serveur standalone répond");
    const reponse = await fetch(`${base}/api/dossiers/${dossier.id}/redaction/lettre-motivation/relecture`, {
      method: "POST", headers: { cookie: `immipro_session=${sessionCandidat.valeur}`, origin: base },
    });
    const data = await reponse.json() as { relue?: boolean };
    exige(reponse.ok && data.relue === false && appels === 1, "POST réel : une relecture sans mesure complète refuse l'avis sans relance");
    const apres = await db.documentVersion.findUniqueOrThrow({ where: { id: version.id } });
    exige(apres.critiquedAt === null && await db.critiqueFinding.count({ where: { versionId: version.id } }) === 0, "POST réel : version non datée et aucune remarque publiée");
    const mouvements = await db.analysisCredit.findMany({ where: { applicationId: dossier.id } });
    exige(mouvements.reduce((n, l) => n + l.delta, 0) === 30 && mouvements.filter(l => l.delta === -1).length === 1 && mouvements.filter(l => l.delta === 1).length === 1, "POST réel : le grand livre rend une seule réservation");
    const usage = await db.aiUsage.findFirstOrThrow({ where: { applicationId: dossier.id } });
    exige(usage.usageState === "PARTIELLE" && usage.inputTokens === 120 && usage.outputTokens === null && usage.costMicros === null, "POST réel : mesure partielle conservée avec coût inconnu");
    const entetes = { cookie: `immipro_session=${sessionAdmin.valeur}` };
    const couts = await fetch(`${base}/api/admin/couts-ia`, { headers: entetes });
    const cout = (await couts.json() as { dossiers: { dossierId: string; appelsARapprocher: number; coutMicros: number | null }[] }).dossiers.find(l => l.dossierId === dossier.id);
    exige(couts.ok && cout?.appelsARapprocher === 1 && cout.coutMicros === null, "API B-07 : coût indisponible même avec tarif configuré");
    const page = await fetch(`${base}/couts-ia`, { headers: entetes });
    exige(page.ok && (await page.text()).includes("Consommation à rapprocher"), "B-07 rendu par Next : l'alerte de rapprochement est visible");
    const jour = jourCivil(new Date());
    const csv = await fetch(`${base}/api/admin/couts-ia/export?du=${jour}&au=${jour}`, { headers: entetes });
    exige(csv.ok && (await csv.text()).includes("PARTIELLE"), "export HTTP : qualification de mesure conservée dans le CSV");
  } finally {
    if (app.exitCode === null) {
      app.kill("SIGTERM"); const delai = setTimeout(() => app.kill("SIGKILL"), 5000);
      await new Promise<void>(ok => app.once("exit", () => ok())); clearTimeout(delai);
    }
    await new Promise<void>(ok => service.close(() => ok()));
  }
}
