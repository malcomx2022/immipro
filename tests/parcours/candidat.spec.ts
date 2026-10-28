/**
 * Recette L6 — parcours candidat et back-office, sur le banc `--parcours`.
 *
 * Un candidat synthétique par profil navigateur, créé par l'inscription
 * réelle, puis les gestes de la matrice dans l'ordre où il les ferait :
 * simulateur, profils contrastés (WF-03), inscription et code, ouverture,
 * achat scripté, consentement, dépôt et lecture, coupure réseau, réponse
 * tardive, lecture sans mesure et revue humaine, signalement et décision
 * B-05, retrait du consentement, rédaction assistée, double onglet, quota
 * épuisé et reprise gratuite, échéancier, fuseau, pièce périmée,
 * déclaration du dépôt, clôture, purge effective et portabilité ; puis, au
 * bureau, B-04, B-08, B-03, B-06, veille et textes juridiques,
 * publication par un second lecteur et arbitrage
 * (R-O03), et suppression du compte pendant une panne du stockage, puis
 * reprise (R-O05).
 *
 * Chaque geste est contrôlé par son effet en base, jamais par un seul
 * HTTP 200. IA et paiement sont les réponses scriptées locales du banc :
 * rien ici ne qualifie un fournisseur réel (L5) ni un encaissement (M.C).
 * Les écrans du back-office sont tenus pour le bureau : ils sont joués dans
 * un contexte de 1 280 px quel que soit le profil.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { suivreErreurs } from "./erreurs-navigateur";
import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
} from "../../src/domain/copy/vocabulaire-interdit";
import { CONSEQUENCE_ETAT, LIBELLE_ETAT } from "../../src/domain/backoffice/consultants";
import { EDITORIAL } from "../../src/lib/contenu/destinations";
import { jourCivil } from "../../src/domain/format/fuseau";
import {
  codeDeVerification,
  controlerLesFournisseurs,
  echoirLaPurge,
  journal,
  lire,
  motDePasseDuBanc,
  origineDesFournisseurs,
  perimerLaPiece,
  preparerDossierPret,
  preparerLettre,
  purgerALaMain,
  statsDesFournisseurs,
  suppressionsDuStockage,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

const PIECE = (nom: string) => resolve("tests/banc-ia/pieces", nom);
const MOT_DE_PASSE = "RecetteL6Synthetique42";
const APP_HTTP = "http://localhost:3162";

let context: BrowserContext;
let page: Page;
let admin: Page | null = null;
let veilleur: Page | null = null;
let largeur = 0;
let email = "";
let compte = "";
let dossier = "";
let passeport = "";
let second = "";
let origineApp = "";
const suivis: ReturnType<typeof suivreErreurs>[] = [];
let moteur = "";
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
      const hydrate = await p.evaluate((sel) => {
        const el = document.querySelector(sel);
        return (
          !!el &&
          Object.keys(el).some(
            (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"),
          )
        );
      }, selecteur);
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
  const interrupteur = p.getByRole("switch", {
    name: "Analyse de mes pièces d'identité",
    exact: true,
  });
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
    p.waitForResponse(
      (r) => r.url().endsWith("/api/comptes/consentements") && r.request().method() === "PUT",
    ),
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

/**
 * L'écran de connexion, sans navigation de document de trop (S.197).
 *
 * Sous Firefox, un `goto` vers /connexion a été aussitôt doublé d'une
 * seconde navigation de document (304) qui ne s'achevait jamais, et la
 * saisie l'attendait sans fin (S.193, trace de #314). Déjà sur l'écran —
 * après une connexion refusée —, on ne le recharge donc pas. Sinon on y va
 * par `aller`, qui reprend une navigation interrompue et attend que le
 * formulaire soit hydraté avant de le remplir.
 */
async function ouvrirLaConnexion(p: Page, suite?: string) {
  const ici = /^https?:/u.test(p.url()) ? new URL(p.url()) : null;
  if (!suite && ici?.pathname === "/connexion") {
    await attendreLHydratation(p, "form");
    return;
  }
  await aller(suite ? `/connexion?suite=${encodeURIComponent(suite)}` : "/connexion", p);
  await attendreLHydratation(p, "form");
}

/**
 * Se connecter, et arriver où l'écran l'a promis : la suite portée par
 * l'adresse quand l'écran en a une — une page protégée y a renvoyé —,
 * sinon le tableau de bord.
 */
async function connecter(p: Page, adresse: string, motDePasse: string) {
  await ouvrirLaConnexion(p);
  const suite = new URL(p.url()).searchParams.get("suite") ?? "/tableau-de-bord";
  await p.getByLabel("Adresse email", { exact: true }).fill(adresse);
  await p.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await p.getByLabel("Mot de passe", { exact: true }).press("Enter");
  await p.waitForURL((u) => u.pathname === suite);
}

/** Un opérateur, au bureau, dans son propre contexte, arrivé sur `suite`. */
async function operateur(adresse: string, suite: string): Promise<Page> {
  const contexte = await context.browser()!.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    baseURL: origineApp,
  });
  const p = await contexte.newPage();
  suivis.push(suivreErreurs(p, moteur, origineApp));
  await ouvrirLaConnexion(p, suite);
  await p.getByLabel("Adresse email", { exact: true }).fill(adresse);
  await p.getByLabel("Mot de passe", { exact: true }).fill(motDePasseDuBanc());
  await p.getByLabel("Mot de passe", { exact: true }).press("Enter");
  await p.waitForURL(`**${suite}`);
  return p;
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
  suivis.push(suivreErreurs(admin, moteur, origineApp));
  await connecter(admin, "admin@immipro.test", motDePasseDuBanc());
  return admin;
}

test.beforeAll(async ({ browser }, info) => {
  moteur = info.project.use.browserName!;
  largeur = info.project.use.viewport!.width;
  origineApp = info.project.use.baseURL!;
  context = await browser.newContext({
    viewport: info.project.use.viewport!,
    ignoreHTTPSErrors: true,
    baseURL: origineApp,
  });
  page = await context.newPage();
  suivis.push(suivreErreurs(page, moteur, origineApp));
  email = `l6-${info.project.name}-${process.hrtime.bigint()}@immipro.test`;
});

test.afterAll(async () => {
  await controlerLesFournisseurs("lue");
  await suppressionsDuStockage("acceptees");
  await admin?.context().close();
  await veilleur?.context().close();
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
    await expect(page.locator("[role=radio][aria-checked=true]")).toHaveText(
      new RegExp(`^${nom}`, "u"),
    );
    await page
      .getByRole("button", { name: i === 5 ? "Voir mes destinations" : "Continuer", exact: true })
      .click();
  }
  await page.waitForURL("**/resultats");
  await expect(page.locator("h1").filter({ hasText: "destination" })).toBeVisible();
  await relever();
  preuves.push({
    controle: "Six réponses au clavier et recommandations calculées",
    conforme: true,
  });
});

/**
 * WF-03 — profils contrastés (S.188). Le premier geste ne jouait qu'un jeu
 * de réponses : rien ne montrait que le classement suit le profil. Trois
 * profils, dans un contexte vierge pour ne pas toucher à la simulation du
 * candidat : chacun son classement, ses écarts chiffrés, sa source datée
 * (INV-8), et aucun mot de la note de dossier ni promesse (INV-1, INV-2).
 */
