/**
 * Recette L6 — parcours candidat et back-office, sur le banc `--parcours`.
 *
 * Un candidat synthétique par profil navigateur, créé par l'inscription
 * réelle, puis les gestes de la matrice dans l'ordre où il les ferait :
 * simulateur, inscription et code, ouverture, achat scripté, consentement,
 * dépôt et lecture, coupure réseau, réponse tardive, lecture sans mesure et
 * revue humaine, signalement et décision B-05, retrait du consentement,
 * rédaction assistée, double onglet, quota épuisé et reprise gratuite,
 * déclaration du dépôt, clôture et purge annoncée.
 *
 * Chaque geste est contrôlé par son effet en base, jamais par un seul
 * HTTP 200. IA et paiement sont les réponses scriptées locales du banc :
 * rien ici ne qualifie un fournisseur réel (L5) ni un encaissement (M.C).
 * Les écrans du back-office sont tenus pour le bureau : ils sont joués dans
 * un contexte de 1 280 px quel que soit le profil.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  codeDeVerification,
  controlerLesFournisseurs,
  journal,
  lire,
  motDePasseDuBanc,
  origineDesFournisseurs,
  preparerDossierPret,
  preparerLettre,
  statsDesFournisseurs,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

const PIECE = (nom: string) => resolve("tests/banc-ia/pieces", nom);
const MOT_DE_PASSE = "RecetteL6Synthetique42";
const APP_HTTP = "http://localhost:3162";

let context: BrowserContext;
let page: Page;
let admin: Page | null = null;
let largeur = 0;
let email = "";
let compte = "";
let dossier = "";
let passeport = "";
let second = "";
let origineApp = "";
const erreurs: string[] = [];
const mesures: { route: string; largeur: number; contenu: number }[] = [];
const preuves: Record<string, unknown>[] = [];

type Ligne = Record<string, unknown>;

const credits = async (id = dossier) =>
  Number(
    (
      await lire<{ n: string }>(
        'SELECT coalesce(sum(delta),0) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',
        [id],
      )
    )[0]!.n,
  );

const versions = (piece: string) =>
  lire<{ id: string; rank: number; scanState: string | null }>(
    'SELECT v.id, v.rank, v."scanState" FROM "DocumentVersion" v WHERE v."documentId"=$1 ORDER BY v.rank',
    [piece],
  );

const analyses = (piece: string) =>
  lire<{
    rank: number;
    scanState: string;
    verdict: string;
    creditConsumed: boolean;
    inputTokens: number | null;
    outputTokens: number | null;
  }>(
    `SELECT v.rank, v."scanState", a.verdict, a."creditConsumed", a."inputTokens", a."outputTokens"
     FROM "DocumentVersion" v JOIN "DocumentAnalysis" a ON a."versionId"=v.id
     WHERE v."documentId"=$1 ORDER BY v.rank`,
    [piece],
  );

/** L'analyse de la dernière version, dès que le worker l'a écrite. */
async function attendreLAnalyse(piece: string, rang: number, delai = 90_000) {
  await expect
    .poll(async () => (await analyses(piece)).filter((a) => a.rank === rang).length, {
      timeout: delai,
      intervals: [500],
    })
    .toBe(1);
  return (await analyses(piece)).find((a) => a.rank === rang)!;
}

async function relever(p: Page = page) {
  const m = await p.evaluate(() => ({
    largeur: innerWidth,
    contenu: document.documentElement.scrollWidth,
  }));
  mesures.push({ route: new URL(p.url()).pathname, ...m });
}

/**
 * Navigue, laisse le réseau se calmer au plus trois secondes, puis mesure.
 * « networkidle » seul ne suffit pas : au bureau, les préchargements des
 * liens et un rafraîchissement en cours peuvent le repousser sans fin, et
 * Firefox abandonne une navigation qu'une autre vient de doubler — un
 * second essai suffit alors.
 */
async function aller(route: string, p: Page = page) {
  try {
    await p.goto(route, { waitUntil: "load" });
  } catch (erreur) {
    if (!/NS_BINDING_ABORTED|interrupted by another navigation/u.test(String(erreur))) throw erreur;
    await p.goto(route, { waitUntil: "load" });
  }
  await attendreLHydratation(p);
  await Promise.race([
    p.waitForLoadState("networkidle").catch(() => undefined),
    p.waitForTimeout(3_000),
  ]);
  await relever(p);
}

/**
 * React pose ses clés internes (`__reactFiber$…`, `__reactProps$…`) sur
 * chaque nœud qu'il a hydraté : c'est le signe que l'élément répond à ses
 * gestionnaires. Une touche Entrée envoyée avant provoquait l'envoi natif
 * du formulaire, et la recette attendait une redirection qui ne venait pas ;
 * l'annonceur de route de Next, lui, apparaît avant les îlots tardifs.
 * Tolérant aux navigations de repli de Next, qui rechargent la page : on
 * réessaie jusqu'à la limite plutôt que d'échouer sur une évaluation coupée.
 */
async function attendreLHydratation(p: Page, selecteur = "body", limite = 45_000) {
  const debut = Date.now();
  while (Date.now() - debut < limite) {
    try {
      const hydrate = await p.evaluate(
        (sel) => {
          const el = document.querySelector(sel);
          return (
            !!el &&
            Object.keys(el).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"))
          );
        },
        selecteur,
      );
      if (hydrate) return;
    } catch {
      /* navigation en cours : réessayer */
    }
    await p.waitForTimeout(250);
  }
  throw new Error(`Hydratation non constatée sur « ${selecteur} » en ${limite} ms.`);
}

