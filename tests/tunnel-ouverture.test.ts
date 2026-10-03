import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cheminDeRetour,
  cleDOuverture,
  depuisSousUnite,
  motifDeDivergence,
  ouvertureConcorde,
  verifierLUrlHebergee,
  versSousUnite,
} from "@/domain/paiement/ouverture";
import { cleDIdempotence } from "@/domain/paiement/remboursement";
import { adaptateurStripe } from "@/server/paiement/stripe";
import { adaptateurFedaPay, baseDe } from "@/server/paiement/fedapay";
import { lOuvreur } from "@/server/paiement/ouvreurs";
import { SANS_REPONSE, type IssueDEchec } from "@/server/paiement/ouvreur";
import {
  NATURE_DE_LA_CAUSE,
  ouvertureReessayable,
  traceDeLOuverture,
  type CauseDEchecDOuverture,
} from "@/domain/paiement/ouverture";
import { lireFedaPay, lireStripe } from "@/server/paiement/notifications";

/**
 * L'ouverture d'un paiement chez le fournisseur — WF-05 étapes 2 et 3.
 *
 * Ce fichier éprouve les adaptateurs **contre un `fetch` simulé** : la
 * forme de la requête qui part, et ce que chaque forme de réponse produit.
 * L'enchaînement complet — double soumission, reprise, divergence,
 * appartenance — demande une base, et vit dans `scripts/fumee-tunnel.ts`.
 *
 * Rien ici ne confirme un paiement : c'est la propriété que les deux
 * niveaux vérifient, chacun à sa place.
 */

const RETOUR = (chemin: string) => new URL(chemin, "https://immipro.test").toString();

const reponse = (statut: number, charge: unknown) => ({
  status: statut,
  json: async () => charge,
});

