// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloisonnement du rôle SUPER_ADMIN — S.208.
 *
 * Le composeur réel (`route()`), avec la session et le journal remplacés :
 * un VEILLEUR, un CANDIDAT ou un ADMIN qui appelle un geste du sommet
 * reçoit 403 et l'essai part au journal ; le super-administrateur passe.
 * Puis le service de changement de rôle, sur une transaction simulée :
 * les sessions du compte changé sont fermées dans la transaction, avec
 * la ligne de journal ; un refus ne ferme rien et n'écrit rien.
 */

const m = vi.hoisted(() => ({
  lireSession: vi.fn(),
  journaliser: vi.fn(),
  tx: {
    user: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    session: { deleteMany: vi.fn() },
  },
  dbUser: { findUnique: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "jeton" }), set: vi.fn() }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("@/server/securite/session", async (original) => ({
  ...(await original<typeof import("@/server/securite/session")>()),
  lireSession: (...a: unknown[]) => m.lireSession(...a),
}));
vi.mock("@/server/acces/journal", () => ({ journaliser: m.journaliser }));
vi.mock("@/lib/db", () => ({
  db: {
    user: m.dbUser,
    $transaction: async (fn: (tx: typeof m.tx) => Promise<unknown>) => fn(m.tx),
  },
}));

import { route } from "@/server/http/route";
import { reinitialiser } from "@/server/http/limites";
import { appliquerLeChangementDeRole } from "@/server/comptes/role";
import { suspendreOuRetablir } from "@/server/comptes/gestion";
import { EchecHttp } from "@/server/http/echecs";
import { POST as changerRole } from "@/app/api/admin/comptes/role/route";
import { POST as creerCompte } from "@/app/api/admin/comptes/route";
import { POST as supprimer } from "@/app/api/comptes/suppression/route";

const acteur = (role: string, id = `${role.toLowerCase()}-1`) => ({
  id,
  email: `${id}@immipro.test`,
  role,
  emailVerifie: true,
});

const appeler = (gestionnaire: typeof changerRole, corps: unknown) =>
  gestionnaire(
    new Request("https://immipro.app/api/admin/comptes/role", {
      method: "POST",
      headers: { host: "immipro.app", origin: "https://immipro.app", "content-type": "application/json" },
      body: JSON.stringify(corps),
    }),
    { params: Promise.resolve({}) },
  );

const CIBLE = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

beforeEach(() => {
  vi.clearAllMocks();
  reinitialiser();
  m.journaliser.mockResolvedValue(undefined);
});

describe("les gestes du sommet refusent tout autre rôle — 403 et trace", () => {
  const sonde = route({
    nom: "essai.sommet",
    acces: "super_admin",
    limite: "sensible",
    traiter: async () => ({ fait: true }),
  });

  it.each(["VEILLEUR", "CANDIDAT", "ADMIN"])("%s : 403, essai journalisé, rien d'exécuté", async (role) => {
    m.lireSession.mockResolvedValue(acteur(role));
    const reponse = await appeler(sonde, {});
    expect(reponse.status).toBe(403);
    expect(m.journaliser).toHaveBeenCalledTimes(1);
    expect(m.journaliser.mock.calls[0]![0]).toMatchObject({
      acteurId: `${role.toLowerCase()}-1`,
      action: "acces.refuse",
      cible: "route:essai.sommet",
      details: { role, route: "essai.sommet" },
    });
  });

  it("SUPER_ADMIN passe, sans ligne de refus", async () => {
    m.lireSession.mockResolvedValue(acteur("SUPER_ADMIN"));
    const reponse = await appeler(sonde, {});
    expect(reponse.status).toBe(200);
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("sans session : 401, rien au journal (il n'y a personne à nommer)", async () => {
    m.lireSession.mockResolvedValue(null);
    expect((await appeler(sonde, {})).status).toBe(401);
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("les refus sont journalisés sous débit : une rafale n'écrit pas une ligne par requête", async () => {
    m.lireSession.mockResolvedValue(acteur("VEILLEUR"));
    for (let i = 0; i < 15; i += 1) expect((await appeler(sonde, {})).status).toBe(403);
    expect(m.journaliser.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("une autre origine est refusée avant même la session (CSRF)", async () => {
    const reponse = await sonde(
      new Request("https://immipro.app/api/admin/comptes/role", {
        method: "POST",
        headers: { host: "immipro.app", origin: "https://evil.example" },
        body: "{}",
      }),
      { params: Promise.resolve({}) },
    );
    expect(reponse.status).toBe(403);
    expect(m.lireSession).not.toHaveBeenCalled();
  });

  it("un administrateur passe toujours là où un administrateur est exigé, le sommet aussi", async () => {
    const admin = route({ nom: "essai.admin", acces: "admin", limite: "lecture", traiter: async () => ({ ok: 1 }) });
    m.lireSession.mockResolvedValue(acteur("SUPER_ADMIN"));
    expect((await appeler(admin, {})).status).toBe(200);
    m.lireSession.mockResolvedValue(acteur("VEILLEUR"));
    expect((await appeler(admin, {})).status).toBe(403);
    // Une route `admin` ne journalise pas ses refus : seul le sommet le fait.
    expect(m.journaliser).not.toHaveBeenCalled();
  });
});

describe("les routes réelles du sommet", () => {
  it.each([
    ["src/app/api/admin/comptes/role/route.ts", "admin.comptes.role"],
    ["src/app/api/admin/comptes/route.ts", "admin.comptes.creation"],
  ])("%s : accès super_admin, limite sensible, POST", (fichier, nom) => {
    const source = readFileSync(fichier, "utf8");
    expect(source).toContain(`nom: "${nom}"`);
    expect(source).toMatch(/acces: "super_admin"/u);
    expect(source).toMatch(/limite: "sensible"/u);
    expect(source).toMatch(/export const POST = route/u);
  });

  it.each(["VEILLEUR", "CANDIDAT"])("%s appelant le changement de rôle : 403 et trace, aucun changement", async (role) => {
    m.lireSession.mockResolvedValue(acteur(role));
    const reponse = await appeler(changerRole, {
      userId: CIBLE,
      role: "ADMIN",
      motif: "Promotion de la veille",
      confirmation: "x@immipro.test",
    });
    expect(reponse.status).toBe(403);
    expect(m.journaliser).toHaveBeenCalledWith(expect.objectContaining({ action: "acces.refuse", cible: "route:admin.comptes.role" }));
    expect(m.tx.user.updateMany).not.toHaveBeenCalled();
    expect(m.tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["VEILLEUR", "CANDIDAT", "ADMIN"])("%s appelant la création interne : 403 et trace", async (role) => {
    m.lireSession.mockResolvedValue(acteur(role));
    const reponse = await appeler(creerCompte, {
      email: "kofi@immipro.app",
      prenom: "Kofi",
      nom: "Mensah",
      role: "ADMIN",
      motif: "Renfort de la revue",
    });
    expect(reponse.status).toBe(403);
    expect(m.tx.user.create).not.toHaveBeenCalled();
    expect(m.journaliser).toHaveBeenCalledWith(expect.objectContaining({ action: "acces.refuse" }));
  });

  it("une confirmation fausse n'écrit rien et ne journalise rien", async () => {
    m.lireSession.mockResolvedValue(acteur("SUPER_ADMIN"));
    m.dbUser.findUnique.mockResolvedValue({ id: CIBLE, email: "awa@exemple.com" });
    const reponse = await appeler(changerRole, {
      userId: CIBLE,
      role: "ADMIN",
      motif: "Responsable de la revue",
      confirmation: "awa@exemple.co",
    });
    expect(reponse.status).toBe(422);
    expect(m.tx.user.updateMany).not.toHaveBeenCalled();
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("un compte interne ne se supprime pas lui-même (RG-10.4)", async () => {
    m.lireSession.mockResolvedValue(acteur("ADMIN"));
    const reponse = await appeler(supprimer, { motDePasse: "secret-secret" });
    expect(reponse.status).toBe(409);
    const corps = (await reponse.json()) as { echec: { corps: string } };
    expect(corps.echec.corps).toMatch(/compte interne ne se supprime pas/u);
    expect(m.dbUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("le changement de rôle ferme les sessions du compte, dans la transaction", () => {
  const cible = {
    id: CIBLE,
    email: "awa@exemple.com",
    role: "CANDIDAT",
    emailVerified: new Date("2026-10-01"),
    suspendedAt: null,
    deletedAt: null,
  };
  const sommet = { genre: "compte" as const, id: "sommet-1", role: "SUPER_ADMIN" as const };

  it("promotion : rôle écrit sous condition, sessions fermées, trace avec le nombre fermé", async () => {
    m.tx.user.findUnique.mockResolvedValue(cible);
    m.tx.user.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    m.tx.user.updateMany.mockResolvedValue({ count: 1 });
    m.tx.session.deleteMany.mockResolvedValue({ count: 3 });

    const issue = await appliquerLeChangementDeRole({
      cible: { id: CIBLE },
      vers: "ADMIN",
      motif: "Responsable de la revue manuelle",
      auteur: sommet,
    });

    expect(issue).toEqual({ issue: "change", de: "CANDIDAT", vers: "ADMIN", sessionsFermees: 3 });
    expect(m.tx.user.updateMany).toHaveBeenCalledWith({ where: { id: CIBLE, role: "CANDIDAT" }, data: { role: "ADMIN" } });
    expect(m.tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: CIBLE } });
    expect(m.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({
        acteurId: "sommet-1",
        action: "compte.role",
        cible: `user:${CIBLE}`,
        details: { de: "CANDIDAT", vers: "ADMIN", sessionsFermees: 3, origine: "back-office" },
      }),
      m.tx,
    );
    // Les sessions tombent avant la trace : une trace sans fermeture mentirait.
    expect(m.tx.session.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(m.journaliser.mock.invocationCallOrder[0]!);
  });

  it("depuis la console, l'auteur est « console:<nom> »", async () => {
    m.tx.user.findUnique.mockResolvedValue(cible);
    m.tx.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    m.tx.user.updateMany.mockResolvedValue({ count: 1 });
    m.tx.session.deleteMany.mockResolvedValue({ count: 0 });
    await appliquerLeChangementDeRole({
      cible: { email: "awa@exemple.com" },
      vers: "SUPER_ADMIN",
      motif: "Premier super-administrateur",
      auteur: { genre: "console", par: "Awa Koffi" },
    });
    expect(m.journaliser.mock.calls[0]![0]).toMatchObject({ acteurId: "console:Awa Koffi", details: { origine: "console" } });
  });

  it("un ADMIN qui passerait la route est encore refusé par le domaine : rien n'est fermé", async () => {
    m.tx.user.findUnique.mockResolvedValue(cible);
    m.tx.user.count.mockResolvedValue(2);
    const issue = await appliquerLeChangementDeRole({
      cible: { id: CIBLE },
      vers: "ADMIN",
      motif: "Responsable de la revue manuelle",
      auteur: { genre: "compte", id: "admin-1", role: "ADMIN" },
    });
    expect(issue.issue).toBe("refuse");
    expect(m.tx.user.updateMany).not.toHaveBeenCalled();
    expect(m.tx.session.deleteMany).not.toHaveBeenCalled();
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("le dernier super-administrateur actif ne se retire pas : aucune écriture", async () => {
    m.tx.user.findUnique.mockResolvedValue({ ...cible, id: "sommet-1", role: "SUPER_ADMIN" });
    m.tx.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const issue = await appliquerLeChangementDeRole({
      cible: { id: "sommet-1" },
      vers: "ADMIN",
      motif: "Je me retire de la gestion des rôles",
      auteur: sommet,
    });
    expect(issue).toMatchObject({ issue: "refuse" });
    if (issue.issue === "refuse") expect(issue.raison).toMatch(/seul super-administrateur actif/u);
    expect(m.tx.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe("suspension d'un compte interne", () => {
  const admin = acteur("ADMIN", "admin-1") as Parameters<typeof suspendreOuRetablir>[0];
  const sommet = acteur("SUPER_ADMIN", "sommet-1") as Parameters<typeof suspendreOuRetablir>[0];
  const demande = { userId: CIBLE, suspendre: true, motif: "Départ de l'équipe" };

  it("un administrateur ne suspend pas un veilleur : refus, rien d'écrit", async () => {
    m.tx.user.findUnique.mockResolvedValue({ id: CIBLE, role: "VEILLEUR", suspendedAt: null, deletedAt: null });
    m.tx.user.count.mockResolvedValue(1);
    await expect(suspendreOuRetablir(admin, demande)).rejects.toBeInstanceOf(EchecHttp);
    expect(m.journaliser).not.toHaveBeenCalled();
    expect(m.tx.user.update).not.toHaveBeenCalled();
  });

  it("un super-administrateur le suspend : trace, date, sessions fermées", async () => {
    m.tx.user.findUnique.mockResolvedValue({ id: CIBLE, role: "VEILLEUR", suspendedAt: null, deletedAt: null });
    m.tx.user.count.mockResolvedValue(1);
    m.tx.session.deleteMany.mockResolvedValue({ count: 2 });
    expect(await suspendreOuRetablir(sommet, demande)).toEqual({ suspendu: true, sessionsFermees: 2 });
    expect(m.journaliser).toHaveBeenCalledWith(expect.objectContaining({ action: "compte.suspension" }), m.tx);
    expect(m.journaliser.mock.invocationCallOrder[0]).toBeLessThan(m.tx.user.update.mock.invocationCallOrder[0]!);
  });
});
