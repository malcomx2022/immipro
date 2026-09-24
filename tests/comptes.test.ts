import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sansCommentaires } from "@/domain/copy/source";
import { ESSAIS_AVANT_BLOCAGE, libelleEchec, verdictDeConnexion } from "@/domain/comptes/connexion";
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

/**
 * Le temps de réponse disait ce que le message tait — A-02, WF-02.
 *
 * `domain/comptes/connexion` pose la règle : « le serveur doit rendre le
 * même message dans les deux cas, **et mettre le même temps à le
 * rendre** ». `connecter` la tient pour l'adresse inconnue — elle compare
 * le mot de passe à un leurre —, et **le compte bloqué sortait avant
 * l'empreinte**. Mesuré, médiane de cinq appels avec un mauvais mot de
 * passe :
 *
 *     adresse inconnue        196 ms
 *     adresse connue          241 ms
 *     adresse connue, bloquée   1 ms
 *
 * Deux cents fois plus vite, et c'est un oracle que l'attaquant déclenche
 * lui-même : cinq essais faux sur n'importe quelle adresse, puis un
 * sixième. S'il revient en une milliseconde, l'adresse existe — une
 * adresse sans compte ne se bloque jamais. La liste de clients que le
 * message refuse de dire, le chronomètre la dictait.
 *
 * Après correction : 200 / 200 / 212 ms.
 *
 * Le garde-fou est **structurel** et non chronométré : une assertion sur
 * des millisecondes serait fragile sous charge, et ce qui compte est la
 * position de l'appel — avant toute branche qui rend.
 */
describe("la connexion met le même temps à refuser, quoi qu'il refuse", () => {
  const source = sansCommentaires(readFileSync("src/server/acces/comptes.ts", "utf8"));
  const connecter = source.slice(source.indexOf("export async function connecter"));

  it("l'empreinte est calculée avant toute branche qui rend", () => {
    const empreinte = connecter.indexOf("await correspond(");
    const premierRetour = connecter.indexOf("return {");
    expect(empreinte).toBeGreaterThan(0);
    expect(premierRetour).toBeGreaterThan(empreinte);
  });

  it("et le blocage n'y échappe pas", () => {
    // C'était le défaut : `if (verdictAvant.bloque) return …` passait avant.
    const empreinte = connecter.indexOf("await correspond(");
    const blocage = connecter.indexOf("verdictAvant.bloque");
    expect(blocage).toBeGreaterThan(empreinte);
  });

  it("une adresse inconnue paie le leurre, comme les autres", () => {
    // Sans lui, l'absence de compte se lirait au chronomètre sans même
    // avoir à provoquer un blocage.
    expect(connecter).toMatch(/correspond\(motDePasse, LEURRE\)/u);
  });

  it("et le refus ne nomme jamais l'adresse ni son absence", () => {
    /*
      L'autre moitié de la règle : le texte. « Adresse inconnue »
      confirmerait qu'une adresse a un compte ici, ce qui suffit à dresser
      une liste de clients à partir d'un carnet d'adresses.
    */
    for (const echecs of [0, 1, 4]) {
      const dit = libelleEchec(verdictDeConnexion(echecs, null, new Date()));
      expect(dit, `${echecs}`).not.toMatch(/adresse|inconnu|inexistant|mot de passe/iu);
    }
  });

  it("le décompte annoncé, lui, sépare encore les deux — question ouverte", () => {
    /*
      Mesuré au **premier** essai : une adresse inconnue rend « il te reste
      5 essais », une adresse connue « il te reste 4 ». Le compteur de
      l'une est incrémenté avant que la phrase soit composée, l'autre n'en
      a pas — un seul essai suffit donc à savoir si une adresse a un compte.

      L'essai constate, il ne valide pas : la parité textuelle demande soit
      de renoncer au décompte vivant — dont le domaine écrit la raison —,
      soit de compter les échecs d'adresses sans compte. Les deux ont un
      prix, et trancher appartient au produit. Le jour où c'est tranché,
      c'est cet essai-ci qui change, et il dira quoi.
    */
    const inconnue = libelleEchec(verdictDeConnexion(0, null, new Date()));
    const connue = libelleEchec(verdictDeConnexion(1, null, new Date()));
    expect(inconnue).not.toBe(connue);
    expect(inconnue).toContain(`${ESSAIS_AVANT_BLOCAGE} essais`);
    expect(connue).toContain(`${ESSAIS_AVANT_BLOCAGE - 1} essais`);
    // Et la question est posée là où la règle vit, pas seulement ici.
    expect(readFileSync("src/domain/comptes/connexion.ts", "utf8")).toMatch(
      /Question ouverte : le décompte annoncé dit si l'adresse existe/u,
    );
  });
});