/** Le dernier appel simulé, pour lire ce qui est effectivement parti. */
function simuler(...reponses: Array<{ status: number; json: () => Promise<unknown> } | Error>) {
  const appels: Array<{ url: string; options: RequestInit }> = [];
  let rang = 0;
  const faux = vi.fn(async (url: string, options: RequestInit) => {
    appels.push({ url, options });
    const suivante = reponses[Math.min(rang++, reponses.length - 1)];
    if (suivante instanceof Error) throw suivante;
    return suivante as unknown as Response;
  });
  vi.stubGlobal("fetch", faux);
  return appels;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const DEMANDE = {
  reference: "IMP-260921-ABCDEF",
  montant: 12,
  devise: "EUR" as const,
  cle: cleDOuverture("IMP-260921-ABCDEF"),
  retour: cheminDeRetour("IMP-260921-ABCDEF"),
  intitule: "ImmiPro — Pack Dossier",
};

/* ------------------------------------------------------------------ *
 * Le domaine : ce qu'est une ouverture valable.
 * ------------------------------------------------------------------ */

describe("la clé d'idempotence est dérivée, stable, et distincte", () => {
  it("deux tentatives sur la même référence portent la même clé", () => {
    expect(cleDOuverture("IMP-1")).toBe(cleDOuverture("IMP-1"));
    expect(cleDOuverture("IMP-1")).not.toBe(cleDOuverture("IMP-2"));
  });

  /**
   * La même référence porte deux opérations au cours de sa vie. Une clé
   * commune ferait prendre le remboursement pour un rejeu de l'ouverture.
   */
  it("ouvrir et rembourser ne portent pas la même clé", () => {
    expect(cleDOuverture("IMP-1")).not.toBe(cleDIdempotence("IMP-1"));
  });
});

describe("l'URL hébergée est vérifiée avant qu'un navigateur y aille", () => {
  const DOM = ["stripe.com"];

  it("accepte le domaine et ses sous-domaines", () => {
    expect(verifierLUrlHebergee("https://checkout.stripe.com/c/pay/cs_1", DOM).valide).toBe(true);
    expect(verifierLUrlHebergee("https://stripe.com/pay", DOM).valide).toBe(true);
  });

  it("refuse l'absence, le relatif, le clair et l'étranger", () => {
    expect(verifierLUrlHebergee(null, DOM)).toEqual({ valide: false, raison: "absente" });
    expect(verifierLUrlHebergee("  ", DOM)).toEqual({ valide: false, raison: "absente" });
    expect(verifierLUrlHebergee("/pay/cs_1", DOM)).toEqual({ valide: false, raison: "malformee" });
    expect(verifierLUrlHebergee("http://checkout.stripe.com/x", DOM)).toEqual({
      valide: false,
      raison: "non_https",
    });
    expect(verifierLUrlHebergee("https://exemple.test/x", DOM)).toEqual({
      valide: false,
      raison: "domaine_inattendu",
    });
  });

  /** Les deux ressemblances qui coûteraient le plus cher. */
  it("ne se laisse pas prendre à un domaine qui ressemble", () => {
    expect(verifierLUrlHebergee("https://evilstripe.com/x", DOM).valide).toBe(false);
    expect(verifierLUrlHebergee("https://stripe.com.exemple.net/x", DOM).valide).toBe(false);
  });
});

describe("la plus petite unité, et le facteur cent qu'elle évite", () => {
  it("l'euro se convertit, le franc CFA non", () => {
    expect(versSousUnite(12, "EUR")).toBe(1200);
    expect(versSousUnite(5000, "XOF")).toBe(5000);
    expect(depuisSousUnite(1200, "EUR")).toBe(12);
    expect(depuisSousUnite(5000, "XOF")).toBe(5000);
  });

  it("l'aller-retour rend exactement ce qu'on a envoyé", () => {
    for (const [montant, devise] of [
      [12, "EUR"],
      [29, "EUR"],
      [5000, "XOF"],
      [45000, "XOF"],
    ] as const) {
      expect(depuisSousUnite(versSousUnite(montant, devise), devise)).toBe(montant);
    }
  });
});

describe("la concordance du montant et de la devise", () => {
  it("concorde à l'identique, pas autrement", () => {
    expect(ouvertureConcorde({ montant: 12, devise: "EUR" }, { montant: 12, devise: "eur" })).toBe(
      true,
    );
    expect(ouvertureConcorde({ montant: 12, devise: "EUR" }, { montant: 1200, devise: "EUR" })).toBe(
      false,
    );
    expect(ouvertureConcorde({ montant: 12, devise: "EUR" }, { montant: 12, devise: "XOF" })).toBe(
      false,
    );
  });

  it("le motif d'écart dit les deux sommes", () => {
    const motif = motifDeDivergence({ montant: 12, devise: "EUR" }, { montant: 1200, devise: "EUR" });
    expect(motif).toContain("1200 EUR");
    expect(motif).toContain("12 EUR");
  });
});

describe("l'adresse de retour ne confirme rien", () => {
  it("ramène sur l'attente, et ne porte aucun verdict", () => {
    const retour = cheminDeRetour("IMP-1");
    expect(retour).toBe("/paiement/attente?tx=IMP-1");
    // Ni « succès », ni « payé », ni un état quelconque : la page qui
    // accueille interroge la base, que seul le webhook fait avancer.
    expect(retour).not.toMatch(/succes|success|paye|confirm|statut=/iu);
  });
});

/* ------------------------------------------------------------------ *
 * Stripe, contre un `fetch` simulé.
 * ------------------------------------------------------------------ */

describe("adaptateur Stripe", () => {
  const sessionOk = {
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    amount_total: 1200,
    currency: "eur",
    metadata: { reference: DEMANDE.reference },
  };

  it("ouvre une session, et rend l'URL et l'identifiant préfixé", async () => {
    simuler(reponse(200, sessionOk));
    const vu = await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE);
    expect(vu).toEqual({
      issue: "ouverte",
      session: {
        providerTxId: "stripe:cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
        montant: 12,
        devise: "EUR",
      },
    });
  });

  /**
   * Ce que la requête porte, et qui fait tout tenir : la clé
   * d'idempotence, la référence là où le webhook ira la lire, le montant
   * en plus petite unité, et le retour en absolu.
   */
  it("envoie la clé d'idempotence, la référence et le montant converti", async () => {
    const appels = simuler(reponse(200, sessionOk));
    await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE);

    const { url, options } = appels[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const entetes = options.headers as Record<string, string>;
    expect(entetes["Idempotency-Key"]).toBe(cleDOuverture(DEMANDE.reference));
    expect(entetes.Authorization).toBe("Bearer sk_essai");

    const corps = new URLSearchParams(options.body as string);
    expect(corps.get("metadata[reference]")).toBe(DEMANDE.reference);
    expect(corps.get("line_items[0][price_data][unit_amount]")).toBe("1200");
    expect(corps.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(corps.get("success_url")).toBe("https://immipro.test/paiement/attente?tx=IMP-260921-ABCDEF");
    // Le renoncement ramène au même endroit : pas de page morte.
    expect(corps.get("cancel_url")).toBe(corps.get("success_url"));
  });

  /**
   * La référence qui voyage est celle que le lecteur de webhook ira
   * chercher. Les deux se lisent ici, ensemble : si l'un change de clé,
   * la notification signée arriverait sans savoir quoi confirmer.
   */
  it("pose la référence là où `lireStripe` la relira", async () => {
    const appels = simuler(reponse(200, sessionOk));
    await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE);
    const corps = new URLSearchParams(appels[0]!.options.body as string);

    const relue = lireStripe({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_test_123", metadata: { reference: corps.get("metadata[reference]") } },
      },
    });
    expect(relue?.reference).toBe(DEMANDE.reference);
    expect(relue?.providerTxId).toBe("stripe:cs_test_123");
  });

  it("un fournisseur injoignable ne rend pas d'URL, et dit qu'il s'est tu", async () => {
    simuler(new Error("ECONNREFUSED"));
    expect(await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE)).toEqual({
      issue: "injoignable",
      detail: SANS_REPONSE,
    });
  });

  /**
   * Une panne annoncée n'est pas un silence : le statut rendu par le
   * fournisseur distingue les deux, et c'est lui qui remplira
   * `Diagnostic.statutAmont`. L'adaptateur le savait déjà et le jetait.
   */
  it("une panne du fournisseur est injoignable avec son statut, un refus est un refus", async () => {
    simuler(reponse(503, {}));
    expect(await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE)).toEqual({
      issue: "injoignable",
      statut: 503,
      detail: "le fournisseur est en panne",
    });

    simuler(reponse(402, { error: { type: "card_error" } }));
    expect(await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE)).toEqual({
      issue: "refusee",
      statut: 402,
      detail: "card_error",
    });
  });

  it("une URL absente rend l'identifiant plutôt que de le perdre", async () => {
    simuler(reponse(200, { ...sessionOk, url: null }));
    expect(await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE)).toEqual({
      issue: "creee_sans_url",
      providerTxId: "stripe:cs_test_123",
      detail: "url absente",
    });
  });

  it("une URL sur un domaine étranger n'envoie personne", async () => {
    simuler(reponse(200, { ...sessionOk, url: "https://collecte.exemple.test/pay" }));
    const vu = await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE);
    expect(vu).toMatchObject({ issue: "creee_sans_url", detail: "url domaine_inattendu" });
  });

  /** Une session dont la référence n'est pas la nôtre n'est pas la nôtre. */
  it("refuse une session dont la référence n'est pas revenue", async () => {
    simuler(reponse(200, { ...sessionOk, metadata: { reference: "IMP-AUTRE" } }));
    expect(await adaptateurStripe("sk_essai", RETOUR).creer(DEMANDE)).toEqual({
      issue: "reponse_inattendue",
      detail: "la référence interne n'est pas revenue telle quelle",
    });
  });

  it("retrouve une session déjà ouverte, sans en créer une seconde", async () => {
    const appels = simuler(reponse(200, sessionOk));
    const vu = await adaptateurStripe("sk_essai", RETOUR).retrouver(
      "stripe:cs_test_123",
      DEMANDE.reference,
      "EUR",
    );
    expect(vu).toMatchObject({ issue: "ouverte" });
    expect(appels[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions/cs_test_123");
    expect(appels[0]!.options.method).toBe("GET");
  });
});

