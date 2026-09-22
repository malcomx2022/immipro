import { describe, expect, it } from "vitest";
import {
  comparerLesVersions,
  relectureExigee,
  motifDeRelecture,
} from "@/domain/rules/comparaison";
import { visaRulesSchema, type VisaRulesPayload } from "@/domain/rules/schema";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * Ce qui sépare deux versions d'une règle — WF-11 étapes 1 et 3, WF-14 §4.
 *
 * La comparaison ne regardait que les **codes** des conditions bloquantes.
 * Un seuil qui passe de 4 357 € à 1 000 € garde le sien, et la propagation
 * sortait donc sans prévenir personne — sur le changement réglementaire que
 * RG-14.3 annonce comme le plus régulier du produit.
 */

const NL = visaRulesSchema.parse(
  REGLES_DE_REFERENCE.find(
    (r) => r.countryCode === "NL" && r.visaType === "emploi_kennismigrant",
  )!.rules,
);

const avecSeuil = (code: string, valeur: number): VisaRulesPayload => ({
  ...NL,
  conditions: NL.conditions.map((c) => (c.code === code ? { ...c, valeur } : c)),
});

const SEUIL = "salaire_min_moins_30_ans";
const ACTUEL = 4357;

describe("Une valeur de condition bloquante qui bouge", () => {
  it("est vue, là où seul son code l'était", () => {
    const { impact, diff } = comparerLesVersions(NL, avecSeuil(SEUIL, 1000));
    expect(impact).not.toBe("MINEUR");
    expect(diff.map((c) => c.champ)).toContain(`condition.${SEUIL}.valeur`);
  });

  it("dit le seuil en clair, des deux côtés", () => {
    const { diff } = comparerLesVersions(NL, avecSeuil(SEUIL, 1000));
    const ligne = diff.find((c) => c.champ === `condition.${SEUIL}.valeur`)!;
    expect(ligne.avant).toBe("≥ 4357 EUR_brut_mensuel");
    expect(ligne.apres).toBe("≥ 1000 EUR_brut_mensuel");
  });

  /**
   * Le sens décide du traitement, et c'est tout l'intérêt de la distinction :
   * un seuil relevé retire l'éligibilité à qui l'atteignait tout juste, un
   * seuil abaissé ne retire rien à personne.
   */
  it("relevée, elle est critique — le dossier est mis en pause", () => {
    expect(comparerLesVersions(NL, avecSeuil(SEUIL, 5000)).impact).toBe("CRITIQUE");
  });

  it("abaissée, elle est majeure — notification et proposition de migration", () => {
    expect(comparerLesVersions(NL, avecSeuil(SEUIL, 1000)).impact).toBe("MAJEUR");
  });

  it("inchangée, rien ne bouge", () => {
    const { impact, diff } = comparerLesVersions(NL, avecSeuil(SEUIL, ACTUEL));
    expect(impact).toBe("MINEUR");
    expect(diff).toEqual([]);
  });

  it("un `lte` se lit dans l'autre sens", () => {
    const base: VisaRulesPayload = {
      ...NL,
      conditions: [
        {
          code: "age_max",
          piece: "passeport",
          operateur: "lte",
          valeur: 35,
          unite: "ans",
          message_echec: "Le dispositif s'arrête à 35 ans.",
          bloquant: true,
        },
      ],
    };
    const abaisse: VisaRulesPayload = {
      ...base,
      conditions: [{ ...base.conditions[0]!, valeur: 30 }],
    };
    const releve: VisaRulesPayload = {
      ...base,
      conditions: [{ ...base.conditions[0]!, valeur: 40 }],
    };
    // Un plafond qu'on baisse ferme la porte ; qu'on relève, il l'ouvre.
    expect(comparerLesVersions(base, abaisse).impact).toBe("CRITIQUE");
    expect(comparerLesVersions(base, releve).impact).toBe("MAJEUR");
  });
});

