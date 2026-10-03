import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { lireFedaPay, lireStripe } from "@/server/paiement/notifications";
import { effetDeLaNotification } from "@/server/paiement/cycle";
import {
  agreger,
  DEVISE_DE_REFERENCE,
  estEnEchec,
  lignesDeTotal,
  estRembourse,
  LIBELLE_RAPPROCHEMENT,
  type Paiement,
} from "@/domain/backoffice/reconciliation";
import {
  A_REMBOURSER_A_LA_MAIN,
  MOTIF_DE_REFUS_DE_DECLARATION,
  cleDIdempotence,
  consigneFedaPay,
  defautDeDeclaration,
  lireLaReferenceDeRemboursement,
  suiteDeLaTentative,
} from "@/domain/paiement/remboursement";
import { REMBOURSEMENT_NON_OPERATIONNEL, remboursementFedaPay } from "@/server/paiement/fedapay";
import { leRembourseur } from "@/server/paiement/remboursement";

/**
 * Le remboursement arrive — M.B.
 *
 * `REMBOURSEE` était au schéma, la table du cycle l'autorisait, le reçu
 * savait le présenter, et les deux rails traduisaient déjà leur événement.
 * Rien ne l'écrivait pourtant, et la cause tenait dans une colonne :
 * `providerTxId` servait à la fois d'identifiant de transaction chez le
 * fournisseur et de clé d'idempotence du webhook.
 *
 * Ce fichier tient les deux bouts du correctif — ce que les rails
 * produisent, et ce que le back-office en fait.
 */

const fedapay = (id: string, status: string) =>
  lireFedaPay({ entity: { id, status, custom_metadata: { reference: "IMP-260920-AAAAAA" } } });

const stripe = (evenement: string, type: string, objet: string) =>
  lireStripe({
    id: evenement,
    type,
    data: { object: { id: objet, metadata: { reference: "IMP-260920-AAAAAA" } } },
  });

describe("une transaction reçoit plusieurs notifications", () => {
  /**
   * Le défaut, en une ligne. FedaPay renvoie l'entité : la confirmation et
   * le remboursement portent le même `entity.id`. Tant que l'idempotence
   * s'appuyait dessus, le remboursement se lisait comme un rejeu de la
   * confirmation et disparaissait sans laisser de trace.
   */
  it("FedaPay : confirmation et remboursement se distinguent, la transaction non", () => {
    const paye = fedapay("42", "approved")!;
    const rendu = fedapay("42", "refunded")!;

    expect(paye.statut).toBe("CONFIRMEE");
    expect(rendu.statut).toBe("REMBOURSEE");
    expect(rendu.providerEventId).not.toBe(paye.providerEventId);
    // Même transaction chez eux : c'est bien la même somme qui revient.
    expect(rendu.providerTxId).toBe(paye.providerTxId);
  });

  it("la même notification deux fois porte la même clé", () => {
    expect(fedapay("42", "refunded")!.providerEventId).toBe(
      fedapay("42", "refunded")!.providerEventId,
    );
    expect(stripe("evt_9", "charge.refunded", "ch_1")!.providerEventId).toBe(
      stripe("evt_9", "charge.refunded", "ch_1")!.providerEventId,
    );
  });

  /**
   * Stripe pose le problème à l'envers : l'événement de remboursement cite
   * la charge, la confirmation citait la session. Le remboursement
   * s'écrivait donc, mais en remplaçant la référence opérateur que le reçu
   * affiche — une pièce comptable dont la référence change après coup.
   */
  it("Stripe : l'événement se numérote, la transaction change d'objet", () => {
    const paye = stripe("evt_1", "checkout.session.completed", "cs_1")!;
    const rendu = stripe("evt_2", "charge.refunded", "ch_1")!;

    expect(paye.providerEventId).toBe("stripe:evt_1");
    expect(rendu.providerEventId).toBe("stripe:evt_2");
    expect(rendu.providerTxId).not.toBe(paye.providerTxId);
  });

  /**
   * Deux notifications de confirmation portant deux identifiants d'objet
   * différents existent chez Stripe — `checkout.session.completed` et
   * `payment_intent.succeeded`. L'ancienne clé ne les rapprochait pas :
   * c'est la course que la condition sur l'état lu couvre désormais.
   */
  it("deux confirmations d'un même paiement ne partagent aucune clé", () => {
    const session = stripe("evt_1", "checkout.session.completed", "cs_1")!;
    const intention = stripe("evt_2", "payment_intent.succeeded", "pi_1")!;
    expect(session.providerEventId).not.toBe(intention.providerEventId);
    expect(session.providerTxId).not.toBe(intention.providerTxId);
    expect(intention.statut).toBe("CONFIRMEE");
  });
});

