import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ trouver: vi.fn(), creer: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: m.trouver, create: m.creer } } }));
vi.mock("@/server/securite/secret", () => ({
  empreinte: vi.fn(async () => "empreinte_synthetique"),
}));
import { inscrire } from "@/server/acces/comptes";
beforeEach(() => {
  vi.clearAllMocks();
  m.trouver.mockResolvedValue(null);
  m.creer.mockResolvedValue({ id: "synthetique" });
});
const base = { email: "telephone@immipro.test", motDePasse: "RecetteL6Synthetique" };
describe("L6 — inscription et persistance", () => {
  it("conserve le téléphone en User.phone", async () => {
    await inscrire({ ...base, telephone: "00 229 01 97 00 00 42" });
    expect(m.creer).toHaveBeenCalledWith({
      data: expect.objectContaining({ phone: "+2290197000042" }),
    });
  });
  it("refuse un numéro incomplet avant tout accès au compte", async () => {
    await expect(inscrire({ ...base, telephone: "97000042" })).rejects.toMatchObject({
      echec: { code: "champs_invalides" },
    });
    expect(m.trouver).not.toHaveBeenCalled();
    expect(m.creer).not.toHaveBeenCalled();
  });
  it("un compte déjà inscrit n'est pas modifié par une seconde inscription", async () => {
    m.trouver.mockResolvedValue({ id: "existant" });
    expect(await inscrire({ ...base, telephone: "+2290197000042" })).toEqual({
      user: null,
      existait: true,
    });
    expect(m.creer).not.toHaveBeenCalled();
  });
});
