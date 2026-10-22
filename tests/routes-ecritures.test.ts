// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { EchecHttp } from "@/server/http/echecs";

/**
 * Les écritures sans test de route — revue S.183, constat C-1 : B-04,
 * B-03, partages, divergence, dépôt, échéancier, rappels, veille,
 * notification, partenaire et rendez-vous consultant.
 *
 * Leur logique vit dans `src/server/`, déjà testée ; ce qui manquait est
 * le contrat de la route elle-même : le rôle déclaré (RG-15.3), la limite
 * sensible, le corps refusé avant tout effet, le motif obligatoire au
 * journal (RG-15.1), la propriété du dossier lue avant d'écrire, et le
 * rejeu qui ne journalise pas un second geste. Le composeur est remplacé
 * par une capture de la définition, comme dans `simulation-procedures` ;
 * il est éprouvé pour lui-même ailleurs.
 */

interface Definition {
  nom: string;
  acces: string;
  limite: string;
  corps?: ZodType;
  traiter: (contexte: Record<string, unknown>) => Promise<unknown>;
}

const m = vi.hoisted(() => ({
  definitions: new Map<string, Definition>(),
  journaliser: vi.fn(),
  transaction: vi.fn(),
  utilisateur: vi.fn(),
  declarer: vi.fn(),
  trancher: vi.fn(),
  acheverLaSuppression: vi.fn(),
  emettreUnCode: vi.fn(),
  envoyerCode: vi.fn(),
  retirerLePartage: vi.fn(),
  dossierDuCandidat: vi.fn(),
  arbitrer: vi.fn(),
  demanderCorrection: vi.fn(),
  fuseau: vi.fn(),
  majUtilisateur: vi.fn(),
  fermerSessions: vi.fn(),
  consignerReleve: vi.fn(),
  enregistrerRappels: vi.fn(),
  etatRappels: vi.fn(),
  notificationsLues: vi.fn(),
  notificationsComptees: vi.fn(),
  enregistrerSuite: vi.fn(),
  dossierAvecSaRegle: vi.fn(),
  remplacement: vi.fn(),
  majDossier: vi.fn(),
  transactionSql: vi.fn(),
  echeancier: vi.fn(),
  consultant: vi.fn(),
  tenir: vi.fn(),
  rattacher: vi.fn(),
  ouvrirLeTunnel: vi.fn(),
}));

vi.mock("@/server/http/route", () => ({
  route: (definition: Definition) => {
    m.definitions.set(definition.nom, definition);
    return definition.traiter;
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: { findUnique: m.transaction },
    user: { findUnique: m.utilisateur, update: m.majUtilisateur },
    notification: { updateMany: m.notificationsLues, count: m.notificationsComptees },
    application: { update: m.majDossier },
    consultant: { findFirst: m.consultant },
    $transaction: m.transactionSql,
  },
}));
vi.mock("@/server/acces/journal", () => ({ journaliser: m.journaliser }));
vi.mock("@/server/acces/paiements", () => ({
  declarerLeRemboursementManuel: m.declarer,
  trancherLaRevueManuelle: m.trancher,
  ouvrirLeTunnel: m.ouvrirLeTunnel,
}));
vi.mock("@/server/acces/suppression", () => ({ acheverLaSuppression: m.acheverLaSuppression }));
vi.mock("@/server/acces/comptes", () => ({ emettreUnCode: m.emettreUnCode }));
vi.mock("@/server/courrier", () => ({ envoyerCodeDeVerification: m.envoyerCode }));
vi.mock("@/server/lecture/consultants", () => ({
  retirerLePartage: m.retirerLePartage,
  partagesDuCandidat: vi.fn(),
}));
// `exigerModifiable` reste le vrai : c'est lui qui fige un dossier soumis.
vi.mock("@/server/acces/dossiers", async (original) => ({
  ...(await original<typeof import("@/server/acces/dossiers")>()),
  dossierDuCandidat: m.dossierDuCandidat,
  dossierAvecSaRegle: m.dossierAvecSaRegle,
}));
vi.mock("@/server/dossiers/migration", () => ({ arbitrerLaDivergence: m.arbitrer }));
vi.mock("@/server/dossiers/parcours", () => ({ demanderUneCorrectionDuDepot: m.demanderCorrection }));
vi.mock("@/server/comptes/rappels", () => ({
  fuseauDuCandidat: m.fuseau,
  enregistrerLesPreferencesDeRappel: m.enregistrerRappels,
  etatDesRappels: m.etatRappels,
}));
vi.mock("@/server/securite/session", () => ({ fermerToutesLesSessions: m.fermerSessions }));
vi.mock("@/server/lecture/backoffice", () => ({
  collecte: vi.fn(),
  fichesSuivies: vi.fn(),
  comptes: vi.fn(),
}));
vi.mock("@/server/veille/releve", () => ({ consignerLeReleve: m.consignerReleve }));
vi.mock("@/server/acces/partenaires", () => ({ enregistrerLaSuite: m.enregistrerSuite }));
vi.mock("@/server/dossiers/echeancier", () => ({ remplacementDeLEcheancier: m.remplacement }));
vi.mock("@/server/lecture/dossiers", () => ({ echeancierDuDossier: m.echeancier }));
vi.mock("@/server/acces/regles", async (original) => ({
  ...(await original<typeof import("@/server/acces/regles")>()),
  payload: () => ({}),
  versFiche: () => ({ pays: "Pays-Bas", intitule: "Études supérieures" }),
}));
vi.mock("@/server/acces/consultations", () => ({
  tenirLeCreneau: m.tenir,
  rattacherLePaiement: m.rattacher,
}));
vi.mock("@/server/http/reponse", () => ({ sansContenu: () => "sans-contenu" }));

