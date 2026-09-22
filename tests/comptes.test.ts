import { describe, expect, it } from "vitest";
import {
  concordent,
  forceMotDePasse,
  libelleConcordance,
  libelleForce,
  LONGUEUR_MINIMALE,
  motDePasseRecevable,
} from "@/domain/comptes/mot-de-passe";
import {
  codeComplet,
  libelleAvancementCode,
  LONGUEUR_CODE,
  normaliserCode,
} from "@/domain/comptes/code-verification";
import {
  CONSENTEMENTS,
  CONSENTEMENT_SENSIBLE,
  consentementsActifs,
  ETAT_INITIAL,
  libelleActifs,
} from "@/domain/comptes/consentements";

describe("mot de passe — WF-02", () => {
  it("gradue la force sur la longueur, sans juger le contenu", () => {
    expect(forceMotDePasse("")).toBe(0);
    expect(forceMotDePasse("court")).toBe(1);
    expect(forceMotDePasse("dix-carac")).toBe(2);
    expect(forceMotDePasse("douze-caracteres")).toBe(3);
  });

  it("dit quoi faire, jamais « mot de passe faible » seul", () => {
    expect(libelleForce("")).toContain("Au moins dix caractères");
    expect(libelleForce("abc")).toContain("il manque des caractères");
    expect(libelleForce("douze-caracteres")).toBe("Solide.");
  });

  it("n'accepte pas un mot de passe sous la longueur minimale", () => {
    expect(motDePasseRecevable("a".repeat(LONGUEUR_MINIMALE - 1))).toBe(false);
    expect(motDePasseRecevable("a".repeat(LONGUEUR_MINIMALE))).toBe(true);
  });

  it("constate la concordance des deux saisies", () => {
    expect(libelleConcordance("secret1234", "")).toContain("Répète exactement");
    expect(libelleConcordance("secret1234", "secret1234")).toContain("correspondent");
    expect(libelleConcordance("secret1234", "secret12")).toContain("diffèrent");
    expect(concordent("secret1234", "secret1234")).toBe(true);
    expect(concordent("secret1234", "")).toBe(false);
  });
});

describe("code de vérification — A-03", () => {
  it("ne garde que les chiffres, et jamais plus que six", () => {
    expect(normaliserCode("12 34-56")).toBe("123456");
    expect(normaliserCode("1234567890")).toBe("123456");
    expect(normaliserCode("abc")).toBe("");
  });

  it("ne se déclare complet qu'à six chiffres", () => {
    expect(codeComplet("12345")).toBe(false);
    expect(codeComplet("12 34 56")).toBe(true);
  });

  it("accorde l'avancement et rappelle l'échéance jusqu'au bout", () => {
    expect(libelleAvancementCode("1")).toBe(
      `1 chiffre sur ${LONGUEUR_CODE} · le code expire dans 10 minutes`,
    );
    expect(libelleAvancementCode("123")).toContain("3 chiffres sur 6");
    expect(libelleAvancementCode("123456")).toBe("Code complet.");
  });
});

describe("consentements — RG-02.1", () => {
  it("n'active aucune autorisation au premier passage", () => {
    expect(Object.values(ETAT_INITIAL).every((v) => v === false)).toBe(true);
    expect(consentementsActifs(ETAT_INITIAL)).toBe(0);
  });

  it("isole le consentement aux pièces d'identité des autres", () => {
    const sensibles = CONSENTEMENTS.filter((c) => c.sensible);
    expect(sensibles).toHaveLength(1);
    expect(CONSENTEMENT_SENSIBLE?.code).toBe("pieces_identite");
  });

  it("dit la conséquence du refus là où elle existe, sans la présenter en sanction", () => {
    /*
      La phrase promettait « tu téléverses tes pièces sans analyse
      automatique », c'est-à-dire un parcours qui n'existe pas : RG-02.2
      refuse le dépôt lui-même tant que l'autorisation manque. Le candidat
      lisait l'inverse de ce qui allait se passer, au moment précis où il
      décidait.

      Ce que la phrase doit dire désormais : ce que le refus empêche, et ce
      que le retrait arrête — puisqu'il arrête quelque chose.
    */
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).not.toContain("sans analyse automatique");
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).toMatch(/aucune pièce ne peut être déposée/u);
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).toMatch(/retirer à tout moment/u);
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).toMatch(/déjà déposées/u);

    // Le refus reste une décision, pas une faute.
    for (const c of CONSENTEMENTS) {
      expect(c.siRefuse ?? "").not.toMatch(/oblig|bloqu|interdit/i);
    }
  });

  it("accorde le décompte des autorisations actives", () => {
    expect(libelleActifs(ETAT_INITIAL)).toBe("0 autorisation sur 5 active");
    expect(libelleActifs({ ...ETAT_INITIAL, alertes_regles: true })).toBe(
      "1 autorisation sur 5 active",
    );
    expect(
      libelleActifs({ ...ETAT_INITIAL, alertes_regles: true, mesure_audience: true }),
    ).toBe("2 autorisations sur 5 actives");
  });

  it("garde l'état initial hors d'atteinte des écrans", () => {
    const copie = { ...ETAT_INITIAL };
    copie.alertes_regles = true;
    expect(ETAT_INITIAL.alertes_regles).toBe(false);
  });
});
