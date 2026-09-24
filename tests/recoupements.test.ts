import { describe, expect, it } from "vitest";
import {
  AUCUN_RECOUPEMENT,
  DESTINATIONS_NOMMEES,
  destinationNommee,
  destinationsCitees,
  niveauxCites,
  recoupements,
  type FaitsDuDossier,
} from "@/domain/redaction/coherence";
import {
  etatDeLaRelecture,
  resumeSelonLEtat,
  trierRemarques,
  RESUME_ANALYSE_INDISPONIBLE,
  RESUME_RECOUPEE_SANS_ECART,
} from "@/domain/redaction/relecture";
import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * RG-08.3 — les recoupements déterministes, WF-08 étape 4.
 *
 * Ce que ces tests protègent, dans l'ordre d'importance : d'abord qu'un
 * écart réel soit vu, ensuite — et surtout — qu'un écart inventé ne le
 * soit pas. Une incohérence fausse apprend à ignorer les vraies.
 */

const NL: FaitsDuDossier = {
  destination: destinationNommee("NL")!,
  niveauLangueMin: "B2",
};

const SANS_REGLE: FaitsDuDossier = { destination: null, niveauLangueMin: null };

describe("RG-08.3 — la destination citée", () => {
  it("relève la lettre écrite pour une autre destination", () => {
    const texte = "Je souhaite poursuivre mes études au Canada, à Montréal.";
    const { remarques } = recoupements(texte, NL);
    const ecart = remarques.find((r) => r.id === "recoupement-destination");
    expect(ecart).toBeDefined();
    expect(ecart!.genre).toBe("INCOHERENCE_DOSSIER");
    expect(ecart!.ecarts?.[0]).toEqual({ source: "Ta lettre", valeur: "le Canada" });
    expect(ecart!.ecarts?.[1]).toEqual({ source: "Ce dossier", valeur: "les Pays-Bas" });
  });

  /**
   * Le faux positif qui coûterait le plus cher : un parcours raconté.
   * « Après mon année en France, je pars aux Pays-Bas » cite deux pays et
   * n'a rien d'incohérent — la lettre nomme sa propre destination.
   */
  it("se tait quand la lettre nomme aussi sa destination", () => {
    const texte =
      "Après une année d'échange en France, je souhaite rejoindre les Pays-Bas.";
    expect(recoupements(texte, NL).remarques).toHaveLength(0);
  });

  /** Le pays d'origine n'est pas une destination : Cotonou parle du Bénin. */
  it("ne voit pas d'écart dans le pays d'origine", () => {
    const texte = "J'ai obtenu ma licence à l'université d'Abomey-Calavi, au Bénin.";
    expect(recoupements(texte, NL).remarques).toHaveLength(0);
  });

  /** Sans règle figée, il n'y a rien à comparer — et l'écran doit le dire. */
  it("s'abstient sans règle figée, et le dit", () => {
    const { remarques, effectues, ecartes } = recoupements("Étudier au Canada.", SANS_REGLE);
    expect(remarques).toHaveLength(0);
    expect(effectues).toHaveLength(0);
    expect(ecartes.some((e) => e.includes("pas de procédure figée"))).toBe(true);
  });

  it("reconnaît la forme accentuée, la casse et l'espace", () => {
    expect(destinationsCitees("Je vise les PAYS-BAS.").map((d) => d.code)).toEqual(["NL"]);
    expect(destinationsCitees("un séjour aux pays bas").map((d) => d.code)).toEqual(["NL"]);
    expect(destinationsCitees("les Émirats arabes unis").map((d) => d.code)).toContain("AE");
    expect(destinationsCitees("les emirats arabes unis").map((d) => d.code)).toContain("AE");
  });

  /** Une forme n'est reconnue qu'entière : « Canadair » n'est pas le Canada. */
  it("ne reconnaît pas une forme prise dans un mot plus long", () => {
    expect(destinationsCitees("un stage chez Canadair")).toHaveLength(0);
    expect(destinationsCitees("la suissesse Nestlé")).toHaveLength(0);
  });

  it("nomme toutes les destinations citées, pas seulement la première", () => {
    const texte = "J'hésitais entre l'Allemagne et le Canada.";
    const ecart = recoupements(texte, NL).remarques.find(
      (r) => r.id === "recoupement-destination",
    );
    expect(ecart!.ecarts?.[0].valeur).toBe("l'Allemagne, le Canada");
  });
});

