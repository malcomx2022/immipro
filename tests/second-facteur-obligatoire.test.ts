// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Double authentification obligatoire pour les comptes internes — S.215.
 *
 * Le composeur réel : une route du back-office (veilleur, admin,
 * super_admin) refuse un compte interne sans second facteur actif, avec un
 * message qui dit où l'activer ; ses routes candidat — dont celle qui
 * l'active — restent ouvertes. La garde des pages le renvoie sur « Sécurité
 * du compte ». Le service refuse la désactivation à un compte interne,
 * rôle relu en base.
 */
const m = vi.hoisted(() => ({
  lireSession: vi.fn(),
  journaliser: vi.fn(),
  redirect: vi.fn((cible: string) => {
    throw Object.assign(new Error("redirection"), { cible });
  }),
  userFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "jeton" }), set: vi.fn() }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/server/securite/session", async (original) => ({
  ...(await original<typeof import("@/server/securite/session")>()),
  lireSession: (...a: unknown[]) => m.lireSession(...a),
}));
vi.mock("@/server/acces/journal", () => ({ journaliser: m.journaliser }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: m.userFindUnique } } }));

import { route } from "@/server/http/route";
import { reinitialiser } from "@/server/http/limites";
import { exigerAdmin, exigerCandidat, exigerSuperAdmin, exigerVeilleur } from "@/server/securite/page";
import { desactiverLeSecondFacteur } from "@/server/comptes/second-facteur";
import { backOfficeOuvert, exigeSecondFacteur, ROLES } from "@/domain/comptes/hierarchie";
import { CHEMIN_ACTIVATION_EXIGEE } from "@/domain/comptes/deux-facteurs";

const acteur = (role: string, secondFacteurActif: boolean) => ({
  id: `${role.toLowerCase()}-1`,
  email: `${role.toLowerCase()}@immipro.test`,
  role,
  emailVerifie: true,
  secondFacteurActif,
});

const sonde = (acces: "candidat" | "veilleur" | "admin" | "super_admin") =>
  route({ nom: `essai.${acces}`, acces, limite: "lecture", traiter: async () => ({ ok: true }) });

const appeler = (g: ReturnType<typeof sonde>) =>
  g(new Request("https://immipro.app/api/essai", { headers: { host: "immipro.app" } }), {
    params: Promise.resolve({}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  reinitialiser();
  m.journaliser.mockResolvedValue(undefined);
});

describe("la règle, dans le domaine", () => {
  it("exigée pour VEILLEUR, ADMIN et SUPER_ADMIN, jamais pour le candidat", () => {
    expect(ROLES.filter(exigeSecondFacteur)).toEqual(["VEILLEUR", "ADMIN", "SUPER_ADMIN"]);
  });

  it("le back-office s'ouvre au rôle suffisant avec son second facteur, à lui seul", () => {
    expect(backOfficeOuvert("ADMIN", "VEILLEUR", true)).toBe(true);
    expect(backOfficeOuvert("ADMIN", "VEILLEUR", false)).toBe(false);
    expect(backOfficeOuvert("VEILLEUR", "ADMIN", true)).toBe(false);
    expect(backOfficeOuvert("CANDIDAT", "VEILLEUR", true)).toBe(false);
  });
});

describe("le composeur ferme le back-office sans second facteur", () => {
  it.each([
    ["VEILLEUR", "veilleur"],
    ["ADMIN", "admin"],
    ["SUPER_ADMIN", "super_admin"],
    ["SUPER_ADMIN", "veilleur"],
  ] as const)("%s sans second facteur, route %s : 409 qui dit où l'activer", async (role, acces) => {
    m.lireSession.mockResolvedValue(acteur(role, false));
    const r = await appeler(sonde(acces));
    expect(r.status).toBe(409);
    expect((await r.json()).echec.corps).toMatch(/obligatoire pour le back-office.*\/compte\/securite/u);
  });

  it.each(["VEILLEUR", "ADMIN", "SUPER_ADMIN"])("%s avec son second facteur passe", async (role) => {
    m.lireSession.mockResolvedValue(acteur(role, true));
    const acces = role === "VEILLEUR" ? "veilleur" : role === "ADMIN" ? "admin" : "super_admin";
    expect((await appeler(sonde(acces))).status).toBe(200);
  });

  it("un compte interne sans second facteur garde ses routes candidat — dont celle qui l'active", async () => {
    m.lireSession.mockResolvedValue(acteur("ADMIN", false));
    expect((await appeler(sonde("candidat"))).status).toBe(200);
  });

  it("un candidat sans second facteur n'est pas concerné", async () => {
    m.lireSession.mockResolvedValue(acteur("CANDIDAT", false));
    expect((await appeler(sonde("candidat"))).status).toBe(200);
  });

  it("un champ absent compte comme inactif : la règle échoue fermée", async () => {
    const { secondFacteurActif: _retire, ...sans } = acteur("ADMIN", true);
    void _retire;
    m.lireSession.mockResolvedValue(sans);
    expect((await appeler(sonde("admin"))).status).toBe(409);
  });
});

describe("la garde des pages renvoie sur « Sécurité du compte »", () => {
  const redirigeVers = async (garde: () => Promise<unknown>) => {
    try {
      await garde();
    } catch (e) {
      return (e as { cible?: string }).cible;
    }
    return null;
  };

  it.each([
    ["VEILLEUR", exigerVeilleur],
    ["ADMIN", exigerAdmin],
    ["SUPER_ADMIN", exigerSuperAdmin],
  ] as const)("%s sans second facteur : renvoyé vers l'activation", async (role, garde) => {
    m.lireSession.mockResolvedValue(acteur(role, false));
    expect(await redirigeVers(() => garde())).toBe(CHEMIN_ACTIVATION_EXIGEE);
  });

  it("avec son second facteur, la page s'ouvre", async () => {
    m.lireSession.mockResolvedValue(acteur("ADMIN", true));
    expect(await redirigeVers(() => exigerAdmin())).toBeNull();
  });

  it("l'espace candidat reste ouvert au compte interne sans second facteur", async () => {
    m.lireSession.mockResolvedValue(acteur("ADMIN", false));
    expect(await redirigeVers(() => exigerCandidat())).toBeNull();
  });

  it("un candidat qui ouvre le back-office rentre chez lui, comme avant", async () => {
    m.lireSession.mockResolvedValue(acteur("CANDIDAT", false));
    expect(await redirigeVers(() => exigerVeilleur())).toBe("/tableau-de-bord");
  });
});

describe("un compte interne ne désactive pas son second facteur", () => {
  it("rôle relu en base : refus actionnable, avant même le mot de passe", async () => {
    m.userFindUnique.mockResolvedValueOnce({ role: "VEILLEUR" });
    await expect(desactiverLeSecondFacteur({ id: "v-1" }, "mdp", "123456", undefined)).rejects.toMatchObject({
      echec: { code: "etat_incompatible", corps: expect.stringMatching(/ne se désactive pas.*super-administrateur/su) },
    });
    expect(m.userFindUnique).toHaveBeenCalledTimes(1);
  });
});
