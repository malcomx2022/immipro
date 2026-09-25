import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONFIRMATION_AU_CANDIDAT,
  LIBELLE_ETAPE,
  MOTIF_IDENTIFIANT,
  MOTIF_REVUE_PARTIELLE,
  RESTE_A_FAIRE,
  cleDIdempotence,
  defautDIdentifiant,
  etapeDe,
  suiteDeLaDette,
  suiteDeLaTentative,
  MOTIF_RELANCES_EPUISEES,
  REPOS_AVANT_RELANCE_MINUTES,
  TENTATIVES_AVANT_HUMAIN,
  suiteDuQuota,
  type IssueDeDemande,
} from "@/domain/paiement/remboursement";
import {
  VARIABLES,
  leRembourseur,
  remboursementBranche,
  remboursementConfigure,
} from "@/server/paiement/remboursement";
import { ETAT_DU_REMBOURSEMENT, remboursementStripe } from "@/server/paiement/stripe";
import {
  REMBOURSEMENT_NON_OPERATIONNEL,
  remboursementFedaPay,
} from "@/server/paiement/fedapay";

/**
 * Le rail de remboursement sortant — arbitrages du 21 et du 22/09/2026.
 *
 * Trois faits, et le produit n'en écrivait que deux : la décision (K.C)
 * et la confirmation (M.B). La demande envoyée au fournisseur manquait.
 * Elle existe maintenant pour Stripe ; ce qui compte le plus est ce qui
 * n'a pas bougé — **une demande acceptée n'est pas un versement**, et
 * seule la notification signée écrit `refundedAt` (INV-7).
 *
 * Ce qui demande une base — deux reprises concurrentes, le retrait de
 * droits unique, la dette qui survit à l'acceptation — vit dans
 * `scripts/fumee-remboursement.mts`, sur PostgreSQL.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const ACCES = "src/server/acces/paiements.ts";

const DEMANDE = {
  reference: "IMP-260922-ABCDEF",
  providerTxId: "stripe:cs_essai",
  montant: 29,
  devise: "EUR",
  cle: cleDIdempotence("IMP-260922-ABCDEF"),
};

const reponse = (statut: number, charge: unknown) => ({
  status: statut,
  json: async () => charge,
});

/** Chaque appel rend la réponse suivante ; la dernière se répète. */
function simuler(...reponses: Array<{ status: number; json: () => Promise<unknown> } | Error>) {
  const appels: Array<{ url: string; corps: string; idempotence: string | undefined }> = [];
  let rang = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const entetes = (options?.headers ?? {}) as Record<string, string>;
      appels.push({
        url,
        corps: String(options?.body ?? ""),
        idempotence: entetes["Idempotency-Key"],
      });
      const suivante = reponses[Math.min(rang++, reponses.length - 1)];
      if (suivante instanceof Error) throw suivante;
      return suivante as unknown as Response;
    }),
  );
  return appels;
}

/** La session que Stripe rend, portant notre référence et son intention. */
const session = (reste: Record<string, unknown> = {}) => ({
  id: "cs_essai",
  metadata: { reference: DEMANDE.reference },
  payment_intent: "pi_essai",
  ...reste,
});

afterEach(() => vi.unstubAllGlobals());

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

  it("une demande acceptée n'est pas un versement", () => {
    expect(LIBELLE_ETAPE.DEMANDE).toMatch(/en attente de confirmation/u);
    expect(RESTE_A_FAIRE.DEMANDE).toMatch(/la somme n'est pas rendue/u);
  });
});

describe("les six issues d'une demande", () => {
  const TOUTES: readonly IssueDeDemande[] = [
    "acceptee",
    "refusee_definitivement",
    "temporaire",
    "reponse_illisible",
    "non_configure",
    "procedure_manuelle",
  ];

  /**
   * **Aucune issue ne solde la dette.** C'est la propriété centrale du
   * module : le seul champ qui éteint une obligation est `refundedAt`,
   * et il n'est écrit que par la notification signée.
   */
  it("une seule accepte, et aucune ne verse", () => {
    const acceptantes = TOUTES.filter((i) => suiteDeLaTentative(i).acceptee);
    expect(acceptantes).toEqual(["acceptee"]);
    for (const issue of TOUTES) {
      expect(suiteDeLaTentative(issue).message.length, issue).toBeGreaterThan(20);
      expect(suiteDeLaTentative(issue).message, issue).not.toMatch(/remboursé|versé|rendu à/u);
    }
  });

  /**
   * Ce qui se reprend tout seul n'appelle personne ; ce qui ne se
   * reprendra jamais, si. Confondre les deux noie la file d'écarts sous
   * des coupures réseau, ou laisse une demande morte s'y relancer.
   */
  it("le refus définitif, l'illisible et la procédure manuelle appellent un humain", () => {
    expect(TOUTES.filter((i) => suiteDeLaTentative(i).exigeUnHumain)).toEqual([
      "refusee_definitivement",
      "reponse_illisible",
      "procedure_manuelle",
    ]);
  });

  it("une issue inconnue ne passe pas en silence", () => {
    expect(() => suiteDeLaTentative("inventee" as IssueDeDemande)).toThrow(/non arbitrée/u);
  });
});