describe("le cycle borne ce qu'un remboursement peut suivre", () => {
  it("un paiement encaissé peut être rendu, et cela ne crédite rien", () => {
    const effet = effetDeLaNotification("CONFIRMEE", "REMBOURSEE");
    expect(effet).toEqual({ type: "appliquer", vers: "REMBOURSEE", crediteLePack: false });
  });

  it("on ne rend pas une somme qui n'a pas été encaissée", () => {
    for (const depuis of ["INITIEE", "EN_ATTENTE", "ECHOUEE", "EXPIREE"] as const) {
      expect(effetDeLaNotification(depuis, "REMBOURSEE").type, depuis).toBe("refus");
    }
  });

  it("un remboursement est une fin : rien n'en repart", () => {
    expect(effetDeLaNotification("REMBOURSEE", "REMBOURSEE").type).toBe("rejeu");
    expect(effetDeLaNotification("REMBOURSEE", "CONFIRMEE").type).toBe("refus");
  });
});

describe("la base tient ce qu'un service seul ne tiendrait pas", () => {
  const MIGRATION = readFileSync(
    "prisma/migrations/20260920000400_remboursement_reconcilie/migration.sql",
    "utf8",
  );
  const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

  it("l'état et la date de remboursement ne vont pas l'un sans l'autre", () => {
    expect(MIGRATION).toContain("transaction_remboursement_porte_sa_date");
    expect(MIGRATION).toContain("transaction_remboursement_suppose_un_encaissement");
  });

  it("la clé d'idempotence porte sur la notification", () => {
    const bloc = /model PaymentEvent \{([\s\S]*?)\n\}/u.exec(SCHEMA)![1]!;
    expect(bloc).toMatch(/providerEventId\s+String\s+@unique/u);
    expect(MIGRATION).toContain("PaymentEvent_providerEventId_key");
  });
});

describe("B-04 — un remboursement n'est ni un échec ni un écart", () => {
  const paiement = (etat: Paiement["etat"], montant = 25_000, devise = "XOF"): Paiement => ({
    reference: `IMP-260920-${etat}-${devise}`,
    compte: "awa@example.bj",
    montant,
    devise,
    moyen: "Mobile Money",
    recuLe: "2026-09-20T09:00:00.000Z",
    etat,
  });

  it("il a son propre libellé", () => {
    expect(LIBELLE_RAPPROCHEMENT.REMBOURSE).toBe("Remboursé");
    expect(estRembourse(paiement("REMBOURSE"))).toBe(true);
    // Rendre l'argent n'est pas le refuser : l'opérateur ne doit pas
    // rappeler quelqu'un pour un paiement qui s'est bien passé.
    expect(estEnEchec(paiement("REMBOURSE"))).toBe(false);
  });

  /**
   * Avant M.B, faute d'état, un remboursement retombait sur le cas par
   * défaut du rapprochement : « Écart à traiter », dès la dixième minute.
   * Le compteur d'écarts le comptait, et B-04 proposait de traiter un
   * désaccord qui n'existait pas.
   */
  it("il ne gonfle pas le compteur d'écarts", () => {
    const agregats = agreger([paiement("RAPPROCHE"), paiement("REMBOURSE"), paiement("ECART")]);
    expect(agregats.ecarts).toBe(1);
    expect(agregats.echecs).toBe(0);
  });

  it("la somme rendue sort de l'encaissé, et se compte à part", () => {
    const agregats = agreger([paiement("RAPPROCHE", 25_000), paiement("REMBOURSE", 10_000)]);
    expect(agregats.encaisse).toEqual({ XOF: 25_000 });
    expect(agregats.confirmes).toBe(1);
    // Sans ce compteur, une journée où trois paiements ont été rendus se
    // lit comme une journée où ils n'ont jamais eu lieu.
    expect(agregats.rembourses).toBe(1);
    expect(agregats.rembourse).toEqual({ XOF: 10_000 });
  });
});