import "@/app/api/admin/paiements/[reference]/remboursement/manuel/route";
import "@/app/api/admin/paiements/[reference]/remboursement/tranche/route";
import "@/app/api/admin/utilisateurs/suppression/route";
import "@/app/api/admin/utilisateurs/verification/route";
import "@/app/api/comptes/partages/[id]/retrait/route";
import "@/app/api/dossiers/[id]/migrations/[migrationId]/route";
import "@/app/api/dossiers/[id]/depot/correction/route";
import "@/app/api/admin/utilisateurs/route";
import "@/app/api/admin/veille/route";
import "@/app/api/comptes/rappels/route";
import "@/app/api/notifications/[id]/route";
import "@/app/api/dossiers/[id]/echeancier/route";
import "@/app/api/dossiers/[id]/partenaires/[referralId]/route";
import "@/app/api/consultants/[id]/rendez-vous/route";
import { creneauxProposes } from "@/domain/consultants/rendez-vous";

const ADMIN = { id: "admin-1", role: "ADMIN" };
const CANDIDAT = { id: "candidat-1", role: "CANDIDAT" };

const definition = (nom: string): Definition => {
  const d = m.definitions.get(nom);
  if (!d) throw new Error(`route ${nom} non déclarée`);
  return d;
};

/** Le corps tel que le composeur le lirait : refusé avant `traiter`. */
const corpsAccepte = (nom: string, corps: unknown) =>
  definition(nom).corps!.safeParse(corps).success;

const codeDeLEchec = async (promesse: Promise<unknown>) => {
  try {
    await promesse;
  } catch (e) {
    if (e instanceof EchecHttp) return e.echec.code;
    throw e;
  }
  throw new Error("aucun échec levé");
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toutes les écritures C-1 déclarent leur rôle et une limite sensible", () => {
  it.each([
    ["admin.paiement.remboursement.manuel", "admin"],
    ["admin.paiement.remboursement.tranche", "admin"],
    ["admin.utilisateurs.suppression", "admin"],
    ["admin.utilisateurs.verification", "admin"],
    ["comptes.partages.retrait", "candidat"],
    ["dossier.migration", "candidat_verifie"],
    ["dossier.depot.correction", "candidat_verifie"],
    ["admin.utilisateurs.suspension", "admin"],
    ["admin.veille.relecture", "veilleur"],
    ["comptes.rappels.maj", "candidat"],
    ["notification.lue", "candidat"],
    ["dossier.echeancier.replanifier", "candidat"],
    ["dossier.partenaire.suite", "candidat"],
    ["consultants.rendezvous", "candidat_verifie"],
  ])("%s : rôle %s, limite sensible", (nom, acces) => {
    expect(definition(nom).acces).toBe(acces);
    expect(definition(nom).limite).toBe("sensible");
  });
});