/* ------------------------------------------------------------------ *
 * FedaPay, contre un `fetch` simulé.
 * ------------------------------------------------------------------ */

describe("adaptateur FedaPay", () => {
  const XOF = { ...DEMANDE, montant: 5000, devise: "XOF" as const };
  /*
    La réponse telle que FedaPay la rend : `reference` est **la sienne**
    (`trx_…`), et la nôtre revient dans `custom_metadata` — 03/10/2026.
    Les échantillons portaient notre référence dans `reference`, ce qui
    faisait passer un adaptateur qu'aucune réponse réelle ne satisfaisait.
  */
  const transaction = {
    "v1/transaction": {
      id: 42,
      reference: "trx_Ab3_1759467600",
      amount: 5000,
      currency: { iso: "XOF" },
      custom_metadata: { reference: XOF.reference },
    },
  };
  const jeton = { url: "https://process.fedapay.com/abc" };

  it("le bac à sable est l'espace par défaut", () => {
    expect(baseDe(undefined)).toContain("sandbox-api.fedapay.com");
    expect(baseDe("sandbox")).toContain("sandbox-api.fedapay.com");
    expect(baseDe("live")).toBe("https://api.fedapay.com/v1");
  });

  it("crée la transaction puis sa page, en deux appels", async () => {
    const appels = simuler(reponse(200, transaction), reponse(200, jeton));
    const vu = await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF);

    expect(vu).toEqual({
      issue: "ouverte",
      session: {
        providerTxId: "fedapay:42",
        url: "https://process.fedapay.com/abc",
        // Le franc CFA n'a pas de sous-unité : 5 000 partent, 5 000 reviennent.
        montant: 5000,
        devise: "XOF",
      },
    });
    expect(appels).toHaveLength(2);
    expect(appels[0]!.url).toBe("https://sandbox-api.fedapay.com/v1/transactions");
    expect(appels[1]!.url).toBe("https://sandbox-api.fedapay.com/v1/transactions/42/token");

    const corps = JSON.parse(appels[0]!.options.body as string);
    expect(corps.amount).toBe(5000);
    // Notre référence part dans `custom_metadata` ; `reference` est un
    // champ que FedaPay génère, et qu'on n'envoie pas.
    expect(corps.custom_metadata).toEqual({ reference: XOF.reference });
    expect(corps).not.toHaveProperty("reference");
    expect(corps.callback_url).toBe("https://immipro.test/paiement/attente?tx=IMP-260921-ABCDEF");
    expect((appels[0]!.options.headers as Record<string, string>)["Idempotency-Key"]).toBe(XOF.cle);
  });

  it("pose la référence là où `lireFedaPay` la relira", async () => {
    const appels = simuler(reponse(200, transaction), reponse(200, jeton));
    await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF);
    const corps = JSON.parse(appels[0]!.options.body as string);

    // L'événement porte la transaction entière : leur référence, et nos
    // métadonnées telles qu'on les a envoyées.
    const relue = lireFedaPay({
      name: "transaction.approved",
      entity: {
        id: 42,
        status: "approved",
        reference: "trx_Ab3_1759467600",
        custom_metadata: corps.custom_metadata,
      },
    });
    expect(relue?.reference).toBe(XOF.reference);
    expect(relue?.providerTxId).toBe("fedapay:42");
  });

  /**
   * Le cas qui justifie l'issue intermédiaire : la transaction existe
   * chez eux, la page non. Perdre l'identifiant ici ferait ouvrir une
   * seconde transaction à la tentative suivante.
   */
  it("rend l'identifiant quand la page échoue après la création", async () => {
    simuler(reponse(200, transaction), new Error("ETIMEDOUT"));
    expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toEqual({
      issue: "creee_sans_url",
      providerTxId: "fedapay:42",
      detail: `jeton : ${SANS_REPONSE}`,
    });
  });

  it("refuse une transaction qui porte la référence d'un autre paiement", async () => {
    simuler(
      reponse(200, {
        "v1/transaction": {
          ...transaction["v1/transaction"],
          custom_metadata: { reference: "IMP-AUTRE" },
        },
      }),
    );
    expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toEqual({
      issue: "reponse_inattendue",
      detail: "la référence interne n'est pas revenue telle quelle",
    });
  });

  it("une réponse de forme inconnue n'ouvre rien", async () => {
    simuler(reponse(200, { quelque: "chose" }));
    expect((await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).issue).toBe(
      "reponse_inattendue",
    );
  });

  it("une URL hors du domaine du fournisseur n'envoie personne", async () => {
    simuler(reponse(200, transaction), reponse(200, { url: "https://ailleurs.test/pay" }));
    expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toMatchObject({
      issue: "creee_sans_url",
      detail: "url domaine_inattendu",
    });
  });

  /**
   * La forme que la documentation décrit — correctif du 22/09/2026.
   *
   * **Tous les cas ci-dessus emploient une enveloppe `v1/transaction`,
   * et c'est ainsi que le défaut a survécu** : les tests confrontaient
   * l'adaptateur à la forme qu'il avait lui-même supposée. La
   * documentation publique de FedaPay décrit des réponses plates, sur la
   * création comme sur la lecture. Si elle dit vrai, le rail en francs
   * CFA n'ouvrait aucun paiement.
   *
   * Les deux formes sont désormais acceptées : la plate parce qu'elle
   * est documentée, l'enveloppée parce qu'une documentation peut
   * retarder sur une API et que refuser la bonne est le seul des deux
   * risques qui bloque le rail.
   */
  /**
   * La référence de FedaPay n'est jamais la nôtre — 03/10/2026.
   *
   * `POST /transactions` ne documente pas `reference` en entrée ; la
   * réponse porte celle que FedaPay génère. L'adaptateur la comparait à
   * la nôtre et refusait donc chaque ouverture réelle.
   */
  it("ouvre le paiement quand la référence rendue est celle de FedaPay", async () => {
    simuler(
      reponse(200, {
        "v1/transaction": {
          id: 42,
          reference: "trx_Ab3_1759467600",
          amount: 5000,
          currency: { iso: "XOF" },
        },
      }),
      reponse(200, jeton),
    );
    // Sans métadonnées dans la réponse de création, l'identifiant suffit :
    // il est enregistré à l'ouverture, et la notification le porte.
    expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toMatchObject({
      issue: "ouverte",
      session: { providerTxId: "fedapay:42", montant: 5000 },
    });
  });

  describe("la forme plate, telle que la documentation la décrit", () => {
    const plate = {
      id: 42,
      reference: "trx_Ab3_1759467600",
      amount: 5000,
      currency: { iso: "XOF" },
      custom_metadata: { reference: XOF.reference },
    };

    it("ouvre le paiement, là où l'enveloppe était exigée", async () => {
      simuler(reponse(200, plate), reponse(200, jeton));
      expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toEqual({
        issue: "ouverte",
        session: {
          providerTxId: "fedapay:42",
          url: "https://process.fedapay.com/abc",
          montant: 5000,
          devise: "XOF",
        },
      });
    });

    /**
     * La lecture rend `currency_id`, un entier, là où la création
     * accepte `currency: { iso }`. Sans code ISO, il n'y a pas de devise
     * à comparer — ce qui n'est pas une raison de refuser l'ouverture.
     * L'ancien code rendait une chaîne vide, et la comparaison de
     * `ouvertureConcorde` échouait à tous les coups.
     */
    it("accepte une entité qui ne porte que `currency_id`", async () => {
      simuler(
        reponse(200, { id: 42, reference: "trx_Ab3_1759467600", amount: 5000, currency_id: 1 }),
        reponse(200, jeton),
      );
      const vu = await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF);
      expect(vu).toMatchObject({
        issue: "ouverte",
        session: { montant: 5000, devise: "XOF" },
      });
    });

    it("refuse toujours une référence qui n'est pas la nôtre", async () => {
      simuler(reponse(200, { ...plate, custom_metadata: { reference: "IMP-AUTRE" } }));
      expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toEqual({
        issue: "reponse_inattendue",
        detail: "la référence interne n'est pas revenue telle quelle",
      });
    });

    it("refuse toujours une entité sans montant", async () => {
      simuler(reponse(200, { id: 42, reference: "trx_Ab3_1759467600", currency: { iso: "XOF" } }));
      expect(await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).toEqual({
        issue: "reponse_inattendue",
        detail: "montant absent de la transaction",
      });
    });

    /**
     * **La reprise, et l'écart qu'elle ouvrait à chaque fois.**
     *
     * La documentation décrit `currency_id` sur la lecture — c'est-à-dire
     * précisément sur l'appel que fait une reprise. La devise rendue
     * était une chaîne vide, `ouvertureConcorde` ne pouvait pas
     * concorder, et `ouvrirLeTunnel` écrivait une divergence puis
     * refusait le candidat. Un paiement dont la première réponse s'est
     * perdue était donc **définitivement** irrécupérable.
     *
     * La devise locale est maintenant passée en repli : la reprise rend
     * ce que la plateforme a décidé, et le montant reste comparé.
     */
    it("une reprise sur une entité sans code ISO rend la devise locale", async () => {
      simuler(
        reponse(200, { id: 42, reference: "trx_Ab3_1759467600", amount: 5000, currency_id: 1 }),
        reponse(200, jeton),
      );
      const vu = await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).retrouver(
        "fedapay:42",
        XOF.reference,
        "XOF",
      );
      expect(vu).toMatchObject({ issue: "ouverte", session: { montant: 5000, devise: "XOF" } });
      // Ce que la reprise doit permettre : la concordance passe.
      expect(
        vu.issue === "ouverte" && ouvertureConcorde({ montant: 5000, devise: "XOF" }, vu.session),
      ).toBe(true);
    });

    /** Et l'enveloppe continue de passer : les deux formes coexistent. */
    it("l'enveloppe reste acceptée", async () => {
      simuler(reponse(200, transaction), reponse(200, jeton));
      expect(
        (await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF)).issue,
      ).toBe("ouverte");
    });
  });

  /**
   * `Idempotency-Key` n'est pas documenté chez FedaPay. L'en-tête part
   * quand même — il ne coûte rien, et s'il est un jour honoré il fera
   * son office. Ce qu'on n'affirme plus, c'est qu'il protège : la
   * protection contre un second débit est `creerOuReprendre`, du côté
   * local, et elle est éprouvée par les cas de reprise ci-dessus.
   */
  it("l'en-tête d'idempotence part, et il porte la clé de la tentative", async () => {
    const appels = simuler(reponse(200, transaction), reponse(200, jeton));
    await adaptateurFedaPay("sk_essai", "sandbox", RETOUR).creer(XOF);
    const entetes = (appels[0]!.options.headers ?? {}) as Record<string, string>;
    expect(entetes["Idempotency-Key"]).toBe(XOF.cle);
  });
});