describe("RG-08.3 — le niveau de langue", () => {
  it("relève un niveau annoncé sous le minimum de la règle figée", () => {
    const { remarques } = recoupements("Mon niveau d'anglais est B1.", NL);
    const ecart = remarques.find((r) => r.id === "recoupement-langue");
    expect(ecart).toBeDefined();
    expect(ecart!.ecarts?.[0]).toEqual({ source: "Ta lettre", valeur: "B1" });
    expect(ecart!.ecarts?.[1]).toEqual({ source: "Procédure figée", valeur: "B2" });
  });

  it("ne relève rien quand le niveau annoncé atteint le minimum", () => {
    expect(recoupements("Mon niveau d'anglais est B2.", NL).remarques).toHaveLength(0);
    expect(recoupements("J'ai validé un C1 en anglais.", NL).remarques).toHaveLength(0);
  });

  /**
   * Deux niveaux pour deux langues : nous ne savons pas lequel porte la
   * langue du cursus. Signaler le plus bas serait un faux écart.
   */
  it("se tait quand un seul des niveaux cités suffit", () => {
    const texte = "J'ai un B1 en allemand et un C1 en anglais, la langue du cursus.";
    expect(recoupements(texte, NL).remarques).toHaveLength(0);
  });

  it("relève quand tous les niveaux cités sont sous le minimum", () => {
    const texte = "J'ai un A2 en néerlandais et un B1 en anglais.";
    const ecart = recoupements(texte, NL).remarques.find(
      (r) => r.id === "recoupement-langue",
    );
    expect(ecart!.ecarts?.[0].valeur).toBe("A2 et B1");
  });

  it("s'abstient sur un minimum qui n'est pas un niveau CECRL, et le dit", () => {
    const faits: FaitsDuDossier = {
      destination: destinationNommee("AE")!,
      niveauLangueMin: "IELTS 6.0",
    };
    const { remarques, ecartes } = recoupements("Mon niveau est B1.", faits);
    expect(remarques).toHaveLength(0);
    expect(ecartes.some((e) => e.includes("IELTS 6.0"))).toBe(true);
  });

  it("dit que la procédure ne fixe aucun minimum quand c'est le cas", () => {
    const faits: FaitsDuDossier = {
      destination: destinationNommee("NL")!,
      niveauLangueMin: null,
    };
    expect(recoupements("Mon niveau est A2.", faits).remarques).toHaveLength(0);
    expect(
      recoupements("Mon niveau est A2.", faits).ecartes.some((e) =>
        e.includes("n'en fixe aucun"),
      ),
    ).toBe(true);
  });

  it("lit chaque niveau d'une énumération, séparateur compris", () => {
    expect(niveauxCites("B1 et C1")).toEqual(["B1", "C1"]);
    expect(niveauxCites("A2, B1, B2")).toEqual(["A2", "B1", "B2"]);
    expect(niveauxCites("un niveau B2")).toEqual(["B2"]);
  });

  it("ne prend pas une suite de caractères pour un niveau", () => {
    expect(niveauxCites("la salle B12")).toEqual([]);
    expect(niveauxCites("le formulaire 2B1")).toEqual([]);
  });
});

describe("RG-08.3 — ce qui n'est pas recoupé est dit", () => {
  /**
   * La moitié de RG-08.3 que son exemple canonique décrit — la lettre
   * contre le relevé — reste bloquée sur `extraction`. Ne pas le dire
   * laisserait croire que les pièces jointes ont été lues.
   */
  it("annonce toujours que les pièces jointes ne sont pas lues", () => {
    for (const faits of [NL, SANS_REGLE]) {
      const { ecartes } = recoupements("Un texte.", faits);
      expect(ecartes.some((e) => e.includes("pièces jointes"))).toBe(true);
    }
    expect(AUCUN_RECOUPEMENT.ecartes.some((e) => e.includes("pièces jointes"))).toBe(true);
  });

  it("annonce que les montants ne sont pas recoupés", () => {
    const { ecartes } = recoupements("Mon budget est de 10 000 €.", NL);
    expect(ecartes.some((e) => e.includes("montant"))).toBe(true);
  });

  it("nomme ce qui a été comparé, et rien de plus", () => {
    const { effectues } = recoupements("Un texte.", NL);
    expect(effectues).toHaveLength(2);
    expect(effectues.some((e) => e.includes("les Pays-Bas"))).toBe(true);
    expect(effectues.some((e) => e.includes("B2"))).toBe(true);
  });
});

