import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONFIRMATION_AU_CANDIDAT,
  LIBELLE_ETAPE,
  MOTIF_REVUE_PARTIELLE,
  RESTE_A_FAIRE,
  cleDIdempotence,
  etapeDe,
  suiteDuQuota,
} from "@/domain/paiement/remboursement";
import { NON_BRANCHE, VARIABLES } from "@/server/paiement/remboursement";

/**
 * Le rail de remboursement sortant — arbitrage du 21/09/2026.
 *
 * Trois faits, et le produit n'en écrivait que deux : la décision (K.C)
 * et la confirmation (M.B). La demande envoyée au fournisseur manquait,
 * si bien qu'une obligation ouverte et une demande partie se lisaient
 * pareil, et qu'une tentative échouée ne laissait aucune trace.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const ACCES = "src/server/acces/paiements.ts";

describe("les trois faits ne se confondent pas", () => {
  const d = (x: Partial<Record<"dueAt" | "requestedAt" | "refundedAt", Date>>) => ({
    dueAt: x.dueAt ?? null,
    requestedAt: x.requestedAt ?? null,
    refundedAt: x.refundedAt ?? null,
  });

  it("chaque fait a son étape, et l'ordre compte", () => {
    const t = new Date();
    expect(etapeDe(d({}))).toBeNull();
    expect(etapeDe(d({ dueAt: t }))).toBe("DECIDE");
    expect(etapeDe(d({ dueAt: t, requestedAt: t }))).toBe("DEMANDE");
    expect(etapeDe(d({ dueAt: t, requestedAt: t, refundedAt: t }))).toBe("VERSE");
    for (const e of ["DECIDE", "DEMANDE", "VERSE"] as const) {
      expect(LIBELLE_ETAPE[e], e).toBeTruthy();
      expect(RESTE_A_FAIRE[e].length, e).toBeGreaterThan(10);
    }
  });

  /**
   * Une demande partie et non confirmée est le cas le plus facile à
   * oublier, parce qu'il ressemble à un succès. Le texte doit dire que la
   * somme n'est pas rendue.
   */
  it("une demande acceptée n'est pas un versement", () => {
    expect(LIBELLE_ETAPE.DEMANDE).toMatch(/en attente de confirmation/u);
    expect(RESTE_A_FAIRE.DEMANDE).toMatch(/la somme n'est pas rendue/u);
  });
});

describe("le rail n'est pas branché, et rien ne le simule", () => {
  it("l'envoi non branché rend null, jamais un accusé", async () => {
    expect(
      await NON_BRANCHE({ reference: "IMP-1", providerTxId: null, montant: 1, devise: "XOF", cle: "k" }),
    ).toBeNull();
    expect(VARIABLES).toEqual(["FEDAPAY_API_KEY", "STRIPE_API_KEY"]);
  });

  /** Un seul point de branchement, comme pour l'antivirus et l'interrogation. */
  it("un seul point de branchement, et l'initiation le prend en paramètre", () => {
    const acces = lire(ACCES);
    expect(acces).toMatch(/envoyer: Rembourseur = NON_BRANCHE/u);
    const sortant = lire("src/server/paiement/remboursement.ts");
    expect(sortant).toMatch(/export const NON_BRANCHE: Rembourseur = async \(\) => null/u);
  });

  /** Et il est déclaré au registre des dépendances, avec ce qu'il bloque. */
  it("l'absence du rail bloque l'encaissement", () => {
    const registre = lire("src/domain/exploitation/dependances.ts");
    expect(registre).toMatch(/cle: "remboursement"/u);
    expect(registre).toMatch(/statut: "BLOQUANTE_ENCAISSEMENT"/u);
  });
});

describe("un échec d'envoi conserve la dette", () => {
  const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(lire(ACCES))![0];

  /**
   * **Le test central.** L'initiation n'écrit ni `status` ni `refundedAt` :
   * seule la notification signée du fournisseur les écrit (INV-7). Une
   * demande partie n'est pas de l'argent rendu.
   */
  it("l'initiation ne déclare jamais la somme rendue", () => {
    // La **dernière** écriture sur la transaction : la première appartient
    // à la branche de revue manuelle, qui n'écrit qu'un écart.
    const ecriture = /data: \{[\s\S]*?\n {4}\},/u.exec(
      fonction.slice(fonction.lastIndexOf("db.transaction.update")),
    )![0];
    for (const interdit of ["status", "refundedAt", "refundBasis", "amount"]) {
      expect(ecriture, interdit).not.toContain(interdit);
    }
    expect(ecriture).toContain("refundAttemptedAt");
    expect(ecriture).toContain("refundAttempts");
  });

  /** La tentative est comptée même quand l'envoi échoue : c'est sa fonction. */
  it("la tentative est datée et comptée dans les deux cas", () => {
    expect(fonction).toMatch(/refundAttempts: \{ increment: 1 \}/u);
    // `refundRequestedAt` n'est posé que si le fournisseur a accusé
    // réception, et une seule fois.
    expect(fonction).toMatch(/accuse && !transaction\.refundRequestedAt/u);
  });

  /**
   * La clé est dérivée, pas tirée au sort : deux tentatives portent la
   * même, et le fournisseur reconnaît un rejeu plutôt que d'envoyer
   * l'argent deux fois.
   */
  it("la clé d'idempotence est dérivée de la référence", () => {
    expect(cleDIdempotence("IMP-260921-ABCDEF")).toBe("remboursement:IMP-260921-ABCDEF");
    expect(cleDIdempotence("IMP-1")).toBe(cleDIdempotence("IMP-1"));
    expect(fonction).toContain("cleDIdempotence(transaction.reference)");
    // Et elle ne se stocke pas : une valeur dérivée qu'on enregistre finit
    // par diverger de ce dont elle est dérivée.
    expect(lire("prisma/schema.prisma")).not.toMatch(/refundIdempotency/u);
  });
});

