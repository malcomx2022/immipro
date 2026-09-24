import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCE_PARITE, provenanceDesMontants } from "@/domain/format/change";
import { sansCommentaires } from "@/domain/copy/source";

/** Tous les fichiers de composants sous une racine. */
function fichiers(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (chemin.endsWith(".tsx")) sortie.push(chemin);
  }
  return sortie;
}
import { ficheParSlug, libellePieces, rangAffiche } from "@/domain/destinations/fiche";
import { CLASSEMENT, FICHES } from "@/lib/contenu/destinations";
import { formatMontant } from "@/lib/utils";
import { visaRulesSchema } from "@/domain/rules/schema";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

describe("fiches destination", () => {
  it("retrouve une fiche par son slug, et rien sinon", () => {
    expect(ficheParSlug(FICHES, "pays-bas")?.pays).toBe("Pays-Bas");
    expect(ficheParSlug(FICHES, "atlantide")).toBeUndefined();
  });

  it("numérote les rangs à partir de 1", () => {
    expect(rangAffiche(0)).toBe("1");
    expect(rangAffiche(2)).toBe("3");
  });

  it("accorde le décompte des pièces", () => {
    expect(libellePieces(8)).toBe("8 pièces à réunir");
    expect(libellePieces(1)).toBe("1 pièce à réunir");
    /*
      Zéro n'est pas un nombre de pièces mais une absence de liste. La forme
      accordée rendait « 0 pièce à réunir », et C-04 enchaînait « le détail,
      pièce par pièce, s'ouvre avec le dossier » — un détail promis sur une
      liste vide. Quatre écrans lisent ce libellé.
    */
    expect(libellePieces(0)).toBe("Aucune pièce n'est consignée");
  });
});

describe("INV-8 — toute information réglementaire porte sa source et sa date", () => {
  it("chaque fiche destination porte une source et une date de vérification", () => {
    for (const fiche of FICHES) {
      expect(fiche.mention.source).not.toBe("");
      expect(Number.isNaN(Date.parse(fiche.mention.verifieeLe))).toBe(false);
    }
  });

  it("le classement en porte une aussi", () => {
    // Les guides et les articles ne sont plus des constantes du dépôt
    // (J.C) : c'est la base qui refuse désormais une publication sans
    // source ni date, et `tests/editorial.test.ts` le vérifie.
    expect(CLASSEMENT.mention.source).not.toBe("");
    expect(Number.isNaN(Date.parse(CLASSEMENT.mention.verifieeLe))).toBe(false);
  });
});

describe("INV-1 — une destination écartée l'est sur un motif vérifiable", () => {
  it("chaque écartée nomme son motif", () => {
    expect(CLASSEMENT.ecartees.length).toBeGreaterThan(0);
    for (const d of CLASSEMENT.ecartees) {
      expect(d.motif.length).toBeGreaterThan(20);
      expect(d.motif).not.toMatch(/profil (non )?adapt/i);
    }
  });
});

/**
 * Le test « sommaire des guides » vivait ici. Il vérifiait qu'une entrée de
 * sommaire correspondait bien à un intertitre du corps — une duplication
 * qu'il fallait surveiller, et que le prototype avait déjà ratée.
 *
 * Le sommaire se déduit maintenant des intertitres (J.C) : la classe de
 * défaut n'existe plus, et le test qui la guettait non plus. Ce qui reste à
 * vérifier, c'est la déduction elle-même — `tests/editorial.test.ts`.
 */