/** L'interrupteur de consentement, basculé au clavier : focus puis Espace. */
async function basculerLeConsentement(p: Page, attendu: "true" | "false") {
  const interrupteur = p.getByRole("switch", { name: "Analyse de mes pièces d'identité", exact: true });
  for (let essai = 0; essai < 4; essai += 1) {
    try {
      await attendreLHydratation(p, "[role=switch]");
      await interrupteur.focus({ timeout: 15_000 });
      await p.keyboard.press("Space");
      if ((await interrupteur.getAttribute("aria-checked", { timeout: 5_000 })) === attendu) break;
    } catch {
      // Page restée instable (navigation de repli de Next) : repartir d'une
      // page rechargée plutôt que d'attendre un geste qui n'aboutit pas.
      await p.reload({ waitUntil: "load" });
    }
    await p.waitForTimeout(1_000);
  }
  await expect(interrupteur).toHaveAttribute("aria-checked", attendu);
  const [reponse] = await Promise.all([
    p.waitForResponse((r) => r.url().endsWith("/api/comptes/consentements") && r.request().method() === "PUT"),
    p.getByRole("button", { name: "Enregistrer", exact: true }).click(),
  ]);
  expect(reponse.ok()).toBe(true);
}

async function choisirLeFichier(p: Page, fichier: string) {
  await p.locator("input[type=file]").last().setInputFiles(PIECE(fichier));
  await expect(p.getByText(fichier, { exact: false }).first()).toBeVisible();
}

/** Ouvre le dépôt d'une version suivante, quel que soit le verdict affiché. */
async function nouvelleVersion(p: Page) {
  const bouton = p
    .getByRole("button", { name: /^(Téléverser une autre version|Reprendre la photo)$/u })
    .first();
  await expect(bouton).toBeVisible();
  await bouton.click();
}

async function deposer(p: Page, fichier: string, bouton = "Ajouter la pièce") {
  await choisirLeFichier(p, fichier);
  await p.getByRole("button", { name: bouton, exact: true }).click();
}

/**
 * Dépôts rapprochés : la route de dépôt est « sensible » (dix appels par
 * minute, deux par dépôt). Quand la limite se ferme, l'écran le dit, garde
 * le fichier et promet la réouverture ; le geste suivant est le même bouton.
 * Rend le nombre de fois où la limite a été rencontrée.
 */
async function deposerEnCadence(p: Page, fichier: string, bouton = "Ajouter la pièce") {
  await choisirLeFichier(p, fichier);
  let limites = 0;
  for (let essai = 0; essai < 12; essai += 1) {
    await p.getByRole("button", { name: bouton, exact: true }).click();
    const issue = await Promise.race([
      p
        .getByText(/est bien arrivé/u)
        .waitFor({ timeout: 20_000 })
        .then(() => "recu" as const)
        .catch(() => "aucun" as const),
      p
        .getByRole("alert")
        .filter({ hasText: "Trop de demandes en peu de temps" })
        .waitFor({ timeout: 20_000 })
        .then(() => "limite" as const)
        .catch(() => "aucun" as const),
    ]);
    if (issue === "recu") return limites;
    if (issue === "aucun") throw new Error(`Ni accusé ni limite après le dépôt de ${fichier}.`);
    limites += 1;
    await expect(p.getByText("Rien n'a été perdu de ce que tu as saisi.")).toBeVisible();
    await p.waitForTimeout(12_000);
  }
  throw new Error("La limite d'appels ne s'est pas rouverte.");
}

async function connecter(p: Page, adresse: string, motDePasse: string) {
  await p.goto("/connexion");
  await p.getByLabel("Adresse email", { exact: true }).fill(adresse);
  await p.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await p.getByLabel("Mot de passe", { exact: true }).press("Enter");
  await p.waitForURL("**/tableau-de-bord");
}

/** Le back-office, au bureau, dans son propre contexte de session. */
async function administration(): Promise<Page> {
  if (admin) return admin;
  const contexte = await context.browser()!.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    baseURL: origineApp,
  });
  admin = await contexte.newPage();
  admin.on("pageerror", (e) => erreurs.push(`admin: ${e.message}`));
  await connecter(admin, "admin@immipro.test", motDePasseDuBanc());
  return admin;
}

test.beforeAll(async ({ browser }, info) => {
  largeur = info.project.use.viewport!.width;
  origineApp = info.project.use.baseURL!;
  context = await browser.newContext({
    viewport: info.project.use.viewport!,
    ignoreHTTPSErrors: true,
    baseURL: origineApp,
  });
  page = await context.newPage();
  page.on("pageerror", (e) => erreurs.push(e.message));
  email = `l6-${info.project.name}-${process.hrtime.bigint()}@immipro.test`;
});

test.afterAll(async () => {
  await controlerLesFournisseurs("lue");
  await admin?.context().close();
  await context.close();
});

test("simulateur au clavier : six réponses et recommandations calculées", async () => {
  await aller("/simulateur");
  const choix = [
    "Étudier",
    "Licence",
    "Plus de 12 millions F",
    "C1 et plus",
    "Rentrée de septembre 2027",
    "Seul",
  ];
  for (const [i, nom] of choix.entries()) {
    const radio = page.getByRole("radio", { name: nom, exact: true });
    await radio.focus();
    await page.keyboard.press("Space");
    await expect(page.locator("[role=radio][aria-checked=true]")).toHaveText(new RegExp(`^${nom}`, "u"));
    await page
      .getByRole("button", { name: i === 5 ? "Voir mes destinations" : "Continuer", exact: true })
      .click();
  }
  await page.waitForURL("**/resultats");
  await expect(page.locator("h1").filter({ hasText: "destination" })).toBeVisible();
  await relever();
  preuves.push({ controle: "Six réponses au clavier et recommandations calculées", conforme: true });
});