/**
 * Le défaut qui ne s'est vu qu'avec les deux rails côte à côte à l'écran :
 * les totaux additionnaient des francs et des euros, et l'affichage les
 * suivait d'un « F ». Vingt-cinq mille francs et vingt-neuf euros donnaient
 * « 25 029 F » — le genre de chiffre que ce module refuse explicitement.
 */
describe("B-04 — un total ne mélange pas deux monnaies", () => {
  const paiement = (devise: string, montant: number): Paiement => ({
    reference: `IMP-260920-${devise}`,
    compte: "awa@example.bj",
    montant,
    devise,
    moyen: devise === "XOF" ? "Mobile Money" : "Carte bancaire",
    recuLe: "2026-09-20T09:00:00.000Z",
    etat: "RAPPROCHE",
  });

  it("chaque monnaie a sa somme", () => {
    const agregats = agreger([paiement("XOF", 25_000), paiement("EUR", 29), paiement("XOF", 5_000)]);
    expect(agregats.encaisse).toEqual({ XOF: 30_000, EUR: 29 });
    expect(agregats.confirmes).toBe(3);
  });

  it("une journée sans rien affiche zéro, pas le vide", () => {
    // Une carte vide se lit comme une carte en panne.
    expect(lignesDeTotal({})).toEqual([{ devise: DEVISE_DE_REFERENCE, montant: 0 }]);
  });

  it("les lignes sortent dans un ordre stable", () => {
    expect(lignesDeTotal({ XOF: 1, EUR: 2 })).toEqual([
      { devise: "EUR", montant: 2 },
      { devise: "XOF", montant: 1 },
    ]);
  });
});

/**
 * Le rail FedaPay — arbitrage S.91.
 *
 * FedaPay n'expose aucune API de remboursement (documentation relue le
 * 25/09/2026) : le geste se fait à son tableau de bord, puis sa référence
 * se déclare en B-04. Ce bloc tient ce qui ne demande pas de base ; la
 * fumée `smoke:remboursement` tient le reste, sur une base réelle.
 */
describe("FedaPay — aucun appel, aucun secret, aucune promesse de versement", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const DEMANDE = {
    reference: "IMP-260920-AAAAAA",
    providerTxId: "fedapay:42",
    montant: 25_000,
    devise: "XOF",
    cle: cleDIdempotence("IMP-260920-AAAAAA"),
  };

  it("l'adaptateur n'appelle pas le réseau et rend la procédure manuelle", async () => {
    const appels = vi.fn();
    vi.stubGlobal("fetch", appels);
    const issue = await remboursementFedaPay().demander(DEMANDE);
    expect(issue).toEqual({ issue: "procedure_manuelle", detail: REMBOURSEMENT_NON_OPERATIONNEL });
    expect(appels).not.toHaveBeenCalled();
  });

  it("la clé d'API n'apparaît dans rien de ce qu'il rend", async () => {
    const secret = "sk_live_NE_DOIT_JAMAIS_SORTIR";
    vi.stubGlobal("fetch", vi.fn());
    const rail = leRembourseur("FEDAPAY", { FEDAPAY_API_KEY: secret });
    const issue = await rail!.demander(DEMANDE);
    expect(JSON.stringify(issue)).not.toContain(secret);
    expect(JSON.stringify(suiteDeLaTentative(issue.issue))).not.toContain(secret);
  });

  it("la procédure appelle un humain tout de suite, et ne vaut ni demande ni versement", () => {
    const suite = suiteDeLaTentative("procedure_manuelle");
    expect(suite.acceptee).toBe(false);
    expect(suite.exigeUnHumain).toBe(true);
    // Actionnable : où agir, quoi saisir, ce qui soldera la dette.
    expect(suite.message).toBe(A_REMBOURSER_A_LA_MAIN);
    expect(suite.message).toMatch(/tableau de bord FedaPay/u);
    expect(suite.message).toMatch(/référence/u);
    expect(suite.message).toMatch(/notification signée/u);
  });

  it("la clé d'idempotence est stable d'une reprise à l'autre", () => {
    expect(cleDIdempotence("IMP-260920-AAAAAA")).toBe(cleDIdempotence("IMP-260920-AAAAAA"));
    expect(cleDIdempotence("IMP-260920-AAAAAA")).not.toBe(cleDIdempotence("IMP-260920-BBBBBB"));
  });
});

