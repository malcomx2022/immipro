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
  MONTEES_OUVERTES,
  NOTE_REDACTION_ASSISTEE,
  REFUS_ESSENTIEL_APRES_MONTEE,
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
  packEffectif,
  redactionAssisteeOuverte,
  type AchatCouvrant,
} from "@/domain/payments/droits";
import {
  octroiAEntamer,
  octroisDeLaTransaction,
  repartir,
  type LigneDuGrandLivre,
} from "@/domain/payments/grand-livre";
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

/* ── S.92 — décision définitive ─────────────────────────────────────── */

/** Un grand livre écrit ligne à ligne, dans l'ordre. */
function grandLivre() {
  const lignes: LigneDuGrandLivre[] = [];
  let t = Date.parse("2026-09-01T08:00:00Z");
  const ecrire = (l: Omit<LigneDuGrandLivre, "id" | "createdAt">): string => {
    const id = `l${String(lignes.length + 1).padStart(3, "0")}`;
    t += 60_000;
    lignes.push({ ...l, id, createdAt: new Date(t) });
    return id;
  };
  const vide = { transactionId: null, analysisId: null, grantId: null };
  return {
    lignes,
    octroi: (reason: "ACHAT_PACK" | "RECHARGE", transactionId: string, n: number) =>
      ecrire({ ...vide, reason, delta: n, transactionId }),
    /** Un débit tel que `debiterUneAnalyse` l'écrit : imputé par le rejeu. */
    debiter: (analysisId: string | null = null) =>
      ecrire({ ...vide, reason: "ANALYSE", delta: -1, analysisId, grantId: octroiAEntamer(lignes) }),
    /** Un débit d'avant S.92 : sans imputation écrite. */
    debiterSansImputation: () => ecrire({ ...vide, reason: "ANALYSE", delta: -1 }),
    rendre: (analysisId: string | null, grantId: string | null = null) =>
      ecrire({ ...vide, reason: "ANALYSE_RENDUE", delta: 1, analysisId, grantId }),
    retirer: (transactionId: string, n: number, grantId: string | null = null) =>
      ecrire({ ...vide, reason: "REMBOURSEMENT", delta: -n, transactionId, grantId }),
  };
}

const etat = (lignes: readonly LigneDuGrandLivre[], transactionId: string) =>
  octroisDeLaTransaction(lignes, transactionId)[0]!;