test("inscription : téléphone normalisé, code capturé, vérification par Entrée, tableau de bord vide", async () => {
  await aller("/inscription");
  await page.getByLabel("Prénom et nom", { exact: true }).fill("Recette Telephone");
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  const telephone = page.getByLabel("Numéro Mobile Money", { exact: true });
  await telephone.fill("97000042");
  await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Créer mon compte", exact: true })).toBeDisabled();
  await telephone.fill("00 229 01 97 00 00 42");
  await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
  await page.waitForURL("**/verification");
  await attendreLHydratation(page, "form");
  await page.waitForLoadState("networkidle");
  await relever();

  const [utilisateur] = await lire<{ id: string; phone: string; emailVerified: string | null }>(
    'SELECT id, phone, "emailVerified" FROM "User" WHERE email=$1',
    [email],
  );
  expect(utilisateur).toBeDefined();
  expect(utilisateur!.phone).toBe("+2290197000042");
  expect(utilisateur!.emailVerified).toBeNull();
  compte = utilisateur!.id;

  await expect.poll(() => codeDeVerification(email), { timeout: 20_000 }).not.toBeNull();
  // Entrée valide le formulaire. Sur un exécuteur lent, si l'envoi natif a
  // devancé React (page rechargée, aucune redirection), la saisie est reprise ;
  // si le code est refusé, « Renvoyer le code » en émet un nouveau, qui
  // annule le précédent, et c'est le dernier code parti qui est saisi.
  let renvois = 0;
  for (let essai = 0; essai < 4; essai += 1) {
    await attendreLHydratation(page, "form");
    const code = codeDeVerification(email)!;
    const champ = page.getByLabel("Code de vérification", { exact: true });
    await champ.fill(code);
    await expect(champ).toHaveValue(code);
    const [reponse] = await Promise.all([
      page
        .waitForResponse(
          (r) => r.url().endsWith("/api/comptes/verification") && r.request().method() === "POST",
          { timeout: 20_000 },
        )
        .catch(() => null),
      champ.press("Enter"),
    ]);
    if (reponse?.ok()) {
      await page.waitForURL("**/tableau-de-bord", { timeout: 30_000 });
      break;
    }
    expect(essai, "vérification toujours refusée après quatre essais").toBeLessThan(3);
    if (reponse && reponse.status() === 422) {
      const deja = (journal().match(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu")) ?? []).length;
      await page.getByRole("button", { name: "Renvoyer le code", exact: true }).click();
      await expect
        .poll(() => (journal().match(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu")) ?? []).length, {
          timeout: 20_000,
        })
        .toBeGreaterThan(deja);
      renvois += 1;
    }
  }
  await page.waitForLoadState("networkidle");
  await relever();
  const [verifie] = await lire<{ emailVerified: string | null }>(
    'SELECT "emailVerified" FROM "User" WHERE id=$1',
    [compte],
  );
  expect(verifie!.emailVerified).not.toBeNull();
  // État vide du tableau de bord : aucun dossier, l'action qui ouvre le parcours.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu n'as pas encore de dossier");
  await expect(page.getByRole("link", { name: "Lancer le simulateur", exact: true })).toBeVisible();
  preuves.push({
    controle:
      "Inscription, téléphone normalisé en base, courrier capturé, vérification par Entrée, état vide du tableau de bord",
    renvoisDuCode: renvois,
    conforme: true,
  });
});

test("ouverture du dossier : brouillon, règle figée, checklist persistée sans date inventée", async () => {
  await aller("/dossiers/nouveau?destination=pays-bas");
  await page.getByRole("radio", { name: /Je ne sais pas encore/u }).click();
  await page.getByRole("button", { name: "Créer mon dossier", exact: true }).click();
  await page.waitForURL(/\/dossiers\/[a-f0-9-]+$/u);
  await page.waitForLoadState("networkidle");
  await relever();
  dossier = page.url().split("/").at(-1)!;
  const [ligne] = await lire<{ status: string; targetDate: string | null; visaRuleId: string | null }>(
    'SELECT status, "targetDate", "visaRuleId" FROM "Application" WHERE id=$1 AND "userId"=$2',
    [dossier, compte],
  );
  expect(ligne!.status).toBe("BROUILLON");
  expect(ligne!.targetDate).toBeNull();
  expect(ligne!.visaRuleId).not.toBeNull();
  const [pieces] = await lire<{ n: string }>(
    'SELECT count(*) AS n FROM "Document" WHERE "applicationId"=$1',
    [dossier],
  );
  expect(Number(pieces!.n)).toBeGreaterThan(0);
  await expect(page.getByText("Ce dossier est encore un brouillon")).toBeVisible();
  preuves.push({
    controle: "Ouverture réelle, règle figée et checklist persistée sans date inventée",
    conforme: true,
  });
});

/** L'achat scripté : checkout intercepté, notification signée réelle, attribution. */
async function acheter(id: string, achat: string, attendu: number) {
  const faux = origineDesFournisseurs();
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: '<html lang="fr"><title>Paiement synthétique local</title><p>Checkout intercepté par la recette.</p></html>',
    }),
  );
  await aller(`/paiement/recapitulatif?dossier=${id}&achat=${achat}&devise=EUR`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Payer /u }).click();
  await page.waitForURL("https://checkout.stripe.com/**");
  const session = new URL(page.url()).pathname.split("/").at(-1)!;
  // Le faux prestataire marque la session payée, signe la notification et
  // l'envoie à la vraie route du webhook, puis renvoie l'URL de retour.
  const retour = await context.request.get(`${faux}/payer/${session}`, { maxRedirects: 0 });
  expect(retour.status()).toBe(303);
  await page.unroute("https://checkout.stripe.com/**");
  await aller(retour.headers()["location"]!.replace(APP_HTTP, origineApp));
  await expect(page).toHaveURL(/\/paiement\/confirme/u);
  await expect.poll(() => credits(id), { timeout: 15_000 }).toBe(attendu);
  const [tx] = await lire<{ status: string; providerTxId: string }>(
    'SELECT status, "providerTxId" FROM "Transaction" WHERE "applicationId"=$1',
    [id],
  );
  expect(tx!.status).toBe("CONFIRMEE");
  // Rejeu de la même notification : aucune seconde attribution.
  const rejoue = await context.request.get(
    `${faux}/payer/${tx!.providerTxId.replace(/^stripe:/u, "")}`,
    { maxRedirects: 0 },
  );
  expect(rejoue.status()).toBe(303);
  expect(await credits(id)).toBe(attendu);
}