describe("l'identifiant du fournisseur est vérifié avant l'appel", () => {
  it("absent, il n'y a rien à rembourser chez lui", () => {
    expect(defautDIdentifiant(null, "STRIPE")).toBe("absent");
    expect(defautDIdentifiant("  ", "STRIPE")).toBe("absent");
  });

  /** Les deux rails écrivent la même colonne : le préfixe les sépare. */
  it("le préfixe de l'autre rail est refusé", () => {
    expect(defautDIdentifiant("fedapay:42", "STRIPE")).toBe("autre_fournisseur");
    expect(defautDIdentifiant("stripe:cs_1", "FEDAPAY")).toBe("autre_fournisseur");
    expect(defautDIdentifiant("stripe:cs_1", "STRIPE")).toBeNull();
    expect(defautDIdentifiant("fedapay:42", "FEDAPAY")).toBeNull();
  });

  it("chaque défaut dit à l'opérateur ce qu'il doit faire", () => {
    expect(MOTIF_IDENTIFIANT.absent).toMatch(/à la main/u);
    expect(MOTIF_IDENTIFIANT.autre_fournisseur).toMatch(/Aucune demande n'est partie/u);
  });
});

describe("l'adaptateur Stripe, contre les réponses du fournisseur", () => {
  const adaptateur = remboursementStripe("sk_essai");

  it("une demande acceptée rend l'accusé, et rien de plus", async () => {
    const appels = simuler(
      reponse(200, session()),
      reponse(200, { id: "re_1", status: "pending" }),
    );
    const issue = await adaptateur.demander(DEMANDE);
    expect(issue).toMatchObject({ issue: "acceptee", providerRefundId: "stripe:re_1" });

    // Le remboursement vise l'intention, pas la session : Stripe ne
    // rembourse pas une session de paiement.
    expect(appels[1]?.url).toBe("https://api.stripe.com/v1/refunds");
    expect(appels[1]?.corps).toContain("payment_intent=pi_essai");
    // Le montant part en plus petite unité : 29 € valent 2900.
    expect(appels[1]?.corps).toContain("amount=2900");
    // Et la clé dérivée voyage, pour que le rejeu soit reconnu chez lui.
    expect(appels[1]?.idempotence).toBe(cleDIdempotence(DEMANDE.reference));
  });

  /**
   * `succeeded` chez Stripe ne vaut pas `refundedAt` chez nous. C'est la
   * frontière d'INV-7, et l'adaptateur n'a aucun moyen de la franchir :
   * il ne sait rendre qu'« il a pris la demande ».
   */
  it("« succeeded » reste une demande acceptée, jamais un versement", async () => {
    simuler(reponse(200, session()), reponse(200, { id: "re_2", status: "succeeded" }));
    const issue = await adaptateur.demander(DEMANDE);
    expect(issue.issue).toBe("acceptee");
    expect(JSON.stringify(issue)).not.toMatch(/refundedAt|REMBOURSEE|verse/u);
    expect(ETAT_DU_REMBOURSEMENT.succeeded).toBe("acceptee");
  });

  it("un remboursement refusé par Stripe est définitif", async () => {
    simuler(reponse(200, session()), reponse(200, { id: "re_3", status: "failed" }));
    expect(await adaptateur.demander(DEMANDE)).toMatchObject({
      issue: "refusee_definitivement",
    });
  });

  /** Une somme déjà rendue de son côté : relancer n'y changera rien. */
  it("une requête invalide est définitive, une panne ne l'est pas", async () => {
    simuler(
      reponse(200, session()),
      reponse(400, { error: { type: "invalid_request_error" } }),
    );
    expect(await adaptateur.demander(DEMANDE)).toMatchObject({
      issue: "refusee_definitivement",
      detail: "invalid_request_error",
    });

    simuler(reponse(200, session()), reponse(500, {}));
    expect((await adaptateur.demander(DEMANDE)).issue).toBe("temporaire");

    simuler(reponse(200, session()), reponse(429, {}));
    expect((await adaptateur.demander(DEMANDE)).issue).toBe("temporaire");

    // Un type d'erreur qu'on ne connaît pas penche du côté sûr : on
    // réessaie une dette plutôt que de la classer.
    simuler(reponse(200, session()), reponse(400, { error: { type: "inconnue" } }));
    expect((await adaptateur.demander(DEMANDE)).issue).toBe("temporaire");
  });

  it("une coupure réseau est passagère, pas un refus", async () => {
    simuler(new Error("ECONNRESET"));
    expect((await adaptateur.demander(DEMANDE)).issue).toBe("temporaire");

    simuler(reponse(200, session()), new Error("ECONNRESET"));
    expect((await adaptateur.demander(DEMANDE)).issue).toBe("temporaire");
  });

  /** Un état hors table appelle un humain : deviner coûterait cher. */
  it("un état inconnu n'est ni accepté ni refusé", async () => {
    simuler(reponse(200, session()), reponse(200, { id: "re_4", status: "en_cours_peut_etre" }));
    expect(await adaptateur.demander(DEMANDE)).toMatchObject({ issue: "reponse_illisible" });

    simuler(reponse(200, session()), reponse(200, { statut: "ok" }));
    expect((await adaptateur.demander(DEMANDE)).issue).toBe("reponse_illisible");
  });

  /**
   * **La vérification qui compte.** Rembourser la session d'un autre
   * candidat parce qu'un identifiant a été mal recopié ne se répare pas
   * avec un correctif.
   */
  it("une session qui ne porte pas notre référence n'est pas remboursée", async () => {
    const appels = simuler(
      reponse(200, session({ metadata: { reference: "IMP-000000-AUTRUI" } })),
    );
    expect(await adaptateur.demander(DEMANDE)).toMatchObject({
      issue: "refusee_definitivement",
      detail: "la session ne porte pas notre référence",
    });
    // Et surtout : aucun appel de remboursement n'a été fait.
    expect(appels.filter((a) => a.url.endsWith("/refunds"))).toHaveLength(0);
  });

  it("une session jamais payée n'a rien à rendre", async () => {
    const appels = simuler(reponse(200, session({ payment_intent: null })));
    expect(await adaptateur.demander(DEMANDE)).toMatchObject({
      issue: "refusee_definitivement",
    });
    expect(appels.filter((a) => a.url.endsWith("/refunds"))).toHaveLength(0);
  });

  it("la clé secrète ne paraît jamais dans ce qui est rendu", async () => {
    simuler(reponse(200, session()), reponse(400, { error: { type: "invalid_request_error" } }));
    const issue = await remboursementStripe("sk_tres_secrete").demander(DEMANDE);
    expect(JSON.stringify(issue)).not.toContain("sk_tres_secrete");
  });
});

describe("FedaPay ne devine pas ce qu'il ne sait pas", () => {
  /**
   * Aucune documentation vérifiée du remboursement FedaPay n'était
   * disponible. Deviner un chemin et un format enverrait de l'argent
   * d'une manière non éprouvée, ou — pire, parce que silencieux —
   * compterait une demande « acceptée » et sortirait une dette de la
   * file sans que personne n'ait rien rendu.
   */
  it("l'adaptateur existe, ne rembourse rien, et le dit", async () => {
    const appels = simuler(reponse(200, {}));
    const issue = await remboursementFedaPay().demander({
      ...DEMANDE,
      providerTxId: "fedapay:42",
    });
    expect(issue).toEqual({ issue: "procedure_manuelle", detail: REMBOURSEMENT_NON_OPERATIONNEL });
    // Et il n'appelle personne : pas de format inventé sur le réseau.
    expect(appels).toHaveLength(0);
  });

  /**
   * `operationnel` est une déclaration, et une déclaration se dément.
   * Celle-ci est éprouvée contre le comportement des deux adaptateurs :
   * un `true` posé sur un adaptateur qui n'appelle rien est exactement
   * l'affirmation rassurante que ce produit s'est déjà faite.
   */
  it("« opérationnel » dit la vérité sur les deux rails", async () => {
    expect(remboursementFedaPay().operationnel).toBe(false);
    expect(remboursementStripe("sk_essai").operationnel).toBe(true);

    // Non opérationnel ⇒ il refuse sans réseau.
    const sans = simuler(reponse(200, {}));
    expect((await remboursementFedaPay().demander(DEMANDE)).issue).toBe("procedure_manuelle");
    expect(sans).toHaveLength(0);

    // Opérationnel ⇒ il appelle, et ne rend jamais `non_configure`.
    const avec = simuler(reponse(200, session()), reponse(200, { id: "re_5", status: "pending" }));
    const issue = await remboursementStripe("sk_essai").demander(DEMANDE);
    expect(avec.length).toBeGreaterThan(0);
    expect(issue.issue).not.toBe("non_configure");
  });

  /** Et la capacité se lit non branchée tant qu'un rail manque. */
  it("la capacité exige les deux rails", () => {
    expect(remboursementBranche()).toBe(false);
    const registre = lire("src/domain/exploitation/dependances.ts");
    expect(registre).toMatch(/cle: "remboursement"/u);
    expect(registre).toMatch(/statut: "BLOQUANTE_ENCAISSEMENT"/u);
  });
});

describe("le point de branchement suit le fournisseur de la transaction", () => {
  it("chaque rail a le sien, et une clé absente n'en rend aucun", () => {
    const avec = { FEDAPAY_API_KEY: "fk", STRIPE_API_KEY: "sk" };
    expect(leRembourseur("STRIPE", avec)?.fournisseur).toBe("STRIPE");
    expect(leRembourseur("FEDAPAY", avec)?.fournisseur).toBe("FEDAPAY");
    expect(leRembourseur("STRIPE", { FEDAPAY_API_KEY: "fk" })).toBeNull();
    expect(leRembourseur("FEDAPAY", { STRIPE_API_KEY: "sk" })).toBeNull();
    expect(leRembourseur("STRIPE", { STRIPE_API_KEY: "   " })).toBeNull();
  });

  it("les clés sortantes sont celles de la nomenclature unique", () => {
    expect(VARIABLES).toEqual(["FEDAPAY_API_KEY", "STRIPE_API_KEY"]);
    expect(remboursementConfigure({ FEDAPAY_API_KEY: "fk", STRIPE_API_KEY: "sk" })).toBe(true);
    expect(remboursementConfigure({ STRIPE_API_KEY: "sk" })).toBe(false);
    // L'ancienne graphie est comprise jusqu'à sa date de retrait.
    expect(remboursementConfigure({ FEDAPAY_SECRET_KEY: "fk", STRIPE_SECRET_KEY: "sk" })).toBe(
      true,
    );
  });

  /** L'initiation ne nomme aucun rail : elle le lit sur la transaction. */
  it("l'initiation résout le rail d'après la transaction", () => {
    expect(lire(ACCES)).toMatch(/leRembourseur\(transaction\.provider\)/u);
  });
});

describe("l'initiation ne déclare jamais la somme rendue", () => {
  const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(
    lire(ACCES),
  )![0];

  /**
   * **Le test central, et il vaut plus qu'avant.** Le rail existe
   * désormais : une réponse 200 du fournisseur ressemble à de l'argent
   * rendu, et c'est exactement le moment où l'on serait tenté d'écrire
   * `refundedAt`.
   */
  it("aucune écriture de l'initiation ne touche l'état ni le versement", () => {
    /*
      Toutes les écritures sur la transaction, prises une par une : ce
      qui suit chaque `db.transaction.update…` jusqu'à la fermeture de
      son `data`. La condition `where` peut lire `refundedAt` — c'est
      même ce qui protège la réservation —, seules les données écrites
      sont en cause.
    */
    const ecritures = [...fonction.matchAll(/db\.transaction\.update\w*\(\{/gu)].map((m) => {
      const reste = fonction.slice(m.index!);
      const debut = reste.indexOf("data: {");
      return reste.slice(debut, reste.indexOf("});", debut));
    });
    expect(ecritures.length).toBeGreaterThan(0);
    for (const ecriture of ecritures) {
      for (const interdit of ["status:", "refundedAt", "refundBasis", "amount:"]) {
        expect(ecriture, `${interdit} dans ${ecriture}`).not.toContain(interdit);
      }
    }
    expect(fonction).toContain("refundAttemptedAt");
    expect(fonction).toContain("refundAttempts");
  });

  /**
   * La tentative est **réservée** avant l'appel, par une mise à jour
   * conditionnée à ce qu'on vient de lire. Deux reprises concurrentes
   * lisent la même valeur ; une seule voit sa condition tenir. La
   * preuve à l'exécution est dans `scripts/fumee-remboursement.mts`.
   */
  it("la tentative est réservée avant que rien ne parte", () => {
    const reservation = fonction.indexOf("refundAttemptedAt: transaction.refundAttemptedAt");
    const appel = fonction.indexOf("adaptateur.demander(");
    expect(reservation).toBeGreaterThan(-1);
    expect(reservation).toBeLessThan(appel);
    expect(fonction).toMatch(/refundedAt: null,\s*\n\s*refundRequestedAt: null,/u);
    expect(fonction).toMatch(/if \(count !== 1\) return \{ issue: "deja_en_cours" \}/u);
  });

  it("la date d'acceptation n'est posée qu'une fois", () => {
    expect(fonction).toMatch(/where: \{ id: transaction\.id, refundRequestedAt: null \}/u);
  });

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

  it("le retrait est une écriture du grand livre, jamais une suppression", () => {
    const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(
      lire(ACCES),
    )![0];
    // Écrit sous le verrou du grand livre depuis S.92 : `createMany`, dans
    // la transaction, et toujours une écriture — jamais une suppression.
    expect(fonction).toMatch(/analysisCredit\s*\n?\s*\.createMany/u);
    expect(fonction).toMatch(/delta: -lue\.retire/u);
    expect(fonction).toMatch(/reason: "REMBOURSEMENT"/u);
    expect(fonction).not.toMatch(/analysisCredit\.delete|deleteMany/u);
  });

  /**
   * **Le retrait n'a lieu qu'une fois, et c'est la base qui le tient.**
   * La lecture préalable ne protégeait pas deux reprises simultanées :
   * entre la lecture et l'écriture, l'autre était passé. L'index unique
   * partiel est la garantie ; la lecture évite seulement de provoquer
   * une violation à chaque relance ordinaire.
   */
  it("l'unicité du retrait est portée par une migration", () => {
    const migration = lire(
      "prisma/migrations/20260922000000_retrait_unique_du_remboursement/migration.sql",
    );
    expect(migration).toMatch(/CREATE UNIQUE INDEX/u);
    expect(migration).toMatch(/WHERE "reason" = 'REMBOURSEMENT'/u);
    // Le garde-fou l'éprouve, et le compte passe de 64 à 65.
    expect(lire("scripts/verifier-garde-fous.sql")).toMatch(
      /un second retrait de droits sur le même remboursement/u,
    );
  });

  /** Un pack partiellement consommé n'envoie aucune demande. */
  it("la revue manuelle ouvre un écart et n'envoie rien", () => {
    const fonction = /export async function initierLeRemboursement[\s\S]*?\n\}$/mu.exec(
      lire(ACCES),
    )![0];
    const avant = fonction.indexOf('return { issue: "revue_manuelle"');
    const envoi = fonction.indexOf("adaptateur.demander(");
    expect(avant).toBeGreaterThan(-1);
    expect(avant).toBeLessThan(envoi);
  });
});

describe("le candidat est prévenu à la confirmation, et pas avant", () => {
  const reception = lire("src/server/paiement/reception.ts");

  /**
   * Le rail branché ne change rien ici, et c'est le point : un courrier
   * envoyé sur l'acceptation ferait chercher sur un relevé une somme
   * qui n'y est pas encore.
   */
  it("le courrier part sur la notification signée, pas sur la demande", () => {
    expect(reception).toContain("envoyerRemboursementConfirme");
    expect(reception).toMatch(/transaction\.status === "REMBOURSEE" && transaction\.refundedAt/u);
    // Ni l'initiation, ni l'ouverture, ni les adaptateurs n'écrivent au
    // candidat.
    for (const module of [
      ACCES,
      "src/server/paiement/remboursement.ts",
      "src/server/paiement/stripe.ts",
      "src/server/paiement/fedapay.ts",
    ]) {
      expect(lire(module), module).not.toContain("envoyerRemboursementConfirme");
    }
  });

  /** Un courrier qui échoue ne défait pas un remboursement confirmé. */
  it("l'échec du courrier ne défait pas la confirmation", () => {
    const bloc = reception.slice(reception.indexOf('case "appliquee"'));
    expect(bloc).toMatch(/\.catch\(\(\) => undefined\)/u);
  });

  it("le texte n'annonce aucun délai de notre part", () => {
    expect(CONFIRMATION_AU_CANDIDAT).toMatch(/quelques jours/u);
    expect(CONFIRMATION_AU_CANDIDAT).not.toMatch(/sous \d|dans \d|\d+ jours ouvr/u);
    expect(lire("src/server/courrier.ts")).toMatch(/qui ne change pas/u);
  });
});

/**
 * La relance d'une dette dont l'envoi n'est pas parti — 24/09/2026.
 *
 * `RESTE_A_FAIRE.DECIDE` disait « La demande n'est pas partie. Relance
 * l'envoi », et personne ne la relançait. Constaté en exécution sur une
 * vraie base, après un premier envoi en échec passager, puis **toutes**
 * les passes que l'ouvrier planifie — réconciliation, péremption, purge,
 * inactivité, rappels :
 *
 *     premier envoi : temporaire
 *     refundDueAt=true refundRequestedAt=false refundedAt=false
 *     après toutes les passes :
 *       tentatives       : 1
 *       demandes parties : 1
 *
 * Une somme due à un candidat, jamais redemandée, jusqu'à ce qu'un
 * opérateur la remarque dans B-04 et clique dessus.
 */
describe("une dette dont l'envoi n'est pas parti se relance", () => {
  const LE_JOUR = new Date("2026-09-24T12:00:00Z");
  const ilYA = (minutes: number) => new Date(LE_JOUR.getTime() - minutes * 60_000);
  const dette = (partiel: Partial<Parameters<typeof suiteDeLaDette>[0]> = {}) =>
    suiteDeLaDette(
      {
        dueAt: new Date("2026-09-20T00:00:00Z"),
        requestedAt: null,
        refundedAt: null,
        tentatives: 1,
        derniereTentative: ilYA(REPOS_AVANT_RELANCE_MINUTES),
        ecartOuvert: false,
        ...partiel,
      },
      LE_JOUR,
    );

  it("le cas du défaut : décidée, jamais demandée, le repos écoulé", () => {
    expect(dette()).toBe("RELANCER");
  });

  it("une première tentative jamais faite part tout de suite", () => {
    expect(dette({ tentatives: 0, derniereTentative: null })).toBe("RELANCER");
  });

  /** Le repos tient : deux envois à la minute n'aident pas un fournisseur en panne. */
  it("le repos retient l'envoi suivant", () => {
    expect(dette({ derniereTentative: ilYA(REPOS_AVANT_RELANCE_MINUTES - 1) })).toBe("ATTENDRE");
    expect(dette({ derniereTentative: ilYA(REPOS_AVANT_RELANCE_MINUTES) })).toBe("RELANCER");
  });

  /**
   * La distinction que tout ce module existe pour tenir : une demande
   * **acceptée** n'est pas notre affaire. La relancer enverrait une
   * seconde demande sur une première qui a abouti.
   */
  it("une demande déjà acceptée ne se relance pas", () => {
    expect(dette({ requestedAt: ilYA(600) })).toBe("RIEN");
  });

  it("une somme rendue ne se redemande pas, quoi que disent les autres colonnes", () => {
    expect(dette({ refundedAt: ilYA(60), requestedAt: null })).toBe("RIEN");
  });

  it("sans obligation ouverte, il n'y a rien à envoyer", () => {
    expect(dette({ dueAt: null })).toBe("RIEN");
  });

  /** Un humain la regarde déjà : lui en ouvrir un second brouillerait ce qu'il voit. */
  it("un écart ouvert suspend la relance automatique", () => {
    expect(dette({ ecartOuvert: true })).toBe("RIEN");
    expect(dette({ ecartOuvert: true, tentatives: TENTATIVES_AVANT_HUMAIN })).toBe("RIEN");
  });

  /**
   * Et elle s'arrête : rejouer sans fin une tâche qui ne peut pas aboutir
   * masque le problème au lieu de le signaler.
   */
  it("au bout de cinq envois, la passe abandonne et appelle quelqu'un", () => {
    expect(dette({ tentatives: TENTATIVES_AVANT_HUMAIN - 1 })).toBe("RELANCER");
    expect(dette({ tentatives: TENTATIVES_AVANT_HUMAIN })).toBe("APPELER_UN_HUMAIN");
  });

  /** Le motif est actionnable : il dit ce qui a été tenté et que la somme reste due. */
  it("le motif dit le compte et ce qui reste dû", () => {
    const motif = MOTIF_RELANCES_EPUISEES(5);
    expect(motif).toContain("5 envois");
    expect(motif).toContain("reste due");
  });
});
