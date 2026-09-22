import { describe, expect, it } from "vitest";
import {
  comparerLesVersions,
  mentionDuDelai,
  relectureExigee,
  type EvolutionDuDelai,
} from "@/domain/rules/comparaison";
import { visaRulesSchema, type VisaRulesPayload } from "@/domain/rules/schema";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * Un délai réglementaire modifié — RG-09.3, correctif du 22/09/2026.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * « Un délai réglementaire modifié déclenche un recalcul intégral de
 * l'échéancier et une notification explicite. » Ni l'un ni l'autre
 * n'existait. La comparaison de versions ne regardait pas
 * `delai_traitement_jours` — pour une raison qui se tenait, un délai ne
 * rend personne inéligible — et la propagation sort sans rien faire dès
 * que le diff est vide. Exécuté avant correction, sur un dossier visant la
 * rentrée du 1er septembre 2027 :
 *
 *     v1 delai_traitement_jours.max = 90
 *     v2 delai_traitement_jours.max = 150
 *     impact = MINEUR      diff = []
 *     bilan  = {"dossiers":0,"alertes":0,…}
 *     notifications reçues par le candidat : 0
 *     dépôt : 2027-06-03 — inchangé
 *     ce qu'il devrait être sur 150 jours : 2027-04-04
 *
 * Soixante jours de retard, sur la date qui décide de tout le reste.
 */

const NL = visaRulesSchema.parse(
  REGLES_DE_REFERENCE.find(
    (r) => r.countryCode === "NL" && r.visaType === "etudes_mvv_vvr",
  )!.rules,
);

const avecDelai = (delai: { min: number; max: number } | null): VisaRulesPayload => ({
  ...NL,
  delai_traitement_jours: delai,
});

describe("le délai d'instruction entre dans la comparaison", () => {
  it("le référentiel livré annonce bien une fourchette : la sonde porte sur du réel", () => {
    expect(NL.delai_traitement_jours).toEqual({ min: 60, max: 90 });
  });

  it("allongé, il est vu — là où la comparaison rendait un diff vide", () => {
    const { impact, diff } = comparerLesVersions(NL, avecDelai({ min: 60, max: 150 }));
    expect(impact).toBe("MAJEUR");
    expect(diff.map((c) => c.champ)).toContain("delai_traitement_jours");
  });

  /** Le diff se lit sans le schéma, comme les seuils. */
  it("et il se lit des deux côtés, en jours", () => {
    const { diff } = comparerLesVersions(NL, avecDelai({ min: 60, max: 150 }));
    const ligne = diff.find((c) => c.champ === "delai_traitement_jours")!;
    expect(ligne.avant).toBe("60–90 jours");
    expect(ligne.apres).toBe("60–150 jours");
  });

  /**
   * Jamais critique, et c'est un arbitrage : la mise en pause coûte au
   * candidat le temps qu'un délai allongé lui a déjà pris. Elle est
   * réservée à ce qui retire l'éligibilité.
   */
  it("il n'est jamais critique : un délai n'a jamais rendu personne inéligible", () => {
    expect(comparerLesVersions(NL, avecDelai({ min: 60, max: 400 })).impact).toBe("MAJEUR");
    expect(comparerLesVersions(NL, avecDelai(null)).impact).toBe("MAJEUR");
  });

  /**
   * WF-14 §4 vise « toute modification de condition bloquante ». Le délai
   * n'en est pas une : exiger deux paires d'yeux pour une fourchette de
   * jours banaliserait le contrôle qui compte.
   */
  it("il n'exige pas de relecture par un second opérateur", () => {
    const comparaison = comparerLesVersions(NL, avecDelai({ min: 60, max: 150 }));
    expect(comparaison.bloquantesTouchees).toEqual([]);
    expect(relectureExigee(comparaison)).toBe(false);
  });

  it("inchangé, il ne produit rien", () => {
    const comparaison = comparerLesVersions(NL, avecDelai({ min: 60, max: 90 }));
    expect(comparaison.diff).toEqual([]);
    expect(comparaison.delaiDInstruction).toBeNull();
    expect(comparaison.impact).toBe("MINEUR");
  });

  /**
   * L'évolution ressort telle quelle, et pas seulement en texte : l'alerte
   * doit dire de combien la date de dépôt avance, ce qu'un diff de chaînes
   * ne permet pas de recalculer sans le reparser.
   */
  it("l'avance de la date de dépôt est chiffrée, pas déduite du texte", () => {
    expect(
      comparerLesVersions(NL, avecDelai({ min: 60, max: 150 })).delaiDInstruction,
    ).toEqual({
      avant: { min: 60, max: 90 },
      apres: { min: 60, max: 150 },
      joursDAvance: 60,
    });
  });

  /** Raccourci, il rend du temps — et l'avance est négative. */
  it("raccourci, il compte à l'envers", () => {
    expect(
      comparerLesVersions(NL, avecDelai({ min: 30, max: 45 })).delaiDInstruction
        ?.joursDAvance,
    ).toBe(-45);
  });

  /**
   * L'échéancier se construit sur le plafond : un plancher qui bouge seul
   * ne déplace aucune date, et le dire évite de faire chercher un
   * changement qui n'a pas eu lieu.
   */
  it("un plancher qui bouge seul est signalé sans avance de date", () => {
    const comparaison = comparerLesVersions(NL, avecDelai({ min: 14, max: 90 }));
    expect(comparaison.diff.map((c) => c.champ)).toContain("delai_traitement_jours");
    expect(comparaison.delaiDInstruction?.joursDAvance).toBe(0);
  });

  /** Une fourchette qui disparaît change le calendrier du tout au tout. */
  it("un délai qui cesse d'être annoncé est une évolution, pas un silence", () => {
    const comparaison = comparerLesVersions(NL, avecDelai(null));
    expect(comparaison.delaiDInstruction).toEqual({
      avant: { min: 60, max: 90 },
      apres: null,
      joursDAvance: -90,
    });
  });
});