describe("S.92 — la consommation est FIFO, et chaque débit nomme son octroi", () => {
  it("Essentiel s'épuise avant les vingt analyses de la montée", () => {
    const g = grandLivre();
    g.octroi("ACHAT_PACK", "essentiel", 10);
    const montee = g.octroi("ACHAT_PACK", "montee", 20);
    for (let i = 0; i < 10; i += 1) g.debiter();
    expect(etat(g.lignes, "essentiel")).toMatchObject({ consommees: 10, restantes: 0 });
    expect(etat(g.lignes, "montee")).toMatchObject({ consommees: 0, restantes: 20 });

    g.debiter();
    expect(g.lignes.at(-1)!.grantId).toBe(montee);
    expect(etat(g.lignes, "montee")).toMatchObject({ consommees: 1, restantes: 19 });
  });

  it("une recharge achetée avant la montée se consomme avant elle", () => {
    const g = grandLivre();
    g.octroi("ACHAT_PACK", "essentiel", 10);
    g.octroi("RECHARGE", "recharge", 10);
    g.octroi("ACHAT_PACK", "montee", 20);
    for (let i = 0; i < 20; i += 1) g.debiter();
    expect(etat(g.lignes, "recharge").restantes).toBe(0);
    expect(etat(g.lignes, "montee").consommees).toBe(0);
  });

  it("une recharge achetée après la montée se consomme après elle", () => {
    const g = grandLivre();
    g.octroi("ACHAT_PACK", "essentiel", 10);
    g.octroi("ACHAT_PACK", "montee", 20);
    g.octroi("RECHARGE", "recharge", 10);
    for (let i = 0; i < 11; i += 1) g.debiter();
    // Le solde couvre encore vingt analyses — et pourtant une de la
    // montée a servi. C'est ce que la lecture par le solde manquait.
    expect(g.lignes.reduce((n, l) => n + l.delta, 0)).toBe(29);
    expect(etat(g.lignes, "montee").consommees).toBe(1);
    expect(etat(g.lignes, "recharge").consommees).toBe(0);
  });

  it("une analyse rendue retourne à l'octroi qu'elle avait entamé", () => {
    const g = grandLivre();
    g.octroi("ACHAT_PACK", "essentiel", 10);
    const montee = g.octroi("ACHAT_PACK", "montee", 20);
    for (let i = 0; i < 10; i += 1) g.debiter();
    g.debiter("analyse-x");
    // Par l'analyse, puis par l'imputation écrite.
    g.rendre("analyse-x");
    expect(etat(g.lignes, "montee")).toMatchObject({ consommees: 0, restantes: 20 });
    g.debiter();
    g.rendre(null, montee);
    expect(etat(g.lignes, "montee").consommees).toBe(0);
  });

  it("les lignes d'avant S.92 sont imputées par la même règle, sans réécriture", () => {
    const g = grandLivre();
    g.octroi("ACHAT_PACK", "essentiel", 10);
    g.octroi("ACHAT_PACK", "montee", 20);
    for (let i = 0; i < 12; i += 1) g.debiterSansImputation();
    const r = repartir(g.lignes);
    expect(etat(g.lignes, "essentiel").consommees).toBe(10);
    expect(etat(g.lignes, "montee").consommees).toBe(2);
    expect(g.lignes.every((l) => l.reason !== "ANALYSE" || l.grantId === null)).toBe(true);
    expect([...r.imputations.values()].filter((v) => v !== null)).toHaveLength(12);
  });

  it("un retrait ne prend que sur l'achat remboursé", () => {
    const g = grandLivre();
    g.octroi("ACHAT_PACK", "essentiel", 10);
    const montee = g.octroi("ACHAT_PACK", "montee", 20);
    g.octroi("RECHARGE", "recharge", 10);
    g.retirer("montee", 20, montee);
    expect(etat(g.lignes, "montee")).toMatchObject({ retirees: 20, restantes: 0 });
    expect(etat(g.lignes, "recharge").restantes).toBe(10);
    // Et plus rien ne l'entame ensuite.
    for (let i = 0; i < 11; i += 1) g.debiter();
    expect(etat(g.lignes, "montee").consommees).toBe(0);
  });
});

