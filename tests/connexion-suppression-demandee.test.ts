// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R-O05, revue S.183 — un compte dont la suppression est demandée ne se
 * rouvre pas.
 *
 * `demanderLaSuppression` ferme les sessions **avant** la purge, « sans
 * attendre son issue », pour que personne ne dépose une pièce dans un
 * dossier en train d'être vidé. Quand le stockage refuse, le compte reste
 * « suppression demandée », non anonymisé : son empreinte de mot de passe
 * est encore là. La connexion ne regardait que `suspendedAt`, et le même
 * mot de passe rouvrait une session sur le compte à moitié purgé.
 */
const m = vi.hoisted(() => ({
  trouver: vi.fn(),
  maj: vi.fn(),
  majPlusieurs: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: m.trouver, update: m.maj, updateMany: m.majPlusieurs } },
}));
vi.mock("@/server/securite/secret", async (original) => ({
  ...(await original<typeof import("@/server/securite/secret")>()),
  correspond: vi.fn(async () => true),
  aRecalculer: () => false,
}));

import { connecter } from "@/server/acces/comptes";

const compte = {
  id: "candidat-1",
  email: "candidat@example.org",
  passwordHash: "empreinte",
  failedLogins: 0,
  lockedUntil: null,
  suspendedAt: null,
  deletionRequestedAt: null,
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.maj.mockResolvedValue({ failedLogins: 1 });
  m.majPlusieurs.mockResolvedValue({ count: 1 });
});

describe("connexion d'un compte dont la suppression est demandée", () => {
  it("le bon mot de passe ouvre un compte ordinaire", async () => {
    m.trouver.mockResolvedValue(compte);
    expect((await connecter(compte.email, "juste")).ouverte).toBe(true);
  });

  it("le même mot de passe ne rouvre pas un compte en suppression demandée", async () => {
    m.trouver.mockResolvedValue({ ...compte, deletionRequestedAt: new Date("2026-10-22") });

    const resultat = await connecter(compte.email, "juste");

    expect(resultat.ouverte).toBe(false);
    // Aucune remise à zéro du compteur : rien n'a été ouvert.
    expect(m.majPlusieurs).not.toHaveBeenCalled();
  });

  it("le refus ne dit pas pourquoi : même message qu'un mot de passe faux", async () => {
    m.trouver.mockResolvedValue({ ...compte, deletionRequestedAt: new Date("2026-10-22") });
    const refus = await connecter(compte.email, "juste");
    m.trouver.mockResolvedValue({ ...compte, suspendedAt: new Date("2026-10-22") });
    const suspendu = await connecter(compte.email, "juste");
    expect(refus.ouverte === false && suspendu.ouverte === false).toBe(true);
    if (!refus.ouverte && !suspendu.ouverte) expect(refus.message).toBe(suspendu.message);
  });
});