describe("la notification est explicite — RG-09.3", () => {
  const mention = (avant: EvolutionDuDelai["avant"], apres: EvolutionDuDelai["apres"]) =>
    mentionDuDelai(comparerLesVersions(avecDelai(avant), avecDelai(apres)).delaiDInstruction!);

  /**
   * Ce que « explicite » veut dire : le nouveau délai **et** ce qu'il fait
   * à la date de dépôt. Le premier seul n'apprend rien à qui ne sait pas
   * que son échéancier se calcule à rebours.
   */
  it("elle nomme le nouveau délai et l'avance qu'il impose", () => {
    const texte = mention({ min: 60, max: 90 }, { min: 60, max: 150 });
    expect(texte).toContain("60–90 jours");
    expect(texte).toContain("60–150 jours");
    expect(texte).toContain("avance de 60 jours");
  });

  /**
   * INV-3 : rien n'a bougé chez le candidat tant qu'il n'a pas tranché.
   * Une phrase au passé lui ferait chercher des dates qu'il ne verra pas.
   */
  it("elle conditionne l'effet à son arbitrage, jamais au passé", () => {
    expect(mention({ min: 60, max: 90 }, { min: 60, max: 150 })).toContain(
      "Si tu appliques cette version",
    );
  });

  it("raccourci, elle dit le temps rendu plutôt qu'un retard", () => {
    const texte = mention({ min: 60, max: 90 }, { min: 30, max: 45 });
    expect(texte).toContain("recule de 45 jours");
    expect(texte).toContain("temps en plus");
  });

  it("un plancher seul : elle dit que la date ne bouge pas, et pourquoi", () => {
    const texte = mention({ min: 60, max: 90 }, { min: 14, max: 90 });
    expect(texte).toContain("ne change pas");
    expect(texte).toContain("le plus long");
  });

  it("un délai qui disparaît : elle rend la date au candidat", () => {
    const texte = mention({ min: 60, max: 90 }, null);
    expect(texte).toContain("n'annonce plus");
    expect(texte).toContain("c'est à toi de la fixer");
  });

  it("un délai qui apparaît : elle annonce que l'échéancier en pose une", () => {
    const texte = mention(null, { min: 60, max: 90 });
    expect(texte).toContain("annonce désormais");
    expect(texte).toContain("date de dépôt");
  });

  /** Le singulier se distingue du pluriel : « avance de 1 jours » se remarque. */
  it("un seul jour se dit au singulier", () => {
    expect(mention({ min: 60, max: 90 }, { min: 60, max: 91 })).toContain("avance de 1 jour :");
  });
});
