import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ANALYSES_AJOUTEES,
  ANALYSES_APRES,
  ANALYSES_AVANT,
  CODE_MONTEE_DOSSIER,
  LIBELLE_MONTEE,
  MESSAGE_DU_REFUS,
  PHRASE_MONTEE,
  PHRASE_RECHARGE,
  ceQueLaMonteeOuvre,
  detailDuPrix,
  prixDeLaMontee,
  suiteDuRemboursementDeLaMontee,
  verdictDeLaMontee,
  type AchatSource,
} from "@/domain/payments/montee";
import {
  achatDepuisLeCode,
  achatDuParametre,
  codeEnregistre,
  corpsDAchat,
  CODES_HORS_PACK,
  ouvrableDepuisLeRecapitulatif,
  schemaAchat,
  tarifDe,
} from "@/domain/payments/achat";
import {
  CODES_REDACTION_ASSISTEE,
  PACKS_REDACTION_ASSISTEE,
  packDeLaCouverture,
  redactionAssisteeOuverte,
} from "@/domain/payments/droits";
import { getPack, RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import { libelleDeLAchat } from "@/domain/paiement/recu";
import { actionApresLAchat, ceQuiSOuvre, phraseDeConfirmation } from "@/domain/paiement/contrepartie";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * La montée en gamme Essentiel → Dossier — arbitrage S.88.
 *
 * Ce qui se décide sans base : le prix différentiel, les vingt analyses,
 * les conditions de l'achat d'origine, le remboursement du supplément, et
 * la catégorie qui traverse le tunnel. Ce qui demande une base — le lien à
 * l'achat source, l'index unique, le rejeu d'un webhook — s'éprouve dans
 * `scripts/fumee-montee.mts`.
 */

const source = (reste: Partial<AchatSource> = {}): AchatSource => ({
  transactionId: "tx-ess",
  reference: "IMP-260925-AAAAAA",
  packCode: "essentiel",
  statut: "CONFIRMEE",
  montant: 5000,
  devise: "XOF",
  couvreLeDossier: true,
  remboursementOuvert: false,
  montee: "AUCUNE",
  ...reste,
});

describe("le prix : la différence, dans la devise de l'achat d'origine", () => {
  it("aux tarifs actuels : 10 000 F et 17 €", () => {
    expect(prixDeLaMontee({ montant: 5000, devise: "XOF" })).toBe(10_000);
    expect(prixDeLaMontee({ montant: 12, devise: "EUR" })).toBe(17);
  });

  it("les grilles restent natives : aucune conversion", () => {
    const dossier = getPack("dossier")!;
    expect(prixDeLaMontee({ montant: 5000, devise: "XOF" })).toBe(dossier.prix.XOF - 5000);
    expect(prixDeLaMontee({ montant: 12, devise: "EUR" })).toBe(dossier.prix.EUR - 12);
  });

  /**
   * Le montant réellement payé, pas le prix d'Essentiel aujourd'hui : un
   * Essentiel acheté avant une hausse paie la différence réelle.
   */
  it("retranche ce qui a été payé, et non le tarif courant d'Essentiel", () => {
    expect(prixDeLaMontee({ montant: 4000, devise: "XOF" })).toBe(11_000);
  });

  it("n'est jamais négatif", () => {
    expect(prixDeLaMontee({ montant: 20_000, devise: "XOF" })).toBe(0);
    expect(prixDeLaMontee({ montant: 29, devise: "EUR" })).toBe(0);
  });

  it("le détail écrit le calcul en entier", () => {
    expect(detailDuPrix({ montant: 5000, devise: "XOF" })).toEqual({
      prixDossier: 15_000,
      dejaPaye: 5000,
      montant: 10_000,
      devise: "XOF",
    });
  });
});

describe("la couverture : vingt analyses ajoutées, jamais trente", () => {
  it("le quota issu du pack passe de 10 à 30", () => {
    expect(ANALYSES_AVANT).toBe(10);
    expect(ANALYSES_APRES).toBe(30);
    expect(ANALYSES_AJOUTEES).toBe(20);
  });

  it("la montée ouvre la rédaction assistée, comme Dossier", () => {
    expect(CODES_REDACTION_ASSISTEE).toContain(CODE_MONTEE_DOSSIER);
    // La grille, elle, n'a pas changé : la montée n'est pas un pack.
    expect([...PACKS_REDACTION_ASSISTEE].sort()).toEqual(["dossier", "pro"]);
    expect(
      redactionAssisteeOuverte([
        { packCode: "essentiel", retiree: false },
        { packCode: CODE_MONTEE_DOSSIER, retiree: false },
      ]),
    ).toBe(true);
  });

  it("et son remboursement retire le droit", () => {
    expect(
      redactionAssisteeOuverte([
        { packCode: "essentiel", retiree: false },
        { packCode: CODE_MONTEE_DOSSIER, retiree: true },
      ]),
    ).toBe(false);
  });

  /**
   * Le pack affiché se lisait sur le dernier achat confirmé : une recharge
   * ou une montée en est un, et l'écran de dépôt écrivait « sans pack ».
   */
  it("le pack affiché se lit sur la couverture, pas sur le dernier achat", () => {
    expect(
      packDeLaCouverture([
        { packCode: "essentiel", retiree: false },
        { packCode: CODE_MONTEE_DOSSIER, retiree: false },
      ]),
    ).toBe("Dossier");
    expect(
      packDeLaCouverture([
        { packCode: "essentiel", retiree: false },
        { packCode: CODE_MONTEE_DOSSIER, retiree: true },
      ]),
    ).toBe("Essentiel");
    expect(packDeLaCouverture([])).toBeNull();
  });
});

describe("l'achat d'origine : confirmé, couvrant, non remboursé", () => {
  it("un Essentiel confirmé qui couvre le dossier ouvre la montée", () => {
    const verdict = verdictDeLaMontee([source()], false);
    expect(verdict).toMatchObject({ ouverte: true, montant: 10_000, devise: "XOF", reprise: false });
  });

  it("garde la devise de l'achat d'origine", () => {
    const verdict = verdictDeLaMontee([source({ montant: 12, devise: "EUR" })], false);
    expect(verdict).toMatchObject({ ouverte: true, montant: 17, devise: "EUR" });
  });

  it.each([
    ["non confirmé", { statut: "EN_ATTENTE" as const }],
    ["échoué", { statut: "ECHOUEE" as const }],
    ["qui ne couvre pas ce dossier", { couvreLeDossier: false }],
    ["d'un autre pack", { packCode: "dossier" }],
  ])("un Essentiel %s ne l'ouvre pas", (_nom, reste) => {
    expect(verdictDeLaMontee([source(reste)], false)).toMatchObject({
      ouverte: false,
      raison: "SANS_ESSENTIEL",
    });
  });

  it("un achat remboursé, ou dont le remboursement est engagé, ne sert pas de base", () => {
    expect(verdictDeLaMontee([source({ remboursementOuvert: true })], false)).toMatchObject({
      ouverte: false,
      raison: "REMBOURSEMENT",
    });
  });

  it("une seule montée par achat et par dossier", () => {
    expect(verdictDeLaMontee([source({ montee: "CONFIRMEE" })], false)).toMatchObject({
      ouverte: false,
      raison: "DEJA_MONTE",
    });
    expect(verdictDeLaMontee([source({ montee: "EN_REMBOURSEMENT" })], false)).toMatchObject({
      ouverte: false,
      raison: "MONTEE_EN_REMBOURSEMENT",
    });
  });

  it("une montée en attente est reprise, pas doublée", () => {
    const verdict = verdictDeLaMontee(
      [source({ transactionId: "a" }), source({ transactionId: "b", montee: "EN_COURS" })],
      false,
    );
    expect(verdict).toMatchObject({ ouverte: true, reprise: true });
    expect(verdict.ouverte && verdict.source.transactionId).toBe("b");
  });

  it("un dossier déjà couvert par Dossier ou Pro ne monte pas", () => {
    expect(verdictDeLaMontee([source()], true)).toMatchObject({
      ouverte: false,
      raison: "DEJA_DOSSIER",
    });
  });

  it("sans différence à payer, rien ne s'ouvre par paiement", () => {
    expect(verdictDeLaMontee([source({ montant: 15_000 })], false)).toMatchObject({
      ouverte: false,
      raison: "SANS_SUPPLEMENT",
    });
  });

  it("chaque refus dit ce qui l'arrête et ce qui reste possible", () => {
    for (const message of Object.values(MESSAGE_DU_REFUS)) {
      expect(message.length).toBeGreaterThan(60);
      expect(message).not.toMatch(/non disponible\.?$/u);
    }
  });
});

describe("le remboursement du supplément", () => {
  it("retire les vingt analyses tant que le solde les couvre", () => {
    expect(suiteDuRemboursementDeLaMontee(20, 30)).toEqual({ suite: "RETRAIT_INTEGRAL", retire: 20 });
    expect(suiteDuRemboursementDeLaMontee(20, 20)).toEqual({ suite: "RETRAIT_INTEGRAL", retire: 20 });
  });

  /**
   * Un candidat qui a consommé ses dix analyses d'Essentiel n'a touché à
   * aucune des vingt ajoutées : elles se retirent sans humain.
   */
  it("les analyses ajoutées sont tenues pour consommées en dernier", () => {
    // 10 + 20 ouvertes, 10 consommées : solde 20.
    expect(suiteDuRemboursementDeLaMontee(20, 20).suite).toBe("RETRAIT_INTEGRAL");
  });

  it("des analyses ajoutées déjà consommées passent en revue manuelle", () => {
    expect(suiteDuRemboursementDeLaMontee(20, 15)).toEqual({
      suite: "REVUE_MANUELLE",
      ouvertes: 20,
      consommees: 5,
    });
    expect(suiteDuRemboursementDeLaMontee(20, 0)).toMatchObject({ consommees: 20 });
  });
});

describe("la catégorie traverse le tunnel", () => {
  it("s'enregistre et se relit sous son propre code", () => {
    expect(codeEnregistre({ type: "montee" })).toBe(CODE_MONTEE_DOSSIER);
    expect(achatDepuisLeCode(CODE_MONTEE_DOSSIER)).toEqual({ type: "montee" });
    expect(achatDuParametre(CODE_MONTEE_DOSSIER)).toEqual({ type: "montee" });
    expect(CODES_HORS_PACK).toContain(CODE_MONTEE_DOSSIER);
  });

  it("ne porte rien d'autre que sa catégorie : ni prix, ni achat d'origine", () => {
    expect(corpsDAchat({ type: "montee" })).toEqual({ type: "montee" });
    expect(schemaAchat.parse({ type: "montee", montant: 1, source: "x" })).toEqual({
      type: "montee",
    });
    // Son prix n'est pas sur la grille : seul le serveur le calcule.
    expect(tarifDe({ type: "montee" })).toBeNull();
    expect(ouvrableDepuisLeRecapitulatif({ type: "montee" })).toBe(true);
  });

  it("le reçu et les écrans de fin la nomment", () => {
    expect(libelleDeLAchat(CODE_MONTEE_DOSSIER)).toBe(LIBELLE_MONTEE);
    expect(LIBELLE_MONTEE).toBe("Passage d'Essentiel à Dossier");
    expect(phraseDeConfirmation({ type: "montee" })).toContain("20 analyses ajoutées");
    expect(ceQuiSOuvre({ type: "montee" })).toContain("Dossier");
    expect(actionApresLAchat({ type: "montee" })).toBe("Revenir à mon dossier");
  });
});

describe("ce que l'écran dit", () => {
  it("les deux gestes ne se confondent pas", () => {
    expect(PHRASE_MONTEE).toMatch(/^Passer à Dossier/u);
    expect(PHRASE_MONTEE).toContain("différence");
    expect(PHRASE_RECHARGE).toMatch(/^Ajouter des analyses/u);
    expect(PHRASE_RECHARGE).toContain("indépendante");
    expect(RECHARGE_ANALYSES.volume).toBe(10);
  });

  it("dit que les recharges ne réduisent ni le prix ni les analyses", () => {
    const lignes = ceQueLaMonteeOuvre().join(" ");
    expect(lignes).toContain("de 10 à 30");
    expect(lignes).toMatch(/recharges[^.]*ne changent ni ce prix ni ces analyses/u);
  });

  it("aucune phrase n'emploie le vocabulaire interdit", () => {
    const phrases = [
      PHRASE_MONTEE,
      PHRASE_RECHARGE,
      LIBELLE_MONTEE,
      ...ceQueLaMonteeOuvre(),
      ...Object.values(MESSAGE_DU_REFUS),
      phraseDeConfirmation({ type: "montee" }),
    ];
    for (const p of phrases) expect(verifierTexte(p, INTERDITS_PARTOUT), p).toEqual([]);
  });
});

describe("le serveur tient ce que le domaine décide", () => {
  const paiements = readFileSync("src/server/acces/paiements.ts", "utf8");

  it("le crédit ajoute ANALYSES_AJOUTEES en ACHAT_PACK, sans repasser par la couverture", () => {
    const bloc = paiements.slice(paiements.indexOf('case "montee":'));
    expect(bloc).toMatch(/analyses: ANALYSES_AJOUTEES,\s*motif: "ACHAT_PACK",\s*transactionId: transaction\.id/u);
  });

  it("le montant vient de l'achat d'origine, jamais du navigateur", () => {
    expect(paiements).toMatch(/return \{ montant: achat\.source\.du, libelle: LIBELLE_MONTEE \}/u);
    const route = readFileSync("src/app/api/paiements/route.ts", "utf8");
    expect(route).toMatch(/preparerLAchat\(corps\.achat, dossier\.id, acteur!\.id\)/u);
  });

  it("la reprise porte sur le même achat, pas sur n'importe quelle transaction en attente", () => {
    expect(paiements).toMatch(/packCode: codeEnregistre\(achat\)/u);
    expect(paiements).toMatch(/sourceTransactionId: achat\.source\.transactionId/u);
  });

  it("la base exige le lien à l'achat d'origine et n'accepte qu'une montée ouverte", () => {
    const migration = readFileSync(
      "prisma/migrations/20260925120000_montee_en_gamme/migration.sql",
      "utf8",
    );
    expect(migration).toMatch(/CHECK \(\("packCode" = 'montee-dossier'\) = \("sourceTransactionId" IS NOT NULL\)\)/u);
    expect(migration).toMatch(/CREATE UNIQUE INDEX "transaction_une_montee_par_achat"/u);
  });
});