/* ------------------------------------------------------------------ *
 * Le rail, et les clés qui ne sortent pas.
 * ------------------------------------------------------------------ */

describe("le fournisseur suit la devise, et le client ne le choisit pas", () => {
  const AVEC = {
    APP_URL: "https://immipro.test",
    FEDAPAY_API_KEY: "sk_fedapay",
    STRIPE_API_KEY: "sk_stripe",
  };

  it("XOF passe par FedaPay, EUR par Stripe", () => {
    expect(lOuvreur("XOF", AVEC)?.fournisseur).toBe("FEDAPAY");
    expect(lOuvreur("EUR", AVEC)?.fournisseur).toBe("STRIPE");
  });

  /** Sans clé, pas d'ouvreur : l'appelant refuse avant d'écrire. */
  it("sans clé sortante, aucun ouvreur", () => {
    expect(lOuvreur("EUR", { ...AVEC, STRIPE_API_KEY: "   " })).toBeNull();
    expect(lOuvreur("XOF", { ...AVEC, FEDAPAY_API_KEY: "" })).toBeNull();
  });

  /** Sans adresse de retour absolue, les deux fournisseurs refusent. */
  it("sans APP_URL, aucun ouvreur", () => {
    expect(lOuvreur("EUR", { ...AVEC, APP_URL: "" })).toBeNull();
  });

  /**
   * L'ancienne graphie reste comprise ici aussi : l'ouverture lit le même
   * environnement normalisé que le reste.
   */
  it("l'ancienne graphie des clés est comprise", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ouvreur = lOuvreur("EUR", {
      APP_URL: "https://immipro.test",
      STRIPE_SECRET_KEY: "sk_ancienne",
    });
    expect(ouvreur?.fournisseur).toBe("STRIPE");
    vi.restoreAllMocks();
  });

  /** Ce que l'ouvreur rend ne contient jamais la clé. */
  it("la session rendue ne porte aucun secret", async () => {
    simuler(
      reponse(200, {
        id: "cs_1",
        url: "https://checkout.stripe.com/c/pay/cs_1",
        amount_total: 1200,
        currency: "eur",
        metadata: { reference: DEMANDE.reference },
      }),
    );
    const vu = await lOuvreur("EUR", AVEC)!.creer(DEMANDE);
    expect(JSON.stringify(vu)).not.toContain("sk_stripe");
  });
});