describe("S.92 — le remboursement automatique du supplément", () => {
  const intact = { accordees: 20, consommees: 0, retirees: 0 };

  it("intactes et sans rédaction : les vingt se retirent sans humain", () => {
    expect(suiteDuRemboursementDeLaMontee({ octroi: intact, redactionUtilisee: false })).toEqual({
      suite: "RETRAIT_INTEGRAL",
      retire: 20,
    });
  });

  it("une consommation partielle envoie en revue manuelle", () => {
    const suite = suiteDuRemboursementDeLaMontee({
      octroi: { ...intact, consommees: 3 },
      redactionUtilisee: false,
    });
    expect(suite.suite).toBe("REVUE_MANUELLE");
    if (suite.suite === "REVUE_MANUELLE") expect(suite.motif).toMatch(/3 des 20 analyses/u);
  });

  it("une rédaction utilisée envoie en revue manuelle, même analyses intactes", () => {
    const suite = suiteDuRemboursementDeLaMontee({ octroi: intact, redactionUtilisee: true });
    expect(suite.suite).toBe("REVUE_MANUELLE");
    if (suite.suite === "REVUE_MANUELLE") expect(suite.motif).toMatch(/rédaction assistée a été utilisée/u);
  });

  it("les deux causes se disent ensemble", () => {
    const suite = suiteDuRemboursementDeLaMontee({
      octroi: { ...intact, consommees: 1 },
      redactionUtilisee: true,
    });
    if (suite.suite !== "REVUE_MANUELLE") throw new Error("revue attendue");
    expect(suite.motif).toMatch(/1 des 20 analyses.*et la rédaction/u);
  });

  it("un octroi introuvable ne se rembourse pas à l'aveugle", () => {
    expect(
      suiteDuRemboursementDeLaMontee({ octroi: null, redactionUtilisee: false }).suite,
    ).toBe("REVUE_MANUELLE");
  });

  it("les débits de rédaction portent leur trace, écrite avant l'appel", () => {
    // La mise en forme débite dans `mettreEnForme` depuis la revue M7.
    const relecture = readFileSync("src/app/api/dossiers/[id]/redaction/[type]/relecture/route.ts", "utf8");
    const miseEnForme = readFileSync("src/server/redaction/mise-en-forme.ts", "utf8");
    expect(relecture).toMatch(/debiterUneAnalyse\(params\.id!, undefined, \{\s*note: `\$\{NOTE_REDACTION_ASSISTEE\}/u);
    expect(miseEnForme).toMatch(/debiterUneAnalyse\(dossierId, undefined, \{\s*note: `\$\{NOTE_REDACTION_ASSISTEE\}/u);
    expect(NOTE_REDACTION_ASSISTEE).toBe("Rédaction assistée");
  });
});

describe("S.92 — l'Essentiel d'origine et le périmètre", () => {
  it("un Essentiel à la base d'une montée confirmée ne se rembourse pas seul", () => {
    const code = readFileSync("src/server/acces/paiements.ts", "utf8");
    const fonction = /export async function ouvrirUnRemboursement[\s\S]*?\n\}$/mu.exec(code)![0];
    expect(fonction).toMatch(/where: \{ status: "CONFIRMEE", refundedAt: null \}/u);
    expect(fonction).toMatch(/transaction\.packCode === PACK_DE_DEPART && transaction\.montees\.length > 0/u);
    expect(REFUS_ESSENTIEL_APRES_MONTEE).toMatch(/Rembourse d'abord le passage à Dossier/u);
  });

  it("Essentiel → Dossier Pro est hors V1", () => {
    expect(MONTEES_OUVERTES).toEqual(["dossier"]);
    expect(achatDuParametre("montee-pro")).not.toEqual({ type: "montee" });
  });
});

describe("S.92 — B-03 et B-07 lisent le pack effectif et le prix payé", () => {
  const achat = (a: Partial<AchatCouvrant> & Pick<AchatCouvrant, "id" | "packCode" | "montant">) =>
    ({ devise: "XOF", sourceTransactionId: null, retiree: false, ...a }) as AchatCouvrant;

  it("après une montée : Dossier, au prix de l'Essentiel plus la différence", () => {
    expect(
      packEffectif([
        achat({ id: "e", packCode: "essentiel", montant: 5_000 }),
        achat({ id: "m", packCode: CODE_MONTEE_DOSSIER, montant: 10_000, sourceTransactionId: "e" }),
      ]),
    ).toEqual({ code: "dossier", prixPaye: 15_000, devise: "XOF", parMontee: true });
  });

  it("le prix est celui réellement encaissé, pas celui de la grille", () => {
    expect(
      packEffectif([
        achat({ id: "e", packCode: "essentiel", montant: 4_000 }),
        achat({ id: "m", packCode: CODE_MONTEE_DOSSIER, montant: 11_000, sourceTransactionId: "e" }),
      ])?.prixPaye,
    ).toBe(15_000);
  });

  it("une montée en remboursement ne compte plus : on revient à Essentiel", () => {
    expect(
      packEffectif([
        achat({ id: "e", packCode: "essentiel", montant: 5_000 }),
        achat({
          id: "m",
          packCode: CODE_MONTEE_DOSSIER,
          montant: 10_000,
          sourceTransactionId: "e",
          retiree: true,
        }),
      ]),
    ).toMatchObject({ code: "essentiel", prixPaye: 5_000, parMontee: false });
  });

  it("sans achat couvrant, rien — et la lecture serveur exclut recharges et consultations", () => {
    expect(packEffectif([])).toBeNull();
    const code = readFileSync("src/server/lecture/backoffice.ts", "utf8");
    expect(code).toMatch(/c\.reason !== "ACHAT_PACK"/u);
    expect(code).not.toMatch(/flatMap\(\(a\) => a\.transactions\)\.at\(0\)/u);
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