test("WF-03 : trois profils contrastés, trois classements sourcés, écarts chiffrés", async () => {
  const profils = [
    ["Étudier", "Licence", "Plus de 12 millions F", "C1 et plus", "Rentrée de septembre 2027", "Seul"],
    ["Travailler", "Master", "4 à 8 millions F", "B2 — avancé", "En 2028", "Avec mon conjoint"],
    ["Étudier", "Baccalauréat", "Moins de 4 millions F", "Débutant", "Je ne sais pas encore", "Avec mes enfants"],
  ];
  const vierge = await context.browser()!.newContext({
    viewport: { width: largeur, height: largeur === 390 ? 844 : 1000 },
    ignoreHTTPSErrors: true,
    baseURL: origineApp,
  });
  const p = await vierge.newPage();
  suivis.push(suivreErreurs(p, moteur, origineApp));
  const lus: { titre: string; retenues: string[]; ecartees: string[] }[] = [];
  try {
    await aller("/simulateur", p);
    for (const [rang, reponses] of profils.entries()) {
      // Le profil suivant part des résultats, comme le candidat : par
      // « Modifier mes réponses », sans doubler une navigation de Next
      // que Firefox n'a pas encore achevée.
      if (rang > 0) {
        await p.getByRole("link", { name: "Modifier mes réponses", exact: true }).click();
        await p.waitForURL("**/simulateur");
      }
      await expect(p.getByRole("heading", { name: "Quel est ton objectif ?" })).toBeVisible();
      for (const [i, nom] of reponses.entries()) {
        await p.getByRole("radio", { name: nom, exact: true }).click();
        await p
          .getByRole("button", { name: i === 5 ? "Voir mes destinations" : "Continuer", exact: true })
          .click();
      }
      await p.waitForURL("**/resultats");
      const titre = p.getByRole("heading", { level: 1 });
      await expect(titre).not.toHaveText("Tes destinations");
      await expect(p.getByText(/Information vérifiée le/u).first()).toBeVisible();
      const lu = {
        titre: (await titre.innerText()).trim(),
        retenues: await p.locator("main .grid h2").allInnerTexts(),
        ecartees: await p
          .locator("main section")
          .filter({ has: p.getByRole("heading", { name: /^(Destinations écartées|Ce qu'il manque)/u }) })
          .locator("li")
          .allInnerTexts(),
      };
      // Une destination écartée dit pourquoi, puis ce qui manque (RG-01.3).
      for (const ecartee of lu.ecartees) expect(ecartee.trim().split("\n").length).toBeGreaterThanOrEqual(4);
      expect(lu.retenues.length + lu.ecartees.length).toBeGreaterThan(0);
      const texte = await p.locator("main").innerText();
      expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT), texte).toEqual([]);
      lus.push(lu);
      await relever(p);
    }
  } finally {
    await vierge.close();
  }
  const signatures = lus.map((l) => JSON.stringify(l));
  expect(new Set(signatures).size).toBe(profils.length);
  // Le profil sans budget ni langue n'a pas le classement du profil le mieux doté.
  expect(lus[2]!.retenues).not.toEqual(lus[0]!.retenues);
  // L'écart franchissable est chiffré : budget ou niveau de langue manquant.
  expect(lus[2]!.ecartees.some((e) => /\d/u.test(e.trim().split("\n").at(-1)!))).toBe(true);
  preuves.push({ controle: "WF-03 : trois profils, trois classements sourcés", classements: lus, conforme: true });
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
        .poll(
          () =>
            (journal().match(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu")) ?? [])
              .length,
          {
            timeout: 20_000,
          },
        )
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

/**
 * WF-03, C-03 (S.194) : le comparateur montre exactement les règles qu'un
 * candidat peut lire, et les valeurs du référentiel. Les règles attendues
 * sont relues en base, en lecture seule, sous les conditions de la
 * requête candidate (publiée, hors `SECONDAIRE` — INV-4 —, relecture non
 * échue, en vigueur) : une colonne de trop ou de moins se voit.
 */
test("WF-03 comparateur : colonnes des règles visibles, valeurs du référentiel, source datée, fiche et ouverture", async () => {
  type Regle = {
    cle: string;
    rules: {
      preuve_fonds: { valeur: number; devise: string; periodicite: string } | null;
      apres_etudes: { duree_mois: number | null } | null;
      delai_traitement_jours: { min: number; max: number } | null;
      langues_acceptees: string[];
      niveau_langue_min: string | null;
      frais_dossier: { valeur: number; devise: string } | null;
      travail_autorise: { permis_employeur_requis: boolean };
    };
    hote: string;
    verifie: string;
  };
  const visibles = (
    await lire<Regle>(
      `SELECT "countryCode" || '/' || "visaType" AS cle, rules,
              regexp_replace(substring("sourceUrl" from '^https?://([^/]+)'), '^www\\.', '') AS hote,
              to_char("verifiedAt", 'YYYY-MM-DD') AS verifie
         FROM "VisaRule"
        WHERE status = 'PUBLISHED' AND "sourceTier" <> 'SECONDAIRE'
          AND "nextReviewAt" >= (now() AT TIME ZONE 'UTC')::date
          AND "effectiveFrom" <= (now() AT TIME ZONE 'UTC')::date
          AND ("effectiveTo" IS NULL OR "effectiveTo" >= (now() AT TIME ZONE 'UTC')::date)`,
    )
  ).filter((r) => EDITORIAL[r.cle]);
  expect(visibles.length).toBeGreaterThan(1);
  const parSlug = new Map(visibles.map((r) => [`/fiches/${EDITORIAL[r.cle]!.slug}`, r]));

  // Le candidat y arrive par l'état vide de son tableau de bord.
  await page.getByRole("link", { name: "Parcourir les destinations", exact: true }).click();
  await page.waitForURL("**/comparateur");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Comparer ${visibles.length} destinations`,
  );
  await attendreLHydratation(page, "table a");
  await relever();
  if (largeur < 768) {
    await expect(page.getByText("Fais défiler le tableau vers la droite.")).toBeVisible();
  }

  const tableau = page.getByRole("table", {
    name: "Exigences publiées de trois destinations, critère par critère",
  });
  const colonnes = await tableau
    .locator("thead th a")
    .evaluateAll((liens) => liens.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  expect([...colonnes].sort()).toEqual([...parSlug.keys()].sort());

  const lignes = await tableau.locator("tbody tr").evaluateAll((trs) =>
    Object.fromEntries(
      trs.map((tr) => [
        tr.querySelector("th")!.textContent!.trim(),
        [...tr.querySelectorAll("td")].map((td) => td.textContent!.trim()),
      ]),
    ),
  );
  const nombre = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
  const attendu: Record<string, (r: Regle["rules"]) => string> = {
    "Ressources à prouver": (r) =>
      r.preuve_fonds
        ? `${nombre(r.preuve_fonds.valeur)} ${r.preuve_fonds.devise}${
            r.preuve_fonds.periodicite === "mensuel" ? " / mois" : " / an"
          }`
        : "Non exigé",
    "Après diplôme": (r) =>
      r.apres_etudes?.duree_mois ? `${r.apres_etudes.duree_mois} mois` : "Aucun dispositif",
    "Délai d'instruction": (r) =>
      r.delai_traitement_jours
        ? `${r.delai_traitement_jours.min} à ${r.delai_traitement_jours.max} jours`
        : "Non communiqué",
    "Langue du cursus": (r) =>
      r.niveau_langue_min
        ? `${r.langues_acceptees.join(", ")} — ${r.niveau_langue_min}`
        : r.langues_acceptees.join(", "),
    "Frais de demande": (r) =>
      r.frais_dossier ? `${nombre(r.frais_dossier.valeur)} ${r.frais_dossier.devise}` : "Aucun",
  };
  for (const [critere, valeur] of Object.entries(attendu)) {
    expect(lignes[critere], critere).toEqual(colonnes.map((c) => valeur(parSlug.get(c)!.rules)));
  }
  // Les deux lignes calculées ailleurs (conversion, travail) sont remplies.
  for (const critere of ["Coût 1re année", "Travail étudiant"]) {
    expect(lignes[critere]).toHaveLength(colonnes.length);
    for (const cellule of lignes[critere]!) expect(cellule).not.toBe("");
  }

  // RG-03.3 : l'encadré n'apparaît que si le contraste existe.
  const permis = visibles.some((r) => r.rules.travail_autorise.permis_employeur_requis);
  await expect(page.getByRole("heading", { name: "Le travail étudiant se lit de près" })).toHaveCount(
    permis ? 1 : 0,
  );
  // INV-8 : la vérification la plus ancienne et toutes les sources. INV-1.
  const [a, m, j] = visibles.map((r) => r.verifie).sort()[0]!.split("-");
  const mention = page.getByText(/^Information vérifiée le /u);
  await expect(mention).toContainText(`${j}/${m}/${a}`);
  for (const hote of new Set(visibles.map((r) => r.hote))) await expect(mention).toContainText(hote);
  await expect(mention).toContainText("il ne prédit aucune décision");
  const texte = await page.locator("main").innerText();
  expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT), texte).toEqual([]);

  // Une colonne mène à sa fiche ; le retour garde le tableau.
  const premiere = parSlug.get(colonnes[0]!)!;
  await tableau.locator("thead th a").first().click();
  await page.waitForURL(`**${colonnes[0]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(EDITORIAL[premiere.cle]!.pays);
  await page.goBack();
  await page.waitForURL("**/comparateur");
  await expect(tableau.locator("thead th a")).toHaveCount(visibles.length);

  // L'action du pied de page ouvre le parcours suivant, sans rien créer.
  await page.getByRole("link", { name: "Ouvrir un dossier", exact: true }).click();
  await page.waitForURL("**/dossiers/nouveau");
  const [dossiers] = await lire<{ n: string }>(
    'SELECT count(*) AS n FROM "Application" WHERE "userId"=$1',
    [compte],
  );
  expect(Number(dossiers!.n)).toBe(0);
  preuves.push({
    controle:
      "Comparateur : colonnes égales aux règles lisibles en base, cinq critères égaux au référentiel, source datée, fiche, ouverture",
    colonnes: colonnes.length,
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
  const [ligne] = await lire<{
    status: string;
    targetDate: string | null;
    visaRuleId: string | null;
  }>('SELECT status, "targetDate", "visaRuleId" FROM "Application" WHERE id=$1 AND "userId"=$2', [
    dossier,
    compte,
  ]);
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
  const interrupteur = page.getByRole("switch", {
    name: "Analyse de mes pièces d'identité",
    exact: true,
  });
  await expect(interrupteur).toHaveAttribute("aria-checked", "false");
  await interrupteur.click();
  const [reponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/comptes/consentements") && r.request().method() === "PUT",
    ),
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
  preuves.push({
    controle: "Réponse tardive : version conservée, lecture publiée à l'arrivée, un seul débit",
    conforme: true,
  });
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
  await expect(
    b.getByRole("button", { name: "Enregistrer et passer à la suivante", exact: true }),
  ).toBeDisabled();
  await message.fill(
    "Ta pièce est lisible : le numéro et la date de validité correspondent à ce que tu as déclaré.",
  );
  await expect(refus).toHaveCount(0);
  const [decision] = await Promise.all([
    b.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/api/admin/revue/"),
    ),
    b.getByRole("button", { name: "Enregistrer et passer à la suivante", exact: true }).click(),
  ]);
  expect(decision.ok()).toBe(true);
  const [piece] = await lire<{ status: string }>('SELECT status FROM "Document" WHERE id=$1', [
    passeport,
  ]);
  expect(piece!.status).toBe("CONFORME");
  const [audit] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AuditLog" WHERE action IN ('piece.consultation','revue.decision') AND "createdAt" > now() - interval '2 minutes'`,
  );
  expect(Number(audit!.n)).toBeGreaterThanOrEqual(1);

  await aller(`/dossiers/${dossier}/pieces/${passeport}`);
  await expect(page.getByText("le numéro et la date de validité correspondent")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Revenir à la checklist", exact: true }),
  ).toBeVisible();
  preuves.push({
    controle: "Signalement sans débit, décision B-05 avec motif, vocabulaire interdit refusé, pièce conforme et message relu par le candidat",
    conforme: true,
  });
});

test("back-office : coûts IA et paiements sans débordement sur la largeur du profil", async ({}, info) => {
  const b = await administration();
  await b.setViewportSize({ width: largeur, height: 1000 });
  try {
    for (const route of ["/couts-ia", "/paiements"]) {
      await aller(route, b);
      const mesure = await b.evaluate(() => ({
        largeur: innerWidth,
        contenu: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("main *")]
          .map((e) => ({
            balise: e.tagName,
            classes: e.className,
            droite: e.getBoundingClientRect().right,
          }))
          .filter((e) => e.droite > innerWidth),
      }));
      const fichier = info.outputPath(`largeur-${route.slice(1)}.json`);
      mkdirSync(info.outputDir, { recursive: true });
      writeFileSync(fichier, JSON.stringify(mesure));
      await info.attach(`largeur-${route.slice(1)}`, {
        path: fichier,
        contentType: "application/json",
      });
      expect(mesure.contenu, route).toBe(largeur);
    }
  } finally {
    await b.setViewportSize({ width: 1280, height: 900 });
  }
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
    page.getByRole("heading", {
      name: "Ton autorisation est nécessaire pour déposer une pièce",
      exact: true,
    }),
  ).toBeVisible();
  await choisirLeFichier(page, "L13.pdf");
  await expect(page.getByRole("button", { name: "Ajouter la pièce", exact: true })).toBeDisabled();
  expect((await versions(fonds)).length).toBe(0);
  expect((await versions(passeport)).length).toBe(3);
  expect(await credits()).toBe(27);
  preuves.push({
    controle: "Retrait du consentement, nouveau dépôt fermé et quota inchangé",
    conforme: true,
  });
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
      .fill(
        "Réponse synthétique de recette : deux phrases qui décrivent mon parcours et mon projet d'études.",
      );
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

  const texteManuel =
    "Madame, Monsieur, je prépare mon dossier à partir des informations que j'ai fournies. Ce texte synthétique décrit mon parcours et mon projet d'études. Il sert à vérifier l'enregistrement, la conservation des versions et l'export local du document, puis sa relecture. Salutations respectueuses.";
  const textePoursuivi = `${texteManuel}\nAjout personnel pendant une réponse lente : cette saisie doit rester.`;
  const cheminVersion = new URL(page.url()).pathname;
  const routeVersion = `**/api${cheminVersion}/version`;
  let reponsePrete!: () => void;
  let liberer!: () => void;
  const recue = new Promise<void>((ok) => {
    reponsePrete = ok;
  });
  const attente = new Promise<void>((ok) => {
    liberer = ok;
  });
  await page.route(routeVersion, async (route) => {
    const reponse = await route.fetch();
    reponsePrete();
    await attente;
    await route.fulfill({ response: reponse });
  });
  await page.getByLabel("Ton texte", { exact: true }).fill(texteManuel);
  try {
    await page.getByRole("button", { name: "Enregistrer une version", exact: true }).click();
    await recue;
    // Le vrai serveur a enregistré, mais sa réponse n'est pas encore livrée.
    await page.getByLabel("Ton texte", { exact: true }).fill(textePoursuivi);
    liberer();
    await expect(page.getByText(/Version 2 en cours/u)).toBeVisible();
    await expect(page.getByLabel("Ton texte", { exact: true })).toHaveValue(textePoursuivi);
  } finally {
    liberer();
    await page.unroute(routeVersion);
  }
  // Les derniers ajouts peuvent à leur tour être enregistrés et exportés.
  await page.getByRole("button", { name: "Enregistrer une version", exact: true }).click();
  await expect(page.getByText(/Version 3 en cours/u)).toBeVisible();
  const [conservee] = await lire<{ body: string }>(
    'SELECT v.body FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE d."applicationId"=$1 AND d.code=$2 ORDER BY v.rank DESC LIMIT 1',
    [dossier, "lettre_motivation"],
  );
  expect(conservee!.body).toBe(textePoursuivi);
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
    .fill(
      "Madame, Monsieur, voici une nouvelle version de ma lettre, écrite pour la recette du double onglet. Elle reprend mon parcours et mon projet d'études. Salutations respectueuses.",
    );
  await page.getByRole("button", { name: "Enregistrer une version", exact: true }).click();
  await expect(page.getByText(/Version 4 en cours/u)).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Analyse en cours…" })).toHaveCount(0, {
    timeout: 30_000,
  });
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
  const fichiers = [
    "L03.pdf",
    "L05.pdf",
    "L06.pdf",
    "L16.pdf",
    "L17.pdf",
    "L19.pdf",
    "L20.pdf",
    "L22.pdf",
    "L23.pdf",
    "L24.pdf",
  ];
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
  await expect(
    page.getByRole("heading", { name: "Tes 10 analyses du pack Essentiel sont utilisées" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ajouter des analyses", exact: true })).toBeVisible();
  limitesRencontrees += await deposerEnCadence(page, "L28.pdf", "Téléverser sans analyse");
  await expect.poll(async () => (await versions(piece)).length, { timeout: 30_000 }).toBe(13);
  await expect
    .poll(async () => (await versions(piece)).find((v) => v.rank === 13)?.scanState ?? null, {
      timeout: 60_000,
    })
    .toBe("SAINE");
  expect((await analyses(piece)).filter((a) => a.rank === 13)).toHaveLength(0);
  expect(await credits(second)).toBe(0);
  await relever();
  preuves.push({
    controle: "Dix analyses Essentiel : neuf débitées, l'illisible débitée puis rendue, reprise gratuite, dernière débitée, dépôt conservé sans analyse à quota nul",
    limitesDAppelsRencontrees: limitesRencontrees,
    conforme: true,
  });
});

/** Le jour civil d'un fuseau, `AAAA-MM-JJ`, comme l'écrit le serveur. */
const jourDans = (fuseau: string, instant = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const decaler = (jour: string, jours: number) =>
  new Date(Date.parse(`${jour}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);

const VERDICT_INTENABLE = /^(La date de dépôt est passée|Une pièce obligatoire ne peut plus arriver à temps|\d+ pièces obligatoires ne peuvent plus arriver à temps)$/u;

/**
 * R-C08, WF-09 — l'échéancier en navigateur (S.188). Le dossier a été ouvert
 * « Je ne sais pas encore » : le candidat fixe sa date depuis l'échéancier,
 * puis la rapproche jusqu'à rendre le calendrier intenable, et reprend la
 * date proposée. Chaque geste est lu en base : la date cible et les
 * échéances recalculées depuis la règle figée (INV-3).
 */
/**
 * WF-07, C-09 et B-05 (S.195) : la relecture humaine de la complétude
 * (avis L.A du 03/10/2026). Le candidat demande, avec ce qui lui semble
 * inexact ; une seule demande en attente par dossier ; le relecteur répond
 * sous le vocabulaire de l'écran candidat ; la réponse part dans les
 * alertes, au journal, et sur l'écran de la complétude.
 */
test("WF-07 relecture de la complétude : demande unique, réponse refusée puis relue, alerte et journal", async () => {
  const demandes = () =>
    lire<{ id: string; status: string; explanation: string; answer: string | null; resolvedBy: string | null }>(
      `SELECT id, status, explanation, answer, "resolvedBy" FROM "CompletenessReviewRequest"
        WHERE "applicationId"=$1 ORDER BY "createdAt"`,
      [dossier],
    );
  expect(await demandes()).toHaveLength(0);

  // Par la vue « Complétude » de la checklist.
  await aller(`/dossiers/${dossier}`);
  await page
    .getByRole("navigation", { name: "Vues du dossier" })
    .getByRole("link", { name: "Complétude", exact: true })
    .click();
  await page.waitForURL(`**/dossiers/${dossier}/completude`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Complétude de ton dossier");
  await attendreLHydratation(page, "section[aria-labelledby=relecture-completude] button");
  const ecran = await page.locator("main").innerText();
  expect(verifierTexte(ecran, INTERDITS_ECRAN_CANDIDAT), ecran).toEqual([]);

  await page.getByRole("button", { name: "Demander une relecture", exact: true }).click();
  const champ = page.getByLabel("Qu'est-ce qui te semble inexact ?", { exact: true });
  const envoyer = page.getByRole("button", { name: "Envoyer la demande", exact: true });
  // Moins de vingt caractères : l'envoi reste fermé et l'aide dit quoi écrire.
  await champ.fill("Le passeport");
  await expect(envoyer).toBeDisabled();
  // L'aide du champ, et la raison que le bouton fermé annonce.
  await expect(page.getByText(/une pièce comptée comme manquante/u)).toHaveCount(2);
  const explication = "Recette S.195 : mon passeport est déposé et conforme, il me semble compté à part.";
  await champ.fill(explication);
  const [demande] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith(`/completude/relecture`),
    ),
    envoyer.click(),
  ]);
  expect(demande.ok()).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Ta demande de relecture est enregistrée" })).toBeVisible();
  const [enAttente] = await demandes();
  expect(enAttente).toMatchObject({ status: "EN_ATTENTE", explanation: explication, answer: null });

  // Une seule demande en attente par dossier : l'écran ne la repropose plus,
  // et la route la refuse sans rien écrire.
  await aller(`/dossiers/${dossier}/completude`);
  await expect(page.getByRole("button", { name: "Demander une relecture", exact: true })).toHaveCount(0);
  const doublon = await page.request.post(`/api/dossiers/${dossier}/completude/relecture`, {
    data: { explication: "Recette S.195 : seconde demande pendant que la première attend." },
  });
  expect(doublon.status()).toBeGreaterThanOrEqual(400);
  expect(await demandes()).toHaveLength(1);

  // B-05 : le relecteur répond. Une note ou une promesse est refusée par la
  // route, rien n'est écrit ; une réponse relue part au candidat.
  const b = await administration();
  await aller("/revue", b);
  const carte = b.locator("article").filter({ hasText: email }).filter({ hasText: explication });
  await expect(carte).toHaveCount(1);
  const reponse = carte.getByLabel("Réponse au candidat", { exact: true });
  const repondre = carte.getByRole("button", { name: "Répondre", exact: true });
  await reponse.fill("Relu : tes chances d'obtention sont bonnes, ton score est complet.");
  const [refusee] = await Promise.all([
    b.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/admin/completude/relectures/")),
    repondre.click(),
  ]);
  expect(refusee.ok()).toBe(false);
  await expect(carte.getByText(/cette réponse est lue par le candidat/u)).toBeVisible();
  expect((await demandes())[0]!.status).toBe("EN_ATTENTE");
  const texteRelu =
    "Relu : ton passeport est bien compté parmi les pièces conformes. Il reste la preuve de ressources à déposer.";
  await reponse.fill(texteRelu);
  const [acceptee] = await Promise.all([
    b.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/admin/completude/relectures/")),
    repondre.click(),
  ]);
  expect(acceptee.ok()).toBe(true);
  await expect(carte).toHaveCount(0);

  const [traitee] = await demandes();
  expect(traitee).toMatchObject({ status: "TRAITEE", answer: texteRelu });
  expect(traitee!.resolvedBy).not.toBeNull();
  const [alerte] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "Notification" WHERE "applicationId"=$1 AND title=$2 AND body=$3`,
    [dossier, "Relecture de ta complétude", texteRelu],
  );
  expect(Number(alerte!.n)).toBe(1);
  const [trace] = await lire<{ reason: string }>(
    `SELECT reason FROM "AuditLog" WHERE action='dossier.completude.relecture' AND target=$1
      ORDER BY "createdAt" DESC LIMIT 1`,
    [`application:${dossier}`],
  );
  expect(trace!.reason).toBe(texteRelu);

  // Le candidat lit la réponse sur l'écran, et peut redemander.
  await aller(`/dossiers/${dossier}/completude`);
  await expect(page.getByText("Réponse à ta dernière demande")).toBeVisible();
  await expect(page.getByText(texteRelu)).toBeVisible();
  await expect(page.getByRole("button", { name: "Demander une relecture", exact: true })).toBeVisible();
  await aller("/notifications");
  await expect(page.getByText("Relecture de ta complétude").first()).toBeVisible();
  preuves.push({
    controle:
      "Relecture de complétude : demande refusée sous vingt caractères, une seule en attente, réponse promettant refusée par la route, réponse relue en alerte, au journal et à l'écran",
    conforme: true,
  });
});

test("échéancier : date fixée depuis l'écran, calendrier intenable, date proposée reprise", async () => {
  const echeances = () =>
    lire<{ code: string; dueAt: string }>(
      `SELECT code, to_char("dueAt", 'YYYY-MM-DD') AS "dueAt" FROM "Deadline" WHERE "applicationId"=$1 ORDER BY code`,
      [dossier],
    );
  const cible = async () =>
    (
      await lire<{ t: string | null }>(
        `SELECT to_char("targetDate", 'YYYY-MM-DD') AS t FROM "Application" WHERE id=$1`,
        [dossier],
      )
    )[0]!.t;
  expect(await cible()).toBeNull();
  expect(await echeances()).toHaveLength(0);

  await aller(`/dossiers/${dossier}`);
  await page.getByRole("link", { name: "Échéancier", exact: true }).click();
  await page.waitForURL(`**/dossiers/${dossier}/echeancier`);
  await relever();
  const champ = page.getByLabel(/^(Nouvelle d|D)ate de départ visée$/u);
  await expect(champ).toBeVisible();
  const aujourdhui = (await champ.getAttribute("min")) ?? "";
  expect(aujourdhui).toBe(jourDans("Africa/Porto-Novo"));

  // Une date lointaine : le calendrier se pose et tient.
  const lointaine = decaler(aujourdhui, 400);
  await champ.fill(lointaine);
  await champ.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Échéancier");
  await expect.poll(cible).toBe(lointaine);
  const posees = await echeances();
  expect(posees.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { level: 2, name: VERDICT_INTENABLE })).toHaveCount(0);
  await relever();

  // Une date trop proche : le dépôt tomberait derrière nous.
  const proche = decaler(aujourdhui, 10);
  const nouvelle = page.getByLabel("Nouvelle date de départ visée");
  await nouvelle.fill(proche);
  await page.getByRole("button", { name: "Replanifier", exact: true }).click();
  await expect.poll(cible).toBe(proche);
  const verdict = page.getByRole("heading", { level: 2, name: VERDICT_INTENABLE });
  await expect(verdict).toBeVisible();
  await expect(page.getByText(/la première date de départ compatible avec les délais connus est le/u)).toBeVisible();
  const rapprochees = await echeances();
  expect(rapprochees.map((e) => e.code)).toEqual(posees.map((e) => e.code));
  expect(rapprochees).not.toEqual(posees);

  // La saisie reste après la réponse (S.182) ; au retour sur l'écran, le
  // champ part de la date proposée : la reprendre suffit.
  await expect(nouvelle).toHaveValue(proche);
  await aller(`/dossiers/${dossier}/echeancier`);
  await expect(verdict).toBeVisible();
  await expect(nouvelle).not.toHaveValue(proche);
  const proposee = await nouvelle.inputValue();
  expect(proposee > proche).toBe(true);
  await page.getByRole("button", { name: "Replanifier", exact: true }).click();
  await expect.poll(cible).toBe(proposee);
  await expect(verdict).toHaveCount(0);
  await relever();
  preuves.push({
    controle: "R-C08 échéancier : date fixée depuis l'écran, échéances posées puis recalculées, intenable signalé, date proposée reprise",
    dates: { lointaine, proche, proposee },
    conforme: true,
  });
});

/**
 * R-K06, RG-09.4 — le changement de fuseau (S.188). Les rappels suivent la
 * ville choisie par le candidat, et la phrase qui les annonce la nomme ;
 * l'aujourd'hui du dépôt se lit dans ce fuseau (S.89). Le reste de l'écran
 * date à l'heure de Cotonou, quel que soit le fuseau du navigateur : un
 * second navigateur réglé sur Kiritimati (UTC+14) lit le même échéancier.
 */
test("fuseau : rappels réglés sur Toronto, échéancier identique depuis un navigateur à UTC+14", async () => {
  await aller(`/dossiers/${dossier}/echeancier`);
  await page.getByRole("link", { name: "Modifier mes rappels", exact: true }).click();
  await page.waitForURL("**/compte/rappels**");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mes rappels d'échéance");
  await relever();
  const phrase = page.getByRole("heading", { name: "Ce qui partira" }).locator("..");
  await expect(phrase).toContainText("heure de Cotonou, Porto-Novo");
  await page.getByLabel("Mon fuseau horaire").selectOption("America/Toronto");
  await page.getByRole("radio", { name: /^Quatorze jours avant/u }).click();
  await expect(phrase).toContainText("heure de Montréal, Toronto");
  await expect(phrase).toContainText("moins de quatorze jours");
  await page.getByRole("button", { name: "Enregistrer mes réglages", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(/Tes réglages sont enregistrés/u);
  const [reglages] = await lire<{ fuseau: string; jours: number }>(
    'SELECT "reminderTimeZone" AS fuseau, "reminderLeadDays" AS jours FROM "User" WHERE id=$1',
    [compte],
  );
  expect(reglages).toEqual({ fuseau: "America/Toronto", jours: 14 });

  await page.getByRole("link", { name: "Revenir à l'échéancier", exact: true }).click();
  await page.waitForURL(`**/dossiers/${dossier}/echeancier`);
  await expect(page.getByText(/heure de Montréal, Toronto/u)).toBeVisible();

  // Le fuseau du navigateur ne déplace aucune date affichée.
  const ailleurs = await context.browser()!.newContext({
    viewport: { width: largeur, height: largeur === 390 ? 844 : 1000 },
    ignoreHTTPSErrors: true,
    baseURL: origineApp,
    timezoneId: "Pacific/Kiritimati",
    storageState: await context.storageState(),
  });
  try {
    const loin = await ailleurs.newPage();
    suivis.push(suivreErreurs(loin, moteur, origineApp));
    await aller(`/dossiers/${dossier}/echeancier`, loin);
    await aller(`/dossiers/${dossier}/echeancier`);
    await attendreLHydratation(loin, "main");
    await attendreLHydratation(page, "main");
    expect(await loin.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
      "Pacific/Kiritimati",
    );
    expect(await loin.locator("main").innerText()).toBe(await page.locator("main").innerText());
    expect(await loin.getByLabel("Nouvelle date de départ visée").getAttribute("min")).toBe(
      jourDans("Africa/Porto-Novo"),
    );
  } finally {
    await ailleurs.close();
  }
  preuves.push({
    controle: "R-K06 fuseau : Toronto et quatorze jours enregistrés, phrase recalculée, échéancier identique depuis un navigateur à UTC+14",
    conforme: true,
  });
});

/**
 * R-K06, RG-06.6/RG-07.4 — la pièce périmée (S.188). Le dossier est prêt ;
 * trois mois passent sur le justificatif de ressources (précondition
 * explicite). L'écran le déclasse sans attendre la passe de nuit : la pièce
 * se lit expirée, la prochaine action dit de la remplacer, le dépôt ne se
 * déclare plus. Le remède est le geste du candidat : une version neuve,
 * qui repose sa péremption.
 */
test("pièce périmée : déclassée à l'affichage, dépôt refusé, version neuve qui repose la péremption", async () => {
  const [fonds] = await lire<{ id: string; label: string }>(
    'SELECT id, label FROM "Document" WHERE "applicationId"=$1 AND code=$2',
    [dossier, "preuve_fonds"],
  );
  const peremption = async () =>
    (
      await lire<{ jusquau: string | null }>(
        `SELECT to_char("expiresAt", 'YYYY-MM-DD') AS jusquau FROM "Document" WHERE id=$1`,
        [fonds!.id],
      )
    )[0]!.jusquau;
  // Le justificatif est déposé et lu : sa péremption se pose au dépôt.
  await aller(`/dossiers/${dossier}/pieces/${fonds!.id}`);
  const rang = (await versions(fonds!.id)).length + 1;
  await deposer(page, "L13.pdf");
  await attendreLAnalyse(fonds!.id, rang);
  expect((await peremption())! > jourDans("UTC")).toBe(true);

  await preparerDossierPret(dossier, email);
  await aller(`/dossiers/${dossier}`);
  await expect(page.getByRole("heading", { name: "Ton dossier est prêt", exact: true })).toBeVisible();
  await perimerLaPiece(dossier, email, "preuve_fonds");
  await aller(`/dossiers/${dossier}`);
  await relever();
  await expect(page.getByText(/Prochaine action : Remplacer ton justificatif/u)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ton dossier est prêt", exact: true })).toHaveCount(0);
  const veille = decaler(jourDans("UTC"), -1);
  const refus = await page.evaluate(
    async ([d, jour]) => {
      const r = await fetch(`/api/dossiers/${d}/depot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposeLe: jour }),
      });
      return { statut: r.status, corps: await r.text() };
    },
    [dossier, veille] as const,
  );
  expect(refus.statut).toBeGreaterThanOrEqual(400);
  expect(refus.statut).toBeLessThan(500);
  expect(refus.corps).toContain("n'est plus valable depuis le");
  const [toujours] = await lire<{ status: string }>('SELECT status FROM "Application" WHERE id=$1', [
    dossier,
  ]);
  expect(toujours!.status).not.toBe("SOUMIS");

  // Le remède : une version neuve, qui repose la péremption.
  await aller(`/dossiers/${dossier}/pieces/${fonds!.id}`);
  await relever();
  await expect(page.getByRole("heading", { level: 2, name: /la validité est dépassée$/u })).toBeVisible();
  await expect(page.getByText(/Cette pièce est conforme/u)).toHaveCount(0);
  await nouvelleVersion(page);
  await deposer(page, "L29.pdf");
  // La lecture arrive avant la suite : elle récrit l'état de la pièce.
  await attendreLAnalyse(fonds!.id, rang + 1);
  expect((await peremption())! > jourDans("UTC")).toBe(true);
  preuves.push({
    controle: "R-K06 péremption : pièce périmée déclassée à l'affichage, prêt retiré, dépôt refusé avec la pièce nommée, version neuve et péremption reposée",
    conforme: true,
    fixture: true,
  });
});

test("déclaration du dépôt, conservation annoncée, dossier figé, clôture et purge annoncée", async () => {
  await preparerDossierPret(dossier, email);
  await aller(`/dossiers/${dossier}`);
  await expect(
    page.getByRole("heading", { name: "Ton dossier est prêt", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Déclarer mon dépôt", exact: true }).click();
  await page.waitForURL(`**/dossiers/${dossier}/depot`);
  await relever();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("As-tu déposé ta demande ?");
  // « Aujourd'hui » est celui du candidat, dans son fuseau (S.89), que
  // l'écran pose en `max` : la date UTC du banc le précède d'un jour entre
  // minuit UTC et minuit local, et tombait avant l'ouverture du dossier.
  const champDate = page.getByLabel("Quand as-tu déposé ta demande ?");
  const aujourdhui = (await champDate.getAttribute("max")) ?? "";
  expect(aujourdhui).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  // Depuis le geste du fuseau, ce jour est celui de Toronto (RG-09.4, S.89).
  expect([jourDans("America/Toronto"), jourDans("America/Toronto", new Date(Date.now() - 60_000))]).toContain(aujourdhui);
  const bouton = page.getByRole("button", { name: "Déclarer mon dépôt", exact: true });
  await expect(bouton).toBeDisabled();
  await champDate.fill("2020-01-01");
  await page.getByRole("checkbox", { name: /J'ai déposé ma demande/u }).check();
  await expect(bouton).toBeDisabled();
  await champDate.fill(aujourdhui);
  await expect(bouton).toBeEnabled();
  await bouton.click();
  await page.waitForURL(`**/dossiers/${dossier}`);
  await page.waitForLoadState("networkidle");
  const [soumis] = await lire<{
    status: string;
    depositedOn: string;
    retentionUntil: string | null;
    submittedAt: string | null;
  }>(
    'SELECT status, to_char("depositedOn", \'YYYY-MM-DD\') AS "depositedOn", "retentionUntil", "submittedAt" FROM "Application" WHERE id=$1',
    [dossier],
  );
  expect(soumis!.status).toBe("SOUMIS");
  expect(soumis!.depositedOn).toBe(aujourdhui);
  expect(soumis!.submittedAt).not.toBeNull();
  expect(soumis!.retentionUntil).not.toBeNull();
  await expect(
    page.getByRole("heading", { name: "Conservation de tes pièces", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/douze mois après ton dépôt/u)).toBeVisible();
  // Figé : la route de dépôt refuse, et l'écran de déclaration le dit.
  const refus = await page.evaluate(
    async ([d, p]) =>
      (
        await fetch(`/api/dossiers/${d}/pieces/${p}/depot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom: "x.pdf",
            octets: 10,
            typeMime: "application/pdf",
            empreinte: "a".repeat(64),
          }),
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
  await expect(
    page.getByRole("button", { name: "Clôturer mon dossier", exact: true }),
  ).toBeDisabled();
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

/**
 * R-C09, RG-10.9 — la purge effective (S.188). La clôture l'annonçait ;
 * l'échéance est ramenée à la minute passée (précondition explicite), puis
 * la purge de rétention est lancée à la main par un opérateur nommé, avec
 * la commande d'exploitation (S.152). L'archive que le candidat consulte
 * le dit, pièce par pièce, et plus rien ne s'y télécharge.
 */
test("purge effective : échéance atteinte, purge lancée à la main, archive sans fichier", async () => {
  await aller(`/dossiers/${dossier}/archive`);
  const telechargements = page.getByRole("button", { name: "Télécharger le fichier", exact: true });
  await expect(telechargements.first()).toBeVisible();
  const [avant] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "DocumentVersion" v JOIN "Document" d ON d.id = v."documentId"
     WHERE d."applicationId"=$1 AND v."objectKey" IS NOT NULL AND v."purgedAt" IS NULL`,
    [dossier],
  );
  expect(Number(avant!.n)).toBeGreaterThan(0);

  await echoirLaPurge(dossier, email);
  const par = `Recette S.188 ${moteur}-${largeur}`;
  const passe = purgerALaMain(par);
  expect(passe.code, passe.sortie).toBe(0);
  expect(passe.sortie).toMatch(/Dossiers purgés : [1-9]/u);

  const [purge] = await lire<{ purgedAt: string | null; restantes: string }>(
    `SELECT a."purgedAt",
       (SELECT count(*) FROM "DocumentVersion" v JOIN "Document" d ON d.id = v."documentId"
        WHERE d."applicationId" = a.id AND v."purgedAt" IS NULL AND v."objectKey" IS NOT NULL) AS restantes
     FROM "Application" a WHERE a.id=$1`,
    [dossier],
  );
  expect(purge!.purgedAt).not.toBeNull();
  expect(purge!.restantes).toBe("0");
  const [journalise] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AuditLog" WHERE "actorId"=$1 AND target LIKE $2`,
    [`console:${par}`, `%${dossier}%`],
  );
  expect(Number(journalise!.n)).toBeGreaterThan(0);

  await aller(`/dossiers/${dossier}/archive`);
  await relever();
  await expect(telechargements).toHaveCount(0);
  await expect(page.getByText(/Supprimée le/u).first()).toBeVisible();
  // L'autre dossier du compte n'est pas touché.
  const [autre] = await lire<{ purgedAt: string | null }>(
    'SELECT "purgedAt" FROM "Application" WHERE id=$1',
    [second],
  );
  expect(autre!.purgedAt).toBeNull();
  preuves.push({
    controle: "R-C09 purge effective : échéance atteinte, purge à la main sous le nom de l'opérateur, versions vidées, archive sans fichier",
    conforme: true,
    fixture: true,
  });
});

/**
 * R-C09, WF-02 — la portabilité (S.188). Le fichier que le candidat
 * télécharge depuis « Mes données » : ses deux dossiers, le purgé compris,
 * et rien d'un autre compte. L'export est journalisé à son nom.
 */
test("portabilité : export de mes données, deux dossiers, aucun autre compte, export journalisé", async ({}, info) => {
  await aller("/compte/mes-donnees");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mes données");
  await relever();
  const [telechargement] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger mes données", exact: true }).click(),
  ]);
  await expect(page.getByText("Le fichier est dans tes téléchargements.")).toBeVisible();
  expect(telechargement.suggestedFilename()).toMatch(/\.json$/u);
  const fichier = info.outputPath("mes-donnees.json");
  await telechargement.saveAs(fichier);
  const brut = readFileSync(fichier, "utf8");
  const donnees = JSON.parse(brut) as {
    dossiers: { statut: string; issue: string | null; departVise: string | null }[];
  };
  // Les deux dossiers du compte, le purgé compris, tels qu'ils sont en base.
  expect(donnees.dossiers).toHaveLength(2);
  const [clos] = await lire<{ t: string }>(
    `SELECT to_char("targetDate", 'YYYY-MM-DD') AS t FROM "Application" WHERE id=$1`,
    [dossier],
  );
  expect(donnees.dossiers).toContainEqual(
    expect.objectContaining({ statut: "ARCHIVE", issue: "ACCEPTE", departVise: clos!.t }),
  );
  // Une seule adresse dans le fichier : celle du titulaire.
  expect([...new Set(brut.match(/[\w.+-]+@[\w.-]+\.\w+/gu) ?? [])]).toEqual([email]);
  expect(brut).not.toContain("objectKey");
  const [exporte] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AuditLog" WHERE action = 'compte.export' AND target = $1`,
    [`user:${compte}`],
  );
  expect(exporte!.n).toBe("1");
  preuves.push({ controle: "R-C09 portabilité : export JSON de deux dossiers, sans autre compte, journalisé", conforme: true });
});

/**
 * R-I04, WF-15 — B-04 au-delà du tableau (S.188) : le rapprochement lancé
 * à la main rend son compte rendu, et le grand livre exporté porte le
 * paiement scripté du candidat. Ni remboursement ni avoir : R-O04 attend
 * un rail réel (M.C).
 */
test("B-04 : rapprochement lancé à la main, grand livre exporté avec le paiement du candidat", async ({}, info) => {
  const b = await administration();
  await aller("/paiements", b);
  await b.getByRole("button", { name: "Lancer le rapprochement", exact: true }).click();
  await expect(b.getByRole("button", { name: "Lancer le rapprochement", exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(b.getByRole("status").or(b.getByRole("alert")).first()).toBeVisible();
  const [telechargement] = await Promise.all([
    b.waitForEvent("download"),
    b.getByRole("button", { name: "Exporter le grand livre", exact: true }).click(),
  ]);
  const fichier = info.outputPath("grand-livre.csv");
  await telechargement.saveAs(fichier);
  const livre = readFileSync(fichier, "utf8");
  const [tx] = await lire<{ reference: string; recu: Date }>(
    'SELECT reference, "createdAt" AS recu FROM "Transaction" WHERE "applicationId"=$1',
    [dossier],
  );
  /*
    Le livre exporté est celui de la journée affichée, au jour civil de
    Cotonou (S.198). Une exécution qui passe minuit entre l'achat et
    l'export ne trouve pas le paiement dans le livre du jour, et c'est
    juste : il appartient à la veille. Le test lit donc le jour du
    paiement au lieu de le supposer.
  */
  const journee = /^\uFEFF?Grand livre ImmiPro\r?\nJournée;(\d{4}-\d{2}-\d{2})/u.exec(livre)?.[1];
  expect(journee, "première ligne « Journée » du grand livre").toBeDefined();
  const jourDuPaiement = jourCivil(new Date(tx!.recu));
  if (jourDuPaiement === journee) {
    expect(livre).toContain(tx!.reference);
  } else {
    // Hors du livre du jour, et présent dans celui de son propre jour.
    expect(livre).not.toContain(tx!.reference);
    const veille = await b.request.get(`/api/admin/paiements/export?jour=${jourDuPaiement}`);
    expect(veille.ok()).toBe(true);
    const livreDuPaiement = await veille.text();
    expect(livreDuPaiement).toContain(`Journée;${jourDuPaiement}`);
    expect(livreDuPaiement).toContain(tx!.reference);
  }
  preuves.push({
    controle: "R-I04 B-04 : rapprochement à la main et grand livre exporté au jour civil du paiement",
    journee,
    jourDuPaiement,
    conforme: true,
  });
});

/**
 * R-I04, B-08 — un article, du brouillon à la publication (S.188). Un
 * brouillon qui promet s'enregistre ; sa publication est refusée par
 * l'écran et par la route. La négation passe, la source et la date de
 * vérification sont exigées (INV-8), la page publique les porte, et le
 * retrait la ferme. Un article neuf par profil : le référentiel éditorial
 * de la graine n'est pas touché.
 */
test("B-08 : brouillon qui promet enregistré, publication refusée, négation publiée, retrait", async () => {
  const b = await administration();
  const titre = `Recette S.188 ${moteur} ${largeur} ${process.hrtime.bigint()}`;
  await aller("/contenus", b);
  await b.getByRole("button", { name: "Nouveau document", exact: true }).click();
  await b.getByRole("radio", { name: "Article", exact: true }).click();
  await b.getByLabel("Titre", { exact: true }).fill(titre);
  await b.getByLabel("Rubrique", { exact: true }).fill("Recette");
  await b.getByLabel("Auteur", { exact: true }).fill("Équipe ImmiPro");
  await b.getByRole("button", { name: "Créer le brouillon", exact: true }).click();
  await b.waitForURL(/\/contenus\/[a-f0-9-]+$/u);
  const id = b.url().split("/").at(-1)!;
  const etat = async () =>
    (
      await lire<{ status: string; standfirst: string; slug: string }>(
        'SELECT status, standfirst, slug FROM "EditorialDoc" WHERE id=$1',
        [id],
      )
    )[0]!;

  // Le brouillon s'enregistre, même s'il promet ; la publication, non.
  await b.getByLabel("Chapeau", { exact: true }).fill("Visa garanti en trois semaines pour tous les profils.");
  await b.getByLabel("Texte", { exact: true }).first().fill("Les étapes de la demande, dans l'ordre.");
  await b.getByLabel("Source", { exact: true }).fill("ind.nl");
  await b.getByLabel("Vérifiée le", { exact: true }).fill(jourDans("Africa/Porto-Novo"));
  await b.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(b.getByText("Enregistré.")).toBeVisible();
  expect((await etat()).standfirst).toContain("Visa garanti");
  await b.getByLabel("Motif", { exact: true }).fill("Recette S.188 — publication");
  await expect(b.getByRole("button", { name: "Publier", exact: true })).toBeDisabled();
  const refus = await b.evaluate(
    async (d) =>
      (
        await fetch(`/api/admin/contenus/${d}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publier", motif: "Recette S.188 — contournement" }),
        })
      ).status,
    id,
  );
  expect(refus).toBeGreaterThanOrEqual(400);
  expect(refus).toBeLessThan(500);
  expect((await etat()).status).toBe("BROUILLON");

  // La négation n'est pas une promesse : elle se publie, avec sa source.
  await b
    .getByLabel("Chapeau", { exact: true })
    .fill("ImmiPro ne garantit pas l'obtention du visa. Cet article décrit les étapes de la demande.");
  await b.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(b.getByText("Enregistré.")).toBeVisible();
  await b.getByLabel("Motif", { exact: true }).fill("Recette S.188 — publication");
  await b.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(b.getByText(/^Publié — \/articles\//u)).toBeVisible();
  const publie = await etat();
  expect(publie.status).toBe("PUBLIE");
  await aller(`/articles/${publie.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titre);
  await expect(page.getByText(/Information vérifiée le/u).first()).toBeVisible();
  await relever();

  await b.getByLabel("Motif", { exact: true }).fill("Recette S.188 — retrait");
  await b.getByRole("button", { name: "Retirer de la publication", exact: true }).click();
  await expect(b.getByText("Retiré de la publication.")).toBeVisible();
  expect((await etat()).status).not.toBe("PUBLIE");
  const ferme = await page.request.get(`/articles/${publie.slug}`);
  expect(ferme.status()).toBe(404);
  preuves.push({ controle: "R-I04 B-08 : brouillon qui promet enregistré, publication refusée (écran et route), négation publiée sourcée, retrait", conforme: true });
});

/**
 * R-I04, B-03 — suspendre puis rétablir un compte (S.191). Le motif court
 * est refusé à l'écran (O-4, dix caractères) ; la suspension ferme les
 * sessions ouvertes et la connexion est refusée ; le rétablissement rend
 * l'accès, et les deux gestes sont au journal avec leur motif. Le compte
 * est celui du candidat synthétique, reconnecté à la fin pour R-O05.
 */
test("B-03 : motif court refusé, suspension qui ferme les sessions, rétablissement", async () => {
  const b = await administration();
  const etat = async () =>
    (
      await lire<{ suspendu: boolean; sessions: string }>(
        `SELECT "suspendedAt" IS NOT NULL AS suspendu,
           (SELECT count(*) FROM "Session" s WHERE s."userId" = u.id) AS sessions
         FROM "User" u WHERE u.id = $1`,
        [compte],
      )
    )[0]!;
  expect((await etat()).suspendu).toBe(false);
  expect(Number((await etat()).sessions)).toBeGreaterThan(0);

  await aller("/utilisateurs", b);
  await b.getByRole("searchbox", { name: "Rechercher" }).fill(email);
  await b.getByRole("option").filter({ hasText: email }).click();
  const suspendre = b.getByRole("button", { name: "Suspendre le compte", exact: true });
  await b.getByLabel("Motif de la décision", { exact: true }).fill("abus");
  await expect(suspendre).toBeDisabled();
  await expect(b.getByText(/en 10 caractères au moins/u).first()).toBeVisible();
  await b.getByLabel("Motif de la décision", { exact: true }).fill(`Recette S.191 ${moteur}-${largeur} : suspension éprouvée`);
  await suspendre.click();
  await expect(b.getByRole("status")).toHaveText(/Compte suspendu/u);
  await expect.poll(async () => (await etat()).suspendu).toBe(true);
  expect((await etat()).sessions).toBe("0");

  // La session du candidat est fermée, et la connexion est refusée.
  await page.goto(`/dossiers/${dossier}`);
  await page.waitForURL(/\/connexion/u);
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
  // Le refus est attendu au réseau, pas sur « une alerte » : l'annonceur de
  // route de Next en est une dès l'arrivée, et le second envoi, parti avant
  // la réponse, serait ignoré par l'écran encore en cours d'envoi (S.197).
  const [refus] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/comptes/session") && r.request().method() === "POST",
    ),
    page.getByLabel("Mot de passe", { exact: true }).press("Enter"),
  ]);
  expect(refus.status()).toBe(401);
  await expect(page.getByText("Email ou mot de passe incorrect")).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/u);

  await b.getByLabel("Motif de la décision", { exact: true }).fill(`Recette S.191 ${moteur}-${largeur} : rétablissement`);
  await b.getByRole("button", { name: "Rétablir le compte", exact: true }).click();
  await expect(b.getByRole("status")).toHaveText(/Compte rétabli/u);
  await expect.poll(async () => (await etat()).suspendu).toBe(false);
  await connecter(page, email, MOT_DE_PASSE);

  const [journalise] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AuditLog" WHERE target = $1 AND reason LIKE $2`,
    [`user:${compte}`, `Recette S.191 ${moteur}-${largeur}%`],
  );
  expect(journalise!.n).toBe("2");
  preuves.push({ controle: "R-I04 B-03 : motif court refusé, suspension qui ferme les sessions, connexion refusée, rétablissement journalisé", conforme: true });
});

/**
 * R-I04, B-06 — habiliter un consultant sur une destination, puis retirer
 * l'habilitation (S.191, RG-12.1). Titre et motif sont exigés avant le
 * clic ; la ligne retirée reste, datée. Suisse, pour ne pas toucher à
 * l'habilitation néerlandaise de la graine.
 */
/**
 * B-09, WF-15 et RG-12.1 (S.196) : un consultant se crée à l'écran. La
 * fiche n'a aucune habilitation, donc aucun annuaire ne la sert, et
 * l'écran le dit. Une fiche nouvelle par profil : le banc les garde toutes.
 */
test("B-09 : consultant créé à l'écran, refus dits avant l'envoi, sans habilitation, journal", async () => {
  const b = await administration();
  const nom = `Consultant ${email.split("@")[0]}`;
  const motif = `Tableau de l'ordre consulté — recette S.196 ${moteur}-${largeur}`;
  await aller("/habilitations", b);
  const formulaire = b.getByRole("region", { name: "Ajouter un consultant" });
  const creer = () => formulaire.getByRole("button", { name: "Créer le consultant", exact: true });
  await expect(creer()).toBeDisabled();

  await formulaire.getByLabel("Nom", { exact: true }).fill(nom);
  await formulaire.getByLabel("Cabinet", { exact: true }).fill("Cabinet de recette");
  await formulaire.getByLabel("Ville", { exact: true }).fill("Cotonou");
  await formulaire.getByLabel("Qualification", { exact: true }).fill("Avocat, 7 ans");
  await formulaire.getByLabel("Langues de travail", { exact: true }).fill("Français, fon ; français");
  // Un délai qui n'est pas un nombre d'heures se dit sous son champ.
  const delai = formulaire.getByLabel("Délai de réponse, en heures", { exact: true });
  await delai.fill("48h");
  await expect(formulaire.getByText(/en heures, un nombre entier entre 1 et 336/u).first()).toBeVisible();
  await expect(creer()).toBeDisabled();
  await delai.fill("48");
  // Le motif manque encore : le bouton reste fermé et le dit.
  await expect(creer()).toBeDisabled();
  await expect(formulaire.getByText("Indique ce que tu as consulté avant de créer la fiche.")).toBeVisible();
  await formulaire.getByLabel("Motif de la création", { exact: true }).fill(motif);
  const [creation] = await Promise.all([
    b.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/admin/consultants")),
    creer().click(),
  ]);
  expect(creation.ok()).toBe(true);
  await expect(formulaire.getByRole("status")).toContainText("Il reste invisible dans l'annuaire");
  await expect(formulaire.getByLabel("Nom", { exact: true })).toHaveValue("");

  const [cree] = await lire<{
    id: string;
    firm: string;
    city: string;
    qualification: string;
    languages: string[];
    responseHours: number;
    active: boolean;
    habilitations: string;
  }>(
    `SELECT c.id, c.firm, c.city, c.qualification, c.languages, c."responseHours", c.active,
            (SELECT count(*) FROM "Accreditation" a WHERE a."consultantId" = c.id) AS habilitations
       FROM "Consultant" c WHERE c.name = $1`,
    [nom],
  );
  expect(cree).toMatchObject({
    firm: "Cabinet de recette",
    city: "Cotonou",
    qualification: "Avocat, 7 ans",
    languages: ["Français", "fon"],
    responseHours: 48,
    active: true,
    habilitations: "0",
  });
  const [trace] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "AuditLog" WHERE action = 'consultant.creation' AND target = $1 AND reason = $2`,
    [`consultant:${cree!.id}`, motif],
  );
  expect(Number(trace!.n)).toBe(1);

  // La fiche paraît, sans habilitation, et l'écran dit qu'aucun annuaire ne la sert.
  const fiche = b.locator("article").filter({ hasText: nom });
  await expect(fiche).toHaveCount(1);
  await expect(fiche.getByText(LIBELLE_ETAT.SANS_HABILITATION)).toBeVisible();
  await expect(fiche.getByText(CONSEQUENCE_ETAT.SANS_HABILITATION)).toBeVisible();
  preuves.push({
    controle: "B-09 : consultant créé à l'écran, refus avant l'envoi, fiche sans habilitation et journalisée",
    conforme: true,
  });
});

test("B-06 : titre et motif exigés, habilitation vérifiée puis retirée, journal", async () => {
  const b = await administration();
  const habilitation = async () =>
    (
      await lire<{ titre: string; retiree: boolean }>(
        `SELECT a.title AS titre, a."revokedAt" IS NOT NULL AS retiree FROM "Accreditation" a
         JOIN "Consultant" c ON c.id = a."consultantId"
         WHERE c.name = 'Marieke Visser' AND a."countryCode" = 'CH'`,
      )
    )[0] ?? null;
  const motif = `Registre vaudois consulté — recette S.191 ${moteur}-${largeur}`;
  await aller("/habilitations", b);
  const fiche = b.locator("article").filter({ hasText: "Marieke Visser" });
  const habiliter = fiche.getByRole("button", { name: "Habiliter", exact: true });
  await expect(habiliter).toBeDisabled();
  await expect(fiche.getByText("Indique le titre vérifié.").first()).toBeVisible();
  await fiche.getByLabel("Juridiction").selectOption("CH");
  await fiche.getByLabel("Titre vérifié").fill("Avocate au barreau de Lausanne");
  await expect(habiliter).toBeDisabled();
  await fiche.getByLabel("Motif").fill(motif);
  await habiliter.click();
  await expect.poll(habilitation).toEqual({ titre: "Avocate au barreau de Lausanne", retiree: false });

  const ligne = fiche.locator("li").filter({ hasText: "Avocate au barreau de Lausanne" });
  await expect(ligne.getByRole("button", { name: "Retirer", exact: true })).toBeVisible();
  await fiche.getByLabel("Motif").fill(motif);
  await ligne.getByRole("button", { name: "Retirer", exact: true }).click();
  await expect.poll(async () => (await habilitation())?.retiree).toBe(true);
  await expect(ligne.getByText(/retiré le/u)).toBeVisible();
  const [journalise] = await lire<{ actions: string }>(
    `SELECT string_agg(action, ',' ORDER BY "createdAt") AS actions FROM "AuditLog" WHERE reason = $1`,
    [motif],
  );
  expect(journalise!.actions).toBe("consultant.habiliter,consultant.retirer");
  preuves.push({ controle: "R-I04 B-06 : titre et motif exigés, habilitation puis retrait datés et journalisés", conforme: true });
});

/**
 * R-I04, WF-14 étape 2 — un relevé de veille (S.191). Un écart sans note
 * ne se consigne pas ; avec sa note, il s'écrit au relevé et s'affiche sur
 * la fiche, sans déplacer les dates de vérification. « À jour » n'est pas
 * joué : il sortirait la fiche suisse de la file pour les profils suivants.
 */
test("veille : écart sans note refusé, écart noté consigné sans toucher aux dates", async () => {
  const b = await administration();
  const fiche = async () =>
    (
      await lire<{ verifie: string; source: string }>(
        `SELECT to_char("verifiedAt", 'YYYY-MM-DD') AS verifie, "sourceUrl" AS source
         FROM "VisaRule" WHERE "countryCode" = 'CH' AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1`,
      )
    )[0]!;
  const avant = await fiche();
  const note = `Montant mensuel modifié sur la source — recette S.191 ${moteur}-${largeur}`;
  const releve = async () =>
    (
      await lire<{ n: string }>(
        `SELECT count(*) AS n FROM "SourceCheck" WHERE "sourceUrl" = $1 AND difference = $2`,
        [avant.source, note],
      )
    )[0]!.n;
  await aller("/veille", b);
  await b.getByRole("button", { name: "Toutes", exact: true }).click();
  await b.getByRole("option").filter({ hasText: "CH" }).first().click();
  await b.getByRole("radio", { name: /^À arbitrer/u }).click();
  const consigner = b.getByRole("button", { name: "Consigner ce relevé", exact: true });
  await expect(consigner).toBeDisabled();
  await expect(b.getByText(/le relevé se relit dans six mois/u).first()).toBeVisible();
  await b.getByLabel("Ce qui a changé sur la source").fill(note);
  await consigner.click();
  await expect.poll(releve).toBe("1");
  await expect(b.getByText(note).first()).toBeVisible();
  expect((await fiche()).verifie).toBe(avant.verifie);
  preuves.push({ controle: "R-I04 veille : écart sans note refusé, écart noté consigné et affiché, dates inchangées", conforme: true });
});

/**
 * R-I04, textes juridiques (S.191). Une variable mal formée est refusée à
 * l'écran et par la route, sans rien écrire ; la validation d'un texte
 * exige l'attestation de relecture. Rien n'est publié : la relecture d'un
 * juriste ne se simule pas (Q.A).
 */
test("textes juridiques : variable refusée à l'écran et par la route, validation sans attestation impossible", async () => {
  const b = await administration();
  const valeur = async () =>
    (
      await lire<{ value: string }>(`SELECT value FROM "LegalVariable" WHERE key = 'email_contact'`)
    )[0]?.value ?? null;
  const avant = await valeur();
  await aller("/textes-juridiques", b);
  const champ = b.getByLabel("Adresse électronique de contact", { exact: true });
  await champ.fill("pas-une-adresse");
  await expect(b.getByText("n'est pas une adresse électronique", { exact: false }).first()).toBeVisible();
  await expect(b.getByRole("button", { name: /^Enregistrer/u })).toBeDisabled();
  const refus = await b.evaluate(async () => {
    const r = await fetch("/api/admin/textes-juridiques/variables", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valeurs: { email_contact: "pas-une-adresse" } }),
    });
    return r.status;
  });
  expect(refus).toBeGreaterThanOrEqual(400);
  expect(refus).toBeLessThan(500);
  expect(await valeur()).toBe(avant);
  await champ.fill(avant ?? "");
  const valider = b.getByRole("button", { name: "Valider et publier", exact: true }).first();
  await expect(valider).toBeDisabled();
  preuves.push({ controle: "R-I04 textes juridiques : variable refusée (écran et route), rien d'écrit, validation fermée sans attestation", conforme: true });
});

/**
 * R-O03 — publication par un second lecteur, divergence, arbitrage (WF-14 §4,
 * WF-11, T-02). Un second dossier, sur la règle NL « emploi », pour ne rien
 * changer à celle des gestes précédents ni aux profils suivants : chaque
 * profil abaisse d'une unité un seuil bloquant de la version en vigueur —
 * un assouplissement, donc une alerte et une proposition de migration sans
 * pause du dossier. La graine donne à cette règle une fin prévue
 * (`effectiveTo` au 31/12/2026) : c'est le cas que C-7 empêchait de
 * remplacer (S.184), et T-02 doit l'annoncer au candidat. B-02 n'édite que les textes destinés au candidat : la
 * valeur passe par la seule route qui l'écrit, depuis la session du
 * navigateur de l'administrateur, comme le ferait un outil d'exploitation.
 */
const SEUIL = "salaire_min_moins_30_ans";
let emploi = "";

test("R-O03 : rédacteur refusé, relecture du veilleur, publication, divergence et arbitrage du candidat", async () => {
  await aller("/dossiers/nouveau?destination=pays-bas-emploi");
  // O-1 : la procédure ouverte est nommée, pas seulement le pays.
  await expect(page.getByRole("form", { name: /Pays-Bas.*kennismigrant/u })).toBeVisible();
  await page.getByRole("radio", { name: /Je ne sais pas encore/u }).click();
  await page.getByRole("button", { name: "Créer mon dossier", exact: true }).click();
  await page.waitForURL(/\/dossiers\/[a-f0-9-]+$/u);
  emploi = page.url().split("/").at(-1)!;
  await acheter(emploi, "essentiel", 10);
  const [ouvert] = await lire<{ status: string; visaRuleId: string }>(
    'SELECT status, "visaRuleId" FROM "Application" WHERE id=$1',
    [emploi],
  );
  // WF-11 ne prévient que les dossiers actifs, prêts ou suspendus.
  expect(ouvert!.status).toBe("ACTIF");
  const [vigueur] = await lire<{
    id: string;
    version: number;
    rules: { conditions: { code: string; valeur: unknown }[] };
  }>('SELECT id, version, rules FROM "VisaRule" WHERE id=$1 AND status=\'PUBLISHED\'', [
    ouvert!.visaRuleId,
  ]);
  expect(vigueur).toBeDefined();

  /**
   * Le seuil abaissé de `ecart`, saisi dans B-02 depuis la session de `p`
   * (C-12). Il s'écrivait par un `fetch` de la branche `payload` : l'écran
   * ne montrait ni n'éditait la valeur d'une condition.
   */
  const ecrireLeSeuil = async (p: Page, ecart: number) => {
    const actuel = vigueur!.rules.conditions.find((c) => c.code === SEUIL)!.valeur as number;
    await p.getByLabel(`Seuil de « ${SEUIL} »`, { exact: true }).fill(String(actuel - ecart));
    const [reponse] = await Promise.all([
      p.waitForResponse(
        (r) => r.url().includes("/api/admin/regles/") && r.request().method() === "PUT",
      ),
      p.getByRole("button", { name: /^(Enregistrer le brouillon|Ouvrir la version \d+)$/u }).click(),
    ]);
    expect(reponse.status()).toBe(200);
    await expect(p.getByText("Brouillon enregistré", { exact: false })).toBeVisible();
  };

  // 1. L'administrateur rédige : seuil abaissé de deux unités.
  const b02 = await administration();
  await aller(`/regles/${vigueur!.id}`, b02);
  await ecrireLeSeuil(b02, 2);
  const brouillon = async () =>
    (
      await lire<{ id: string; version: number; status: string; verifiedBy: string }>(
        `SELECT id, version, status, "verifiedBy" FROM "VisaRule"
         WHERE "countryCode"='NL' AND "visaType"='emploi_kennismigrant' AND version=$1`,
        [vigueur!.version + 1],
      )
    )[0]!;
  expect((await brouillon()).verifiedBy).toBe("admin@immipro.test");
  const suivante = vigueur!.version + 1;

  // 2. Il tente de publier sa propre version : refus nommant la condition.
  await aller(`/regles/${vigueur!.id}`, b02);
  await expect(b02.getByText(`Brouillon version ${suivante}`, { exact: false })).toBeVisible();
  // C-12 : le panneau des différences montre le seuil que le second lecteur relira.
  await expect(b02.getByText(`Condition « ${SEUIL} », bloquante`, { exact: true })).toBeVisible();
  await b02.getByLabel("Motif du changement", { exact: true }).fill("Seuil IND révisé au 1er janvier");
  await b02.getByRole("button", { name: `Publier la version ${suivante}`, exact: true }).click();
  const refus = b02.getByRole("alert").filter({ hasText: SEUIL });
  await expect(refus).toBeVisible();
  await expect(refus).toContainText("second opérateur");
  expect((await brouillon()).status).toBe("DRAFT");

  // 3. Le veilleur relit et corrige la valeur : il devient le rédacteur. Il ne publie pas.
  veilleur = await operateur("veilleur@immipro.test", `/regles/${vigueur!.id}`);
  await attendreLHydratation(veilleur, "main");
  await ecrireLeSeuil(veilleur, 1);
  expect((await brouillon()).verifiedBy).toBe("veilleur@immipro.test");
  await veilleur.reload({ waitUntil: "load" });
  await attendreLHydratation(veilleur, "main");
  const publierVeilleur = veilleur.getByRole("button", {
    name: `Publier la version ${suivante}`,
    exact: true,
  });
  await expect(publierVeilleur).toBeDisabled();
  await expect(publierVeilleur).toHaveAccessibleDescription(/compte administrateur/u);
  await relever(veilleur);

  // 4. L'administrateur, second lecteur, publie : « Publier » enregistre
  //    d'abord, sans rien changer, et ne fait donc pas de lui le rédacteur.
  await aller(`/regles/${vigueur!.id}`, b02);
  await b02.getByLabel("Motif du changement", { exact: true }).fill("Relu par le veilleur, publié");
  await b02.getByRole("button", { name: `Publier la version ${suivante}`, exact: true }).click();
  await expect(b02.getByText(`Version ${suivante} publiée`, { exact: false })).toBeVisible();
  const nouvelle = await brouillon();
  expect(nouvelle.status).toBe("PUBLISHED");
  const [archivee] = await lire<{ status: string; effectiveTo: string | null }>(
    'SELECT status, to_char("effectiveTo", \'YYYY-MM-DD\') AS "effectiveTo" FROM "VisaRule" WHERE id=$1',
    [vigueur!.id],
  );
  expect(archivee!.status).toBe("ARCHIVED");
  // C-7 : la v1 de la graine porte une fin prévue ; l'archivage la garde.
  // Les profils suivants partent d'une version publiée ici, sans fin prévue.
  const finPrevue = (
    await lire<{ fin: string | null }>(
      `SELECT to_char("effectiveTo", 'YYYY-MM-DD') AS fin FROM "VisaRule"
       WHERE "countryCode"='NL' AND "visaType"='emploi_kennismigrant' AND version=1`,
    )
  )[0]!.fin;
  expect(finPrevue).toBe("2026-12-31");
  const [unique] = await lire<{ n: string }>(
    `SELECT count(*) AS n FROM "VisaRule"
     WHERE "countryCode"='NL' AND "visaType"='emploi_kennismigrant' AND status='PUBLISHED'`,
  );
  expect(Number(unique!.n)).toBe(1);
  const [trace] = await lire<{ metadata: { redigeePar: string; bloquantesTouchees: string[] } }>(
    `SELECT metadata FROM "AuditLog" WHERE action='regle.publication' AND target=$1`,
    [`visaRule:${nouvelle.id}`],
  );
  expect(trace!.metadata.redigeePar).toBe("veilleur@immipro.test");
  const [publiee] = await lire<{ rules: { conditions: { code: string; valeur: number }[] } }>(
    'SELECT rules FROM "VisaRule" WHERE id=$1',
    [nouvelle.id],
  );
  expect(publiee!.rules.conditions.find((c) => c.code === SEUIL)!.valeur).toBe(
    (vigueur!.rules.conditions.find((c) => c.code === SEUIL)!.valeur as number) - 1,
  );
  expect(trace!.metadata.bloquantesTouchees).toContain(SEUIL);

  // 5. Le worker propage : le dossier est prévenu, sans pause.
  await expect
    .poll(
      async () =>
        (
          await lire<{ alertedAt: string | null }>(
            'SELECT "alertedAt" FROM "RuleMigration" WHERE "applicationId"=$1 AND "toRuleId"=$2',
            [emploi, nouvelle.id],
          )
        )[0]?.alertedAt ?? null,
      { timeout: 60_000, intervals: [1_000] },
    )
    .not.toBeNull();
  const [migration] = await lire<{ id: string; impact: string }>(
    'SELECT id, impact FROM "RuleMigration" WHERE "applicationId"=$1 AND "toRuleId"=$2',
    [emploi, nouvelle.id],
  );
  expect(migration!.impact).toBe("MAJEUR");
  expect(
    (await lire<{ status: string }>('SELECT status FROM "Application" WHERE id=$1', [emploi]))[0]!
      .status,
  ).toBe("ACTIF");

  // 6. Le candidat arbitre depuis ses alertes (T-02) : il migre.
  await aller("/notifications");
  await page.getByRole("button", { name: "Choisir la version à appliquer", exact: true }).click();
  if (vigueur!.version === 1) {
    // T-02 annonce la fin prévue de la version que le dossier conserverait.
    await expect(page.getByText(/avant le 31 décembre 2026/u).first()).toBeVisible();
  }
  await page.getByRole("radio", { name: new RegExp(`^Migrer vers la version ${suivante}`, "u") }).click();
  const [arbitrage] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/migrations/${migration!.id}`) && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: `Migrer vers la version ${suivante}`, exact: true }).click(),
  ]);
  expect(arbitrage.ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Voir ma checklist", exact: true })).toBeVisible();
  await relever();
  const [apres] = await lire<{ visaRuleId: string; status: string }>(
    'SELECT "visaRuleId", status FROM "Application" WHERE id=$1',
    [emploi],
  );
  expect(apres!.visaRuleId).toBe(nouvelle.id);
  const [decidee] = await lire<{ decision: string; decidedAt: string | null }>(
    'SELECT decision, "decidedAt" FROM "RuleMigration" WHERE id=$1',
    [migration!.id],
  );
  expect(decidee!.decision).toBe("MIGRER");
  expect(decidee!.decidedAt).not.toBeNull();
  preuves.push({
    controle:
      "R-O03 : refus du rédacteur nommant la condition, correction du veilleur, publication par l'administrateur depuis B-02, version à fin prévue archivée (C-7), divergence MAJEURE propagée par le worker, migration choisie par le candidat",
    version: suivante,
    conforme: true,
    valeurParLaRoute: true,
  });
});

/**
 * R-O05 — suppression demandée, puis reprise (RG-10.4, B-03). Le stockage
 * du banc refuse d'abord les suppressions : la purge échoue, le compte reste
 * « suppression demandée » et non anonymisé. L'écran ne doit pas dire les
 * pièces supprimées, le mot de passe ne doit plus rien ouvrir, et B-03 doit
 * dire qu'une relance pendant la panne n'achève rien. Le stockage rétabli,
 * la relance anonymise. Dernier geste du profil : le compte n'existe plus.
 */
test("R-O05 : suppression demandée pendant une panne du stockage, connexion refusée, reprise B-03 jusqu'à l'anonymisation", async () => {
  const etat = async () =>
    (
      await lire<{
        email: string;
        deletionRequestedAt: string | null;
        deletedAt: string | null;
        sessions: string;
        restants: string;
      }>(
        `SELECT u.email, u."deletionRequestedAt", u."deletedAt",
           (SELECT count(*) FROM "Session" s WHERE s."userId" = u.id) AS sessions,
           (SELECT count(*) FROM "Application" a WHERE a."userId" = u.id AND a."purgedAt" IS NULL) AS restants
         FROM "User" u WHERE u.id = $1`,
        [compte],
      )
    )[0]!;
  const relances = async () =>
    Number(
      (
        await lire<{ n: string }>(
          `SELECT count(*) AS n FROM "AuditLog" WHERE action='compte.relance' AND target=$1`,
          [`user:${compte}`],
        )
      )[0]!.n,
    );

  await suppressionsDuStockage("refusees");
  const b03 = await administration();
  try {
    await aller("/compte/suppression");
    await page.getByLabel("Ton mot de passe, pour confirmer", { exact: true }).fill(MOT_DE_PASSE);
    await page
      .getByRole("button", { name: "Supprimer définitivement mon compte", exact: true })
      .click();
    // Chaque refus du stockage est réessayé par le client S3 : la réponse
    // arrive après ces reprises, objet par objet.
    await expect(
      page.getByRole("heading", { name: "Ta demande de suppression est enregistrée", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/ont été supprimées/u)).toHaveCount(0);
    await relever();
    const demande = await etat();
    expect(demande.deletionRequestedAt).not.toBeNull();
    expect(demande.deletedAt).toBeNull();
    expect(Number(demande.sessions)).toBe(0);
    expect(Number(demande.restants)).toBeGreaterThan(0);

    // Le même mot de passe ne rouvre rien pendant que la purge attend.
    // Par les liens du candidat, sans `goto` : sous Firefox, la navigation
    // de document vers /connexion était aussitôt doublée d'une seconde
    // (304) qui ne s'achevait jamais, et la saisie l'attendait sans fin
    // (S.193, trace de #314). Le parcours éprouve au passage la sortie
    // annoncée par l'écran de confirmation.
    await page.getByRole("link", { name: "Revenir à l'accueil", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Connexion", exact: true })
      .click();
    await page.waitForURL("**/connexion");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
    const [connexion] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/comptes/session") && r.request().method() === "POST",
      ),
      page.getByLabel("Mot de passe", { exact: true }).press("Enter"),
    ]);
    expect(connexion.status()).toBe(401);
    await expect(page.getByText("Email ou mot de passe incorrect")).toBeVisible();
    expect(Number((await etat()).sessions)).toBe(0);

    // B-03 pendant la panne : la relance dit qu'elle n'a rien achevé.
    await aller("/utilisateurs", b03);
    await b03.getByRole("button", { name: "Suppression demandée", exact: true }).click();
    await b03.getByRole("option").filter({ hasText: email }).click();
    await b03.getByLabel("Motif de la décision", { exact: true }).fill(
      "Purge restée inachevée, stockage indisponible",
    );
    await b03.getByRole("button", { name: "Traiter la demande de suppression", exact: true }).click();
    await expect(b03.getByText(/Suppression non achevée/u)).toBeVisible({ timeout: 60_000 });
    expect((await etat()).deletedAt).toBeNull();
    expect(await relances()).toBe(1);
  } finally {
    await suppressionsDuStockage("acceptees");
  }

  // Le stockage répond de nouveau : la reprise achève et anonymise.
  await b03.getByLabel("Motif de la décision", { exact: true }).fill(
    "Stockage rétabli, reprise de la purge",
  );
  await b03.getByRole("button", { name: "Traiter la demande de suppression", exact: true }).click();
  await expect
    .poll(async () => (await etat()).deletedAt, { timeout: 30_000 })
    .not.toBeNull();
  const fin = await etat();
  expect(fin.email).toMatch(/@comptes\.invalid$/u);
  expect(Number(fin.restants)).toBe(0);
  expect(await relances()).toBe(2);
  await relever(b03);
  preuves.push({
    controle:
      "R-O05 : suppression demandée pendant une panne de stockage, écran sans fausse annonce, connexion refusée, relance B-03 non achevée puis achevée, compte anonymisé",
    conforme: true,
  });
});

test("bilan du profil : aucun défilement horizontal, aucune erreur JavaScript", async ({}, info) => {
  const debordements = mesures.filter((m) => m.contenu > m.largeur);
  const bilans = suivis.map((lire) => lire());
  const prechargementsInterrompus = bilans.flatMap((b) => b.prechargementsAnnules);
  const erreursReelles = bilans.flatMap((b) => b.erreursJS);
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
        observationsPrechargements: bilans.flatMap((b) => b.observationsPrechargements),
      },
      null,
      2,
    ),
  );
  await info.attach("preuves", { path: releve, contentType: "application/json" });
  expect(debordements).toEqual([]);
  expect(erreursReelles, JSON.stringify({
    observationsPrechargements: bilans.flatMap((b) => b.observationsPrechargements),
  })).toEqual([]);
});