/**
 * La cause d'une ouverture échouée — 24/09/2026.
 *
 * Elle était calculée par l'adaptateur, typée par le contrat, et jetée par
 * son unique lecteur : cinq issues distinctes rendaient
 * `paiement_indisponible` au caractère près, sans diagnostic et sans ligne
 * de journal — `route.ts` ne journalise que ce qui n'est **pas** un échec
 * du catalogue.
 */
describe("l'ouverture échouée dit ce qui l'a empêchée", () => {
  /**
   * La garde porte sur la forme, pas sur l'instance : ce n'est pas « les
   * cinq causes d'aujourd'hui sont là », c'est « la liste du domaine **est**
   * celle du contrat ». Une sixième issue ajoutée au contrat sans nature
   * déclarée ne compile plus, au lieu de retomber dans une branche par
   * défaut — le défaut que ce lot corrige.
   */
  it("le domaine nomme exactement les issues d'échec du contrat, plus l'absence d'adaptateur", () => {
    type Identiques<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const memeListe: Identiques<
      CauseDEchecDOuverture,
      IssueDEchec | "aucun_adaptateur"
    > = true;
    expect(memeListe).toBe(true);
    expect(Object.keys(NATURE_DE_LA_CAUSE).sort()).toEqual(
      ["aucun_adaptateur", "creee_sans_url", "injoignable", "refusee", "reponse_inattendue"].sort(),
    );
  });

  /**
   * La nature décide de ce qu'on propose, et la proposition doit être
   * tenable : « Réessayer » sur une clé expirée fait perdre son temps au
   * candidat à la place du nôtre.
   */
  it("seule une panne qu'un second essai peut lever est réessayable", () => {
    expect(ouvertureReessayable("injoignable")).toBe(true);
    expect(ouvertureReessayable("creee_sans_url")).toBe(true);
    expect(ouvertureReessayable("aucun_adaptateur")).toBe(false);
    expect(ouvertureReessayable("refusee")).toBe(false);
    expect(ouvertureReessayable("reponse_inattendue")).toBe(false);
  });

  it("la trace commence par la référence, qui est ce par quoi on retrouve la transaction", () => {
    expect(traceDeLOuverture("IMP-2026-000123", "refusee", "api_key_expired")).toBe(
      "IMP-2026-000123 · refusee : api_key_expired",
    );
    expect(traceDeLOuverture("IMP-2026-000123", "injoignable")).toBe(
      "IMP-2026-000123 · injoignable",
    );
  });

  /**
   * Le constat ne sort jamais vers le candidat — `pourCandidat` ne
   * sérialise pas le diagnostic. C'est ce qui permet d'y écrire ce qui est
   * utile plutôt que ce qui est présentable ; encore faut-il que rien n'y
   * recopie la réponse du fournisseur.
   */
  it("aucune issue d'échec ne se construit sans dire ce qui a été constaté", async () => {
    const source = await readFile("src/server/paiement/ouvreur.ts", "utf8");
    // `detail` est obligatoire sur `Constat`, et les quatre issues d'échec
    // l'étendent : c'est le compilateur qui tient la règle, pas une revue.
    expect(source).toMatch(/export interface Constat \{\n\s*statut\?: number;\n\s*detail: string;/u);
    for (const issue of ["injoignable", "reponse_inattendue", "refusee", "creee_sans_url"]) {
      expect(source).toMatch(new RegExp(`issue: "${issue}"[^}]*\\} & Constat`, "u"));
    }
  });
});
