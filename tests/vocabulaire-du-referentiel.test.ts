import { describe, expect, it } from "vitest";
import { visaRulesSchema, textesCandidat } from "@/domain/rules/schema";
import { verifierPayloadCandidat, refusDuReferentiel } from "@/domain/backoffice/regle";
import { INTERDITS_INTERFACE_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * Le vocabulaire interdit, sur le référentiel livré — INV-1, INV-2, C-09.
 *
 * CLAUDE.md annonce « une seule liste, quatre points d'application », et
 * nomme B-02 pour les textes d'une règle. Mais B-02 n'est qu'un des **deux**
 * chemins par lesquels une règle entre en base : l'autre est la graine, qui
 * charge le référentiel livré et ne contrôlait rien.
 *
 * Le référentiel portait donc « moins de 50 % de ses crédits annuels » dans
 * un `message_echec` — un texte que le candidat lit sur sa pièce, et que la
 * publication refuse. Exécuté, avant correctif :
 *
 *     NL etudes_mvv_vvr  1 faute(s)
 *       conditions.2.message_echec · « 50 % »
 *
 * La graine porte le garde-fou désormais. Ce test le double là où il mord
 * le plus tôt : à chaque `npm run check`, sans base.
 */
describe("Le référentiel livré passe le vocabulaire de l'interface candidat", () => {
  it("aucune procédure ne porte une formulation que la publication refuserait", () => {
    expect(REGLES_DE_REFERENCE.length).toBeGreaterThan(3);
    for (const regle of REGLES_DE_REFERENCE) {
      const payload = visaRulesSchema.parse(regle.rules);
      expect(
        verifierPayloadCandidat(textesCandidat(payload)),
        `${regle.countryCode}/${regle.visaType}`,
      ).toEqual([]);
    }
  });

  /**
   * Et la vérification porte bien sur ce que le candidat lit, pas seulement
   * sur le libellé de la procédure : c'est le `message_echec` d'une
   * condition qui portait la faute, et c'est la phrase qu'on lit sur une
   * pièce refusée.
   */
  it("les messages d'échec des conditions sont dans le périmètre", () => {
    const [regle] = REGLES_DE_REFERENCE;
    const payload = visaRulesSchema.parse(regle!.rules);
    const chemins = textesCandidat(payload).map((t) => t.chemin);
    expect(chemins.some((c) => /conditions\.\d+\.message_echec/u.test(c))).toBe(true);
  });

  /**
   * Le contrôle n'est pas vacant : le motif qui a mordu mord encore.
   *
   * Sans cette vérification, remplacer la liste par un tableau vide ferait
   * passer le test précédent en vert, et il ne dirait plus rien.
   */
  it("le motif qui avait mordu mord toujours", () => {
    const fautes = verifierTexte(
      "L'établissement signale tout étudiant validant moins de 50 % de ses crédits.",
      INTERDITS_INTERFACE_CANDIDAT,
    );
    expect(fautes.map((f) => f.extrait)).toContain("50 %");
  });

  /**
   * La réécriture dit la même chose, sans le chiffre.
   *
   * Une dérogation dans `copy-exceptions.json` était l'autre issue. Elle
   * n'a pas été prise : le budget est de cinq, et « la moitié » dit
   * exactement « 50 % » en toutes lettres. Une dérogation se dépense pour
   * ce qui n'a pas d'équivalent.
   */
  it("et le seuil de crédits reste dit au candidat", () => {
    const nl = REGLES_DE_REFERENCE.find(
      (r) => r.countryCode === "NL" && r.visaType === "etudes_mvv_vvr",
    )!;
    const payload = visaRulesSchema.parse(nl.rules);
    const progression = payload.conditions.find((c) => c.code === "progression_academique");
    expect(progression?.message_echec).toMatch(/moiti[ée]/u);
    expect(progression?.valeur).toBe(50);
  });

  /**
   * Les deux chemins d'écriture appellent la **même** fonction.
   *
   * C'était tout le défaut : la publication refusait ce que la graine
   * laissait passer. Le refus est donc éprouvé ici, sur le contenu exact
   * qui était en base — et il porte le message que l'opérateur lit.
   */
  it("le refus partagé nomme le chemin fautif et le geste", () => {
    const nl = REGLES_DE_REFERENCE.find(
      (r) => r.countryCode === "NL" && r.visaType === "etudes_mvv_vvr",
    )!;
    const payload = visaRulesSchema.parse(nl.rules);
    expect(refusDuReferentiel(payload)).toBeNull();

    const fautif = {
      ...payload,
      conditions: payload.conditions.map((c) =>
        c.code === "progression_academique"
          ? { ...c, message_echec: "Moins de 50 % des crédits annuels validés." }
          : c,
      ),
    };
    const refus = refusDuReferentiel(fautif);
    expect(refus).not.toBeNull();
    expect(refus).toContain("50 %");
    expect(refus).toMatch(/conditions\.\d+\.message_echec/u);
  });

  /**
   * Et il refuse toujours l'autre motif, celui qui existait avant : une
   * règle qu'aucun dépôt ne pourrait terminer. Réunir les deux refus ne
   * doit pas en perdre un.
   */
  it("le refus partagé garde le motif qu'il avait déjà", () => {
    const nl = REGLES_DE_REFERENCE.find(
      (r) => r.countryCode === "NL" && r.visaType === "emploi_kennismigrant",
    )!;
    const payload = visaRulesSchema.parse(nl.rules);
    const sansPiece = {
      ...payload,
      conditions: payload.conditions.map((c) =>
        c.bloquant ? { ...c, piece: undefined } : c,
      ),
    };
    expect(refusDuReferentiel(sansPiece)).toMatch(/aucune pièce/u);
  });
});
