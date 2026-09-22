import { describe, expect, it } from "vitest";
import { visaRulesSchema } from "@/domain/rules/schema";
import { checklistDepuis } from "@/server/acces/dossiers";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * RG-06.6 — la durée de validité d'une pièce vient du référentiel.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * Le serveur la déduisait d'un motif sur l'identifiant : `/releve|bancaire|
 * ressources|fonds/` valait trois mois, `/medical|sante/` six. La durée
 * dépendait donc de l'orthographe d'un code, pas de l'exigence.
 *
 * Renommer « preuve_fonds » en « moyens_financiers » — ce que son propre
 * libellé appelle déjà, « Justificatif de moyens financiers », et qu'un
 * éditeur peut faire depuis B-02 — faisait disparaître l'échéance sans un
 * mot. Exécuté avant correction :
 *
 *     CH, référentiel tel quel      : preuve_fonds → 3 mois
 *     la même exigence, renommée    : aucune pièce périssable
 *
 * Le référentiel tient pourtant ses renvois : le schéma refuse la règle si
 * une condition nomme une pièce disparue, et c'est ce refus qui a forcé la
 * sonde à renommer aussi la condition. La durée de validité était la seule
 * propriété de l'exigence qui vivait hors du référentiel, et la seule qui
 * se perdait en silence.
 *
 * Ce qu'elle décide n'est pas cosmétique : l'échéance « à demander au plus
 * tôt » du calendrier, et la date de péremption inscrite au dépôt, d'où la
 * bascule en `EXPIREE`.
 */

/** Les pièces d'une règle qui portent une durée, lues comme le serveur les lit. */
const perissables = (rules: unknown): Record<string, number> =>
  Object.fromEntries(
    checklistDepuis(visaRulesSchema.parse(rules))
      .filter((d) => d.validityMonths != null)
      .map((d) => [d.code, d.validityMonths as number]),
  );

const regle = (pays: string) => REGLES_DE_REFERENCE.find((r) => r.countryCode === pays)!;

describe("la durée de validité est une propriété de l'exigence", () => {
  it("suit l'exigence quand son code change", () => {
    const ch = structuredClone(regle("CH").rules) as {
      pieces_requises: { code: string }[];
      conditions: { piece?: string }[];
    };
    expect(perissables(ch)).toEqual({ preuve_fonds: 3 });

    for (const p of ch.pieces_requises) if (p.code === "preuve_fonds") p.code = "moyens_financiers";
    for (const c of ch.conditions) if (c.piece === "preuve_fonds") c.piece = "moyens_financiers";

    expect(perissables(ch)).toEqual({ moyens_financiers: 3 });
  });

  it("ne s'invente pas à partir d'un code qui y ressemble", () => {
    const rules = structuredClone(regle("NL").rules) as {
      pieces_requises: { code: string; libelle: string; obligatoire: boolean }[];
      conditions: unknown[];
    };
    rules.pieces_requises.push({
      code: "releve_de_notes",
      libelle: "Relevé de notes du dernier diplôme",
      obligatoire: false,
    });

    // `/releve|…/` le classait périssable à trois mois. Un relevé de notes
    // ne périme pas : il atteste d'un résultat obtenu une fois pour toutes.
    expect(perissables(rules)).toEqual({ preuve_fonds: 3 });
  });

  it("vaut ce que le référentiel dit, et non une valeur unique pour tous les pays", () => {
    const nl = structuredClone(regle("NL").rules) as {
      pieces_requises: { code: string; validite_mois?: number }[];
    };
    for (const p of nl.pieces_requises) if (p.code === "preuve_fonds") p.validite_mois = 6;

    expect(perissables(nl)).toEqual({ preuve_fonds: 6 });
  });

  it("absente, la pièce ne périme pas", () => {
    const nl = structuredClone(regle("NL").rules) as {
      pieces_requises: { code: string; validite_mois?: number }[];
    };
    for (const p of nl.pieces_requises) delete p.validite_mois;

    expect(perissables(nl)).toEqual({});
  });

  it("refuse une durée qui n'en est pas une", () => {
    for (const valeur of [0, -3, 2.5]) {
      const nl = structuredClone(regle("NL").rules) as {
        pieces_requises: { code: string; validite_mois?: number }[];
      };
      for (const p of nl.pieces_requises) if (p.code === "preuve_fonds") p.validite_mois = valeur;

      expect(() => visaRulesSchema.parse(nl)).toThrow();
    }
  });

  it("le référentiel de référence garde exactement les durées qu'il affichait", () => {
    expect(
      Object.fromEntries(
        REGLES_DE_REFERENCE.map((r) => [`${r.countryCode}/${r.visaType}`, perissables(r.rules)]),
      ),
    ).toEqual({
      "NL/etudes_mvv_vvr": { preuve_fonds: 3 },
      "NL/emploi_kennismigrant": {},
      "CH/etudes_permis_b": { preuve_fonds: 3 },
      "AE/etudes_residence_etudiante": { visite_medicale: 6 },
    });
  });
});
