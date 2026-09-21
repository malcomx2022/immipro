import { describe, expect, it } from "vitest";
import {
  corpsDuVerdict,
  dateDeDepot,
  enAjoutant,
  evaluerLeCalendrier,
  phraseDeReplanification,
  premiereDateCibleTenable,
  titreDuVerdict,
  TON_DU_VERDICT,
  type CalendrierAEvaluer,
  type PieceAObtenir,
} from "@/domain/dossiers/faisabilite";
import { calendrierAEvaluer } from "@/server/lecture/dossiers";
import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * WF-09 étape 4 — l'alerte d'incompatibilité et la replanification.
 *
 * Ce que ces tests protègent, dans l'ordre : qu'un calendrier mort soit
 * annoncé mort ; qu'un calendrier dont on ignore les délais ne soit pas
 * annoncé vivant ; et qu'aucune phrase ne devienne un pronostic.
 */

const AUJOURDHUI = "2026-09-21";

const piece = (
  code: string,
  delaiJours: number | null,
  obligatoire = true,
): PieceAObtenir => ({ code, libelle: `Pièce ${code}`, delaiJours, obligatoire });

const calendrier = (
  partiel: Partial<CalendrierAEvaluer> = {},
): CalendrierAEvaluer => ({
  aujourdhui: AUJOURDHUI,
  dateCible: "2027-09-01",
  delaiInstructionJours: 60,
  aObtenir: [],
  ...partiel,
});

describe("WF-09.4 — le calendrier tient-il", () => {
  it("n'a rien à dire sans date visée", () => {
    const verdict = evaluerLeCalendrier(calendrier({ dateCible: null }));
    expect(verdict.etat).toBe("SANS_DATE");
    expect(verdict.depot).toBeNull();
    expect(TON_DU_VERDICT.SANS_DATE).toBeNull();
  });

  it("retire le délai d'instruction pour trouver la date de dépôt", () => {
    expect(dateDeDepot("2027-09-01", 60)).toBe("2027-07-03");
    // Délai inconnu : le dépôt retombe sur la date cible, jamais sur rien.
    expect(dateDeDepot("2027-09-01", null)).toBe("2027-09-01");
  });

  it("déclare intenable une pièce obligatoire qui ne peut plus arriver", () => {
    const verdict = evaluerLeCalendrier(
      calendrier({ dateCible: "2026-11-01", aObtenir: [piece("passeport", 90)] }),
    );
    expect(verdict.etat).toBe("INTENABLE");
    expect(verdict.enRetard).toHaveLength(1);
    // Dépôt au 2026-09-02, arrivée au 2026-12-20 : 109 jours de trop.
    expect(verdict.enRetard[0]!.joursManquants).toBe(109);
    expect(corpsDuVerdict(verdict)).toContain("90 jours d'obtention");
  });

  /**
   * Le cas qu'un décompte de retards manquait : la ligne « Dépôt » n'est
   * pas une pièce à obtenir, et aucune pièce n'est en retard — le
   * calendrier est mort quand même.
   */
  it("déclare intenable un dépôt déjà passé, sans aucune pièce en retard", () => {
    const verdict = evaluerLeCalendrier(
      calendrier({ dateCible: "2026-10-01", aObtenir: [] }),
    );
    expect(verdict.depotPasse).toBe(true);
    expect(verdict.enRetard).toHaveLength(0);
    expect(verdict.etat).toBe("INTENABLE");
    expect(titreDuVerdict(verdict)).toBe("La date de dépôt est passée");
  });

  /**
   * Le défaut que ce lot vise. Un délai absent compté comme zéro conclut
   * « ça tient » sur un dossier dont on ignore les délais.
   */
  it("ne conclut pas quand un délai n'est pas annoncé", () => {
    const verdict = evaluerLeCalendrier(
      calendrier({ aObtenir: [piece("acte", null), piece("passeport", 30)] }),
    );
    expect(verdict.etat).toBe("INDETERMINE");
    expect(verdict.etat).not.toBe("TENABLE");
    expect(verdict.inconnues.map((p) => p.code)).toEqual(["acte"]);
    expect(corpsDuVerdict(verdict)).toContain("n'est pas compté comme nul");
  });

  it("un retard l'emporte sur une inconnue", () => {
    const verdict = evaluerLeCalendrier(
      calendrier({
        dateCible: "2026-11-01",
        aObtenir: [piece("acte", null), piece("passeport", 90)],
      }),
    );
    expect(verdict.etat).toBe("INTENABLE");
  });

  it("dit que le calendrier tient, et nomme la pièce la plus tendue", () => {
    const verdict = evaluerLeCalendrier(
      calendrier({ aObtenir: [piece("passeport", 30), piece("releve", 200)] }),
    );
    expect(verdict.etat).toBe("TENABLE");
    expect(verdict.margeLaPlusCourte!.piece.code).toBe("releve");
    expect(corpsDuVerdict(verdict)).toContain("Pièce releve");
    expect(corpsDuVerdict(verdict)).toContain("de marge");
  });

  /**
   * RG-07.2 a déjà tranché la frontière pour la complétude : une pièce
   * bloquante ne se compense pas, et une complémentaire ne bloque pas.
   * Le calendrier suit la même.
   */
  it("une pièce complémentaire en retard ne condamne pas la date", () => {
    const verdict = evaluerLeCalendrier(
      // Dépôt à venir : seule la pièce complémentaire déborde.
      calendrier({ aObtenir: [piece("assurance", 400, false)] }),
    );
    expect(verdict.etat).toBe("TENABLE");
    expect(verdict.enRetard).toHaveLength(0);
  });

  it("classe les retards du plus grave au moins grave", () => {
    const verdict = evaluerLeCalendrier(
      calendrier({
        dateCible: "2026-11-01",
        aObtenir: [piece("a", 70), piece("b", 300)],
      }),
    );
    expect(verdict.enRetard.map((r) => r.piece.code)).toEqual(["b", "a"]);
  });
});

