import { describe, expect, it } from "vitest";
import {
  ceQuiSepare,
  ecartMontant,
  libelleDelaiVersion,
  libelleImpact,
  optionsArbitrage,
  type VersionRegle,
} from "@/domain/notifications/divergence";

/**
 * Ce qu'un arbitrage doit montrer — T-02, correctif du 22/09/2026.
 *
 * L'écran supposait que ce qui sépare deux versions est le **montant**.
 * C'était vrai des cas qu'il avait vus. Depuis que la comparaison voit
 * aussi le délai d'instruction (RG-09.3), une version peut n'en changer
 * que le délai — et l'écran posait alors deux cartes portant la même
 * somme. Exécuté avant correction :
 *
 *     ce que ça change : « … c'est la version 2 qui s'appliquera,
 *                          et il te faut 0 € de plus. »
 *     option : « Ta checklist et tes montants passent à 11 500 €. »
 *     option : « Ta checklist reste à 11 500 €. »
 *     le mot « délai » apparaît-il ? false
 *
 * On demandait de trancher entre deux options présentées comme la même.
 */

const V1: VersionRegle = {
  numero: 1,
  montant: 11500,
  devise: "EUR",
  intitule: "sur compte bloqué",
  publieeLe: "2026-01-01",
  applicableJusquau: "2026-08-31",
  delai: { min: 60, max: 90 },
};

const V2: VersionRegle = {
  ...V1,
  numero: 2,
  montant: 13000,
  publieeLe: "2026-06-01",
  applicableDepuis: "2026-09-01",
  delai: { min: 60, max: 150 },
};

const sansLeMontant = { ...V2, montant: V1.montant };
const sansLeDelai = { ...V2, delai: V1.delai };

const impact = (a: VersionRegle, b: VersionRegle, depot?: string) =>
  libelleImpact(a, b, `${ecartMontant(a, b)} €`, depot);

describe("ce qui sépare deux versions", () => {
  it("le montant seul, le délai seul, ou les deux", () => {
    expect(ceQuiSepare(V1, V2)).toEqual({ montant: true, delai: true });
    expect(ceQuiSepare(V1, sansLeMontant)).toEqual({ montant: false, delai: true });
    expect(ceQuiSepare(V1, sansLeDelai)).toEqual({ montant: true, delai: false });
    expect(ceQuiSepare(V1, { ...V1, numero: 9 })).toEqual({ montant: false, delai: false });
  });

  /** Changer de devise change le montant exigé, même à valeur égale. */
  it("un changement de devise est un changement de montant", () => {
    expect(ceQuiSepare(V1, { ...V1, devise: "CHF" }).montant).toBe(true);
  });

  /** Une version sans délai renseigné n'est pas une version sans délai. */
  it("l'absence de délai se distingue du délai absent", () => {
    expect(libelleDelaiVersion(V1)).toBe("Instruction : 60–90 jours");
    expect(libelleDelaiVersion({ ...V1, delai: null })).toContain("Aucun délai");
    expect(libelleDelaiVersion({ ...V1, delai: undefined })).toContain("non renseigné");
  });
});

describe("« ce que ça change pour ton dossier »", () => {
  const DEPOT_SOUS_LA_NOUVELLE = "2026-10-15";

  it("ne donne plus un chiffre pour ne rien dire", () => {
    const texte = impact(V1, sansLeMontant, DEPOT_SOUS_LA_NOUVELLE);
    expect(texte).not.toContain("0 € de plus");
    expect(texte).not.toContain("de plus");
  });

  it("et nomme le délai, qui est ce qui a bougé", () => {
    const texte = impact(V1, sansLeMontant, DEPOT_SOUS_LA_NOUVELLE);
    expect(texte).toContain("60–150 jours");
    expect(texte).toContain("ton échéancier se recalcule");
  });

  /** Le montant reste dit quand il bouge : rien n'est retiré. */
  it("le montant supplémentaire est toujours annoncé quand il change", () => {
    expect(impact(V1, V2, DEPOT_SOUS_LA_NOUVELLE)).toContain("1500 € de plus");
  });

  it("et le délai n'est pas cité quand il n'a pas bougé", () => {
    expect(impact(V1, sansLeDelai, DEPOT_SOUS_LA_NOUVELLE)).not.toContain("jours");
  });

  /**
   * Ce que le correctif ne touche pas : un dépôt antérieur à l'entrée en
   * vigueur reste régi par l'ancienne version, et la phrase le dit sans
   * parler ni du montant ni du délai de la nouvelle.
   */
  it("un dépôt avant l'entrée en vigueur reste sous l'ancienne version", () => {
    const texte = impact(V1, V2, "2026-08-01");
    expect(texte).toContain("avant l'entrée en vigueur");
    expect(texte).toContain("la version 1 reste celle de ton dossier");
    expect(texte).not.toContain("de plus");
  });

  /** Sans date de dépôt, la phrase reste conditionnelle — et complète. */
  it("sans dépôt fixé, elle conditionne sans rien taire", () => {
    const texte = impact(V1, sansLeMontant);
    expect(texte).toContain("Si tu déposes");
    expect(texte).toContain("60–150 jours");
  });
});

describe("les deux options d'arbitrage", () => {
  const options = (nouvelle: VersionRegle) =>
    optionsArbitrage(V1, nouvelle, "11 500 €", "13 000 €").map((o) => o.detail);

  /**
   * Deux options identiques ne sont pas un arbitrage. C'est exactement ce
   * que l'écran offrait quand seul le délai changeait.
   */
  it("ne se lisent jamais à l'identique", () => {
    const [migrer, conserver] = options(sansLeMontant);
    expect(migrer).not.toBe(conserver);
    expect(migrer).toContain("60–150 jours");
    expect(conserver).toContain("60–90 jours");
  });

  it("ne citent pas un montant que le choix ne change pas", () => {
    for (const detail of options(sansLeMontant)) {
      expect(detail).not.toContain("€");
    }
  });

  it("citent le montant quand c'est lui qui bouge", () => {
    const [migrer, conserver] = options(sansLeDelai);
    expect(migrer).toContain("13 000 € à prouver");
    expect(conserver).toContain("11 500 € à prouver");
    expect(migrer).not.toContain("jours");
  });

  it("citent les deux quand les deux bougent", () => {
    const [migrer] = options(V2);
    expect(migrer).toContain("13 000 € à prouver");
    expect(migrer).toContain("60–150 jours");
  });

  /** Les bornes d'application restent dites : elles décident du choix. */
  it("gardent ce qui rend chaque choix défendable", () => {
    const [migrer, conserver] = options(V2);
    expect(migrer).toContain("si tu déposes à partir du");
    expect(conserver).toContain("si tu déposes avant le");
  });
});