describe("B-04 — remboursement FedaPay déclaré à la main", () => {
  const NOM = "admin.paiement.remboursement.manuel";
  const appeler = () =>
    definition(NOM).traiter({
      corps: { referenceFournisseur: "RF-12345" },
      params: { reference: "IMP-001" },
      acteur: ADMIN,
    });

  it("refuse une référence démesurée avant tout effet", () => {
    expect(corpsAccepte(NOM, { referenceFournisseur: "x".repeat(201) })).toBe(false);
    expect(corpsAccepte(NOM, {})).toBe(false);
  });

  it("journalise une fois la déclaration, avec la référence et la somme figée", async () => {
    m.declarer.mockResolvedValue({
      issue: "declaree",
      referenceFournisseur: "RF-12345",
      montantMineur: 15000,
    });
    m.transaction.mockResolvedValue({ id: "tx-1", currency: "XOF" });

    const reponse = await appeler();

    expect(m.declarer).toHaveBeenCalledWith("IMP-001", "RF-12345", ADMIN.id);
    expect(reponse).toMatchObject({ issue: "declaree" });
    expect(m.journaliser).toHaveBeenCalledTimes(1);
    const ligne = m.journaliser.mock.calls[0]![0];
    expect(ligne).toMatchObject({
      acteurId: ADMIN.id,
      action: "paiement.remboursement.manuel",
      cible: "transaction:tx-1",
      details: { referenceFournisseur: "RF-12345", montantMineur: 15000 },
    });
    expect(ligne.motif).toContain("RF-12345");
    expect(ligne.motif).toContain("F CFA");
  });

  it("un rejeu de la même référence ne journalise pas un second geste", async () => {
    m.declarer.mockResolvedValue({
      issue: "deja_declaree",
      referenceFournisseur: "RF-12345",
      montantMineur: 15000,
    });

    const reponse = await appeler();

    expect(reponse).toMatchObject({ issue: "deja_declaree" });
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("une déclaration refusée par le service n'écrit rien au journal", async () => {
    m.declarer.mockRejectedValue(new EchecHttp("etat_incompatible"));
    expect(await codeDeLEchec(appeler())).toBe("etat_incompatible");
    expect(m.journaliser).not.toHaveBeenCalled();
  });
});

describe("B-04 — revue manuelle d'un remboursement tranchée", () => {
  const NOM = "admin.paiement.remboursement.tranche";
  const MOTIF = "Accord de la direction du 20/10, pack à moitié utilisé.";
  const appeler = (montant = "5000") =>
    definition(NOM).traiter({
      corps: { montant, motif: MOTIF },
      params: { reference: "IMP-002" },
      acteur: ADMIN,
    });

  it("exige un motif d'au moins dix caractères", () => {
    expect(corpsAccepte(NOM, { montant: "5000", motif: "  trop  " })).toBe(false);
    expect(corpsAccepte(NOM, { montant: "5000" })).toBe(false);
    expect(corpsAccepte(NOM, { montant: "5000", motif: MOTIF })).toBe(true);
  });

  it("un paiement inconnu est refusé sans rien trancher ni journaliser", async () => {
    m.transaction.mockResolvedValue(null);
    expect(await codeDeLEchec(appeler())).toBe("paiement_introuvable");
    expect(m.trancher).not.toHaveBeenCalled();
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("une somme décidée se journalise avec le montant relu et l'issue de l'envoi", async () => {
    m.transaction
      .mockResolvedValueOnce({ id: "tx-2" })
      .mockResolvedValueOnce({ refundAmountMinor: 5000 });
    m.trancher.mockResolvedValue({ issue: "decidee", envoi: "demandee" });

    await appeler();

    expect(m.trancher).toHaveBeenCalledWith("IMP-002", "5000", MOTIF, ADMIN.id);
    expect(m.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "paiement.remboursement.tranche",
        cible: "transaction:tx-2",
        motif: MOTIF,
        details: { montantMineur: 5000, issue: "decidee", envoi: "demandee" },
      }),
    );
  });

  it("zéro referme l'obligation et se journalise à zéro", async () => {
    m.transaction.mockResolvedValueOnce({ id: "tx-2" }).mockResolvedValueOnce({
      refundAmountMinor: null,
    });
    m.trancher.mockResolvedValue({ issue: "refermee" });

    await appeler("0");

    expect(m.journaliser.mock.calls[0]![0].details).toEqual({ montantMineur: 0, issue: "refermee" });
  });

  it("une décision refusée n'est jamais journalisée comme prise", async () => {
    m.transaction.mockResolvedValue({ id: "tx-2" });
    m.trancher.mockRejectedValue(new EchecHttp("etat_incompatible"));
    expect(await codeDeLEchec(appeler())).toBe("etat_incompatible");
    expect(m.journaliser).not.toHaveBeenCalled();
  });
});

describe("B-03 — relance de la suppression d'un compte", () => {
  const NOM = "admin.utilisateurs.suppression";
  const userId = randomUUID();
  const MOTIF = "Stockage indisponible cette nuit, purge à reprendre.";
  const appeler = () => definition(NOM).traiter({ corps: { userId, motif: MOTIF }, acteur: ADMIN });

  it("exige un identifiant valide et un motif", () => {
    expect(corpsAccepte(NOM, { userId: "pas-un-id", motif: MOTIF })).toBe(false);
    expect(corpsAccepte(NOM, { userId, motif: "court" })).toBe(false);
    expect(corpsAccepte(NOM, { userId, motif: MOTIF })).toBe(true);
  });

  it("un compte inconnu est refusé", async () => {
    m.utilisateur.mockResolvedValue(null);
    expect(await codeDeLEchec(appeler())).toBe("introuvable");
    expect(m.acheverLaSuppression).not.toHaveBeenCalled();
  });

  it("un administrateur ne déclenche pas une suppression que le candidat n'a pas demandée", async () => {
    m.utilisateur.mockResolvedValue({ id: userId, deletedAt: null, deletionRequestedAt: null });
    expect(await codeDeLEchec(appeler())).toBe("etat_incompatible");
    expect(m.journaliser).not.toHaveBeenCalled();
    expect(m.acheverLaSuppression).not.toHaveBeenCalled();
  });

  it("un compte déjà anonymisé se relit sans rien réécrire ni journaliser", async () => {
    m.utilisateur.mockResolvedValue({
      id: userId,
      deletedAt: new Date("2026-10-01"),
      deletionRequestedAt: new Date("2026-09-01"),
    });
    expect(await appeler()).toEqual({ anonymise: true, dossiers: 0, versions: 0 });
    expect(m.journaliser).not.toHaveBeenCalled();
    expect(m.acheverLaSuppression).not.toHaveBeenCalled();
  });

  it("le motif est au journal avant la reprise de la purge", async () => {
    m.utilisateur.mockResolvedValue({
      id: userId,
      deletedAt: null,
      deletionRequestedAt: new Date("2026-10-20"),
    });
    m.acheverLaSuppression.mockResolvedValue({ anonymise: false, dossiers: 1, versions: 2 });

    expect(await appeler()).toEqual({ anonymise: false, dossiers: 1, versions: 2 });
    expect(m.journaliser).toHaveBeenCalledWith({
      acteurId: ADMIN.id,
      action: "compte.relance",
      cible: `user:${userId}`,
      motif: MOTIF,
    });
    expect(m.journaliser.mock.invocationCallOrder[0]).toBeLessThan(
      m.acheverLaSuppression.mock.invocationCallOrder[0]!,
    );
  });
});

describe("B-03 — renvoi du code de vérification", () => {
  const NOM = "admin.utilisateurs.verification";
  const userId = randomUUID();
  const MOTIF = "Le candidat a fermé son écran de vérification.";
  const compte = {
    id: userId,
    email: "candidat@example.org",
    emailVerified: null,
    deletedAt: null,
    deletionRequestedAt: null,
  };
  const appeler = () => definition(NOM).traiter({ corps: { userId, motif: MOTIF }, acteur: ADMIN });

  it("exige un motif", () => {
    expect(corpsAccepte(NOM, { userId, motif: "" })).toBe(false);
  });

  it.each([
    ["un compte effacé", { deletedAt: new Date() }, "introuvable"],
    ["une adresse déjà vérifiée", { emailVerified: new Date() }, "etat_incompatible"],
    ["un compte qui demande sa suppression", { deletionRequestedAt: new Date() }, "etat_incompatible"],
  ])("refuse %s sans émettre de code", async (_cas, etat, code) => {
    m.utilisateur.mockResolvedValue({ ...compte, ...etat });
    expect(await codeDeLEchec(appeler())).toBe(code);
    expect(m.emettreUnCode).not.toHaveBeenCalled();
    expect(m.journaliser).not.toHaveBeenCalled();
  });

  it("journalise le motif avant l'envoi, à la seule adresse du compte, sans le code", async () => {
    m.utilisateur.mockResolvedValue(compte);
    m.emettreUnCode.mockResolvedValue("482913");
    m.envoyerCode.mockResolvedValue({ issue: "envoye" });

    const reponse = await appeler();

    expect(reponse).toEqual({ envoye: true });
    expect(m.emettreUnCode).toHaveBeenCalledWith(userId, "VERIFICATION_EMAIL");
    expect(m.envoyerCode).toHaveBeenCalledWith(compte.email, "482913");
    expect(m.journaliser.mock.invocationCallOrder[0]).toBeLessThan(
      m.emettreUnCode.mock.invocationCallOrder[0]!,
    );
    expect(JSON.stringify(m.journaliser.mock.calls)).not.toContain("482913");
    expect(JSON.stringify(reponse)).not.toContain("482913");
  });

  it("un transport muet n'est pas un envoi", async () => {
    m.utilisateur.mockResolvedValue(compte);
    m.emettreUnCode.mockResolvedValue("482913");
    m.envoyerCode.mockResolvedValue({ issue: "non_configure" });
    expect(await codeDeLEchec(appeler())).toBe("service_indisponible");
  });
});

describe("A-05 — retrait d'un accord de partage", () => {
  const NOM = "comptes.partages.retrait";
  const appeler = () => definition(NOM).traiter({ params: { id: "acces-1" }, acteur: CANDIDAT });

  it("retire l'accord du seul candidat connecté et le journalise", async () => {
    m.retirerLePartage.mockResolvedValue({
      consultant: "Awa Dossou",
      dossierId: "dossier-1",
      dejaRetire: false,
    });

    expect(await appeler()).toEqual({ retire: true, dejaRetire: false });
    expect(m.retirerLePartage).toHaveBeenCalledWith("acces-1", CANDIDAT.id);
    expect(m.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({
        acteurId: CANDIDAT.id,
        action: "partage.retrait",
        cible: "application:dossier-1",
      }),
    );
  });

  it("un second appui rend le même résultat sans seconde ligne au journal", async () => {
    m.retirerLePartage.mockResolvedValue({
      consultant: "Awa Dossou",
      dossierId: "dossier-1",
      dejaRetire: true,
    });

    expect(await appeler()).toEqual({ retire: true, dejaRetire: true });
    expect(m.journaliser).not.toHaveBeenCalled();
  });
});

describe("T-02 — arbitrage d'une divergence réglementaire (WF-11)", () => {
  const NOM = "dossier.migration";
  const appeler = (decision = "CONSERVER") =>
    definition(NOM).traiter({
      corps: { decision },
      params: { id: "dossier-1", migrationId: "migration-1" },
      acteur: CANDIDAT,
    });

  it("n'accepte que les deux décisions prévues", () => {
    expect(corpsAccepte(NOM, { decision: "MIGRER" })).toBe(true);
    expect(corpsAccepte(NOM, { decision: "CONSERVER" })).toBe(true);
    expect(corpsAccepte(NOM, { decision: "ANNULER" })).toBe(false);
  });

  it("lit le dossier du candidat connecté avant d'arbitrer", async () => {
    const dossier = { id: "dossier-1", userId: CANDIDAT.id };
    m.dossierDuCandidat.mockResolvedValue(dossier);
    m.arbitrer.mockResolvedValue({ decision: "CONSERVER" });

    await appeler();

    expect(m.dossierDuCandidat).toHaveBeenCalledWith("dossier-1", CANDIDAT.id);
    expect(m.arbitrer).toHaveBeenCalledWith(dossier, "migration-1", "CONSERVER");
  });

  it("le dossier d'un autre candidat n'est jamais arbitré", async () => {
    m.dossierDuCandidat.mockRejectedValue(new EchecHttp("introuvable"));
    expect(await codeDeLEchec(appeler("MIGRER"))).toBe("introuvable");
    expect(m.arbitrer).not.toHaveBeenCalled();
  });
});

describe("Correction de la date réelle du dépôt — arbitrage S.90", () => {
  const NOM = "dossier.depot.correction";
  const appeler = () =>
    definition(NOM).traiter({
      corps: { deposeLe: "2026-10-14", explication: "J'ai déposé un jour plus tôt." },
      params: { id: "dossier-1" },
      acteur: CANDIDAT,
    });

  it("refuse une date incomplète ou une explication trop longue", () => {
    expect(corpsAccepte(NOM, { deposeLe: "14/10/2026", explication: "" })).toBe(false);
    expect(corpsAccepte(NOM, { deposeLe: "2026-10-14", explication: "x".repeat(1001) })).toBe(false);
    expect(corpsAccepte(NOM, { deposeLe: "2026-10-14", explication: "" })).toBe(true);
  });

  it("transmet la demande dans le fuseau du candidat et répond qu'elle attend un opérateur", async () => {
    const dossier = { id: "dossier-1", userId: CANDIDAT.id };
    m.dossierDuCandidat.mockResolvedValue(dossier);
    m.fuseau.mockResolvedValue("Africa/Porto-Novo");
    m.demanderCorrection.mockResolvedValue({
      requestedDate: new Date("2026-10-14T00:00:00Z"),
      createdAt: new Date("2026-10-22T10:00:00Z"),
    });

    const reponse = (await appeler()) as { deposeLe: string; message: string };

    expect(m.dossierDuCandidat).toHaveBeenCalledWith("dossier-1", CANDIDAT.id);
    expect(m.demanderCorrection).toHaveBeenCalledWith(dossier, {
      deposeLe: "2026-10-14",
      explication: "J'ai déposé un jour plus tôt.",
      fuseau: "Africa/Porto-Novo",
    });
    expect(reponse.deposeLe).toBe("2026-10-14");
    expect(reponse.message.length).toBeGreaterThan(0);
  });

  it("le dossier d'un autre candidat ne reçoit aucune demande", async () => {
    m.dossierDuCandidat.mockRejectedValue(new EchecHttp("introuvable"));
    expect(await codeDeLEchec(appeler())).toBe("introuvable");
    expect(m.demanderCorrection).not.toHaveBeenCalled();
  });
});

describe("B-03 — suspension et rétablissement d'un compte", () => {
  const NOM = "admin.utilisateurs.suspension";
  const userId = randomUUID();
  const appeler = (suspendre: boolean) =>
    definition(NOM).traiter({
      corps: { userId, suspendre, motif: "Signalement de fraude au paiement." },
      acteur: ADMIN,
    });

  it("exige un motif", () => {
    expect(corpsAccepte(NOM, { userId, suspendre: true, motif: "  " })).toBe(false);
    expect(corpsAccepte(NOM, { userId, suspendre: true })).toBe(false);
  });

  it("un compte inconnu n'est ni journalisé ni modifié", async () => {
    m.utilisateur.mockResolvedValue(null);
    expect(await codeDeLEchec(appeler(true))).toBe("introuvable");
    expect(m.journaliser).not.toHaveBeenCalled();
    expect(m.majUtilisateur).not.toHaveBeenCalled();
  });

  it("la suspension est journalisée avant l'écriture et ferme toutes les sessions", async () => {
    m.utilisateur.mockResolvedValue({ id: userId });
    m.fermerSessions.mockResolvedValue(2);

    expect(await appeler(true)).toEqual({ suspendu: true, sessionsFermees: 2 });
    expect(m.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({ action: "compte.suspension", cible: `user:${userId}` }),
    );
    expect(m.journaliser.mock.invocationCallOrder[0]).toBeLessThan(
      m.majUtilisateur.mock.invocationCallOrder[0]!,
    );
    expect(m.majUtilisateur.mock.calls[0]![0].data.suspendedAt).toBeInstanceOf(Date);
    expect(m.fermerSessions).toHaveBeenCalledWith(userId);
  });

  it("le rétablissement efface la date sans toucher aux sessions", async () => {
    m.utilisateur.mockResolvedValue({ id: userId });

    expect(await appeler(false)).toEqual({ suspendu: false, sessionsFermees: 0 });
    expect(m.journaliser.mock.calls[0]![0].action).toBe("compte.retablissement");
    expect(m.majUtilisateur.mock.calls[0]![0].data).toEqual({ suspendedAt: null });
    expect(m.fermerSessions).not.toHaveBeenCalled();
  });
});

describe("WF-14 — relevé de veille", () => {
  const NOM = "admin.veille.relecture";
  const id = randomUUID();

  it("n'accepte que les trois conclusions et une note bornée", () => {
    expect(corpsAccepte(NOM, { id, conclusion: "A_ARBITRER", note: "Seuil relevé." })).toBe(true);
    expect(corpsAccepte(NOM, { id, conclusion: "VALIDE" })).toBe(false);
    expect(corpsAccepte(NOM, { id, note: "x".repeat(501) })).toBe(false);
  });

  it("sans conclusion, le relevé vaut « à jour » et porte le veilleur", async () => {
    const veilleur = { id: "veilleur-1", role: "VEILLEUR" };
    await definition(NOM).traiter({ corps: { id }, acteur: veilleur });
    expect(m.consignerReleve).toHaveBeenCalledWith(id, "A_JOUR", undefined, veilleur);
  });
});

describe("A-04 — préférences de rappel", () => {
  const NOM = "comptes.rappels.maj";
  const valide = { actifs: true, email: true, fuseau: "Africa/Porto-Novo", joursAvant: 7 };

  it("refuse un fuseau hors liste ou un délai non proposé", () => {
    expect(corpsAccepte(NOM, valide)).toBe(true);
    expect(corpsAccepte(NOM, { ...valide, fuseau: "Mars/Olympus" })).toBe(false);
    expect(corpsAccepte(NOM, { ...valide, joursAvant: 5 })).toBe(false);
  });

  it("enregistre pour le seul candidat connecté et rend l'état relu", async () => {
    m.etatRappels.mockResolvedValue({ actifs: true });
    expect(await definition(NOM).traiter({ corps: valide, acteur: CANDIDAT })).toEqual({
      actifs: true,
    });
    expect(m.enregistrerRappels).toHaveBeenCalledWith(CANDIDAT.id, valide);
    expect(m.etatRappels).toHaveBeenCalledWith(CANDIDAT.id);
  });
});

describe("Notification lue", () => {
  const NOM = "notification.lue";
  const appeler = () => definition(NOM).traiter({ params: { id: "notif-1" }, acteur: CANDIDAT });

  it("ne marque que les notifications du candidat, encore non lues", async () => {
    m.notificationsLues.mockResolvedValue({ count: 1 });
    expect(await appeler()).toBe("sans-contenu");
    expect(m.notificationsLues.mock.calls[0]![0].where).toEqual({
      id: "notif-1",
      userId: CANDIDAT.id,
      readAt: null,
    });
  });

  it("une notification déjà lue se relit sans erreur, ni nouvelle date", async () => {
    m.notificationsLues.mockResolvedValue({ count: 0 });
    m.notificationsComptees.mockResolvedValue(1);
    expect(await appeler()).toBe("sans-contenu");
  });

  it("la notification d'un autre candidat est introuvable", async () => {
    m.notificationsLues.mockResolvedValue({ count: 0 });
    m.notificationsComptees.mockResolvedValue(0);
    expect(await codeDeLEchec(appeler())).toBe("introuvable");
    expect(m.notificationsComptees.mock.calls[0]![0].where).toEqual({
      id: "notif-1",
      userId: CANDIDAT.id,
    });
  });
});

describe("WF-09 — replanification de l'échéancier", () => {
  const NOM = "dossier.echeancier.replanifier";
  const demain = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const appeler = () =>
    definition(NOM).traiter({
      corps: { dateCible: demain },
      params: { id: "dossier-1" },
      acteur: CANDIDAT,
    });

  it("refuse une date passée ou mal formée sur le champ", () => {
    expect(corpsAccepte(NOM, { dateCible: demain })).toBe(true);
    expect(corpsAccepte(NOM, { dateCible: "2020-01-01" })).toBe(false);
    expect(corpsAccepte(NOM, { dateCible: "01/09/2027" })).toBe(false);
  });

  it("un dossier figé ne se replanifie pas", async () => {
    m.dossierAvecSaRegle.mockResolvedValue({ id: "dossier-1", status: "SOUMIS", visaRule: {} });
    expect(await codeDeLEchec(appeler())).toBe("dossier_fige");
    expect(m.transactionSql).not.toHaveBeenCalled();
  });

  it("sans règle figée, rien n'est recalculé", async () => {
    m.dossierAvecSaRegle.mockResolvedValue({ id: "dossier-1", status: "ACTIF", visaRule: null });
    expect(await codeDeLEchec(appeler())).toBe("regle_indisponible");
    expect(m.transactionSql).not.toHaveBeenCalled();
  });

  it("échéancier et date cible changent dans une seule transaction, sur le dossier du candidat", async () => {
    m.dossierAvecSaRegle.mockResolvedValue({ id: "dossier-1", status: "ACTIF", visaRule: {} });
    m.remplacement.mockResolvedValue(["suppression", "creation"]);
    m.majDossier.mockReturnValue("maj-dossier");
    m.echeancier.mockResolvedValue({ etapes: [] });

    expect(await appeler()).toEqual({ etapes: [] });
    expect(m.dossierAvecSaRegle).toHaveBeenCalledWith("dossier-1", CANDIDAT.id);
    expect(m.transactionSql).toHaveBeenCalledTimes(1);
    expect(m.transactionSql).toHaveBeenCalledWith(["suppression", "creation", "maj-dossier"]);
    expect(m.majDossier.mock.calls[0]![0].data.targetDate.toISOString()).toBe(
      `${demain}T00:00:00.000Z`,
    );
  });
});

describe("WF-13 — suite donnée à une proposition partenaire", () => {
  const NOM = "dossier.partenaire.suite";

  it("n'accepte que les trois issues", () => {
    expect(corpsAccepte(NOM, { suite: "NE_PLUS_PROPOSER" })).toBe(true);
    expect(corpsAccepte(NOM, { suite: "ACCEPTER_TOUT" })).toBe(false);
  });

  it("enregistre la suite pour le seul candidat connecté", async () => {
    await definition(NOM).traiter({
      corps: { suite: "CONTINUER_SEUL" },
      params: { id: "dossier-1", referralId: "proposition-1" },
      acteur: CANDIDAT,
    });
    expect(m.enregistrerSuite).toHaveBeenCalledWith("proposition-1", CANDIDAT.id, "CONTINUER_SEUL");
  });
});

describe("WF-12 — demande de rendez-vous avec un consultant", () => {
  const NOM = "consultants.rendezvous";
  const dossierId = randomUUID();
  const propose = () => creneauxProposes(new Date()).at(-1)!.toISOString();
  const appeler = (creneau = propose()) =>
    definition(NOM).traiter({
      corps: { dossierId, creneau, accordDePartage: true },
      params: { id: "consultant-1" },
      acteur: CANDIDAT,
    });
  const habilite = { id: "consultant-1", name: "Awa Dossou", accreditations: [{ id: "a" }] };

  beforeEach(() => {
    m.dossierAvecSaRegle.mockResolvedValue({ id: dossierId, visaRule: {} });
  });

  it("sans l'accord de partage coché, rien ne se réserve", () => {
    const creneau = propose();
    expect(corpsAccepte(NOM, { dossierId, creneau, accordDePartage: false })).toBe(false);
    expect(corpsAccepte(NOM, { dossierId, creneau })).toBe(false);
    expect(corpsAccepte(NOM, { dossierId, creneau, accordDePartage: true })).toBe(true);
  });

  it("le dossier d'un autre candidat ne tient aucun créneau", async () => {
    m.dossierAvecSaRegle.mockRejectedValue(new EchecHttp("introuvable"));
    expect(await codeDeLEchec(appeler())).toBe("introuvable");
    expect(m.tenir).not.toHaveBeenCalled();
  });

  it("un consultant sans habilitation en cours est introuvable", async () => {
    m.consultant.mockResolvedValue({ ...habilite, accreditations: [] });
    expect(await codeDeLEchec(appeler())).toBe("introuvable");
    expect(m.tenir).not.toHaveBeenCalled();
  });

  it.each([
    ["un créneau passé", new Date(Date.now() - 3_600_000).toISOString()],
    ["un horaire hors de l'offre", null],
  ])("refuse %s sans rien tenir ni ouvrir de paiement", async (_cas, creneau) => {
    m.consultant.mockResolvedValue(habilite);
    // Sept minutes après un créneau proposé : à venir, mais pas dans l'offre.
    const decale = new Date(new Date(propose()).getTime() + 7 * 60_000).toISOString();
    expect(await codeDeLEchec(appeler(creneau ?? decale))).toBe("etat_incompatible");
    expect(m.tenir).not.toHaveBeenCalled();
    expect(m.ouvrirLeTunnel).not.toHaveBeenCalled();
  });

  it("tient le créneau, ouvre le tunnel dans la devise du compte et rattache le paiement", async () => {
    m.consultant.mockResolvedValue(habilite);
    m.tenir.mockResolvedValue({
      reference: "RDV-1",
      debut: new Date(propose()),
      confirme: false,
      deja: false,
      tenuJusqua: new Date(Date.now() + 900_000),
    });
    m.utilisateur.mockResolvedValue({ countryCode: "BJ" });
    m.ouvrirLeTunnel.mockResolvedValue({
      transactionId: "tx-9",
      url: "https://paiement.example/RDV-1",
      reference: "IMP-RDV-1",
    });

    const reponse = (await appeler()) as Record<string, unknown>;

    expect(m.tenir.mock.calls[0]![0]).toMatchObject({
      applicationId: dossierId,
      consultantId: "consultant-1",
    });
    expect(m.ouvrirLeTunnel).toHaveBeenCalledWith(
      CANDIDAT.id,
      { type: "consultation", applicationId: dossierId },
      "XOF",
    );
    expect(m.rattacher).toHaveBeenCalledWith("RDV-1", "tx-9");
    expect(reponse).toMatchObject({ confirme: false, paiement: "IMP-RDV-1", dossier: "Pays-Bas — Études supérieures" });
  });

  it("un rendez-vous déjà payé ne rouvre pas de paiement", async () => {
    m.consultant.mockResolvedValue(habilite);
    m.tenir.mockResolvedValue({ reference: "RDV-1", debut: new Date(propose()), confirme: true });

    expect(await appeler()).toMatchObject({ confirme: true, deja: true, url: null });
    expect(m.ouvrirLeTunnel).not.toHaveBeenCalled();
    expect(m.rattacher).not.toHaveBeenCalled();
  });
});