describe("WF-09.4 — la replanification", () => {
  it("propose la première date que les délais connus laissent atteindre", () => {
    const c = calendrier({
      dateCible: "2026-11-01",
      aObtenir: [piece("a", 30), piece("b", 90)],
    });
    const proposition = premiereDateCibleTenable(c);
    // Le plus long des délais, puis l'instruction : 90 + 60 jours.
    expect(proposition.date).toBe(enAjoutant(AUJOURDHUI, 150));
    expect(proposition.fondeeSur).toEqual(["a", "b"]);
    expect(proposition.inconnues).toEqual([]);
    expect(proposition.instructionComptee).toBe(true);
    // Et la date proposée rend bien le calendrier tenable.
    expect(evaluerLeCalendrier({ ...c, dateCible: proposition.date }).etat).toBe("TENABLE");
  });

  it("annonce un plancher, pas une prévision, quand un délai manque", () => {
    const proposition = premiereDateCibleTenable(
      calendrier({ aObtenir: [piece("a", 30), piece("inconnue", null)] }),
    );
    expect(proposition.inconnues).toEqual(["inconnue"]);
    const phrase = phraseDeReplanification(proposition);
    expect(phrase).toContain("plancher");
    expect(phrase).toContain("repousser");
    // Une seule explication par phrase : deux deux-points s'emboîtent mal.
    expect(phrase.split(":")).toHaveLength(2);
  });

  it("dit que le délai d'instruction n'est pas compté quand il est inconnu", () => {
    const proposition = premiereDateCibleTenable(
      calendrier({ delaiInstructionJours: null, aObtenir: [piece("a", 30)] }),
    );
    expect(proposition.instructionComptee).toBe(false);
    expect(phraseDeReplanification(proposition)).toContain("pas compté");
  });

  it("ne réserve rien quand tout est connu", () => {
    const proposition = premiereDateCibleTenable(
      calendrier({ aObtenir: [piece("a", 30)] }),
    );
    expect(phraseDeReplanification(proposition)).not.toContain("plancher");
  });
});