describe("FedaPay — la référence saisie par l'opérateur", () => {
  it("se préfixe, et le même geste donne toujours la même référence", () => {
    expect(lireLaReferenceDeRemboursement("  8841 ")).toEqual({
      valide: true,
      reference: "fedapay:8841",
    });
    // Recopiée avec son préfixe : aucun double préfixe, aucune seconde forme.
    expect(lireLaReferenceDeRemboursement("fedapay:8841")).toEqual(
      lireLaReferenceDeRemboursement("8841"),
    );
    expect(lireLaReferenceDeRemboursement("rf_A-12")).toEqual({
      valide: true,
      reference: "fedapay:rf_A-12",
    });
  });

  it("vide ou mal formée, elle est refusée avec ce qu'il faut faire", () => {
    const vide = lireLaReferenceDeRemboursement("   ");
    expect(vide.valide).toBe(false);
    if (!vide.valide) expect(vide.message).toMatch(/tableau de bord FedaPay/u);

    for (const saisie of ["88 41", "8841;DROP", "é8841", "x".repeat(65), "-8841"]) {
      const lue = lireLaReferenceDeRemboursement(saisie);
      expect(lue.valide, saisie).toBe(false);
      if (!lue.valide) expect(lue.message, saisie).toMatch(/recopie-la/u);
    }
  });
});

describe("FedaPay — qui peut recevoir une déclaration", () => {
  const due = new Date("2026-09-20T09:00:00Z");
  const base = {
    provider: "FEDAPAY" as const,
    refundDueAt: due,
    refundedAt: null,
    refundAttemptedAt: due,
  };

  it("une dette FedaPay initiée et non soldée, et elle seule", () => {
    expect(defautDeDeclaration(base)).toBeNull();
    expect(defautDeDeclaration({ ...base, refundDueAt: null })).toBe("sans_dette");
    expect(defautDeDeclaration({ ...base, refundedAt: due })).toBe("deja_rendue");
    expect(defautDeDeclaration({ ...base, provider: "STRIPE" })).toBe("autre_rail");
    // K.C : les droits non consommés partent à l'initiation. Déclarer
    // avant rendrait l'argent en laissant le pack utilisable.
    expect(defautDeDeclaration({ ...base, refundAttemptedAt: null })).toBe("non_initiee");
  });

  it("chaque refus dit quoi faire", () => {
    for (const motif of Object.values(MOTIF_DE_REFUS_DE_DECLARATION)) {
      expect(motif.length).toBeGreaterThan(30);
    }
    expect(MOTIF_DE_REFUS_DE_DECLARATION.non_initiee).toMatch(/Lance d'abord le remboursement/u);
    expect(MOTIF_DE_REFUS_DE_DECLARATION.autre_rail).toMatch(/Relancer l'envoi/u);
  });

  it("une dette déclarée reste une dette : la consigne attend la notification", () => {
    expect(consigneFedaPay({ etape: "DEMANDE", initiee: true })).toMatch(
      /n'est tenue pour rendue qu'à la notification signée/u,
    );
    expect(consigneFedaPay({ etape: "DECIDE", initiee: true })).toBe(A_REMBOURSER_A_LA_MAIN);
    expect(consigneFedaPay({ etape: "DECIDE", initiee: false })).toMatch(/pas encore initié/u);
  });
});

describe("FedaPay — la déclaration n'écrit jamais le versement (INV-7)", () => {
  const source = readFileSync("src/server/acces/paiements.ts", "utf8");
  const debut = source.indexOf("export async function declarerLeRemboursementManuel");
  const fonction = source.slice(debut, source.indexOf("\n}\n", debut));

  it("elle pose la demande et la référence, sous condition", () => {
    expect(debut).toBeGreaterThan(-1);
    expect(fonction).toMatch(/refundRequestedAt: null,\s*\n\s*refundProviderRef: null,/u);
    expect(fonction).toMatch(/data: \{ refundRequestedAt: maintenant, refundProviderRef: lue\.reference \}/u);
  });

  it("ni `status` ni `refundedAt` ne sont écrits", () => {
    const ecritures = fonction.match(/data: \{[^}]*\}/gu) ?? [];
    expect(ecritures.length).toBeGreaterThan(0);
    for (const e of ecritures) {
      expect(e).not.toMatch(/refundedAt|status:/u);
    }
  });

  it("la référence est unique en base : un remboursement ne solde pas deux dettes", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toMatch(/refundProviderRef String\?\s+@unique/u);
  });
});

