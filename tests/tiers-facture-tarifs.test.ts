/**
 * S.213 — pièces de tiers hors périmètre du banc, mesuré contre facturé,
 * tarifs d'IA et leur échéance dans l'état de service.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classerAvantAppel,
  issueDUnEchec,
  partagerLesLectures,
  PIECES_DE_RESSOURCES,
} from "@/domain/banc-ia/perimetre";
import { CAS_DE_LECTURE } from "@/domain/banc-ia/jeu-d-essai";
import { etatDuPassage } from "@/domain/banc-ia/qualification";
import { selectionnerLesCas } from "@/domain/banc-ia/qualification";
import { comparerALaFacture, SEUIL_ECART_FACTURE } from "@/domain/banc-ia/facture";
import { etatDuTarif, etatDesTarifs, PREAVIS_TARIF_JOURS, VARIABLE_ECHEANCE_DU_TARIF } from "@/domain/ia/tarifs";
import { corpsPublic } from "@/domain/exploitation/etat-public";
import { CAUSES_DAPPEL } from "@/domain/ia/appel";

describe("TIERS_HORS_PERIMETRE — classé avant tout appel réseau", () => {
  it("une preuve de ressources émise par un tiers est écartée, avec son motif", () => {
    expect(classerAvantAppel({ codeAttendu: "preuve_fonds", emetteurDeLaPiece: "TIERS" })).toMatchObject({
      classe: "TIERS_HORS_PERIMETRE",
      motif: expect.stringMatching(/tiers.*aucune réserve, aucun appel/u),
    });
  });
  it.each([
    [{ codeAttendu: "preuve_fonds", emetteurDeLaPiece: "TITULAIRE" as const }],
    [{ codeAttendu: "preuve_fonds", emetteurDeLaPiece: "ORGANISME" as const }],
    [{ codeAttendu: "preuve_fonds" }],
    // Un tiers qui émet autre chose qu'une preuve de ressources reste lu.
    [{ codeAttendu: "admission", emetteurDeLaPiece: "TIERS" as const }],
  ])("reste à lire : %j", (cas) => {
    expect(classerAvantAppel(cas)).toEqual({ classe: "A_LIRE" });
  });
  it("dans le jeu d'essai, seules L06 et L14 sont déclarées de tiers", () => {
    expect(CAS_DE_LECTURE.filter((c) => c.emetteurDeLaPiece === "TIERS").map((c) => c.id)).toEqual(["L06", "L14"]);
    expect(PIECES_DE_RESSOURCES.has("preuve_fonds")).toBe(true);
  });
  it("le partage garde l'ordre du jeu et nomme les pièces écartées", () => {
    const { aLire, horsPerimetre } = partagerLesLectures(CAS_DE_LECTURE);
    expect(aLire).toHaveLength(CAS_DE_LECTURE.length - 2);
    expect(aLire.map((c) => c.id)).toEqual(CAS_DE_LECTURE.map((c) => c.id).filter((id) => id !== "L06" && id !== "L14"));
    expect(horsPerimetre.map((h) => h.id)).toEqual(["L06", "L14"]);
  });
  it("une sélection --pieces L06 se sélectionne, puis ne laisse rien à appeler", () => {
    const { lectures } = selectionnerLesCas({ pieces: "L06", sansRedaction: true });
    expect(partagerLesLectures(lectures).aLire).toEqual([]);
  });
  it("la couverture se rapporte aux pièces présentées, et compte les autres à part", () => {
    const synthese = { disqualifie: false, pieces: 28, redactions: { total: 10 } } as never;
    expect(etatDuPassage("FOURNISSEUR_REEL", synthese).couverture).toMatchObject({
      piecesAttendues: CAS_DE_LECTURE.length - 2, piecesHorsPerimetre: 2,
    });
  });
  it("le lanceur partage les lectures avant la réservation au journal et le premier appel", () => {
    const src = readFileSync("scripts/banc-ia/lancer.mts", "utf8");
    const partage = src.indexOf("partagerLesLectures(selection.lectures)");
    expect(partage).toBeGreaterThan(0);
    expect(partage).toBeLessThan(src.indexOf("BudgetVertex.ouvrir("));
    expect(partage).toBeLessThan(src.indexOf("for (const cas of casDeLecture)"));
  });
});

describe("issue d'un appel non abouti : le fournisseur, la configuration ou la lecture", () => {
  it.each([
    ["injoignable", "ECHEC_FOURNISSEUR"],
    ["delai_depasse", "ECHEC_FOURNISSEUR"],
    ["service_sature", "ECHEC_FOURNISSEUR"],
    ["non_configure", "CONFIGURATION"],
    ["refus", "LECTURE"],
    ["reponse_illisible", "LECTURE"],
    ["flou", "LECTURE"],
  ])("%s → %s", (cause, issue) => {
    expect(issueDUnEchec(cause)).toBe(issue);
  });
  it("chaque cause d'appel du domaine a une issue", () => {
    for (const c of CAUSES_DAPPEL) expect(["ECHEC_FOURNISSEUR", "CONFIGURATION", "LECTURE"]).toContain(issueDUnEchec(c));
  });
});

describe("mesuré contre facturé — écart signalé au-delà de 5 %", () => {
  const appel = (cas: string, entree: number | null, sortie: number | null, etat = "CONNUE") => ({
    cas, fonction: "extraction", mesure: { etat, jetonsEntree: entree, jetonsSortie: sortie },
  });
  it("rejoue le 28/10 : 18 034 / 1 631 mesurés pour 21 986 / 3 201 facturés", () => {
    const r = comparerALaFacture([appel("A", 18_034, 1_631), appel("L06", null, null, "INCONNUE")], { entree: 21_986, sortie: 3_201 });
    expect(r.lignes).toMatchObject([
      { grandeur: "entree", mesure: 18_034, facture: 21_986, ecart: 3_952, signale: true },
      { grandeur: "sortie", mesure: 1_631, facture: 3_201, ecart: 1_570, signale: true },
    ]);
    expect(r.lignes[1]!.ecartRelatif).toBeCloseTo(0.4905, 3);
    expect(r.aRapprocher).toBe(true);
    expect(r.appelsSansMesure).toEqual(["L06/extraction"]);
    expect(r.constats.join(" ")).toMatch(/coût sous-estimé/u);
  });
  it("sous le seuil, dans les deux sens, rien n'est signalé", () => {
    const r = comparerALaFacture([appel("A", 990, 32)], { entree: 960, sortie: 33 });
    expect(r.lignes.every((l) => !l.signale)).toBe(true);
    expect(r.aRapprocher).toBe(false);
    expect(r.constats).toEqual([]);
  });
  it("le seuil est strict : 5 % exactement passe, au-delà est signalé", () => {
    expect(SEUIL_ECART_FACTURE).toBe(0.05);
    expect(comparerALaFacture([appel("A", 95, 100)], { entree: 100, sortie: 100 }).lignes[0]!.signale).toBe(false);
    expect(comparerALaFacture([appel("A", 94, 100)], { entree: 100, sortie: 100 }).lignes[0]!.signale).toBe(true);
  });
  it("une mesure au-dessus de la facture est signalée aussi, avec une autre consigne", () => {
    const r = comparerALaFacture([appel("A", 200, 10)], { entree: 100, sortie: 10 });
    expect(r.lignes[0]).toMatchObject({ signale: true, ecart: -100 });
    expect(r.constats[0]).toMatch(/compte plus que la facture/u);
  });
  it("rien de facturé mais quelque chose de mesuré : signalé, sans division par zéro", () => {
    const r = comparerALaFacture([appel("A", 10, 0)], { entree: 0, sortie: 0 });
    expect(r.lignes[0]).toMatchObject({ ecartRelatif: null, signale: true });
    expect(r.lignes[1]).toMatchObject({ ecartRelatif: null, signale: false });
  });
  it("un appel non parti ne compte pas, un appel sans mesure rend la comparaison incomplète", () => {
    const r = comparerALaFacture(
      [appel("A", 100, 10), appel("B", null, null, "NON_APPELE"), appel("C", 50, null, "PARTIELLE")],
      { entree: 100, sortie: 10 },
    );
    expect(r.appelsComptes).toBe(1);
    expect(r.appelsSansMesure).toEqual(["C/extraction"]);
    expect(r.aRapprocher).toBe(true);
  });
});

describe("tarifs d'IA : lus dans la configuration, échéance annoncée", () => {
  const vertex = {
    AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION: "0.825",
    AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION: "4.125",
    AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "USD",
  };
  const avec = (fin: string) => ({ ...vertex, [VARIABLE_ECHEANCE_DU_TARIF.openai_compatible]: fin });

  it("rend les prix lus, sans rien d'autre que des nombres et une devise", () => {
    expect(etatDuTarif(avec("2026-12-31"), "openai_compatible", "2026-11-04")).toMatchObject({
      entreeParMillion: 0.825, sortieParMillion: 4.125, devise: "USD", valideJusquAu: "2026-12-31",
      joursRestants: 57, statut: "EN_VIGUEUR", alerte: null,
    });
  });
  it.each([
    ["2026-12-01", 30, "EXPIRE_BIENTOT"],
    ["2026-12-31", 0, "EXPIRE_BIENTOT"],
    ["2027-01-01", -1, "EXPIRE"],
    ["2026-11-30", 31, "EN_VIGUEUR"],
  ])("le %s, un tarif valable jusqu'au 31/12 reste à %i jour(s) : %s", (jour, restants, statut) => {
    const e = etatDuTarif(avec("2026-12-31"), "openai_compatible", jour);
    expect(e).toMatchObject({ joursRestants: restants, statut });
    if (statut !== "EN_VIGUEUR") expect(e.alerte).toMatch(/page officielle/u);
  });
  it("le préavis est de trente jours", () => expect(PREAVIS_TARIF_JOURS).toBe(30));
  it("échu, l'alerte dit que B-07 calcule à un prix échu", () => {
    expect(etatDuTarif(avec("2026-12-31"), "openai_compatible", "2027-01-10").alerte).toMatch(/échu/u);
  });
  it("sans échéance, l'alerte nomme la variable à saisir", () => {
    expect(etatDuTarif(vertex, "openai_compatible", "2026-11-04")).toMatchObject({
      statut: "SANS_ECHEANCE", alerte: expect.stringContaining("AI_TARIF_OPENAI_COMPATIBLE_VALIDE_JUSQU_AU"),
    });
  });
  it.each(["31/12/2026", "2026-02-30", "demain"])("une échéance illisible (%s) est dite, pas ignorée", (fin) => {
    expect(etatDuTarif(avec(fin), "openai_compatible", "2026-11-04").statut).toBe("ECHEANCE_ILLISIBLE");
  });
  it("sans tarif complet : non tarifé, quelle que soit l'échéance", () => {
    expect(etatDuTarif({ ...avec("2026-12-31"), AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "" }, "openai_compatible", "2026-11-04"))
      .toMatchObject({ statut: "NON_TARIFE", entreeParMillion: null, devise: null });
  });
  it("chaque fournisseur a sa propre variable, déclarée dans .env.example", () => {
    const exemple = readFileSync(".env.example", "utf8");
    for (const v of Object.values(VARIABLE_ECHEANCE_DU_TARIF)) expect(exemple).toMatch(new RegExp(`^${v}=$`, "mu"));
  });
  it("etatDesTarifs ne rassemble que les alertes à lire", () => {
    const e = etatDesTarifs(avec("2026-12-31"), ["openai_compatible", "anthropic"], "2026-12-15");
    expect(e.fournisseurs.map((f) => f.statut)).toEqual(["EXPIRE_BIENTOT", "NON_TARIFE"]);
    expect(e.alertes).toHaveLength(2);
  });
  it("/api/health porte les tarifs dans le détail, jamais dans la vue anonyme, sans rendre l'instance inapte", () => {
    const src = readFileSync("src/app/api/health/route.ts", "utf8");
    expect(src).toMatch(/tarifsIA: etatDesTarifs\(process\.env, fournisseursATarifer\(process\.env, \[\]\), jourCivil\(new Date\(\)\)\)/u);
    const avant = src.slice(0, src.indexOf("tarifsIA:"));
    expect(avant).not.toMatch(/tarifsIA|etatDesTarifs\(/u);
    expect(corpsPublic({ status: "pilote", db: "up", tarifsIA: { alertes: ["x"] } } as never)).toEqual({ status: "pilote", db: "up" });
  });
});