test("achat scripté : checkout intercepté, webhook signé, 30 analyses, rejeu sans double attribution", async () => {
  await acheter(dossier, "dossier", 30);
  await aller(`/dossiers/${dossier}`);
  await expect(page.getByText("Ce dossier est encore un brouillon")).toHaveCount(0);
  preuves.push({
    controle: "Checkout intercepté localement, webhook signé réel et attribution de 30 analyses",
    conforme: true,
    commercial: false,
  });
});

test("consentement, téléversement réel, antivirus, lecture scriptée mesurée et débit", async () => {
  await aller("/consentements");
  const interrupteur = page.getByRole("switch", { name: "Analyse de mes pièces d'identité", exact: true });
  await expect(interrupteur).toHaveAttribute("aria-checked", "false");
  await interrupteur.click();
  const [reponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/comptes/consentements") && r.request().method() === "PUT"),
    page.getByRole("button", { name: "Enregistrer", exact: true }).click(),
  ]);
  expect(reponse.ok()).toBe(true);

  passeport = (
    await lire<{ id: string }>('SELECT id FROM "Document" WHERE "applicationId"=$1 AND code=$2', [
      dossier,
      "passeport",
    ])
  )[0]!.id;
  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await expect(page.getByText("Analyses restantes : 30 sur 30")).toBeVisible();
  const debut = Date.now();
  await deposer(page, "L07.pdf");
  await expect(page.getByText(/est bien arrivé/u)).toBeVisible({ timeout: 20_000 });
  const analyse = await attendreLAnalyse(passeport, 1);
  const duree = Date.now() - debut;
  expect(analyse.scanState).toBe("SAINE");
  expect(analyse.inputTokens).toBe(120);
  expect(analyse.outputTokens).toBe(30);
  expect(analyse.creditConsumed).toBe(true);
  expect(await credits()).toBe(29);
  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await expect(page.getByText("Analyses restantes : 29 sur 30")).toBeVisible();
  preuves.push({
    controle: "Consentement accordé, téléversement réel, antivirus, worker et lecture IA scriptée mesurée",
    analyse,
    dureeMs: duree,
    conforme: true,
  });
});

test("coupure réseau pendant l'envoi : bandeau, fichier gardé, version envoyée au retour sans nouvel appui", async () => {
  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await nouvelleVersion(page);
  // Le stockage présigné ne répond plus : le PUT des octets échoue.
  await page.route("https://localhost:3164/**", (route) => route.abort("failed"));
  await deposer(page, "L09.pdf");
  await expect(page.getByRole("heading", { name: "Connexion perdue", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("L09.pdf", { exact: false }).first()).toBeVisible();
  expect((await versions(passeport)).length).toBe(1);
  await relever();
  // Le réseau revient : la relance automatique (S.157) envoie sans nouvel appui.
  await page.unroute("https://localhost:3164/**");
  await expect.poll(async () => (await versions(passeport)).length, { timeout: 60_000 }).toBe(2);
  const analyse = await attendreLAnalyse(passeport, 2);
  expect(analyse.creditConsumed).toBe(true);
  expect(await credits()).toBe(28);
  await aller(`/dossiers/${dossier}/pieces/${passeport}/versions`);
  await expect(page.getByRole("heading", { name: /version/iu }).first()).toBeVisible();
  preuves.push({
    controle: "Coupure du stockage pendant l'envoi : bandeau, fichier gardé, relance automatique, deux versions et historique",
    conforme: true,
  });
});

test("réponse tardive du fournisseur : la pièce attend, puis la lecture arrive et se débite une fois", async () => {
  await controlerLesFournisseurs("lente", 6_000);
  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await nouvelleVersion(page);
  await deposer(page, "L10.pdf");
  await expect(page.getByText(/est bien arrivé/u)).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await versions(passeport)).length, { timeout: 30_000 }).toBe(3);
  // Aucune analyse tant que le fournisseur n'a pas répondu ; le débit n'est pas doublé ensuite.
  expect((await analyses(passeport)).filter((a) => a.rank === 3)).toHaveLength(0);
  const analyse = await attendreLAnalyse(passeport, 3, 90_000);
  await controlerLesFournisseurs("lue");
  expect(analyse.creditConsumed).toBe(true);
  expect(await credits()).toBe(27);
  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await expect(page.getByText("Analyses restantes : 27 sur 30")).toBeVisible();
  preuves.push({ controle: "Réponse tardive : version conservée, lecture publiée à l'arrivée, un seul débit", conforme: true });
});