describe("RG-08.3 — l'état de R-04", () => {
  /**
   * Le troisième vide. `ANALYSE_INDISPONIBLE` effaçait des écarts trouvés ;
   * `RELUE_SANS_REMARQUE` donnerait pour lu un fond que personne n'a jugé.
   */
  it("distingue « recoupée seulement » de « jamais analysée »", () => {
    const recoupee = etatDeLaRelecture({
      remarques: null,
      texteExistant: true,
      recoupementsEffectues: true,
      redactionAssistee: true,
    });
    expect(recoupee).toBe("RECOUPEE_SEULEMENT");
    expect(
      etatDeLaRelecture({
        remarques: null,
        texteExistant: true,
        recoupementsEffectues: false,
        redactionAssistee: true,
      }),
    ).toBe("ANALYSE_INDISPONIBLE");
  });

  it("ne rend pas un avis favorable sur un recoupement sans écart", () => {
    const resume = resumeSelonLEtat("RECOUPEE_SEULEMENT", []);
    expect(resume).toBe(RESUME_RECOUPEE_SANS_ECART);
    expect(resume).not.toBe(RESUME_ANALYSE_INDISPONIBLE);
    expect(resume).not.toContain("Rien à reprendre");
    expect(resume).toContain("sans l'avoir lu");
  });

  it("dit d'où viennent les écarts quand le fond n'a pas été lu", () => {
    const { remarques } = recoupements("Je pars au Canada, niveau B1.", NL);
    expect(remarques).toHaveLength(2);
    const resume = resumeSelonLEtat("RECOUPEE_SEULEMENT", remarques);
    expect(resume).toContain("2 écarts relevés");
    expect(resume).toContain("n'a pas été analysé");
    // Aucune pièce n'a été ouverte : le résumé ne doit pas en parler.
    expect(resume).not.toContain("pièce");
  });

  /** Le genre existe pour ne pas annoncer une comparaison entre pièces. */
  it("compte séparément les deux origines d'incohérence", () => {
    const { remarques } = recoupements("Je pars au Canada.", NL);
    const analyse = {
      id: "f1",
      genre: "INCOHERENCE" as const,
      titre: "Deux dates",
      corps: "…",
      action: "Corriger le passage",
    };
    const resume = resumeSelonLEtat("RELUE", [analyse, ...remarques]);
    expect(resume).toContain("une incohérence avec une autre pièce de ton dossier");
    expect(resume).toContain("un écart avec les informations de ton dossier");
  });

  it("place les écarts de recoupement après les incohérences entre pièces", () => {
    const { remarques } = recoupements("Je pars au Canada.", NL);
    const forme = {
      id: "f2",
      genre: "FORME" as const,
      titre: "Longueur",
      corps: "…",
      action: "Laisser tel quel",
    };
    const triees = trierRemarques([forme, ...remarques]);
    expect(triees[0]!.genre).toBe("INCOHERENCE_DOSSIER");
    expect(triees[1]!.genre).toBe("FORME");
  });
});

describe("RG-08.3 — ce que les textes produits ne disent pas", () => {
  /**
   * INV-1 et INV-2 sur un texte assemblé à l'exécution : `check:copy` lit
   * les sources, il ne voit pas une phrase composée à partir d'un nom de
   * pays et d'un niveau. Le test la voit.
   */
  it("ne promet rien et ne pronostique rien", () => {
    const textes: string[] = [];
    for (const destination of DESTINATIONS_NOMMEES) {
      const faits: FaitsDuDossier = { destination, niveauLangueMin: "B2" };
      const produit = recoupements("Je pars au Canada, mon niveau est A2.", faits);
      textes.push(
        ...produit.effectues,
        ...produit.ecartes,
        ...produit.remarques.flatMap((r) => [r.titre, r.corps, r.action]),
        resumeSelonLEtat("RECOUPEE_SEULEMENT", produit.remarques),
      );
    }
    const assemble = textes.join("\n");
    expect(verifierTexte(assemble, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    expect(assemble).not.toMatch(/\d\s?%/u);
  });
});
