import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LIBELLE_CAUSE,
  echecPourMotif,
  motifDeLEchec,
  motifParDefaut,
  motifPourLaCause,
  type CauseRefus,
  type MotifEchec,
} from "@/domain/paiement/echec";
import type { Rail } from "@/domain/payments/rail";
import { lireFedaPay, lireStripe } from "@/server/paiement/notifications";
import { LIBELLE_RAPPROCHEMENT, estEnEchec } from "@/domain/backoffice/reconciliation";

const lire = (f: string) => readFileSync(f, "utf8");

const CAUSES: readonly CauseRefus[] = [
  "SOLDE_INSUFFISANT",
  "REFUS_EMETTEUR",
  "ANNULE_PAR_LE_PAYEUR",
  "MOYEN_INVALIDE",
  "INCIDENT_TECHNIQUE",
  "DELAI_DEPASSE",
];

/**
 * La raison d'un refus — N.B, WF-05.
 *
 * Le cycle recevait la raison du fournisseur et ne l'écrivait nulle part.
 * Ce qui se vérifie ici tient en deux moitiés : que la cause conservée dise
 * quelque chose d'utile, et qu'elle ne dise **que** cela — ni le texte du
 * fournisseur, ni un moyen de paiement, ni une accusation par défaut.
 */
describe("ce que les rails disent déjà, et qu'on jetait", () => {
  const fedapay = (statut: string) =>
    lireFedaPay({ entity: { id: 7, status: statut, reference: "IMP-260920-ABCDEF" } });

  it("FedaPay distingue trois échecs par son seul statut", () => {
    // L'information était là depuis le début : les trois se lisaient comme
    // un seul, et $-05 comme B-04 en payaient le prix.
    expect(fedapay("declined")?.cause).toBe("REFUS_EMETTEUR");
    expect(fedapay("canceled")?.cause).toBe("ANNULE_PAR_LE_PAYEUR");
    expect(fedapay("failed")?.cause).toBe("INCIDENT_TECHNIQUE");
  });

  it("FedaPay ne nomme jamais le solde : il ne le dit pas", () => {
    // Le rail n'a pas de code de refus normalisé. Inventer « solde
    // insuffisant » de ce côté serait une accusation sans source.
    for (const statut of ["declined", "canceled", "failed"]) {
      expect(fedapay(statut)?.cause).not.toBe("SOLDE_INSUFFISANT");
    }
  });

  it("aucune cause n'accompagne un paiement qui aboutit", () => {
    for (const statut of ["approved", "transferred", "pending", "refunded"]) {
      expect(fedapay(statut)?.cause).toBeUndefined();
    }
  });

  const stripe = (erreur?: Record<string, string>) =>
    lireStripe({
      id: "evt_1",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_1",
          metadata: { reference: "IMP-260920-ABCDEF" },
          ...(erreur ? { last_payment_error: erreur } : {}),
        },
      },
    });

  it("Stripe donne un code normalisé, et c'est le seul champ lu", () => {
    expect(stripe({ decline_code: "insufficient_funds" })?.cause).toBe("SOLDE_INSUFFISANT");
    expect(stripe({ decline_code: "expired_card" })?.cause).toBe("MOYEN_INVALIDE");
    expect(stripe({ code: "processing_error" })?.cause).toBe("INCIDENT_TECHNIQUE");
  });

  it("un code inconnu, ou absent, ne devient pas une accusation", () => {
    // La valeur par défaut est le refus sans raison : elle n'accuse ni le
    // solde ni le moyen.
    expect(stripe({ decline_code: "un_code_qui_n_existe_pas" })?.cause).toBe("REFUS_EMETTEUR");
    expect(stripe()?.cause).toBe("REFUS_EMETTEUR");
  });

  it("le message rédigé et la carte ne franchissent pas le schéma", () => {
    // Ils voyagent dans le même objet que le code. Ce qui n'est pas déclaré
    // n'atteint pas le code qui écrit en base.
    const lu = stripe({
      decline_code: "insufficient_funds",
      message: "Your card has insufficient funds.",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      charge: "ch_1",
    } as Record<string, string>);
    expect(JSON.stringify(lu)).not.toMatch(/insufficient funds|ch_1/u);
    expect(Object.keys(lu ?? {}).sort()).toEqual([
      "cause",
      // La clé d'idempotence est descendue sur la notification (M.B) ; elle
      // n'ajoute rien de ce que le schéma refuse de lire.
      "providerEventId",
      "providerTxId",
      "reference",
      "statut",
    ]);
  });
});