describe("Ce qu'on ne sait pas ordonner est tenu pour un durcissement", () => {
  const changer = (modif: Partial<VisaRulesPayload["conditions"][number]>) =>
    comparerLesVersions(NL, {
      ...NL,
      conditions: NL.conditions.map((c) => (c.code === SEUIL ? { ...c, ...modif } : c)),
    });

  it("l'opérateur change", () => {
    expect(changer({ operateur: "lte" }).impact).toBe("CRITIQUE");
  });

  it("l'unité change", () => {
    // 4 357 par an n'est pas 4 357 par mois, et rien ne dit lequel est pire.
    expect(changer({ unite: "EUR_brut_annuel" }).impact).toBe("CRITIQUE");
  });

  it("la condition quitte son groupe d'alternatives", () => {
    const { impact, diff } = changer({ alternative: undefined });
    // Elle devient exigible seule : les trois autres seuils ne la
    // satisfont plus.
    expect(impact).toBe("CRITIQUE");
    expect(diff.map((c) => c.champ)).toContain(`condition.${SEUIL}.alternative`);
  });

  it("une condition facultative devient bloquante", () => {
    const facultative = NL.conditions.find((c) => !c.bloquant)!;
    const { impact, bloquantesTouchees } = comparerLesVersions(NL, {
      ...NL,
      conditions: NL.conditions.map((c) =>
        c.code === facultative.code ? { ...c, bloquant: true } : c,
      ),
    });
    expect(impact).toBe("CRITIQUE");
    expect(bloquantesTouchees).toContain(facultative.code);
  });

  it("mais changer de pièce porteuse ne durcit rien", () => {
    // La checklist bouge — une autre pièce établit la condition —, le
    // niveau d'exigence non.
    expect(changer({ piece: "diplome" }).impact).toBe("MAJEUR");
  });
});

describe("Ce qui n'est pas une modification d'exigence", () => {
  it("réécrire le message d'échec ne prévient personne", () => {
    const { impact, diff, bloquantesTouchees } = comparerLesVersions(NL, {
      ...NL,
      conditions: NL.conditions.map((c) =>
        c.code === SEUIL ? { ...c, message_echec: "Le même seuil, dit autrement." } : c,
      ),
    });
    /*
      Faire partir une alerte à tous les dossiers ouverts parce qu'une
      phrase a été clarifiée apprend à ignorer les suivantes.
    */
    expect(impact).toBe("MINEUR");
    expect(diff).toEqual([]);
    expect(bloquantesTouchees).toEqual([]);
  });

  it("une condition facultative qui change ne touche aucune bloquante", () => {
    const facultative = NL.conditions.find((c) => !c.bloquant)!;
    const { bloquantesTouchees } = comparerLesVersions(NL, {
      ...NL,
      conditions: NL.conditions.map((c) =>
        c.code === facultative.code ? { ...c, valeur: 1 } : c,
      ),
    });
    expect(bloquantesTouchees).toEqual([]);
  });
});

describe("WF-14 §4 — la relecture par un second opérateur", () => {
  it("est exigée dès qu'une bloquante bouge, dans les deux sens", () => {
    expect(relectureExigee(comparerLesVersions(NL, avecSeuil(SEUIL, 5000)))).toBe(true);
    // Abaisser n'enlève l'éligibilité à personne, et ouvre la procédure à
    // des dossiers qu'elle n'aurait pas dû accueillir : deux paires d'yeux
    // dans les deux sens.
    expect(relectureExigee(comparerLesVersions(NL, avecSeuil(SEUIL, 1000)))).toBe(true);
  });

  it("ne l'est pas quand aucune bloquante ne bouge", () => {
    const facultative = NL.conditions.find((c) => !c.bloquant)!;
    const comparaison = comparerLesVersions(NL, {
      ...NL,
      conditions: NL.conditions.map((c) =>
        c.code === facultative.code ? { ...c, valeur: 1 } : c,
      ),
    });
    expect(relectureExigee(comparaison)).toBe(false);
  });

  it("le refus nomme la condition, sinon il n'apprend rien", () => {
    const motif = motifDeRelecture(comparerLesVersions(NL, avecSeuil(SEUIL, 5000)));
    expect(motif).toContain(SEUIL);
    expect(motif).toMatch(/second opérateur|autre administrateur/u);
  });
});

describe("Le référentiel livré, comparé à lui-même", () => {
  it("ne produit aucun écart", () => {
    // Une comparaison qui verrait bouger une règle inchangée enverrait une
    // alerte à chaque republication.
    for (const regle of REGLES_DE_REFERENCE) {
      const payload = visaRulesSchema.parse(regle.rules);
      const { impact, diff } = comparerLesVersions(payload, payload);
      expect(impact, `${regle.countryCode} ${regle.visaType}`).toBe("MINEUR");
      expect(diff, `${regle.countryCode} ${regle.visaType}`).toEqual([]);
    }
  });
});