test("signalement d'une erreur de lecture, puis décision B-05 au bureau : vocabulaire refusé, pièce acceptée", async () => {
  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await page.getByRole("button", { name: "Signaler une erreur de lecture", exact: true }).click();
  await page.getByRole("checkbox", { name: "Autre chose", exact: true }).check();
  await page.getByRole("button", { name: "Envoyer le signalement", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await lire<{ n: string }>(
            'SELECT count(*) AS n FROM "ManualReview" r JOIN "DocumentAnalysis" a ON a.id = r."analysisId" JOIN "DocumentVersion" v ON v.id = a."versionId" WHERE v."documentId"=$1',
            [passeport],
          )
        )[0]!.n,
      { timeout: 15_000 },
    )
    .toBe("1");
  expect(await credits()).toBe(27);

  const b = await administration();
  await aller("/revue", b);
  const file = b.getByRole("listbox", { name: "Pièces en attente de relecture humaine" });
  await file.getByRole("option").filter({ hasText: "Signalé par le candidat" }).first().click();
  await b.getByLabel("Motif de l'accès et de la décision").fill("Recette L6 : signalement du candidat relu.");
  await b.getByRole("button", { name: "Conforme", exact: true }).click();
  const message = b.getByLabel("Message envoyé au candidat");
  await message.fill("Pas de doute, visa garanti après cette relecture.");
  // L'aide du champ devient une alerte ; l'annonceur de route de Next en est une autre.
  const refus = b.getByRole("alert").filter({ hasText: "ne peut pas s'afficher chez le candidat" });
  await expect(refus).toContainText("visa garanti");
  await expect(b.getByRole("button", { name: "Enregistrer et passer à la suivante", exact: true })).toBeDisabled();
  await message.fill("Ta pièce est lisible : le numéro et la date de validité correspondent à ce que tu as déclaré.");
  await expect(refus).toHaveCount(0);
  const [decision] = await Promise.all([
    b.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/admin/revue/")),
    b.getByRole("button", { name: "Enregistrer et passer à la suivante", exact: true }).click(),
  ]);
  expect(decision.ok()).toBe(true);
  const [piece] = await lire<{ status: string }>('SELECT status FROM "Document" WHERE id=$1', [passeport]);
  expect(piece!.status).toBe("CONFORME");
  const [audit] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AuditLog" WHERE action IN ('piece.consultation','revue.decision') AND "createdAt" > now() - interval '2 minutes'`,
  );
  expect(Number(audit!.n)).toBeGreaterThanOrEqual(1);

  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await expect(page.getByText("le numéro et la date de validité correspondent")).toBeVisible();
  await expect(page.getByRole("link", { name: "Revenir à la checklist", exact: true })).toBeVisible();
  preuves.push({
    controle: "Signalement sans débit, décision B-05 avec motif, vocabulaire interdit refusé, pièce conforme et message relu par le candidat",
    conforme: true,
  });
});

test("lecture sans mesure valide : aucune publication, revue humaine ouverte, quota rendu", async () => {
  const admission = (
    await lire<{ id: string }>('SELECT id FROM "Document" WHERE "applicationId"=$1 AND code=$2', [
      dossier,
      "admission",
    ])
  )[0]!.id;
  await controlerLesFournisseurs("sans_usage");
  await aller(`/dossiers/${dossier}/pieces/${admission}`);
  await deposer(page, "L12.pdf");
  await expect(page.getByText(/est bien arrivé/u)).toBeVisible({ timeout: 20_000 });
  const analyse = await attendreLAnalyse(admission, 1);
  await controlerLesFournisseurs("lue");
  expect(analyse.inputTokens).toBeNull();
  expect(analyse.creditConsumed).toBe(false);
  expect(await credits()).toBe(27);
  const [revue] = await lire<{ n: string }>(
    'SELECT count(*) AS n FROM "ManualReview" r JOIN "DocumentAnalysis" a ON a.id = r."analysisId" JOIN "DocumentVersion" v ON v.id = a."versionId" WHERE v."documentId"=$1',
    [admission],
  );
  expect(revue!.n).toBe("1");
  await aller(`/dossiers/${dossier}/pieces/${admission}`);
  await expect(page.getByText("Un opérateur regarde ta pièce", { exact: false })).toBeVisible();
  preuves.push({
    controle: "Réponse sans mesure (L2) : aucune publication, revue humaine, analyse non débitée",
    analyse,
    conforme: true,
  });
});