describe("le quota d'un pack remboursé", () => {
  it("rien de consommé : les droits partent en entier", () => {
    expect(suiteDuQuota(30, 0)).toEqual({ suite: "RETRAIT_INTEGRAL", retire: 30 });
  });

  /**
   * Ce que vaut une analyse déjà rendue est une question commerciale, pas
   * arithmétique. Trancher à la place de l'humain produirait soit un
   * cadeau, soit une retenue qu'aucune condition n'annonce.
   */
  it("une seule analyse consommée suffit à passer en revue manuelle", () => {
    expect(suiteDuQuota(30, 1)).toEqual({ suite: "REVUE_MANUELLE", ouvertes: 30, consommees: 1 });
    expect(suiteDuQuota(30, 30)).toEqual({ suite: "REVUE_MANUELLE", ouvertes: 30, consommees: 30 });
    expect(MOTIF_REVUE_PARTIELLE).toMatch(/à trancher à la main/u);
  });

  /**
   * Les droits partent à l'initiation, pas à la confirmation : entre les
   * deux il peut s'écouler des jours, et laisser un pack utilisable
   * pendant qu'on en rend le prix revient à l'offrir.
   */
  it("le retrait est une écriture du grand livre, jamais une suppression", () => {
    const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(lire(ACCES))![0];
    expect(fonction).toMatch(/analysisCredit\.create/u);
    expect(fonction).toMatch(/delta: -suite\.retire/u);
    expect(fonction).toMatch(/reason: "REMBOURSEMENT"/u);
    expect(fonction).not.toMatch(/analysisCredit\.delete|deleteMany/u);
  });

  /**
   * **Le retrait n'a lieu qu'une fois.** Vu en exécutant : deux
   * tentatives d'envoi retiraient deux fois les mêmes droits, et le solde
   * passait de trente à moins trente. La clé d'idempotence protège
   * l'appel au fournisseur, pas le grand livre — et un échec d'envoi est
   * le cas ordinaire tant que le rail n'est pas branché, donc la seconde
   * tentative n'est pas une hypothèse.
   */
  it("une seconde tentative ne retire pas les droits deux fois", () => {
    const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(lire(ACCES))![0];
    expect(fonction).toMatch(/analysisCredit\.findFirst/u);
    expect(fonction).toMatch(/reason: "REMBOURSEMENT"[\s\S]*?select: \{ id: true \}/u);
    expect(fonction).toMatch(/suite\.retire > 0 && !dejaRetire/u);
  });

  /** Un pack partiellement consommé n'envoie aucune demande. */
  it("la revue manuelle ouvre un écart et n'envoie rien", () => {
    const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(lire(ACCES))![0];
    const avant = fonction.indexOf('return { issue: "revue_manuelle"');
    const envoi = fonction.indexOf("await envoyer(");
    expect(avant).toBeGreaterThan(-1);
    expect(avant).toBeLessThan(envoi);
  });
});

describe("le candidat est prévenu à la confirmation, et pas avant", () => {
  const reception = lire("src/server/paiement/reception.ts");

  it("le courrier part sur la notification signée, pas sur la décision", () => {
    expect(reception).toContain("envoyerRemboursementConfirme");
    expect(reception).toMatch(/transaction\.status === "REMBOURSEE" && transaction\.refundedAt/u);
    // Ni l'initiation ni l'ouverture n'écrivent au candidat.
    expect(lire(ACCES)).not.toContain("envoyerRemboursementConfirme");
  });

  /** Un courrier qui échoue ne défait pas un remboursement confirmé. */
  it("l'échec du courrier ne défait pas la confirmation", () => {
    const bloc = reception.slice(reception.indexOf('case "appliquee"'));
    expect(bloc).toMatch(/\.catch\(\(\) => undefined\)/u);
  });

  it("le texte n'annonce aucun délai de notre part", () => {
    expect(CONFIRMATION_AU_CANDIDAT).toMatch(/quelques jours/u);
    expect(CONFIRMATION_AU_CANDIDAT).not.toMatch(/sous \d|dans \d|\d+ jours ouvr/u);
    // Et la référence ne change pas : c'est la même pièce comptable.
    expect(lire("src/server/courrier.ts")).toMatch(/qui ne change pas/u);
  });
});