describe("ce que la cause dit au candidat", () => {
  it("chaque cause a un écran, et chaque écran une phrase", () => {
    for (const cause of CAUSES) {
      const motif = motifPourLaCause(cause);
      const echec = echecPourMotif(motif, "5 000 F", "97 •• •• 42", "MOBILE_MONEY");
      expect(echec.titre.length).toBeGreaterThan(0);
      expect(echec.verifications.length).toBeGreaterThan(0);
      // DOC-12 §16 règle 2 : le corps dit ce qui est conservé.
      expect(echec.corps).toMatch(/conservé/u);
    }
  });

  it("le solde n'est nommé que lorsqu'il est la cause", () => {
    const accusateurs = CAUSES.filter((c) =>
      echecPourMotif(motifPourLaCause(c), "5 000 F", null, "MOBILE_MONEY").titre.match(/solde/iu),
    );
    expect(accusateurs).toEqual(["SOLDE_INSUFFISANT"]);
    /**
     * Le corps non plus — mais la négation compte, comme pour le
     * vocabulaire interdit : « pas à ton solde » est exactement ce qu'on
     * veut lire sur un moyen invalide, et ce n'est pas une accusation.
     */
    const accuse = (texte: string) => /solde/iu.test(texte) && !/pas à ton solde/iu.test(texte);
    const nomment = CAUSES.filter((c) =>
      accuse(echecPourMotif(motifPourLaCause(c), "5 000 F", null, "MOBILE_MONEY").corps),
    );
    expect(nomment).toEqual(["SOLDE_INSUFFISANT"]);
    expect(echecPourMotif("moyen_invalide", "5 000 F", null, "MOBILE_MONEY").corps).toMatch(/pas à ton solde/u);
  });

  /**
   * Les vérifications aussi — et c'est là que l'accusation avait survécu.
   *
   * Le test au-dessus ne lisait que le titre et le corps. Le refus sans
   * raison tenait les deux — « la raison ne nous est pas communiquée » —
   * et ouvrait pourtant son encadré par « le solde disponible doit couvrir
   * 5 000 F ». La ligne la plus lue de l'écran nommait la cause que les
   * deux autres champs disaient ignorer. Un garde-fou qui connaît deux
   * champs sur trois garde deux champs sur trois.
   *
   * Une seule phrase nomme le solde sans l'accuser, et elle est écrite ici
   * plutôt que tolérée par une expression large : consulter son solde est
   * une action, pas un diagnostic. Nommée, elle se voit dans la diff le
   * jour où elle change.
   */
  const CONSULTATION_DU_SOLDE =
    "Compose le *880# pour consulter ton solde et tes dernières opérations.";

  it("les vérifications non plus ne nomment le solde qu'à sa cause", () => {
    const nomment = CAUSES.filter((c) =>
      echecPourMotif(motifPourLaCause(c), "5 000 F", null, "MOBILE_MONEY")
        .verifications.filter((v) => v !== CONSULTATION_DU_SOLDE)
        .some((v) => /solde/iu.test(v)),
    );
    expect(nomment).toEqual(["SOLDE_INSUFFISANT"]);
  });

  it("deux titres voisins ne se lisent pas l'un pour l'autre", () => {
    // Vu en comparant deux écrans : « Le paiement n'a pas abouti » pour un
    // solde et « Le paiement n'a pas pu aboutir » pour une panne. Chacun
    // nomme maintenant son fait.
    const titres = CAUSES.map((c) => echecPourMotif(motifPourLaCause(c), "5 000 F", null, "MOBILE_MONEY").titre);
    expect(new Set(titres).size).toBe(titres.length);
    expect(echecPourMotif("solde_insuffisant", "5 000 F", null, "MOBILE_MONEY").titre).toMatch(/solde/u);
    expect(echecPourMotif("incident_technique", "5 000 F", null, "MOBILE_MONEY").titre).toMatch(/panne/u);
  });

  it("une panne ne se présente pas comme une faute du candidat", () => {
    const panne = echecPourMotif("incident_technique", "5 000 F", null, "MOBILE_MONEY");
    expect(panne.corps).toMatch(/pas du tien/u);
    expect(panne.verifications[0]).toMatch(/rien à corriger/u);
  });

  it("la cause conservée prime sur la déduction par l'état", () => {
    expect(motifDeLEchec("SOLDE_INSUFFISANT", "ECHOUEE")).toBe("solde_insuffisant");
    expect(motifDeLEchec("ANNULE_PAR_LE_PAYEUR", "ECHOUEE")).toBe("annule_par_le_payeur");
    // Sans cause, la déduction d'avant reprend la main.
    expect(motifDeLEchec(null, "ECHOUEE")).toBe(motifParDefaut("ECHOUEE"));
    expect(motifDeLEchec(null, "EXPIREE")).toBe("delai_depasse");
  });

  it("`notification_absente` n'a pas de cause en base", () => {
    // Ce n'est pas un refus : c'est l'état d'un paiement dont personne n'a
    // rien dit. Aucune cause ne doit y conduire.
    const ecrans = CAUSES.map(motifPourLaCause);
    expect(ecrans).not.toContain<MotifEchec>("notification_absente");
  });
});