describe("WF-09.4 — ce que le dossier donne à évaluer", () => {
  const document = (
    code: string,
    status: "ATTENDUE" | "CONFORME",
    remedy: "TELEVERSER" | "REDIGER" | "DEMARCHE",
    required = true,
  ) => ({ code, label: `Pièce ${code}`, status, remedy, required }) as never;

  const regle = {
    rules: {
      libelle: "R",
      langues_acceptees: [],
      niveau_langue_min: null,
      frais_scolarite: null,
      frais_dossier: null,
      preuve_fonds: null,
      delai_traitement_jours: { min: 30, max: 60 },
      travail_autorise: {
        autorise: false,
        limite_hebdomadaire_heures: null,
        plein_temps_vacances: false,
        delai_carence_mois: null,
        permis_employeur_requis: false,
      },
      apres_etudes: {
        dispositif: null,
        duree_mois: null,
        renouvelable: false,
        delai_depot_apres_diplome_mois: null,
        travail_pendant_recherche_heures: null,
      },
      conditions: [],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, delai_obtention_jours: 45, traduction_assermentee: false, legalisation: false, nature: "televerser" },
        { code: "lettre", libelle: "Lettre", obligatoire: true, traduction_assermentee: false, legalisation: false, nature: "rediger" },
        { code: "acte", libelle: "Acte", obligatoire: true, traduction_assermentee: false, legalisation: false, nature: "televerser" },
      ],
    },
  } as never;

  /**
   * Une pièce à rédiger n'a pas de délai d'obtention parce qu'elle n'en a
   * pas : une lettre de motivation ne met pas quarante-cinq jours à venir.
   * La compter comme inconnue mettrait tous les dossiers en
   * « indéterminé », c'est-à-dire nulle part.
   */
  it("écarte les pièces à rédiger", () => {
    const c = calendrierAEvaluer(
      {
        targetDate: new Date("2027-09-01T00:00:00Z"),
        visaRule: regle,
        documents: [
          document("passeport", "ATTENDUE", "TELEVERSER"),
          document("lettre", "ATTENDUE", "REDIGER"),
        ],
      },
      new Date(`${AUJOURDHUI}T00:00:00Z`),
    );
    expect(c.aObtenir.map((p) => p.code)).toEqual(["passeport"]);
    expect(evaluerLeCalendrier(c).etat).toBe("TENABLE");
  });

  it("écarte les pièces déjà conformes", () => {
    const c = calendrierAEvaluer(
      {
        targetDate: new Date("2027-09-01T00:00:00Z"),
        visaRule: regle,
        documents: [
          document("passeport", "CONFORME", "TELEVERSER"),
          document("acte", "ATTENDUE", "TELEVERSER"),
        ],
      },
      new Date(`${AUJOURDHUI}T00:00:00Z`),
    );
    expect(c.aObtenir.map((p) => p.code)).toEqual(["acte"]);
  });

  it("prend les délais de la règle figée, et laisse `null` ce qu'elle n'annonce pas", () => {
    const c = calendrierAEvaluer(
      {
        targetDate: new Date("2027-09-01T00:00:00Z"),
        visaRule: regle,
        documents: [
          document("passeport", "ATTENDUE", "TELEVERSER"),
          document("acte", "ATTENDUE", "TELEVERSER"),
        ],
      },
      new Date(`${AUJOURDHUI}T00:00:00Z`),
    );
    expect(c.delaiInstructionJours).toBe(60);
    expect(c.aObtenir.find((p) => p.code === "passeport")!.delaiJours).toBe(45);
    expect(c.aObtenir.find((p) => p.code === "acte")!.delaiJours).toBeNull();
    expect(evaluerLeCalendrier(c).etat).toBe("INDETERMINE");
  });

  it("sans règle figée, aucun délai n'est inventé", () => {
    const c = calendrierAEvaluer(
      {
        targetDate: new Date("2027-09-01T00:00:00Z"),
        visaRule: null,
        documents: [document("passeport", "ATTENDUE", "TELEVERSER")],
      },
      new Date(`${AUJOURDHUI}T00:00:00Z`),
    );
    expect(c.delaiInstructionJours).toBeNull();
    expect(c.aObtenir[0]!.delaiJours).toBeNull();
    expect(evaluerLeCalendrier(c).etat).toBe("INDETERMINE");
  });
});

describe("WF-09.4 — ce que les phrases ne disent pas", () => {
  /**
   * INV-1 et INV-2 sur des textes assemblés à l'exécution : `check:copy`
   * lit les sources, il ne voit pas une phrase composée d'un libellé de
   * pièce et d'un nombre de jours.
   */
  it("ne promet rien et ne pronostique rien", () => {
    const cas: CalendrierAEvaluer[] = [
      calendrier({ dateCible: null }),
      calendrier({ dateCible: "2026-10-01" }),
      calendrier({ dateCible: "2026-11-01", aObtenir: [piece("a", 90)] }),
      calendrier({ aObtenir: [piece("a", null)] }),
      calendrier({ aObtenir: [piece("a", 30)] }),
      calendrier({ aObtenir: [] }),
    ];
    const textes = cas.flatMap((c) => {
      const verdict = evaluerLeCalendrier(c);
      return [
        titreDuVerdict(verdict),
        corpsDuVerdict(verdict),
        phraseDeReplanification(premiereDateCibleTenable(c)),
      ];
    });
    const assemble = textes.join("\n");
    expect(verifierTexte(assemble, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    expect(assemble).not.toMatch(/\d\s?%/u);
    // Une date atteignable ne dit rien de la décision de l'administration.
    expect(assemble).not.toMatch(/obtiendra|accept|refus/iu);
  });
});
