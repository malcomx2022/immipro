// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

/**
 * Profil candidat durci — S.214, C-02 et A-01.
 *
 * Trois écritures touchent `User.phone` : l'inscription, C-02 et « Mon
 * compte ». Seule la dernière exigeait un indicatif de pays couvert ; les
 * deux autres écrivaient ce qu'elle refusait. La règle est désormais une
 * (`refusDuTelephone`), et C-02 refuse les clés qu'il ne connaît pas, les
 * langues malformées, le budget démesuré et les pays hors liste. La
 * lecture ne rend plus la ligne de profil entière.
 */

type Definition = { corps?: ZodType; traiter: (ctx: { acteur: { id: string } }) => Promise<unknown> };
const m = vi.hoisted(() => ({
  definitions: new Map<string, Definition>(),
  trouver: vi.fn(),
  creer: vi.fn(),
  majCompte: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/server/http/route", () => ({
  route: (d: Definition & { nom: string }) => {
    m.definitions.set(d.nom, d);
    return d.traiter;
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: m.trouver, create: m.creer, update: m.majCompte },
    profile: { upsert: m.upsert },
  },
}));
vi.mock("@/server/securite/secret", async (original) => ({
  ...(await original<typeof import("@/server/securite/secret")>()),
  empreinte: vi.fn(async () => "empreinte_synthetique"),
}));

import "@/app/api/comptes/profil/route";
import { enregistrerLeProfil } from "@/server/acces/profil";
import { inscrire } from "@/server/acces/comptes";
import { refusDuTelephone } from "@/domain/comptes/profil";

const corps = () => m.definitions.get("comptes.profil.maj")!.corps!;
const lu = (valeur: unknown) => corps().safeParse(valeur);
const messageDe = (valeur: unknown, champ: string): string | undefined => {
  const r = lu(valeur);
  return r.success ? undefined : r.error.issues.find((i) => i.path.join(".").startsWith(champ))?.message;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.trouver.mockResolvedValue(null);
  m.creer.mockResolvedValue({ id: "synthetique" });
});

describe("une seule règle pour le téléphone (E.164 et indicatif couvert)", () => {
  it.each([
    ["+2290197000042", null],
    ["+33612345678", null],
    ["2290197000042", /Commence par « \+ »/u],
    ["+22901", /il en faut entre 8 et 15/u],
    ["+2410712345678", /pays couvert.*\+229/u],
  ])("%s", (numero, attendu) => {
    const refus = refusDuTelephone(numero);
    if (attendu === null) expect(refus).toBeNull();
    else expect(refus).toMatch(attendu);
  });

  it("C-02 la lit à la réception, après normalisation", () => {
    expect(lu({ telephone: "00 229 01 97 00 00 42" }).success).toBe(true);
    expect(messageDe({ telephone: "+241 07 12 34 56 78" }, "telephone")).toMatch(/pays couvert/u);
  });

  it("l'inscription aussi, avant tout accès au compte", async () => {
    await expect(inscrire({ email: "a@immipro.test", motDePasse: "RecetteSynthetique", telephone: "+241 07 12 34 56 78" })).rejects.toMatchObject({
      echec: { code: "champs_invalides" },
      champs: { telephone: expect.stringMatching(/pays couvert/u) },
    });
    expect(m.trouver).not.toHaveBeenCalled();
    expect(m.creer).not.toHaveBeenCalled();
  });

  it("et le service de C-02, quel que soit l'appelant", async () => {
    await expect(enregistrerLeProfil("u-1", { telephone: "+2410712345678" })).rejects.toMatchObject({
      echec: { code: "champs_invalides" },
    });
    expect(m.majCompte).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });
});

describe("C-02 — le corps est strict et borné", () => {
  it("une clé inconnue est refusée, pas ignorée : ni rôle, ni adresse, ni empreinte ne s'écrivent ici", () => {
    for (const cle of ["role", "email", "passwordHash", "emailVerified", "suspendedAt"]) {
      expect(lu({ prenom: "Awa", [cle]: "x" }).success, cle).toBe(false);
    }
  });

  it("le pays : la liste des pays couverts, casse ignorée ; vide efface", () => {
    expect(lu({ pays: "bj" }).success).toBe(true);
    expect(lu({ pays: "" }).success).toBe(true);
    expect(messageDe({ pays: "ZZ" }, "pays")).toMatch(/liste/u);
  });

  it("les langues : code ISO à deux lettres, niveau court, dix au plus", () => {
    expect(lu({ langues: { en: "C1 (IELTS 7)" } }).success).toBe(true);
    expect(messageDe({ langues: { anglais: "C1" } }, "langues")).toMatch(/deux lettres/u);
    expect(lu({ langues: { en: "x".repeat(41) } }).success).toBe(false);
    const onze = Object.fromEntries("abcdefghijk".split("").map((l) => [`${l}a`, "B2"]));
    expect(messageDe({ langues: onze }, "langues")).toMatch(/Au plus 10/u);
  });

  it("les textes et nombres bornés", () => {
    expect(lu({ prenom: "x".repeat(81) }).success).toBe(false);
    expect(lu({ domaine: "x".repeat(121) }).success).toBe(false);
    expect(lu({ anneesExperience: 61 }).success).toBe(false);
    expect(lu({ budgetTotal: 1_000_000_001 }).success).toBe(false);
    expect(lu({ budgetTotal: 4_000_000, budgetDevise: "XOF" }).success).toBe(true);
    expect(lu({ budgetDevise: "USD" }).success).toBe(false);
  });

  it("la chaîne vide reste le geste « j'efface »", () => {
    expect(lu({ prenom: "", diplome: "", facturationNom: "" }).success).toBe(true);
  });
});

describe("C-02 — la lecture ne rend que les colonnes affichées", () => {
  it("ni identifiant interne, ni empreinte, ni compteur d'échecs : la requête les nomme et n'en prend pas d'autres", async () => {
    m.trouver.mockResolvedValue({ email: "a@immipro.test", emailVerified: null, profile: null });
    await m.definitions.get("comptes.profil")!.traiter({ acteur: { id: "u-1" } });
    const requete = m.trouver.mock.calls[0]![0] as { select?: Record<string, unknown>; include?: unknown };
    expect(requete.include).toBeUndefined();
    const colonnes = Object.keys(requete.select ?? {});
    for (const interdite of ["passwordHash", "failedLogins", "lockedUntil", "role", "id", "birthDate"]) {
      expect(colonnes).not.toContain(interdite);
    }
    const profil = (requete.select!.profile as { select: Record<string, unknown> }).select;
    expect(Object.keys(profil)).not.toContain("id");
    expect(Object.keys(profil)).not.toContain("userId");
  });
});