describe("formatMontant — copie du prototype", () => {
  // `Intl` sépare les milliers par une espace fine insécable ; la comparaison
  // porte sur la forme, pas sur le codet de l'espace.
  const normalise = (s: string) => s.replace(/\s/gu, " ");

  it("écrit le franc CFA « 5 000 F », sans décimale ni « CFA »", () => {
    expect(normalise(formatMontant(5000, "XOF"))).toBe("5 000 F");
    expect(normalise(formatMontant(6900000, "XOF"))).toBe("6 900 000 F");
    expect(formatMontant(5000, "XOF")).not.toContain("CFA");
  });

  it("écrit l'euro « 12 € », et ne garde les décimales que si elles existent", () => {
    expect(normalise(formatMontant(12, "EUR"))).toBe("12 €");
    expect(normalise(formatMontant(1130.77, "EUR"))).toBe("1 130,77 €");
  });

  /**
   * Le dernier cas rendait l'euro. Pas « par défaut » : **toujours**.
   * Constaté en exécution sur le référentiel livré :
   *
   *     CH/etudes_permis_b : devise réelle = CHF | affiché = « 21 000 € »
   *
   * Le produit retire ailleurs jusqu'aux conversions à parité fixe pour ne
   * pas donner « pour un montant opposable ce qui n'est qu'un ordre de
   * grandeur ». Afficher une somme dans une monnaie que l'autorité
   * n'emploie pas est le même défaut, et il ne s'annonce même pas comme
   * une conversion.
   */
  it("écrit toute autre devise avec la sienne, et jamais en euros", () => {
    expect(normalise(formatMontant(21000, "CHF"))).toBe("21 000 CHF");
    expect(formatMontant(21000, "CHF")).not.toContain("€");
    expect(normalise(formatMontant(3000, "AED"))).toBe("3 000 AED");
    expect(normalise(formatMontant(21000, "USD"))).toBe("21 000 USD");
  });

  /**
   * Et la garde qui porte sur le produit livré, non sur des exemples
   * choisis : chaque procédure du référentiel affiche sa propre monnaie.
   * C'est cette lecture-là qui a trouvé le défaut.
   */
  it("chaque procédure du référentiel s'affiche dans sa monnaie", () => {
    const montants = REGLES_DE_REFERENCE.map((r) => visaRulesSchema.parse(r.rules).preuve_fonds)
      .filter((f): f is NonNullable<typeof f> => f !== null && f !== undefined);
    expect(montants.length).toBeGreaterThan(0);
    for (const f of montants) {
      const rendu = formatMontant(f.valeur, f.devise);
      if (f.devise === "XOF") expect(rendu).toContain("F");
      else if (f.devise === "EUR") expect(rendu).toContain("€");
      else expect(rendu).toContain(f.devise);
    }
  });
});

/**
 * La seconde moitié d'INV-8 — le montant recomposé porte sa provenance.
 *
 * « Toute information réglementaire affichée porte sa source et sa date de
 * vérification. » La source l'était. Le **montant**, non : `ind.nl` publie
 * « 1 130,77 € par mois » et le candidat lisait « 8 900 838 F ». Ni
 * l'annualisation ni la conversion ne se lisaient, et `SOURCE_PARITE`
 * existait dans le domaine sans qu'aucun écran ne l'importe.
 *
 * Établi par exécution, sur le référentiel livré :
 *
 *     NL/etudes_mvv_vvr
 *       l'autorité publie : 1 130,77 EUR (mensuel)
 *       le candidat lit   : 8 900 838 F
 *       la source citée   : ind.nl — vérifiée le 2026-09-11
 *
 * Le commentaire en tête de `format/change` s'arrêtait une phrase trop
 * tôt : convertir au taux fixe « n'introduit aucune information non
 * sourcée » est vrai du **taux** et faux du **montant**, qui n'existe sur
 * aucune page officielle.
 */
