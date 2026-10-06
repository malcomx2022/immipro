import { describe, expect, it } from "vitest";
import {
  A_REMBOURSER_A_LA_MAIN,
  ETATS_CLOS,
  consigneFedaPay,
  estPartiel,
  libelleDeLaSommeARendre,
  montantAuProrata,
  montantDuRemboursement,
  sommeARendre,
  type PackARembourser,
} from "@/domain/paiement/remboursement";
import { getPack } from "@/domain/payments/pricing";
import { ventiler, montantEnLettres, versMineur } from "@/domain/facturation/montants";
import {
  COLONNES_GRAND_LIVRE,
  agreger,
  ligneDuGrandLivre,
  libelleRemboursementPartiel,
  type Paiement,
} from "@/domain/backoffice/reconciliation";
import { mentionRembourse, mentionRembourseDuRecu } from "@/domain/paiement/recu";
import { MODELES } from "@/domain/juridique/modeles";
import { VARIABLES_JURIDIQUES } from "@/domain/juridique/variables";

/**
 * RG-15.2 — le pack entamé se rembourse au prorata des analyses
 * restantes (décision de la direction du 06/10/2026).
 */
const essentiel = getPack("essentiel")!;
const dossier = getPack("dossier")!;

const pack = (autre: Partial<PackARembourser> = {}): PackARembourser => ({
  prixMineur: versMineur(essentiel.prix.XOF, "XOF"),
  analysesDuPack: essentiel.analyses,
  consommees: 0,
  dossierDepose: false,
  dossierClos: false,
  dossiersServis: 1,
  ...autre,
});

