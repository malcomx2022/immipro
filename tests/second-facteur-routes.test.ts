// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Double authentification, par les routes réelles — S.214.
 *
 * Le composeur (`route()`) est le vrai : contrôle d'origine, session,
 * rôle, débit, corps. Les services sont remplacés : leur logique est
 * éprouvée par `deux-facteurs.test.ts` et, sur une base réelle, par
 * `npm run smoke:second-facteur`. Ici, ce que chaque route décide.
 */

const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  poses: [] as Array<{ nom: string; valeur: string; options: Record<string, unknown> }>,
  lireSession: vi.fn(),
  journaliser: vi.fn(),
  connecter: vi.fn(),
  ouvrirSession: vi.fn(),
  exige: vi.fn(),
  ouvrirUnDefi: vi.fn(),
  repondreAuDefi: vi.fn(),
  reinitialiser: vi.fn(),
  etat: vi.fn(),
  preparer: vi.fn(),
  activer: vi.fn(),
  desactiver: vi.fn(),
  regenerer: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (m.cookies.has(nom) ? { value: m.cookies.get(nom) } : undefined),
    set: (nom: string, valeur: string, options: Record<string, unknown>) => m.poses.push({ nom, valeur, options }),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", "user-agent": "essai" }),
}));
vi.mock("@/server/securite/session", async (original) => ({
  ...(await original<typeof import("@/server/securite/session")>()),
  lireSession: (...a: unknown[]) => m.lireSession(...a),
  ouvrirSession: (...a: unknown[]) => m.ouvrirSession(...a),
}));
vi.mock("@/server/acces/journal", () => ({ journaliser: m.journaliser }));
vi.mock("@/server/acces/comptes", () => ({ connecter: m.connecter }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: m.userFindUnique } } }));
vi.mock("@/server/comptes/second-facteur", async (original) => ({
  ...(await original<typeof import("@/server/comptes/second-facteur")>()),
  secondFacteurExige: m.exige,
  ouvrirUnDefi: m.ouvrirUnDefi,
  repondreAuDefi: m.repondreAuDefi,
  reinitialiserLeSecondFacteur: m.reinitialiser,
  etatDuSecondFacteur: m.etat,
  preparerLEnrolement: m.preparer,
  activerLeSecondFacteur: m.activer,
  desactiverLeSecondFacteur: m.desactiver,
  regenererLesCodesDeSecours: m.regenerer,
}));

import { reinitialiser as viderLesLimites } from "@/server/http/limites";
import { COOKIE_SESSION } from "@/server/securite/session";
import { COOKIE_DEFI } from "@/server/comptes/second-facteur";
import { TITRE_CONNEXION_A_RECOMMENCER } from "@/domain/comptes/deux-facteurs";
import { POST as connexion } from "@/app/api/comptes/session/route";
import { POST as secondTemps } from "@/app/api/comptes/session/second-facteur/route";
import { GET as lireEtat, POST as gerer } from "@/app/api/comptes/second-facteur/route";
import { POST as reinitialiserRoute } from "@/app/api/admin/comptes/second-facteur/route";

type Gestionnaire = typeof connexion;
const ORIGINE = "https://immipro.app";
const appeler = (g: Gestionnaire, corps?: unknown, options: { origine?: string; methode?: string } = {}) =>
  g(
    new Request(`${ORIGINE}/api/essai`, {
      method: options.methode ?? (corps === undefined ? "GET" : "POST"),
      headers: {
        host: "immipro.app",
        origin: options.origine ?? ORIGINE,
        "content-type": "application/json",
      },
      ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    }),
    { params: Promise.resolve({}) },
  );

const acteur = (role: string, id = `${role.toLowerCase()}-1`) => ({ id, email: `${id}@immipro.test`, role, emailVerifie: true });
const CIBLE = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";
const USER = { id: "awa-1", firstName: "Awa", emailVerified: new Date(), role: "CANDIDAT" };