describe("ce que le back-office en lit", () => {
  it("l'état ne nomme plus une cause qu'il ne connaît pas", () => {
    // Il classait tout échec en « Solde insuffisant », panne comprise.
    expect(Object.values(LIBELLE_RAPPROCHEMENT)).not.toContain("Solde insuffisant");
    expect(LIBELLE_RAPPROCHEMENT.ECHEC).toBe("Échec");
    expect(estEnEchec({ etat: "ECHEC" } as never)).toBe(true);
  });

  it("la cause est une colonne à part, avec son libellé", () => {
    for (const cause of CAUSES) {
      expect(LIBELLE_CAUSE[cause].length).toBeGreaterThan(0);
    }
    expect(LIBELLE_CAUSE.SOLDE_INSUFFISANT).toBe("Solde insuffisant");
  });
});

describe("ce que la base refuse", () => {
  const migration = lire("prisma/migrations/20260920000200_motif_de_refus/migration.sql");

  it("un motif sur un paiement encaissé", () => {
    expect(migration).toMatch(/transaction_motif_seulement_sur_un_echec/u);
    expect(migration).toMatch(/IN \('ECHOUEE', 'EXPIREE'\)/u);
  });

  it("une expiration qui jugerait le payeur", () => {
    expect(migration).toMatch(/transaction_expiration_ne_juge_pas_le_payeur/u);
  });

  it("un échec annoncé qui se dirait hors délai", () => {
    expect(migration).toMatch(/transaction_echec_annonce_n_est_pas_un_delai/u);
  });
});

