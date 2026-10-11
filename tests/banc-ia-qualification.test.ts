import { describe, expect, it } from "vitest";
import { selectionnerLesCas, etatDuPassage } from "@/domain/banc-ia/qualification";
import { LETTRES_DE_REFERENCE, avisDeReference } from "@/domain/banc-ia/lettres-reference";
import { lireLaCritique } from "@/domain/redaction/commande";
import { synthetiser } from "@/domain/banc-ia/notation";
import { mesurerLesJetons } from "@/domain/ia/usage";
import { mesureDuBanc, versObtenue, versTexte, versRemarques } from "../scripts/banc-ia/resultats";
import { lireManifeste } from "../scripts/banc-ia/manifeste";
const manifeste = {
  societe: "Essai",
  regionDeclaree: "non vérifiée",
  modele: "essai",
  dateVerification: "2026-10-11",
  sourceModele: "https://exemple.test/modeles",
  sourceTarif: "https://exemple.test/tarifs",
  maxAppels: 60,
  budgetCompte: "plafond à poser dans le compte d'essai",
  autorisationEssaiSynthetique: true,
  dpa: "NON_VERIFIE",
  residence: "NON_VERIFIE",
  conservation: "NON_VERIFIE",
};
const appel = (entree: unknown, sortie: unknown) => ({
  fournisseur: "anthropic" as const,
  modele: "essai",
  mesure: mesurerLesJetons(entree, sortie),
});
describe("REV11-L5 — une preuve n'est pas une qualification", () => {
  it("sélectionne trente pièces et dix lettres", () => {
    const c = selectionnerLesCas({});
    expect(c.lectures).toHaveLength(30);
    expect(c.redactions).toHaveLength(10);
  });
  it.each(["INEXISTANT", "", "L01,", "L01,L01"])("refuse le filtre %s avant réseau", (pieces) => {
    expect(() => selectionnerLesCas({ pieces })).toThrow();
  });
  it("refuse zéro fonction et une sélection entièrement exclue", () => {
    expect(() => selectionnerLesCas({ sansLecture: true, sansRedaction: true })).toThrow();
    expect(() => selectionnerLesCas({ pieces: "L01", sansLecture: true })).toThrow();
  });
  it.each(["SIMULATION", "SERVEUR_LOCAL", "FOURNISSEUR_REEL"] as const)(
    "ne certifie jamais %s automatiquement",
    (nature) => {
      expect(etatDuPassage(nature, synthetiser([], []))).toMatchObject({
        fournisseurQualifie: false,
        couverture: { pieces: 0 },
      });
    },
  );
  it("distingue absence d'appel, usage absente et vrai zéro", () => {
    expect(mesureDuBanc({})).toMatchObject({ etat: "NON_APPELE", jetonsEntree: null });
    expect(mesureDuBanc({ appel: { fournisseur: "anthropic", modele: "essai" } })).toMatchObject({
      etat: "INCONNUE",
      jetonsEntree: null,
    });
    expect(mesureDuBanc({ appel: appel(0, 0) })).toMatchObject({
      etat: "CONNUE",
      jetonsEntree: 0,
      jetonsSortie: 0,
    });
  });
  it.each([
    [undefined, undefined],
    [7, undefined],
    [-1, 2],
  ])("L2 : aucun contenu publiable avec mesure %s / %s", (entree, sortie) => {
    const base = { jetonsEntree: 0, jetonsSortie: 0, appel: appel(entree, sortie) };
    expect(
      versObtenue({ etat: "LUE", pieceIdentifiee: "passeport", bruts: {}, ...base }),
    ).toMatchObject({ etat: "NON_LUE", cause: "mesure_incomplete" });
    expect(versTexte({ etat: "ECRITE", texte: "contenu", ...base }).texte).toBeNull();
    expect(versRemarques({ etat: "RELUE", remarques: [], ...base }).remarques).toBeNull();
  });
  it("conserve le coût mesuré d'un refus et le motif L3", () => {
    const r = versRemarques({
      etat: "SANS_AVIS",
      cause: "reponse_illisible",
      motif: "avis_mal_forme",
      detail: "refus",
      jetonsEntree: 4,
      jetonsSortie: 2,
      appel: appel(4, 2),
    });
    expect(r).toMatchObject({
      remarques: null,
      mesure: { etat: "CONNUE", jetonsEntree: 4, jetonsSortie: 2 },
    });
    expect(r.detail).toContain("avis_mal_forme");
  });
  it("les dix lettres fixes couvrent deux contradictions et leurs témoins respectent L3", () => {
    expect(LETTRES_DE_REFERENCE).toHaveLength(10);
    expect(LETTRES_DE_REFERENCE.filter((r) => r.incoherenceAttendue).map((r) => r.id)).toEqual([
      "R03",
      "R07",
    ]);
    for (const r of LETTRES_DE_REFERENCE) {
      expect(r.texte.length).toBeGreaterThan(100);
      const avis = avisDeReference(r.id);
      expect(Array.isArray(lireLaCritique({ remarques: avis }))).toBe(true);
      expect(avis.some((a) => a.genre === "INCOHERENCE")).toBe(r.incoherenceAttendue);
    }
  });
  it("le manifeste cadre le modèle et les appels sans valider un DPA", () => {
    expect(lireManifeste(manifeste, "essai", 60).dpa).toBe("NON_VERIFIE");
    expect(() => lireManifeste(manifeste, "autre", 60)).toThrow(/modèle/u);
    expect(() => lireManifeste(manifeste, "essai", 61)).toThrow(/maximum/u);
  });
  it.each([
    { sourceTarif: "https://utilisateur:secret@exemple.test/" },
    { sourceModele: "https://exemple.test/?cle=secret" },
    { secret: "interdit" },
    { dateVerification: "2099-01-01" },
    { autorisationEssaiSynthetique: false },
  ])("refuse un manifeste trompeur ou secret", (patch) => {
    expect(() => lireManifeste({ ...manifeste, ...patch }, "essai", 60)).toThrow();
  });
});