describe("Un montant en francs dit d'où il vient", () => {
  /*
    `Intl.NumberFormat` sépare les milliers par une espace insécable
    étroite. L'essai porte sur les mots et les chiffres, pas sur le
    caractère d'espacement : le normaliser évite d'écrire dans le test un
    codet que personne ne relit.
  */
  const lisible = (t: string | null) => (t ?? "").replace(/[\u202f\u00a0]/gu, " ");

  it("nomme le montant publié, l'annualisation et le taux", () => {
    const rendu = lisible(
      provenanceDesMontants([{ valeur: 1130.77, devise: "EUR", periodicite: "mensuel" }]),
    );
    expect(rendu).toContain("1 130,77 EUR par mois");
    expect(rendu).toContain("ramené à l'année");
    expect(rendu).toContain("655,957");
    expect(rendu).toContain(SOURCE_PARITE);
  });

  it("accole le geste au montant qu'il touche, pas à tous", () => {
    // Une fiche mêle un montant annuel et un montant mensuel : dire « les
    // montants sont ramenés à l'année » serait faux du premier.
    const rendu = lisible(
      provenanceDesMontants([
        { valeur: 6000, devise: "EUR", periodicite: "annuel" },
        { valeur: 1130.77, devise: "EUR", periodicite: "mensuel" },
      ]),
    );
    expect(rendu).toContain("6 000 EUR par an et 1 130,77 EUR par mois, ramené à l'année");
    // Et la parité une seule fois : la répéter noierait ce qui compte.
    expect(rendu.match(/655,957/gu)).toHaveLength(1);
    expect(rendu.match(new RegExp(SOURCE_PARITE, "gu"))).toHaveLength(1);
  });

  /**
   * Un montant **converti** est un montant dont la parité est sûre, et non
   * un montant qui n'est pas déjà en francs.
   *
   * Le franc suisse et le dirham n'ont pas de taux dans ce module — c'est
   * sa décision même —, et la phrase de provenance les annonçait pourtant
   * convertis, au taux d'une monnaie qui n'a rien à voir. Constaté en
   * exécution sur le référentiel livré :
   *
   *     CH/etudes_permis_b
   *       montants : CHF → non convertible, CHF → non convertible
   *       affiché  : « … Les montants sont convertis au taux fixe de
   *                    655,957 F pour 1 EUR — Parité fixe XOF/EUR… »
   */
  it("ne parle pas de conversion là où il n'y en a pas", () => {
    expect(
      provenanceDesMontants([
        { valeur: 1000, devise: "CHF", periodicite: "annuel" },
        { valeur: 21_000, devise: "CHF", periodicite: "annuel" },
      ]),
    ).toBeNull();
    expect(
      provenanceDesMontants([{ valeur: 10_000, devise: "AED", periodicite: "annuel" }]),
    ).toBeNull();
  });

  /* Mais l'annualisation, elle, a bien lieu — et se dit sans parler de change. */
  it("dit l'annualisation d'un montant que personne ne convertit", () => {
    const rendu = lisible(
      provenanceDesMontants([{ valeur: 900, devise: "CHF", periodicite: "mensuel" }]),
    );
    expect(rendu).toContain("900 CHF par mois, ramené à l'année");
    expect(rendu).not.toContain("655,957");
    expect(rendu).not.toContain("converti");
  });

  /**
   * Et sur le référentiel réel : une destination dont aucun montant n'est
   * convertible ne raconte aucune conversion. Une fixture écrite à la main
   * dirait la règle ; celle-ci dit que le produit livré la tient.
   */
  it("le référentiel livré ne cite le taux que là où il s'applique", () => {
    for (const regle of REGLES_DE_REFERENCE) {
      const p = visaRulesSchema.parse(regle.rules);
      const montants = [
        p.frais_scolarite
          ? {
              valeur: p.frais_scolarite.min,
              devise: p.frais_scolarite.devise,
              periodicite: p.frais_scolarite.periodicite,
            }
          : null,
        p.preuve_fonds,
      ];
      const rendu = provenanceDesMontants(montants);
      const converti = montants.some((m) => m != null && m.devise === "EUR");
      expect(Boolean(rendu?.includes("655,957")), `${regle.visaType}`).toBe(converti);
    }
  });

  it("se tait quand rien n'a été transformé", () => {
    // Un montant publié en francs et à l'année n'a pas de provenance à
    // raconter : l'annoncer ferait du bruit là où la source suffit.
    expect(
      provenanceDesMontants([{ valeur: 500_000, devise: "XOF", periodicite: "annuel" }]),
    ).toBeNull();
    expect(provenanceDesMontants([null, undefined])).toBeNull();
  });

  /**
   * Le garde-fou, et c'est la réciproque : la provenance voyage sur la
   * mention, et un écran qui tient une mention la **répand**. Recopier
   * `source` et `verifieeLe` un par un est précisément ce qui a laissé
   * quatorze écrans sans la porter — la mention la connaissait, aucun ne
   * la lisait. Un champ ajouté à `Mention` doit arriver partout sans
   * qu'on édite quatorze fichiers.
   */
  it("tout écran qui tient une mention la répand au lieu de la recopier", () => {
    const ECRANS = fichiers("src/app").concat(fichiers("src/components"));
    const recopient = ECRANS.filter((f) => {
      const vue = sansCommentaires(readFileSync(f, "utf8"));
      // Deux champs pris sur un même objet : la mention est là, et seuls
      // deux de ses champs passent.
      return /<SourceNote\s+source=\{(\w+)\.source\}\s+verifieeLe=\{\1\./u.test(vue);
    });
    expect(recopient).toEqual([]);
  });

  it("et la mention d'une règle porte la provenance de ses montants", () => {
    // La composition vit dans `mentionDe`, avec la source et la date :
    // ailleurs, elle serait retombée dans le cas d'avant — un écran qui
    // cite une page pour un chiffre qu'elle ne contient pas.
    const lecture = sansCommentaires(readFileSync("src/server/acces/regles.ts", "utf8"));
    expect(lecture).toMatch(/provenanceDesMontants\(/u);
    expect(lecture).toMatch(/conversion \? \{ conversion \}/u);
  });

  it("et le composant partagé la rend", () => {
    const note = sansCommentaires(readFileSync("src/components/ui/SourceNote.tsx", "utf8"));
    expect(note).toMatch(/\{conversion \? /u);
  });
});
