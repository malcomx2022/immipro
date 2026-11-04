// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CleAbsente,
  chiffrer,
  cleMaitresse,
  dechiffrer,
  empreinteDeSecours,
} from "@/server/securite/chiffrement";

/**
 * Chiffrement au repos du second facteur — S.214.
 *
 * Le secret TOTP sort de la base chiffré, lié à son compte ; une enveloppe
 * altérée, recopiée sur un autre compte ou lue sous une autre clé ne rend
 * rien. Les codes de secours sont gardés en HMAC, sous une sous-clé : la
 * même saisie sur deux comptes ne donne pas la même empreinte.
 */

const avant = process.env.DEUX_FACTEURS_CLE;
beforeEach(() => {
  process.env.DEUX_FACTEURS_CLE = randomBytes(32).toString("base64");
});
afterEach(() => {
  if (avant === undefined) delete process.env.DEUX_FACTEURS_CLE;
  else process.env.DEUX_FACTEURS_CLE = avant;
});

describe("la clé", () => {
  it("32 octets en base64 ou base64url ; toute autre taille vaut une clé absente", () => {
    expect(cleMaitresse({ DEUX_FACTEURS_CLE: randomBytes(32).toString("base64url") })).not.toBeNull();
    expect(cleMaitresse({ DEUX_FACTEURS_CLE: randomBytes(16).toString("base64") })).toBeNull();
    expect(cleMaitresse({ DEUX_FACTEURS_CLE: "" })).toBeNull();
    expect(cleMaitresse({})).toBeNull();
  });

  it("sans clé, ni chiffrement ni empreinte : une erreur qui la nomme", () => {
    delete process.env.DEUX_FACTEURS_CLE;
    expect(() => chiffrer("SECRET", "user-1")).toThrow(CleAbsente);
    expect(() => empreinteDeSecours("ABCDEFGH", "user-1")).toThrow(/DEUX_FACTEURS_CLE/u);
  });
});

describe("le secret chiffré", () => {
  it("aller-retour, et jamais le clair dans l'enveloppe ; deux chiffrements diffèrent", () => {
    const e1 = chiffrer("JBSWY3DPEHPK3PXP", "user-1");
    const e2 = chiffrer("JBSWY3DPEHPK3PXP", "user-1");
    expect(e1).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/u);
    expect(e1).not.toContain("JBSWY3DP");
    expect(e1).not.toBe(e2);
    expect(dechiffrer(e1, "user-1")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("recopié sur un autre compte, il ne se déchiffre pas", () => {
    expect(dechiffrer(chiffrer("JBSWY3DPEHPK3PXP", "user-1"), "user-2")).toBeNull();
  });

  it("altéré, ou d'une version inconnue, il ne se déchiffre pas", () => {
    const e = chiffrer("JBSWY3DPEHPK3PXP", "user-1");
    const [v, iv, tag, donnees] = e.split(".") as [string, string, string, string];
    const autre = donnees.startsWith("A") ? `B${donnees.slice(1)}` : `A${donnees.slice(1)}`;
    expect(dechiffrer([v, iv, tag, autre].join("."), "user-1")).toBeNull();
    expect(dechiffrer(["v2", iv, tag, donnees].join("."), "user-1")).toBeNull();
    expect(dechiffrer("illisible", "user-1")).toBeNull();
  });

  it("sous une autre clé, il ne se déchiffre pas", () => {
    const e = chiffrer("JBSWY3DPEHPK3PXP", "user-1");
    process.env.DEUX_FACTEURS_CLE = randomBytes(32).toString("base64");
    expect(dechiffrer(e, "user-1")).toBeNull();
  });
});

describe("l'empreinte d'un code de secours", () => {
  it("stable pour un compte, différente d'un compte à l'autre et d'une clé à l'autre", () => {
    const a = empreinteDeSecours("ABCDEFGH", "user-1");
    expect(empreinteDeSecours("ABCDEFGH", "user-1")).toBe(a);
    expect(empreinteDeSecours("ABCDEFGH", "user-2")).not.toBe(a);
    expect(a).not.toContain("ABCDEFGH");
    process.env.DEUX_FACTEURS_CLE = randomBytes(32).toString("base64");
    expect(empreinteDeSecours("ABCDEFGH", "user-1")).not.toBe(a);
  });
});
