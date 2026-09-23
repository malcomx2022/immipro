import { describe, expect, it } from "vitest";
import {
  codesConformes,
  conditionsDeLaRegle,
  conditionsEvaluees,
} from "@/domain/completeness/conditions";
import { completudeDesPieces, type Piece } from "@/domain/dossiers/piece";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * RG-07.1 — deux calculs de la même chose, et un seul voyait les conditions.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * `completudeDesPieces` appelait `computeCompleteness` avec
 * `conditions: []`, en dur. `recalculerCompletude`, côté serveur, les
 * évaluait et décidait le passage à `PRET`. Exécuté avant correction, sur
 * un dossier dont **toutes** les pièces sont conformes et dont la règle
 * figée porte une condition bloquante qu'aucune pièce n'établit :
 *
 *     la vue candidat : palier COMPLET, ready true, missing []
 *                       « Rien ne bloque un dépôt. »
 *     la base         : ACTIF — le serveur a refusé de le déclarer prêt
 *
 * Le candidat lisait que rien ne bloquait son dépôt sur le seul dossier
 * que la plateforme ne le laisserait pas déposer : `declarerLeDepot`
 * n'accepte que `PRET`.
 */
const NL = REGLES_DE_REFERENCE.find(
  (r) => r.countryCode === "NL" && r.visaType === "etudes_mvv_vvr",
)!.rules;

const piece = (code: string, etat: Piece["etat"]): Piece => ({
  id: code,
  // Volontairement la pastille de trois lettres, comme `versPiece` la pose.
  code: code.replace(/[^a-z]/giu, "").slice(0, 3).toUpperCase(),
  libelle: code,
  famille: "OBLIGATOIRE",
  etat,
  remede: "TELEVERSER",
});

describe("les conditions d'une règle figée", () => {
  it("se lisent sans repasser le schéma — une règle gelée reste lisible (INV-3)", () => {
    const lues = conditionsDeLaRegle(NL);
    expect(lues.map((c) => c.code)).toContain("preuve_fonds_annuelle");
    expect(lues.find((c) => c.code === "preuve_fonds_annuelle")?.piece).toBe("preuve_fonds");
  });

  it("ne lèvent pas sur une règle absente ou difforme", () => {
    for (const rien of [undefined, null, 42, "texte", {}, { conditions: "non" }]) {
      expect(conditionsDeLaRegle(rien)).toEqual([]);
    }
    expect(conditionsDeLaRegle({ conditions: [null, 7, { sansCode: true }] })).toEqual([]);
  });

  it("sont tenues dès que la pièce qui les porte est conforme", () => {
    const conformes = new Set(["preuve_fonds", "passeport"]);
    const evaluees = conditionsEvaluees(NL, conformes);

    expect(evaluees.find((c) => c.code === "preuve_fonds_annuelle")?.satisfaite).toBe(true);
    expect(evaluees.find((c) => c.code === "passeport_validite_min")?.satisfaite).toBe(true);
  });

  /**
   * Une facultative sans pièce ne se juge pas : elle ne s'établit par aucun
   * dépôt — une progression de crédits constatée en cours d'année — et la
   * compter ferait porter au candidat un manque qu'aucun geste ne lève.
   */
  it("écartent une facultative sans pièce, gardent une bloquante sans pièce", () => {
    const evaluees = conditionsEvaluees(NL, new Set());
    expect(evaluees.map((c) => c.code)).not.toContain("progression_academique");

    const orpheline = conditionsEvaluees(
      { conditions: [{ code: "attestation", bloquant: true, message_echec: "Il en faut une." }] },
      new Set(),
    );
    expect(orpheline).toEqual([
      { code: "attestation", bloquant: true, satisfaite: false, messageEchec: "Il en faut une." },
    ]);
  });
});

describe("la complétude d'un écran voit ce que la base voit", () => {
  const TOUTES_CONFORMES = [
    piece("passeport", "CONFORME"),
    piece("preuve_fonds", "CONFORME"),
  ];

  it("ne conclut pas « complet » quand une bloquante n'est pas tenue", () => {
    const regle = {
      conditions: [
        {
          code: "attestation_prealable",
          bloquant: true,
          message_echec: "L'autorité exige une attestation préalable.",
        },
      ],
    };

    const vue = completudeDesPieces(TOUTES_CONFORMES, {
      regle,
      conformes: codesConformes([
        { code: "passeport", status: "CONFORME" },
        { code: "preuve_fonds", status: "CONFORME" },
      ]),
    });

    expect(vue.ready).toBe(false);
    expect(vue.palier).toBe("INCOMPLET");
    expect(vue.missing.map((m) => m.message)).toContain(
      "L'autorité exige une attestation préalable.",
    );
  });

  it("conclut « complet » quand tout est tenu, comme avant", () => {
    const vue = completudeDesPieces(TOUTES_CONFORMES, {
      regle: NL,
      conformes: codesConformes([
        { code: "passeport", status: "CONFORME" },
        { code: "preuve_fonds", status: "CONFORME" },
      ]),
    });

    expect(vue.ready).toBe(true);
    expect(vue.palier).toBe("COMPLET");
  });

  /**
   * L'ensemble se construit depuis les **documents**, jamais depuis les
   * `Piece` d'un écran : `Piece.code` est une pastille de trois lettres —
   * `passeport` y devient `PAS`. Rapprocher l'une de l'autre ne rapproche
   * rien, et **toutes** les conditions se liraient non satisfaites, sur
   * tous les dossiers, sans qu'un type ni un test ne s'en aperçoive.
   */
  it("se construit sur les codes du référentiel, pas sur les pastilles d'écran", () => {
    expect(TOUTES_CONFORMES.map((p) => p.code)).toEqual(["PAS", "PRE"]);
    expect([...codesConformes([{ code: "passeport", status: "CONFORME" }])]).toEqual(["passeport"]);

    // La pastille ne satisfait rien.
    const parPastille = conditionsEvaluees(NL, new Set(["PAS", "PRE"]));
    expect(parPastille.every((c) => !c.satisfaite)).toBe(true);
  });

  it("ignore une pièce déposée mais non conforme", () => {
    expect([
      ...codesConformes([
        { code: "passeport", status: "A_CORRIGER" },
        { code: "preuve_fonds", status: "EN_ANALYSE" },
      ]),
    ]).toEqual([]);
  });
});
