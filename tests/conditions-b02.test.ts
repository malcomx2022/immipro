import { describe, expect, it } from "vitest";
import { visaRulesSchema, type VisaRulesPayload } from "@/domain/rules/schema";
import {
  avecLesSeuils,
  conditionsAffichees,
  lireSeuil,
  seuilsModifies,
  valeurLisible,
} from "@/domain/backoffice/regle";
import { comparerLesVersions, relectureExigee } from "@/domain/rules/comparaison";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * C-12 — B-02 montre les conditions et en modifie les seuils.
 *
 * Constat de la revue S.183 : l'écran ne montrait aucune condition, et son
 * panneau des différences annonçait « 0 champ modifié » sur un seuil
 * bloquant changé. Le second opérateur que WF-14 §4 exige relisait sans
 * voir ce qu'il relisait, et aucune valeur ne se modifiait depuis l'écran :
 * R-O03 devait passer par l'API pour écrire le seuil.
 */
const KENNISMIGRANT: VisaRulesPayload = visaRulesSchema.parse(
  REGLES_DE_REFERENCE.find((r) => r.visaType === "emploi_kennismigrant")!.rules,
);
const SEUIL = "salaire_min_moins_30_ans";

describe("C-12 — les conditions telles que B-02 les lit", () => {
  const lues = conditionsAffichees(KENNISMIGRANT);

  it("rend chaque condition du référentiel, dans son ordre", () => {
    expect(lues.map((c) => c.code)).toEqual(KENNISMIGRANT.conditions.map((c) => c.code));
    const seuil = lues.find((c) => c.code === SEUIL)!;
    expect(seuil).toMatchObject({
      operateur: "gte",
      valeur: 4357,
      bloquant: true,
      piece: "contrat_travail",
      alternative: "salaire",
      modifiable: true,
    });
    expect(seuil.message).toBe(
      KENNISMIGRANT.conditions.find((c) => c.code === SEUIL)!.message_echec,
    );
  });

  it("ne rend modifiable qu'un seuil chiffré, jamais une référence", () => {
    const presence = lues.find((c) => c.operateur === "exists")!;
    expect(presence.modifiable).toBe(false);
    expect(lues.filter((c) => c.modifiable).every((c) => typeof c.valeur === "number")).toBe(true);
  });

  it("écrit la valeur comme l'opérateur la lit", () => {
    expect(valeurLisible({ operateur: "gte", valeur: 13569.24, unite: "EUR" })).toMatch(
      /^au moins 13\s569,24 EUR$/u,
    );
    expect(valeurLisible({ operateur: "exists", valeur: "erkend_referent" })).toBe(
      "présence de erkend_referent",
    );
    expect(valeurLisible({ operateur: "in", valeur: ["B2", "C1"] })).toBe("parmi B2, C1");
  });
});

describe("C-12 — un seuil saisi à la française", () => {
  it.each([
    ["4357", 4357],
    ["4 357", 4357],
    ["4 357", 4357],
    ["13 569,24", 13569.24],
    [" 6 ", 6],
  ])("lit « %s »", (saisie, attendu) => {
    expect(lireSeuil(saisie)).toEqual({ ok: true, valeur: attendu });
  });

  it.each(["", "  ", "abc", "-5", "4.357.1", "12,345"])("refuse « %s » en disant quoi écrire", (saisie) => {
    const lu = lireSeuil(saisie);
    expect(lu.ok).toBe(false);
    if (!lu.ok) expect(lu.message).toMatch(/4 357/u);
  });
});

describe("C-12 — les seuils recollés sur le payload en base", () => {
  it("ne change que le seuil soumis", () => {
    const recolle = avecLesSeuils(KENNISMIGRANT, { [SEUIL]: 4355 });
    expect(recolle.ok).toBe(true);
    if (!recolle.ok) return;
    const avant = KENNISMIGRANT.conditions;
    const apres = recolle.payload.conditions;
    expect(apres.find((c) => c.code === SEUIL)!.valeur).toBe(4355);
    expect(apres.filter((c) => c.code !== SEUIL)).toEqual(avant.filter((c) => c.code !== SEUIL));
    expect({ ...recolle.payload, conditions: [] }).toEqual({ ...KENNISMIGRANT, conditions: [] });
    expect(visaRulesSchema.safeParse(recolle.payload).success).toBe(true);
  });

  it("refuse une condition que la version ne porte plus, nommée", () => {
    const recolle = avecLesSeuils(KENNISMIGRANT, { disparue: 10 });
    expect(recolle).toMatchObject({ ok: false, code: "disparue" });
    if (!recolle.ok) expect(recolle.message).toMatch(/recharge la page/u);
  });

  it("refuse de réécrire une référence comme un seuil", () => {
    const reference = KENNISMIGRANT.conditions.find((c) => c.operateur === "exists")!;
    const recolle = avecLesSeuils(KENNISMIGRANT, { [reference.code]: 1 });
    expect(recolle).toMatchObject({ ok: false, code: reference.code });
  });

  it("refuse un seuil négatif ou non fini", () => {
    expect(avecLesSeuils(KENNISMIGRANT, { [SEUIL]: -1 }).ok).toBe(false);
    expect(avecLesSeuils(KENNISMIGRANT, { [SEUIL]: Number.NaN }).ok).toBe(false);
  });

  /*
    Le maillon qui manquait à WF-14 §4 : un seuil bloquant modifié depuis
    l'écran est vu par la comparaison qui décide de la relecture.
  */
  it("un seuil bloquant modifié exige la relecture d'un second opérateur", () => {
    const recolle = avecLesSeuils(KENNISMIGRANT, { [SEUIL]: 4355 });
    if (!recolle.ok) throw new Error(recolle.message);
    const comparaison = comparerLesVersions(KENNISMIGRANT, recolle.payload);
    expect(comparaison.bloquantesTouchees).toContain(SEUIL);
    expect(relectureExigee(comparaison)).toBe(true);
  });
});

describe("C-12 — l'écran n'envoie que les seuils modifiés", () => {
  const lues = conditionsAffichees(KENNISMIGRANT);
  const telsQuels = Object.fromEntries(
    lues.filter((c) => c.modifiable).map((c) => [c.code, String(c.valeur).replace(".", ",")]),
  );

  it("rien de modifié, rien d'envoyé", () => {
    expect(seuilsModifies(lues, telsQuels)).toEqual({});
  });

  it("le seuil changé seul, lu en nombre", () => {
    expect(seuilsModifies(lues, { ...telsQuels, [SEUIL]: "4 355" })).toEqual({ [SEUIL]: 4355 });
  });

  it("une saisie illisible ne part pas, une référence non plus", () => {
    const reference = lues.find((c) => !c.modifiable)!;
    expect(
      seuilsModifies(lues, { ...telsQuels, [SEUIL]: "quatre mille", [reference.code]: "1" }),
    ).toEqual({});
  });
});
