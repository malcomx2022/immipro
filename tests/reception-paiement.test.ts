import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La réception d'un paiement ne dépend plus du courrier — revue du
 * 07/10/2026, F3.
 *
 * Une lecture de la base ou un transport qui levait après le crédit
 * renvoyait une erreur au fournisseur : il rejouait une notification déjà
 * appliquée, que l'idempotence tenait pour un rejeu muet — et le reçu
 * n'était jamais envoyé. `smoke:courrier` joue la reprise sur un vrai
 * relais ; ces essais tiennent la réponse.
 */
const transaction = {
  id: "t1",
  reference: "IMP-261008-RECU01",
  userId: "u1",
  applicationId: "a1",
  amountMajor: 15000,
  currency: "XOF",
};

const pannes = { creation: false, lecture: false, envoi: false };

vi.mock("@/server/acces/paiements", () => ({
  appliquerLaNotification: vi.fn(async () => ({ issue: "creditee", transaction })),
}));
vi.mock("@/server/acces/journal", () => ({ journaliser: vi.fn(async () => undefined) }));
vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      create: vi.fn(async () => {
        if (pannes.creation) throw new Error("base indisponible");
        return { id: "n1", emailAttempts: 0 };
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    user: {
      findUnique: vi.fn(async () => {
        if (pannes.lecture) throw new Error("lecture impossible");
        return { email: "awa@exemple.test", deletionRequestedAt: null };
      }),
    },
  },
}));
vi.mock("@/server/courrier", () => ({
  envoyerRecu: vi.fn(async () => {
    if (pannes.envoi) throw new Error("transport en panne");
    return { issue: "envoye" };
  }),
  envoyerRemboursementConfirme: vi.fn(async () => ({ issue: "envoye" })),
}));

const notification = {
  providerEventId: "stripe:evt_1",
  providerTxId: "stripe:cs_1",
  reference: transaction.reference,
  statut: "CONFIRMEE" as const,
  montantMineur: 15000,
  devise: "XOF",
  rembourseMineur: null,
};

beforeEach(() => {
  pannes.creation = false;
  pannes.lecture = false;
  pannes.envoi = false;
});

describe("la réception acquitte un paiement crédité, quoi qu'il arrive au reçu", () => {
  it("un envoi qui lève rend quand même « créditée »", async () => {
    pannes.envoi = true;
    const { traiterLaNotification } = await import("@/server/paiement/reception");
    await expect(traiterLaNotification(notification, "stripe")).resolves.toEqual({
      recue: true,
      issue: "creditee",
    });
  });

  it("une lecture du compte qui lève rend quand même « créditée »", async () => {
    pannes.lecture = true;
    const { traiterLaNotification } = await import("@/server/paiement/reception");
    await expect(traiterLaNotification(notification, "stripe")).resolves.toMatchObject({
      issue: "creditee",
    });
  });

  it("une réservation qui lève rend quand même « créditée »", async () => {
    pannes.creation = true;
    const { traiterLaNotification } = await import("@/server/paiement/reception");
    await expect(traiterLaNotification(notification, "stripe")).resolves.toMatchObject({
      issue: "creditee",
    });
  });

  it("le reçu est réservé avec sa clé, et le courrier en attente", async () => {
    const { db } = await import("@/lib/db");
    const { traiterLaNotification } = await import("@/server/paiement/reception");
    await traiterLaNotification(notification, "stripe");
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "PAIEMENT",
          dedupKey: `recu:${transaction.reference}`,
          emailStatus: "EN_ATTENTE",
        }),
      }),
    );
  });
});