describe("RG-15.2 — le montant au prorata des analyses restantes", () => {
  it("Essentiel 5 000 F, 10 analyses, 4 consommées : 3 000 F", () => {
    expect(essentiel.prix.XOF).toBe(5000);
    expect(essentiel.analyses).toBe(10);
    expect(montantDuRemboursement(pack({ consommees: 4 }))).toEqual({
      verdict: "prorata",
      montant: 3000,
      restantes: 6,
      analysesDuPack: 10,
    });
  });

  it("en euros, le prorata se compte en centimes : 12 € × 6 ÷ 10 = 7,20 €", () => {
    const verdict = montantDuRemboursement(
      pack({ prixMineur: versMineur(essentiel.prix.EUR, "EUR"), consommees: 4 }),
    );
    expect(verdict).toMatchObject({ verdict: "prorata", montant: 720 });
  });

  it("arrondit à l'unité mineure inférieure : 29 € × 23 ÷ 30 = 22,2333… € → 22,23 €", () => {
    expect(montantAuProrata(versMineur(dossier.prix.EUR, "EUR"), 23, dossier.analyses)).toBe(2223);
    // 15 000 F × 29 ÷ 30 = 14 500 F tout rond : rien à arrondir.
    expect(montantAuProrata(15_000, 29, 30)).toBe(14_500);
  });

  it("ne rend jamais plus que la valeur exacte des analyses restantes, et jamais une unité de moins", () => {
    for (const p of [getPack("essentiel")!, getPack("dossier")!, getPack("pro")!]) {
      for (const devise of ["XOF", "EUR"] as const) {
        const prix = versMineur(p.prix[devise], devise);
        for (let restantes = 0; restantes <= p.analyses; restantes += 1) {
          const rendu = montantAuProrata(prix, restantes, p.analyses);
          const exact = (prix * restantes) / p.analyses;
          expect(Number.isInteger(rendu)).toBe(true);
          expect(rendu).toBeLessThanOrEqual(exact);
          expect(exact - rendu).toBeLessThan(1);
          expect(rendu).toBeLessThanOrEqual(prix);
        }
      }
    }
  });

  it("rien consommé : le prix entier, même sur un dossier déposé ou clos (comportement d'avant la règle)", () => {
    expect(montantDuRemboursement(pack())).toEqual({ verdict: "integral", montant: 5000 });
    expect(montantDuRemboursement(pack({ dossierDepose: true, dossierClos: true }))).toEqual({
      verdict: "integral",
      montant: 5000,
    });
  });

  it("dossier déclaré déposé ou clos : revue manuelle, avec ce qu'il faut faire", () => {
    const depose = montantDuRemboursement(pack({ consommees: 4, dossierDepose: true }));
    expect(depose.verdict).toBe("manuel");
    if (depose.verdict === "manuel") {
      expect(depose.motif).toMatch(/4 analyses consommées sur 10/u);
      expect(depose.motif).toMatch(/déclaré déposé/u);
      expect(depose.motif).toMatch(/À trancher à la main/u);
    }
    const clos = montantDuRemboursement(pack({ consommees: 1, dossierClos: true }));
    expect(clos).toMatchObject({ verdict: "manuel" });
    if (clos.verdict === "manuel") expect(clos.motif).toMatch(/1 analyse consommée sur 10.*clos/u);
  });

  it("les états clos sont l'issue déclarée, l'abandon et l'archive — pas la suspension", () => {
    expect([...ETATS_CLOS].sort()).toEqual(["ABANDONNE", "ARCHIVE", "ISSUE_DECLAREE"]);
    expect(ETATS_CLOS.has("SUSPENDU")).toBe(false);
    expect(ETATS_CLOS.has("SOUMIS")).toBe(false);
  });

  it("un pack servi sur plusieurs dossiers et entamé part en revue", () => {
    const pro = getPack("pro")!;
    expect(
      montantDuRemboursement(
        pack({ prixMineur: pro.prix.XOF, analysesDuPack: pro.analyses, consommees: 3, dossiersServis: 2 }),
      ),
    ).toMatchObject({ verdict: "manuel" });
    // Servi sur un seul dossier, ses destinations non ouvertes comptent
    // parmi les analyses restantes : 45 000 × 87 ÷ 90 = 43 500 F.
    expect(
      montantDuRemboursement(
        pack({ prixMineur: pro.prix.XOF, analysesDuPack: pro.analyses, consommees: 3 }),
      ),
    ).toMatchObject({ verdict: "prorata", montant: 43_500 });
  });

  it("tout consommé : rien à rendre, et la raison dit quoi faire", () => {
    const tout = montantDuRemboursement(pack({ consommees: 10 }));
    expect(tout.verdict).toBe("rien_a_rendre");
    if (tout.verdict === "rien_a_rendre") {
      expect(tout.motif).toMatch(/^les 10 analyses du pack ont toutes été consommées/u);
      expect(tout.motif).toMatch(/direction/u);
    }
    // Un débit au-delà du pack ne fait pas un montant négatif.
    expect(montantDuRemboursement(pack({ consommees: 12 })).verdict).toBe("rien_a_rendre");
  });

  it("refuse un calcul hors bornes plutôt que de rendre un nombre faux", () => {
    expect(() => montantAuProrata(5000, 11, 10)).toThrow(/de 0 au nombre d'analyses/u);
    expect(() => montantAuProrata(5000, 1, 0)).toThrow(RangeError);
    expect(() => montantAuProrata(50.5, 1, 10)).toThrow(RangeError);
  });

  it("la somme à rendre nulle se lit « le prix payé » : les lignes d'avant la règle", () => {
    expect(sommeARendre(null, 5000)).toBe(5000);
    expect(sommeARendre(3000, 5000)).toBe(3000);
    expect(estPartiel(null, 5000)).toBe(false);
    expect(estPartiel(5000, 5000)).toBe(false);
    expect(estPartiel(3000, 5000)).toBe(true);
  });
});

describe("RG-15.2 — FedaPay : le montant exact au tableau de bord", () => {
  const dette = { etape: "DECIDE" as const, initiee: true, devise: "XOF" };

  it("intégral, la consigne est celle d'avant", () => {
    expect(consigneFedaPay({ ...dette, montant: 5000, montantARendre: 5000 })).toBe(
      A_REMBOURSER_A_LA_MAIN,
    );
  });

  it("partiel, elle dit la somme exacte, et de ne rien rembourser si le montant ne se saisit pas", () => {
    const consigne = consigneFedaPay({ ...dette, montant: 5000, montantARendre: 3000 });
    const plat = consigne.replace(/\s/gu, " ");
    expect(consigne.startsWith(A_REMBOURSER_A_LA_MAIN)).toBe(true);
    expect(plat).toContain("rembourse exactement 3 000 F CFA, et non les 5 000 F CFA payés");
    expect(plat).toMatch(/ne rembourse rien et signale la dette à la direction/u);
  });

  it("l'écart et la note portent la somme, et le prix quand elle en diffère", () => {
    expect(libelleDeLaSommeARendre(3000, 5000, "XOF").replace(/\s/gu, " ")).toBe(
      "Montant à rembourser : 3 000 F CFA sur 5 000 F CFA payés (prorata des analyses restantes, RG-15.2).",
    );
    expect(libelleDeLaSommeARendre(720, 1200, "EUR").replace(/\s/gu, " ")).toMatch(/7,20 € sur 12,00 €/u);
    expect(libelleDeLaSommeARendre(5000, 5000, "XOF").replace(/\s/gu, " ")).toBe(
      "Montant à rembourser : 5 000 F CFA, le prix payé.",
    );
  });
});

describe("RG-15.2 — l'avoir d'un remboursement partiel", () => {
  it("se ventile sous le même régime, et sa somme en lettres suit le montant rendu", () => {
    const assujettie = { declare: true, assujettie: true, tauxBp: 1800 } as const;
    const avoir = ventiler(720, assujettie);
    expect(avoir.ht + avoir.tva).toBe(720);
    expect(avoir.tauxBp).toBe(1800);
    expect(montantEnLettres(3000, "XOF")).toBe("trois mille francs CFA");
    expect(montantEnLettres(720, "EUR")).toBe("sept euros et vingt centimes");
  });
});

describe("RG-15.2 — B-04 et le grand livre comptent ce qui est rendu", () => {
  const ligne = (autre: Partial<Paiement>): Paiement => ({
    reference: "IMP-1",
    compte: "awa@example.bj",
    montant: 5000,
    devise: "XOF",
    moyen: "Mobile Money",
    recuLe: "2026-10-06T08:00:00.000Z",
    etat: "REMBOURSE",
    ...autre,
  });

  it("le total remboursé somme la somme rendue, pas le prix payé", () => {
    const agregats = agreger([
      ligne({ reference: "a", montantRembourse: 3000 }),
      ligne({ reference: "b", etat: "REMBOURSEMENT_DU", montantRembourse: 2500 }),
      ligne({ reference: "c", devise: "EUR", montant: 12, montantRembourse: 7.2 }),
      ligne({ reference: "d", devise: "EUR", montant: 29, montantRembourse: 22.23 }),
    ]);
    expect(agregats.rembourse).toEqual({ XOF: 3000, EUR: 29.43 });
    expect(agregats.remboursementDu).toEqual({ XOF: 2500 });
  });

  it("l'export porte une colonne « Montant remboursé », vide hors remboursement", () => {
    expect(COLONNES_GRAND_LIVRE.at(-1)).toBe("Montant remboursé");
    expect(ligneDuGrandLivre(ligne({ montantRembourse: 3000 })).at(-1)).toEqual({
      nombre: 3000,
      decimales: 0,
    });
    expect(ligneDuGrandLivre(ligne({ etat: "RAPPROCHE" })).at(-1)).toEqual({ vide: true });
    expect(ligneDuGrandLivre(ligne({})).length).toBe(COLONNES_GRAND_LIVRE.length);
  });

  it("la ligne de B-04 distingue le dû du versé", () => {
    expect(libelleRemboursementPartiel("3 000 F", "5 000 F", true)).toBe(
      "3 000 F rendus sur 5 000 F payés, au prorata des analyses restantes",
    );
    expect(libelleRemboursementPartiel("3 000 F", "5 000 F", false)).toMatch(/^3 000 F à rendre/u);
  });
});

describe("RG-15.2 — ce que lit le candidat", () => {
  const formater = (v: number, d: string) => `${v} ${d}`;

  it("le reçu dit la somme rendue et le prix payé quand ils diffèrent", () => {
    expect(
      mentionRembourseDuRecu({ montant: 5000, montantRembourse: 3000, devise: "XOF" }, "6 octobre", formater),
    ).toBe(mentionRembourse("6 octobre", { rendu: "3000 XOF", paye: "5000 XOF" }));
    expect(
      mentionRembourseDuRecu({ montant: 5000, montantRembourse: 5000, devise: "XOF" }, "6 octobre", formater),
    ).toBe(mentionRembourse("6 octobre"));
  });
});

describe("RG-15.2 — les conditions portent la règle, et le registre ne l'attend plus", () => {
  it("la section 10 énonce le prorata en clair", () => {
    const conditions = JSON.stringify(MODELES.conditions);
    expect(conditions).toContain(
      "Pack entamé : remboursé au prorata des analyses restantes, tant que le dossier n'est ni déclaré déposé ni clos ; au-delà, la demande est examinée par l'équipe.",
    );
    expect(conditions).not.toContain("remboursement_entame");
  });

  it("la variable « remboursement_entame » a quitté le registre", () => {
    expect(VARIABLES_JURIDIQUES.map((v) => v.cle)).not.toContain("remboursement_entame");
  });
});