beforeEach(() => {
  vi.clearAllMocks();
  m.cookies.clear();
  m.poses.length = 0;
  viderLesLimites();
  m.journaliser.mockResolvedValue(undefined);
  m.ouvrirSession.mockResolvedValue({ valeur: "jeton-session", expireLe: new Date(), cookieExpireLe: null });
});

describe("A-02 — le mot de passe juste n'ouvre pas de session quand le second facteur est actif", () => {
  it("défi posé dans un cookie strict limité à la connexion ; ni session, ni détail du compte", async () => {
    m.connecter.mockResolvedValue({ ouverte: true, user: USER });
    m.exige.mockResolvedValue(true);
    m.ouvrirUnDefi.mockResolvedValue({ valeur: "jeton-defi", expireLe: new Date(Date.now() + 300_000) });

    const r = await appeler(connexion, { email: "awa@exemple.com", motDePasse: "x", resterConnecte: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ secondFacteur: { requis: true } });
    expect(m.ouvrirSession).not.toHaveBeenCalled();
    expect(m.ouvrirUnDefi).toHaveBeenCalledWith("awa-1", true, "essai");
    const pose = m.poses.find((p) => p.nom === COOKIE_DEFI)!;
    expect(pose.valeur).toBe("jeton-defi");
    expect(pose.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/comptes/session" });
    expect(m.poses.some((p) => p.nom === COOKIE_SESSION)).toBe(false);
  });

  it("sans second facteur, la connexion reste celle d'avant", async () => {
    m.connecter.mockResolvedValue({ ouverte: true, user: USER });
    m.exige.mockResolvedValue(false);
    const r = await appeler(connexion, { email: "awa@exemple.com", motDePasse: "x" });
    expect((await r.json()).compte).toMatchObject({ prenom: "Awa", role: "CANDIDAT" });
    expect(m.ouvrirSession).toHaveBeenCalledWith("awa-1", "essai", false);
    expect(m.ouvrirUnDefi).not.toHaveBeenCalled();
  });

  it("un mot de passe faux ne dit rien du second facteur", async () => {
    m.connecter.mockResolvedValue({ ouverte: false, verdict: { bloque: false }, message: "Il te reste 4 essais." });
    const r = await appeler(connexion, { email: "awa@exemple.com", motDePasse: "x" });
    expect(r.status).toBe(401);
    expect(m.exige).not.toHaveBeenCalled();
  });
});

describe("A-02, second temps — /api/comptes/session/second-facteur", () => {
  it("code accepté : la session s'ouvre avec la mémorisation du défi, le cookie du défi s'efface", async () => {
    m.cookies.set(COOKIE_DEFI, "jeton-defi");
    m.repondreAuDefi.mockResolvedValue({ issue: "ouverte", userId: "awa-1", memoriser: true, userAgent: "essai", genre: "totp", codesRestants: 10 });
    m.userFindUnique.mockResolvedValue(USER);
    const r = await appeler(secondTemps, { code: "123456" });
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(corps.compte).toMatchObject({ prenom: "Awa", emailVerifie: true });
    expect(corps).not.toHaveProperty("codesDeSecoursRestants");
    expect(m.repondreAuDefi).toHaveBeenCalledWith("jeton-defi", "123456");
    expect(m.ouvrirSession).toHaveBeenCalledWith("awa-1", "essai", true);
    expect(m.poses.find((p) => p.nom === COOKIE_SESSION)?.valeur).toBe("jeton-session");
    expect(m.poses.find((p) => p.nom === COOKIE_DEFI)?.options).toMatchObject({ maxAge: 0 });
  });

  it("par un code de secours, la réponse dit combien il en reste", async () => {
    m.cookies.set(COOKIE_DEFI, "jeton-defi");
    m.repondreAuDefi.mockResolvedValue({ issue: "ouverte", userId: "awa-1", memoriser: false, userAgent: null, genre: "secours", codesRestants: 7 });
    m.userFindUnique.mockResolvedValue(USER);
    expect((await (await appeler(secondTemps, { code: "ABCD-EFGH" })).json()).codesDeSecoursRestants).toBe(7);
  });

  it("code refusé : 401 avec le message du service, aucune session", async () => {
    m.cookies.set(COOKIE_DEFI, "jeton-defi");
    m.repondreAuDefi.mockResolvedValue({ issue: "refuse", message: "Ce code ne correspond pas. Il te reste 4 essais.", bloque: false });
    const r = await appeler(secondTemps, { code: "000000" });
    expect(r.status).toBe(401);
    expect((await r.json()).echec).toMatchObject({ titre: "Code refusé", corps: expect.stringMatching(/4 essais/u), ton: "echec" });
    expect(m.ouvrirSession).not.toHaveBeenCalled();
  });

  it("défi échu ou absent : 401, retour au mot de passe, cookie effacé", async () => {
    m.repondreAuDefi.mockResolvedValue({ issue: "expire" });
    const r = await appeler(secondTemps, { code: "123456" });
    expect(r.status).toBe(401);
    expect((await r.json()).echec.titre).toBe(TITRE_CONNEXION_A_RECOMMENCER);
    expect(m.repondreAuDefi).toHaveBeenCalledWith(undefined, "123456");
    expect(m.poses.find((p) => p.nom === COOKIE_DEFI)?.options).toMatchObject({ maxAge: 0 });
  });

  it("une autre origine est refusée avant tout essai (CSRF)", async () => {
    m.cookies.set(COOKIE_DEFI, "jeton-defi");
    const r = await appeler(secondTemps, { code: "123456" }, { origine: "https://attaquant.example" });
    expect(r.status).toBe(403);
    expect(m.repondreAuDefi).not.toHaveBeenCalled();
  });

  it("sous la limite sensible : au-delà de dix essais par minute, 429 sans examen", async () => {
    m.repondreAuDefi.mockResolvedValue({ issue: "refuse", message: "non", bloque: false });
    for (let i = 0; i < 10; i += 1) await appeler(secondTemps, { code: "000000" });
    const r = await appeler(secondTemps, { code: "000000" });
    expect(r.status).toBe(429);
    expect(m.repondreAuDefi).toHaveBeenCalledTimes(10);
  });
});

describe("« Sécurité » — /api/comptes/second-facteur", () => {
  it("exige une session ; la lecture ne rend jamais de secret", async () => {
    m.lireSession.mockResolvedValue(null);
    expect((await appeler(lireEtat)).status).toBe(401);
    m.lireSession.mockResolvedValue(acteur("CANDIDAT"));
    m.etat.mockResolvedValue({ disponible: true, active: true, activeLe: "2026-11-04T10:00:00.000Z", enCours: false, codesRestants: 9 });
    const texte = await (await appeler(lireEtat)).text();
    expect(texte).not.toMatch(/secret|empreinte|chiffre/iu);
  });

  it("une action inconnue, ou un champ manquant, est refusée avant le service", async () => {
    m.lireSession.mockResolvedValue(acteur("CANDIDAT"));
    expect((await appeler(gerer, { action: "exporter" })).status).toBe(422);
    expect((await appeler(gerer, { action: "desactiver", code: "123456" })).status).toBe(422);
    expect(m.desactiver).not.toHaveBeenCalled();
  });

  it("chaque action va au service qui la porte, avec la session courante pour la garder ouverte", async () => {
    m.lireSession.mockResolvedValue(acteur("CANDIDAT"));
    m.cookies.set(COOKIE_SESSION, "jeton-courant");
    m.preparer.mockResolvedValue({ secret: "S", adresse: "otpauth://x" });
    m.activer.mockResolvedValue({ codesDeSecours: [], sessionsFermees: 0 });
    m.desactiver.mockResolvedValue({ sessionsFermees: 1 });
    m.regenerer.mockResolvedValue({ codesDeSecours: [] });
    await appeler(gerer, { action: "preparer", motDePasse: "mdp" });
    await appeler(gerer, { action: "activer", code: "123456" });
    await appeler(gerer, { action: "codes", code: "123456" });
    await appeler(gerer, { action: "desactiver", motDePasse: "mdp", code: "123456" });
    const a = acteur("CANDIDAT");
    expect(m.preparer).toHaveBeenCalledWith(a, "mdp");
    expect(m.activer).toHaveBeenCalledWith(a, "123456", "jeton-courant");
    expect(m.regenerer).toHaveBeenCalledWith(a, "123456");
    expect(m.desactiver).toHaveBeenCalledWith(a, "mdp", "123456", "jeton-courant");
  });

  it("une autre origine ne désactive rien (CSRF)", async () => {
    m.lireSession.mockResolvedValue(acteur("CANDIDAT"));
    const r = await appeler(gerer, { action: "desactiver", motDePasse: "mdp", code: "123456" }, { origine: "https://attaquant.example" });
    expect(r.status).toBe(403);
    expect(m.desactiver).not.toHaveBeenCalled();
    expect(m.lireSession).not.toHaveBeenCalled();
  });
});

describe("B-03 — réinitialiser le second facteur d'un compte", () => {
  const corps = { userId: CIBLE, motif: "Téléphone perdu, identité vérifiée", confirmation: "awa@exemple.com" };

  it.each(["CANDIDAT", "VEILLEUR", "ADMIN"])("%s : 403, l'essai part au journal, rien n'est réinitialisé", async (role) => {
    m.lireSession.mockResolvedValue(acteur(role));
    const r = await appeler(reinitialiserRoute, corps);
    expect(r.status).toBe(403);
    expect(m.reinitialiser).not.toHaveBeenCalled();
    expect(m.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({ action: "acces.refuse", cible: "route:admin.comptes.second_facteur" }),
    );
  });

  it("super-administrateur, adresse mal ressaisie : refus par champ, rien n'est réinitialisé", async () => {
    m.lireSession.mockResolvedValue(acteur("SUPER_ADMIN"));
    m.userFindUnique.mockResolvedValue({ id: CIBLE, email: "awa@exemple.com" });
    const r = await appeler(reinitialiserRoute, { ...corps, confirmation: "awa@exemple.co" });
    expect(r.status).toBe(422);
    expect((await r.json()).echec.champs.confirmation).toMatch(/Ressaisis/u);
    expect(m.reinitialiser).not.toHaveBeenCalled();
  });

  it("super-administrateur, confirmation juste : le service reçoit l'auteur, la cible et le motif", async () => {
    m.lireSession.mockResolvedValue(acteur("SUPER_ADMIN"));
    m.userFindUnique.mockResolvedValue({ id: CIBLE, email: "awa@exemple.com" });
    m.reinitialiser.mockResolvedValue({ reinitialise: true, sessionsFermees: 2 });
    const r = await appeler(reinitialiserRoute, { ...corps, confirmation: " AWA@exemple.com " });
    expect(r.status).toBe(200);
    expect(m.reinitialiser).toHaveBeenCalledWith(acteur("SUPER_ADMIN"), CIBLE, corps.motif);
  });

  it("régime critique : vingt par quart d'heure, le vingt et unième est refusé", async () => {
    m.lireSession.mockResolvedValue(acteur("SUPER_ADMIN"));
    m.userFindUnique.mockResolvedValue({ id: CIBLE, email: "awa@exemple.com" });
    m.reinitialiser.mockResolvedValue({ reinitialise: true, sessionsFermees: 0 });
    for (let i = 0; i < 20; i += 1) expect((await appeler(reinitialiserRoute, corps)).status).toBe(200);
    expect((await appeler(reinitialiserRoute, corps)).status).toBe(429);
    expect(m.reinitialiser).toHaveBeenCalledTimes(20);
  });
});