describe("ce qui part avec le compte", () => {
  it("l'anonymisation efface le motif, comme le refus de visa", () => {
    // Une contrainte CHECK ne peut pas interroger une autre table : le
    // garde-fou vit dans le service, à côté de `issueReason`.
    const suppression = lire("src/server/acces/suppression.ts");
    expect(suppression).toMatch(/failureCause: null/u);
    expect(suppression.indexOf("issueReason: null")).toBeLessThan(
      suppression.indexOf("failureCause: null"),
    );
  });

  it("l'écran de suppression le dit avant le bouton", () => {
    const domaine = lire("src/domain/comptes/suppression.ts");
    expect(domaine).toMatch(/sans ton nom ni la raison d'un refus/u);
  });
});

describe("ce qui écrit la colonne", () => {
  it("le motif ne s'écrit que sur un échec", () => {
    const acces = lire("src/server/acces/paiements.ts");
    expect(acces).toMatch(/effet\.vers === "ECHOUEE" && notification\.cause/u);
  });

  it("une expiration porte le seul motif que la plateforme peut prononcer", () => {
    const job = lire("src/server/jobs/reconciliation.ts");
    expect(job).toMatch(/status: "EXPIREE", failureCause: "DELAI_DEPASSE"/u);
  });

  it("aucun texte de fournisseur n'entre en base", () => {
    // Le schéma de lecture ne déclare que des codes ; rien qui ressemble à
    // un message ou à un numéro de carte n'est nommé.
    const notifications = lire("src/server/paiement/notifications.ts");
    const schema = notifications.slice(notifications.indexOf("const schemaStripe"));
    expect(schema).not.toMatch(/message:|last4|network_status/u);
  });
});

/**
 * O.A, tranché pour la V1 le 20/09/2026 — FedaPay ne dit pas pourquoi, et
 * on ne le devine pas à sa place.
 *
 * Trois interdits, trois tests. Le rail n'expose pas de code de refus
 * normalisé : le motif reste générique et non accusatoire, aucune seconde
 * adresse n'est interrogée pour fabriquer une précision incertaine, et la
 * table des causes ne s'enrichit pas sans code stable.
 *
 * L'enquête chez le fournisseur reste à mener et ne bloque rien. Ce qui
 * suit tient la décision d'ici là — un relevé en prose ne l'aurait pas
 * tenue, et c'est la leçon que M.C avait déjà tirée.
 */
describe("le refus sans raison reste sans raison", () => {
  const refus = (rail: Rail, numero: string | null = "97 •• •• 42") =>
    echecPourMotif("refus_operateur", "5 000 F", numero, rail);

  /**
   * Le montant est le marqueur de l'accusation retirée : il n'apparaissait
   * dans cet écran que pour dire « ton solde ne le couvrait pas ». Sans
   * cause connue, il n'y a rien à en faire — la somme est déjà rappelée en
   * pied d'écran, sous le bouton.
   */
  it("aucun texte ne rappelle le montant : il ne servait qu'à accuser le solde", () => {
    for (const rail of ["MOBILE_MONEY", "CARTE"] as const) {
      expect(JSON.stringify(refus(rail))).not.toContain("5 000 F");
    }
  });

  it("aucune vérification n'exige un solde qu'on ne connaît pas", () => {
    for (const rail of ["MOBILE_MONEY", "CARTE"] as const) {
      for (const v of refus(rail).verifications) {
        expect(v, v).not.toMatch(/doit couvrir|solde disponible|solde suffisant/iu);
      }
    }
  });

  /** Ce qui reste se vérifie sans cause : l'instrument, et le relevé. */
  it("ce qui reste est vérifiable sans connaître la cause", () => {
    for (const rail of ["MOBILE_MONEY", "CARTE"] as const) {
      const v = refus(rail).verifications;
      expect(v.length).toBeGreaterThan(0);
      expect(v.some((l) => /autorisé|autorisée/u.test(l))).toBe(true);
      expect(refus(rail).corps).toMatch(/la raison ne nous est pas communiquée/u);
    }
  });

  /**
   * Réessayer et changer de grille sont les deux autres actions utiles, et
   * l'écran les porte en boutons. Les répéter dans « ce que tu peux
   * vérifier » ferait de l'encadré un doublon des commandes du dessous —
   * c'est la faute de N.A, une règle sans domicile recopiée à chaque
   * endroit qui en a besoin.
   */
  it("les actions que l'écran porte déjà ne sont pas redites dans l'encadré", () => {
    const ecran = lire("src/app/(app)/paiement/echec/Echec.tsx");
    expect(ecran).toContain("Réessayer le paiement");
    expect(ecran).toContain("actionVersLAutreGrille");
    for (const rail of ["MOBILE_MONEY", "CARTE"] as const) {
      for (const v of refus(rail).verifications) {
        expect(v, v).not.toMatch(/réessaie|relance|autre grille/iu);
      }
    }
  });

  /**
   * Le vocabulaire suit le rail. « Ton opérateur n'a pas confirmé » est
   * juste en Mobile Money et faux pour une carte, où l'émetteur est une
   * banque — et le `*880#` d'un opérateur béninois n'a rien à faire sur
   * l'écran d'un paiement par carte en euros.
   */
  it("un payeur par carte ne s'entend pas parler d'opérateur ni de *880#", () => {
    const carte = refus("CARTE");
    expect(carte.titre).toMatch(/banque/u);
    expect(JSON.stringify(carte)).not.toMatch(/\*880#|opérateur|Mobile Money/u);
    expect(refus("MOBILE_MONEY").titre).toMatch(/opérateur/u);
  });

  /** Et le `*880#` ne part sur aucun motif quand on paie par carte. */
  it("aucun motif n'envoie composer un code USSD à un payeur par carte", () => {
    const motifs: readonly MotifEchec[] = CAUSES.map(motifPourLaCause);
    for (const motif of motifs) {
      expect(
        JSON.stringify(echecPourMotif(motif, "5 000 F", null, "CARTE")),
        motif,
      ).not.toContain("*880#");
    }
  });
});

describe("la table des causes FedaPay ne s'enrichit pas d'une supposition", () => {
  const source = lire("src/server/paiement/notifications.ts");

  /**
   * Seules les causes que le vocabulaire de `status` distingue réellement
   * ont le droit d'y figurer. `SOLDE_INSUFFISANT` et `MOYEN_INVALIDE`
   * nomment une défaillance précise de l'instrument du payeur : les tirer
   * de « declined » serait les deviner, et il faudrait pour cela un code
   * normalisé et contractuellement stable que le webhook ne porte pas.
   */
  it("elle ne traduit que ce que les trois états d'échec distinguent", () => {
    const table = /const CAUSES_FEDAPAY[\s\S]*?\n\};/u.exec(source)![0];
    const valeurs = [...table.matchAll(/:\s*"([A-Z_]+)"/gu)].map((m) => m[1]!);
    expect(valeurs.length).toBeGreaterThan(0);
    for (const valeur of valeurs) {
      expect(["REFUS_EMETTEUR", "ANNULE_PAR_LE_PAYEUR", "INCIDENT_TECHNIQUE"], valeur).toContain(
        valeur,
      );
    }
  });

  /** Et la condition d'entrée est écrite là où la table vit. */
  it("la condition d'entrée est énoncée, pas seulement respectée", () => {
    expect(source).toMatch(/normalisé et contractuellement stable/u);
  });

  /**
   * Aucune seconde adresse n'est interrogée pour préciser un échec. Un
   * aller-retour sur le chemin d'un webhook, dans le seul but de fabriquer
   * une précision dont on ne pourrait pas garantir le sens, coûte deux
   * fois : la latence, et la fausse cause.
   */
  it("aucun appel sortant ne vient enrichir la cause", () => {
    for (const f of [
      "src/server/paiement/notifications.ts",
      "src/server/paiement/reception.ts",
      "src/app/api/webhooks/fedapay/route.ts",
    ]) {
      expect(lire(f), f).not.toMatch(/\bfetch\(|axios|https?\.request\(/u);
    }
  });
});