test("retrait du consentement : le dépôt se ferme, versions et quota inchangés", async () => {
  await aller("/consentements");
  await basculerLeConsentement(page, "false");
  // Une pièce encore sans version : le formulaire de dépôt est ouvert d'emblée.
  const fonds = (
    await lire<{ id: string }>('SELECT id FROM "Document" WHERE "applicationId"=$1 AND code=$2', [
      dossier,
      "preuve_fonds",
    ])
  )[0]!.id;
  await aller(`/dossiers/${dossier}/pieces/${fonds}`);
  await expect(
    page.getByRole("heading", { name: "Ton autorisation est nécessaire pour déposer une pièce", exact: true }),
  ).toBeVisible();
  await choisirLeFichier(page, "L13.pdf");
  await expect(page.getByRole("button", { name: "Ajouter la pièce", exact: true })).toBeDisabled();
  expect((await versions(fonds)).length).toBe(0);
  expect((await versions(passeport)).length).toBe(3);
  expect(await credits()).toBe(27);
  preuves.push({ controle: "Retrait du consentement, nouveau dépôt fermé et quota inchangé", conforme: true });
});

test("rédaction assistée : entretien, premier texte scripté débité, version, export DOCX et relecture débitée", async () => {
  await preparerLettre(dossier, email);
  await aller(`/dossiers/${dossier}/redaction`);
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Commencer l'entretien", exact: true }).click();
  await expect(page.getByLabel("Ta réponse", { exact: true })).toBeVisible();
  for (let i = 0; i < 12; i += 1) {
    await page
      .getByLabel("Ta réponse", { exact: true })
      .fill("Réponse synthétique de recette : deux phrases qui décrivent mon parcours et mon projet d'études.");
    const dernier = page.getByRole("button", { name: "Mettre en forme ma lettre", exact: true });
    if (await dernier.isVisible()) {
      await dernier.click();
      break;
    }
    await page.getByRole("button", { name: "Question suivante", exact: true }).click();
  }
  await relever();
  const avant = await credits();
  const [miseEnForme] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/redaction/")),
    page.getByRole("button", { name: "Proposer un premier texte", exact: true }).click(),
  ]);
  expect(miseEnForme.ok()).toBe(true);
  await expect(page.getByLabel("Ton texte", { exact: true })).toHaveValue(/Madame, Monsieur/u);
  await expect.poll(() => credits()).toBe(avant - 1);
  const [ligne] = await lire<{ reservedUntil: string | null }>(
    `SELECT "reservedUntil" FROM "AnalysisCredit" WHERE "applicationId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
    [dossier],
  );
  expect(ligne!.reservedUntil).toBeNull();

  await page
    .getByLabel("Ton texte", { exact: true })
    .fill(
      "Madame, Monsieur, je prépare mon dossier à partir des informations que j'ai fournies. Ce texte synthétique décrit mon parcours et mon projet d'études. Il sert à vérifier l'enregistrement, la conservation des versions et l'export local du document, puis sa relecture. Salutations respectueuses.",
    );
  await page.getByRole("button", { name: "Enregistrer une version", exact: true }).click();
  // Le lien d'export est une vraie route ; elle est appelée avec la session
  // du navigateur. Le clic lui-même passe par le repli de navigation de Next
  // vers une route d'API, dont l'événement de téléchargement n'est pas
  // observable de façon stable sous Firefox en intégration continue.
  const lienWord = page.getByRole("link", { name: "Télécharger en Word", exact: true });
  await expect(lienWord).toBeVisible();
  const export_ = await page.request.get((await lienWord.getAttribute("href"))!);
  expect(export_.status()).toBe(200);
  expect(export_.headers()["content-disposition"] ?? "").toContain("attachment");
  expect((await export_.body()).subarray(0, 2).toString()).toBe("PK");

  await page.getByRole("link", { name: "Voir l'analyse critique", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await relever();
  const [critique] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/relecture") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Lancer l'analyse", exact: true }).click(),
  ]);
  const charge = (await critique.json()) as { relue?: boolean };
  expect(critique.ok()).toBe(true);
  expect(charge.relue).toBe(true);
  await expect.poll(() => credits()).toBe(avant - 2);
  preuves.push({
    controle: "Entretien, premier texte scripté débité et soldé, version manuelle, export DOCX, relecture débitée",
    conforme: true,
    fixture: true,
  });
});

test("deux onglets : une seule relecture par version, consultation sans second appel", async () => {
  await aller(`/dossiers/${dossier}/redaction/lettre-motivation`);
  await page
    .getByLabel("Ton texte", { exact: true })
    .fill("Madame, Monsieur, voici une nouvelle version de ma lettre, écrite pour la recette du double onglet. Elle reprend mon parcours et mon projet d'études. Salutations respectueuses.");
  await page.getByRole("button", { name: "Enregistrer une version", exact: true }).click();
  await expect(page.getByText(/Version 2 en cours/u)).toBeVisible();
  const route = `/dossiers/${dossier}/redaction/lettre-motivation/relecture`;
  const avantStats = await statsDesFournisseurs();
  await controlerLesFournisseurs("lente", 5_000);
  const b = await context.newPage();
  const posts: string[] = [];
  context.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/relecture")) posts.push(r.url());
  });
  for (const p of [page, b]) {
    await p.goto(route);
    await expect(p.getByRole("button", { name: "Lancer l'analyse", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Lancer l'analyse", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyse en cours…" })).toBeVisible();
  const [reponseB] = await Promise.all([
    b.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/relecture")),
    b.getByRole("button", { name: "Lancer l'analyse", exact: true }).click(),
  ]);
  const chargeB = (await reponseB.json()) as { enCours?: boolean };
  expect(reponseB.ok()).toBe(true);
  expect(chargeB.enCours).toBe(true);
  await expect(b.getByRole("status").filter({ hasText: "déjà en cours" })).toBeVisible();
  await expect(b.getByText("Rien à reprendre sur cette version.")).toHaveCount(0);
  // Une actualisation retrouve la réservation durable, sans nouvel appel.
  await b.reload();
  await expect(b.getByRole("button", { name: "Consulter le résultat", exact: true })).toBeVisible();
  // Le fournisseur répond après son délai : le premier onglet publie le
  // résultat, le second le consulte sans rien relancer.
  await expect(page.getByRole("button", { name: "Analyse en cours…" })).toHaveCount(0, { timeout: 30_000 });
  const resultat = /Rien à reprendre sur cette version|Préciser le retour/u;
  await expect(page.getByText(resultat).first()).toBeVisible();
  await b.getByRole("button", { name: "Consulter le résultat", exact: true }).click();
  await expect(b.getByText(resultat).first()).toBeVisible();
  await controlerLesFournisseurs("lue");
  const apresStats = await statsDesFournisseurs();
  expect(posts).toHaveLength(2);
  expect(apresStats.critiques! - avantStats.critiques!).toBe(1);
  await relever(b);
  await b.close();
  preuves.push({
    controle: "Deux onglets : deux gestes, un seul appel fournisseur, réservation retrouvée après actualisation",
    conforme: true,
  });
});

test("quota épuisé et reprise gratuite : dix analyses Essentiel, reprise après illisible non débitée, dépôt sans analyse", async () => {
  test.setTimeout(420_000);
  await aller("/consentements");
  await basculerLeConsentement(page, "true");
  // Un second dossier Pays-Bas, pack Essentiel : dix analyses. Le passeport
  // scripté y reçoit « à corriger » à chaque lecture, ce qui garde ouverte
  // la version suivante jusqu'à l'épuisement.
  await aller("/dossiers/nouveau?destination=pays-bas");
  await page.getByRole("radio", { name: /Je ne sais pas encore/u }).click();
  await page.getByRole("button", { name: "Créer mon dossier", exact: true }).click();
  await page.waitForURL(/\/dossiers\/[a-f0-9-]+$/u);
  second = page.url().split("/").at(-1)!;
  expect(second).not.toBe(dossier);
  await acheter(second, "essentiel", 10);
  const piece = (
    await lire<{ id: string }>('SELECT id FROM "Document" WHERE "applicationId"=$1 AND code=$2', [
      second,
      "passeport",
    ])
  )[0]!.id;
  const fichiers = ["L03.pdf", "L05.pdf", "L06.pdf", "L16.pdf", "L17.pdf", "L19.pdf", "L20.pdf", "L22.pdf", "L23.pdf", "L24.pdf"];
  let limitesRencontrees = 0;
  await aller(`/dossiers/${second}/pieces/${piece}`);
  for (const [i, fichier] of fichiers.entries()) {
    // La dixième lecture est illisible : c'est elle qui ouvre la reprise gratuite.
    if (i === fichiers.length - 1) await controlerLesFournisseurs("illisible");
    if (i > 0) await nouvelleVersion(page);
    limitesRencontrees += await deposerEnCadence(page, fichier);
    const analyse = await attendreLAnalyse(piece, i + 1);
    // Neuf lectures débitées ; la dixième, illisible, est débitée puis rendue
    // (« Lecture automatique sans résultat ») : c'est une lecture que nous
    // n'avons pas su faire (FON-03, RG-06.5).
    expect(analyse.creditConsumed).toBe(i < 9);
    await aller(`/dossiers/${second}/pieces/${piece}`);
  }
  await controlerLesFournisseurs("lue");
  const dixieme = (await analyses(piece)).find((a) => a.rank === 10)!;
  expect(dixieme.verdict).toBe("ILLISIBLE");
  await expect.poll(() => credits(second)).toBe(1);
  const [rendue] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1 AND reason = 'ANALYSE_RENDUE'`,
    [second],
  );
  expect(rendue!.n).toBe("1");

  // Reprise après « illisible » : annoncée gratuite, lue, non débitée.
  await expect(page.getByText("Cette reprise ne consomme pas d'analyse")).toBeVisible();
  await nouvelleVersion(page);
  limitesRencontrees += await deposerEnCadence(page, "L26.pdf");
  const reprise = await attendreLAnalyse(piece, 11);
  expect(reprise.creditConsumed).toBe(false);
  expect(reprise.verdict).not.toBe("ILLISIBLE");
  expect(await credits(second)).toBe(1);

  // La dernière analyse du pack se débite normalement.
  await aller(`/dossiers/${second}/pieces/${piece}`);
  await expect(page.getByText("Analyses restantes : 1 sur 10")).toBeVisible();
  await nouvelleVersion(page);
  limitesRencontrees += await deposerEnCadence(page, "L27.pdf");
  const derniere = await attendreLAnalyse(piece, 12);
  expect(derniere.creditConsumed).toBe(true);
  expect(await credits(second)).toBe(0);

  // Quota épuisé après une lecture réussie : téléverser et conserver, sans analyse.
  await aller(`/dossiers/${second}/pieces/${piece}`);
  await nouvelleVersion(page);
  await expect(page.getByRole("heading", { name: "Tes 10 analyses du pack Essentiel sont utilisées" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ajouter des analyses", exact: true })).toBeVisible();
  limitesRencontrees += await deposerEnCadence(page, "L28.pdf", "Téléverser sans analyse");
  await expect.poll(async () => (await versions(piece)).length, { timeout: 30_000 }).toBe(13);
  await expect.poll(async () => (await versions(piece)).find((v) => v.rank === 13)?.scanState ?? null, { timeout: 60_000 }).toBe("SAINE");
  expect((await analyses(piece)).filter((a) => a.rank === 13)).toHaveLength(0);
  expect(await credits(second)).toBe(0);
  await relever();
  preuves.push({
    controle: "Dix analyses Essentiel : neuf débitées, l'illisible débitée puis rendue, reprise gratuite, dernière débitée, dépôt conservé sans analyse à quota nul",
    limitesDAppelsRencontrees: limitesRencontrees,
    conforme: true,
  });
});

test("déclaration du dépôt, conservation annoncée, dossier figé, clôture et purge annoncée", async () => {
  await preparerDossierPret(dossier, email);
  await aller(`/dossiers/${dossier}`);
  await expect(page.getByRole("heading", { name: "Ton dossier est prêt", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Déclarer mon dépôt", exact: true }).click();
  await page.waitForURL(`**/dossiers/${dossier}/depot`);
  await relever();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("As-tu déposé ta demande ?");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const bouton = page.getByRole("button", { name: "Déclarer mon dépôt", exact: true });
  await expect(bouton).toBeDisabled();
  await page.getByLabel("Quand as-tu déposé ta demande ?").fill("2020-01-01");
  await page.getByRole("checkbox", { name: /J'ai déposé ma demande/u }).check();
  await expect(bouton).toBeDisabled();
  await page.getByLabel("Quand as-tu déposé ta demande ?").fill(aujourdhui);
  await expect(bouton).toBeEnabled();
  await bouton.click();
  await page.waitForURL(`**/dossiers/${dossier}`);
  await page.waitForLoadState("networkidle");
  const [soumis] = await lire<{ status: string; depositedOn: string; retentionUntil: string | null; submittedAt: string | null }>(
    'SELECT status, to_char("depositedOn", \'YYYY-MM-DD\') AS "depositedOn", "retentionUntil", "submittedAt" FROM "Application" WHERE id=$1',
    [dossier],
  );
  expect(soumis!.status).toBe("SOUMIS");
  expect(soumis!.depositedOn).toBe(aujourdhui);
  expect(soumis!.submittedAt).not.toBeNull();
  expect(soumis!.retentionUntil).not.toBeNull();
  await expect(page.getByRole("heading", { name: "Conservation de tes pièces", exact: true })).toBeVisible();
  await expect(page.getByText(/douze mois après ton dépôt/u)).toBeVisible();
  // Figé : la route de dépôt refuse, et l'écran de déclaration le dit.
  const refus = await page.evaluate(
    async ([d, p]) =>
      (
        await fetch(`/api/dossiers/${d}/pieces/${p}/depot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom: "x.pdf", octets: 10, typeMime: "application/pdf", empreinte: "a".repeat(64) }),
        })
      ).status,
    [dossier, passeport] as const,
  );
  expect(refus).toBeGreaterThanOrEqual(400);
  expect(refus).toBeLessThan(500);
  expect((await versions(passeport)).length).toBe(3);
  await aller(`/dossiers/${dossier}/depot`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ton dépôt est déjà déclaré");

  await aller(`/dossiers/${dossier}/cloture`);
  await expect(page.getByRole("button", { name: "Clôturer mon dossier", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "J'ai obtenu mon visa", exact: true }).click();
  await page.getByRole("button", { name: "Clôturer mon dossier", exact: true }).click();
  await page.waitForURL("**/tableau-de-bord");
  await page.waitForLoadState("networkidle");
  const [clos] = await lire<{ status: string; issue: string | null; purgeDueAt: string | null }>(
    'SELECT status, issue, "purgeDueAt" FROM "Application" WHERE id=$1',
    [dossier],
  );
  expect(clos!.status).toBe("ISSUE_DECLAREE");
  // « J'ai obtenu mon visa » est stocké comme issue acceptée.
  expect(clos!.issue).toBe("ACCEPTE");
  expect(clos!.purgeDueAt).not.toBeNull();
  await aller(`/dossiers/${dossier}/archive`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await aller(`/dossiers/${dossier}/depot`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ce dossier est clôturé");
  preuves.push({
    controle: "Déclaration du dépôt datée, conservation douze mois annoncée, dépôt refusé sur dossier figé, clôture avec issue et purge annoncée",
    conforme: true,
    fixture: true,
  });
});

test("bilan du profil : aucun défilement horizontal, aucune erreur JavaScript", async ({}, info) => {
  const debordements = mesures.filter((m) => m.contenu > m.largeur);
  // WebKit remonte comme erreur de page un préchargement Next (`_rsc`)
  // interrompu par la navigation suivante ; Chromium et Firefox le voient
  // comme une requête annulée. Relevé à part, jamais compté comme erreur.
  const prechargementInterrompu = /[?&]_rsc=.* due to access control checks\.$/u;
  const prechargementsInterrompus = erreurs.filter((e) => prechargementInterrompu.test(e));
  const erreursReelles = erreurs.filter((e) => !prechargementInterrompu.test(e));
  mkdirSync(info.outputDir, { recursive: true });
  const releve = info.outputPath("preuves.json");
  writeFileSync(
    releve,
    JSON.stringify(
      {
        simulation: true,
        navigateur: info.project.name,
        largeur,
        resultats: preuves,
        pages: mesures,
        debordements,
        erreursJS: erreursReelles,
        prechargementsInterrompusWebKit: prechargementsInterrompus,
      },
      null,
      2,
    ),
  );
  await info.attach("preuves", { path: releve, contentType: "application/json" });
  expect(debordements).toEqual([]);
  expect(erreursReelles).toEqual([]);
});