/**
 * Le remboursement d'une montée — décision définitive S.92.
 *
 * Les scénarios sur base réelle (concurrence, recharges, rédaction,
 * rejeu) sont dans `smoke:montee`. Ici, ce qui se tient sans base.
 */
describe("S.92 — le remboursement du supplément se rejoue sans se contredire", () => {
  const source = readFileSync("src/server/acces/paiements.ts", "utf8");
  const initier = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(source)![0];

  it("une fois les droits retirés, la reprise ne réévalue pas la montée", async () => {
    const { repartir } = await import("@/domain/payments/grand-livre");
    const { suiteDuRemboursementDeLaMontee } = await import("@/domain/payments/montee");
    const t = (m: number) => new Date(Date.UTC(2026, 8, 1, 8, m));
    const vide = { analysisId: null, grantId: null };
    const lignes = [
      { ...vide, id: "e", delta: 10, reason: "ACHAT_PACK" as const, transactionId: "ess", createdAt: t(1) },
      { ...vide, id: "m", delta: 20, reason: "ACHAT_PACK" as const, transactionId: "mon", createdAt: t(2) },
      { id: "r", delta: -20, reason: "REMBOURSEMENT" as const, transactionId: "mon", analysisId: null, grantId: "m", createdAt: t(3) },
    ];
    const octroi = repartir(lignes).octrois.find((o) => o.transactionId === "mon")!;
    // Relue après son propre retrait, la montée ne paraît plus intacte :
    // la réévaluer ouvrirait un écart contre le candidat. D'où la garde.
    expect(suiteDuRemboursementDeLaMontee({ octroi, redactionUtilisee: false }).suite).toBe(
      "REVUE_MANUELLE",
    );
    expect(initier).toMatch(/if \(transaction\.applicationId && !dejaRetire\) \{\s*const suite = await suiteDuQuotaDuPack/u);
  });

  it("le retrait se décide et s'écrit sous le verrou du grand livre, imputé à l'octroi", () => {
    expect(initier).toMatch(/sousVerrouDuGrandLivre\(applicationId, async \(tx\) =>/u);
    expect(initier).toMatch(/grantId: lue\.octroi/u);
    expect(initier).toMatch(/skipDuplicates: true/u);
    // Relue sous verrou, une montée entamée entre-temps part en revue.
    expect(initier).toMatch(/if \(suite\?\.suite === "REVUE_MANUELLE"\)/u);
  });

  it("le débit prend le même verrou, et nomme l'octroi qu'il entame", () => {
    const quota = readFileSync("src/server/acces/quota.ts", "utf8");
    expect(quota).toMatch(/pg_advisory_xact_lock\(hashtextextended\(\$\{`grand-livre:\$\{applicationId\}`\}, 0\)\)/u);
    const debit = /export async function debiterUneAnalyse[\s\S]*?\n\}$/mu.exec(quota)![0];
    expect(debit).toMatch(/sousVerrouDuGrandLivre/u);
    expect(debit).toMatch(/const grantId = octroiAEntamer\(lignes\)/u);
  });
});
