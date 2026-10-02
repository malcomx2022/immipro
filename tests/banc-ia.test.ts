import { describe, expect, it } from "vitest";
import {
  CAS_DE_LECTURE,
  CAS_DE_REDACTION,
  FAUSSES_CONFORMITES_ADMISES,
  type CasDeLecture,
} from "@/domain/banc-ia/jeu-d-essai";
import {
  nombresDuTexte,
  noterUneLecture,
  noterUneRedaction,
  synthetiser,
  verdictDuProduit,
  type LectureObtenue,
} from "@/domain/banc-ia/notation";
import type { Condition } from "@/domain/dossiers/verification";
import { conditionsDeLaPiece } from "@/domain/dossiers/verification";
import { PIECES_REDIGEABLES } from "@/lib/contenu/redaction";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * S.99 — le jeu d'essai du banc des fournisseurs d'IA.
 *
 * Un banc faux disqualifie un bon fournisseur ou en retient un mauvais.
 * Ces tests vérifient le jeu lui-même, avant qu'aucun fournisseur ne le
 * passe :
 *
 * - chaque cas vise une règle et une ligne de checklist qui existent ;
 * - chaque lecture attendue ne porte que des champs que le produit
 *   demande ;
 * - le verdict écrit à la main est celui que la chaîne du produit calcule
 *   sur la lecture attendue — un lecteur parfait passe sans faute ;
 * - les pièges sont réels : la faute qu'ils tendent produit bien une
 *   fausse conformité.
 */

const regleDe = (cas: CasDeLecture) => {
  const regle = REGLES_DE_REFERENCE.find(
    (r) => r.countryCode === cas.regle.pays && r.visaType === cas.regle.visaType,
  );
  if (!regle) throw new Error(`${cas.id} : aucune règle ${cas.regle.pays} ${cas.regle.visaType}`);
  return regle;
};

const conditionsDe = (cas: CasDeLecture): readonly Condition[] =>
  regleDe(cas).rules.conditions as readonly Condition[];

/** Ce qu'un lecteur parfait rend : la lecture attendue, dans la forme d'un adaptateur. */
const parfaite = (cas: CasDeLecture): LectureObtenue =>
  cas.attendu.obstacle !== null
    ? { etat: "NON_LUE", cause: cas.attendu.obstacle }
    : { etat: "LUE", pieceIdentifiee: cas.attendu.pieceIdentifiee, bruts: { ...cas.attendu.champs } };

describe("le jeu d'essai des pièces", () => {
  it("compte trente pièces, chacune à un identifiant unique", () => {
    expect(CAS_DE_LECTURE).toHaveLength(30);
    expect(new Set(CAS_DE_LECTURE.map((c) => c.id)).size).toBe(30);
  });

  it("couvre les quatre règles, les quatre formats et les pièces difficiles", () => {
    const regles = new Set(CAS_DE_LECTURE.map((c) => `${c.regle.pays}/${c.regle.visaType}`));
    expect(regles.size).toBe(4);
    const formats = new Set(CAS_DE_LECTURE.map((c) => c.rendu.format));
    expect([...formats].sort()).toEqual(["jpeg", "pdf_natif", "pdf_scanne", "png"]);
    const degradations = CAS_DE_LECTURE.filter((c) => c.rendu.degradation !== "aucune");
    expect(degradations.length).toBeGreaterThanOrEqual(8);
  });

  it("chaque cas vise une règle et une ligne de checklist qui existent", () => {
    for (const cas of CAS_DE_LECTURE) {
      const codes = regleDe(cas).rules.pieces_requises.map((p) => p.code);
      expect(codes, cas.id).toContain(cas.codeAttendu);
      if (cas.attendu.pieceIdentifiee !== null) {
        expect(codes, cas.id).toContain(cas.attendu.pieceIdentifiee);
      }
    }
  });

  it("une lecture attendue ne porte que les champs que le produit demande, et tous", () => {
    for (const cas of CAS_DE_LECTURE) {
      const demandes = conditionsDeLaPiece(conditionsDe(cas), cas.codeAttendu).map((c) => c.code);
      const portes = Object.keys(cas.attendu.champs);
      if (cas.attendu.obstacle !== null) {
        expect(portes, cas.id).toEqual([]);
        continue;
      }
      expect([...portes].sort(), cas.id).toEqual([...demandes].sort());
    }
  });

  it("les dates attendues sont en ISO, les montants en nombres", () => {
    for (const cas of CAS_DE_LECTURE) {
      for (const condition of conditionsDeLaPiece(conditionsDe(cas), cas.codeAttendu)) {
        const valeur = cas.attendu.champs[condition.code];
        if (valeur === null || valeur === undefined) continue;
        if (condition.unite === "mois") expect(valeur, cas.id).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        else if (condition.operateur === "gte" || condition.operateur === "lte") {
          expect(typeof valeur, cas.id).toBe("number");
        }
      }
    }
  });

  it("le verdict écrit à la main est celui que la chaîne du produit calcule", () => {
    for (const cas of CAS_DE_LECTURE) {
      expect(verdictDuProduit(conditionsDe(cas), cas.codeAttendu, parfaite(cas), cas.repere), cas.id).toBe(
        cas.verdictAttendu,
      );
    }
  });

  it("le jeu tend des pièges : au moins un tiers des pièces ne sont pas conformes", () => {
    const nonConformes = CAS_DE_LECTURE.filter((c) => c.verdictAttendu !== "CONFORME");
    expect(nonConformes.length).toBeGreaterThanOrEqual(10);
    expect(CAS_DE_LECTURE.filter((c) => c.piege !== undefined).length).toBeGreaterThanOrEqual(10);
  });
});

describe("la notation d'une lecture", () => {
  const cas = (id: string) => CAS_DE_LECTURE.find((c) => c.id === id)!;

  it("un lecteur parfait passe le banc sans une faute", () => {
    const notes = CAS_DE_LECTURE.map((c) => noterUneLecture(c, conditionsDe(c), parfaite(c)));
    const s = synthetiser(notes, []);
    expect(s.champs.justes).toBe(s.champs.total);
    expect(s.identifications.justes).toBe(s.identifications.attendues);
    expect(s.obstacles.justes).toBe(s.obstacles.attendus);
    expect(s.verdicts.justes).toBe(30);
    expect(s.fausseConformite).toEqual([]);
    expect(s.disqualifie).toBe(false);
  });

  it("L07 : recopier un solde en FCFA comme des euros est une fausse conformité", () => {
    const l07 = cas("L07");
    const note = noterUneLecture(l07, conditionsDe(l07), {
      etat: "LUE",
      pieceIdentifiee: "preuve_fonds",
      bruts: { preuve_fonds_annuelle: 5_000_000 },
    });
    expect(note.champs[0]!.issue).toBe("inventee");
    expect(note.verdictObtenu).toBe("CONFORME");
    expect(note.fausseConformite).toBe(true);
  });

  it("L10 : un relevé pris pour un passeport, avec une date inventée, est une fausse conformité", () => {
    const l10 = cas("L10");
    const note = noterUneLecture(l10, conditionsDe(l10), {
      etat: "LUE",
      pieceIdentifiee: "passeport",
      bruts: { passeport_validite_min: "2031-01-01" },
    });
    expect(note.identificationJuste).toBe(false);
    expect(note.fausseConformite).toBe(true);
  });

  it("L10 : la même date inventée, la pièce bien reconnue, reste hors sujet", () => {
    const l10 = cas("L10");
    const note = noterUneLecture(l10, conditionsDe(l10), {
      etat: "LUE",
      pieceIdentifiee: "preuve_fonds",
      bruts: { passeport_validite_min: "2031-01-01" },
    });
    expect(note.champs[0]!.issue).toBe("inventee");
    expect(note.verdictObtenu).toBe("HORS_SUJET");
    expect(note.fausseConformite).toBe(false);
  });

  it("L23 : une mention d'employeur reconnu fabriquée est une fausse conformité", () => {
    const l23 = cas("L23");
    const note = noterUneLecture(l23, conditionsDe(l23), {
      etat: "LUE",
      pieceIdentifiee: "contrat_travail",
      bruts: { ...l23.attendu.champs, employeur_reconnu: "erkend referent" },
    });
    expect(note.fausseConformite).toBe(true);
  });

  it("L08 : un solde arrondi au-dessus du seuil est une valeur fausse et une fausse conformité", () => {
    const l08 = cas("L08");
    const note = noterUneLecture(l08, conditionsDe(l08), {
      etat: "LUE",
      pieceIdentifiee: "preuve_fonds",
      bruts: { preuve_fonds_annuelle: 13600 },
    });
    expect(note.champs[0]!.issue).toBe("fausse");
    expect(note.fausseConformite).toBe(true);
  });

  it("L30 : une date devinée sur une photo noire est une fausse conformité, et l'obstacle est manqué", () => {
    const l30 = cas("L30");
    const note = noterUneLecture(l30, conditionsDe(l30), {
      etat: "LUE",
      pieceIdentifiee: "passeport",
      bruts: { passeport_validite_min: "2031-05-14" },
    });
    expect(note.obstacle).toBe("manque");
    expect(note.fausseConformite).toBe(true);
  });

  it("une lecture prudente n'est jamais une fausse conformité : elle part en revue", () => {
    const l01 = cas("L01");
    const note = noterUneLecture(l01, conditionsDe(l01), {
      etat: "LUE",
      pieceIdentifiee: "passeport",
      bruts: { passeport_validite_min: null },
    });
    expect(note.champs[0]!.issue).toBe("manquee");
    expect(note.fausseConformite).toBe(false);
  });

  it("une panne du service est un échec technique, pas un obstacle", () => {
    const l01 = cas("L01");
    const note = noterUneLecture(l01, conditionsDe(l01), { etat: "NON_LUE", cause: "delai_depasse" });
    expect(note.echecTechnique).toBe(true);
    expect(note.obstacle).toBe("sans_objet");
    expect(note.verdictObtenu).toBe("ILLISIBLE");
  });

  it("un obstacle signalé sur une pièce lisible se compte à part", () => {
    const l05 = cas("L05");
    const note = noterUneLecture(l05, conditionsDe(l05), { etat: "NON_LUE", cause: "scan_illisible" });
    expect(note.obstacle).toBe("signale_a_tort");
    expect(note.echecTechnique).toBe(false);
  });

  it("une seule fausse conformité disqualifie", () => {
    expect(FAUSSES_CONFORMITES_ADMISES).toBe(0);
    const l07 = cas("L07");
    const fautive = noterUneLecture(l07, conditionsDe(l07), {
      etat: "LUE",
      pieceIdentifiee: "preuve_fonds",
      bruts: { preuve_fonds_annuelle: 5_000_000 },
    });
    const autres = CAS_DE_LECTURE.filter((c) => c.id !== "L07").map((c) =>
      noterUneLecture(c, conditionsDe(c), parfaite(c)),
    );
    const s = synthetiser([...autres, fautive], []);
    expect(s.fausseConformite).toEqual(["L07"]);
    expect(s.disqualifie).toBe(true);
  });
});

describe("le jeu d'essai des rédactions", () => {
  it("compte dix rédactions, sur les quatre pièces que le produit sait mettre en forme", () => {
    expect(CAS_DE_REDACTION).toHaveLength(10);
    const types = new Set(CAS_DE_REDACTION.map((c) => c.piece));
    expect([...types].sort()).toEqual(PIECES_REDIGEABLES.map((p) => p.type).sort());
  });

  it("chaque réponse répond à une question que la pièce pose réellement", () => {
    for (const cas of CAS_DE_REDACTION) {
      const piece = PIECES_REDIGEABLES.find((p) => p.type === cas.piece)!;
      const intitules = piece.questions.map((q) => q.intitule);
      for (const intitule of Object.keys(cas.reponses)) {
        expect(intitules, `${cas.id} : ${intitule}`).toContain(intitule);
      }
    }
  });

  it("deux cas portent une incohérence à relever", () => {
    expect(CAS_DE_REDACTION.filter((c) => c.incoherenceAttendue).map((c) => c.id)).toEqual(["R03", "R07"]);
  });
});

describe("la notation d'une rédaction", () => {
  const r = (id: string) => CAS_DE_REDACTION.find((c) => c.id === id)!;

  it("les nombres se comparent sans leurs séparateurs", () => {
    expect(nombresDuTexte("14 250 euros, soit 14.250 ou 14250 ; IELTS 6,5")).toEqual(["14250", "65"]);
  });

  it("R02 : un montant absent des réponses est signalé comme ajouté", () => {
    const note = noterUneRedaction(
      r("R02"),
      "Je dispose de 20 000 francs pour financer mon master, obtenu après ma licence de 2026.",
      [],
    );
    expect(note.nombresAjoutes).toEqual(["20000"]);
    expect(note.aVerifier.join(" ")).toMatch(/20000/u);
  });

  it("R10 : la promesse demandée par la réponse est signalée", () => {
    const note = noterUneRedaction(
      r("R10"),
      "Je suis Lionel Akpovi. L'obtention de mon visa est certaine, et mon visa garanti par un dossier complet.",
      [],
    );
    expect(note.fautesDeVocabulaire.map((f) => f.code)).toContain("visa-garanti");
    expect(note.formulesSignalees).toContain("certaine");
  });

  it("une négation n'est pas une faute de vocabulaire", () => {
    const note = noterUneRedaction(r("R10"), "Je sais que rien n'est acquis : aucun visa garanti.", []);
    expect(note.fautesDeVocabulaire).toEqual([]);
  });

  it("le tutoiement est relevé : la lettre parle pour le candidat, pas à lui", () => {
    expect(noterUneRedaction(r("R01"), "Tu es candidat au bachelor.", []).tutoiement).toBe(true);
    expect(noterUneRedaction(r("R01"), "Je suis candidat au bachelor, et ma famille me soutient.", []).tutoiement).toBe(false);
  });

  it("R03 : une relecture sans incohérence manque le piège", () => {
    const manquee = noterUneRedaction(r("R03"), "Texte.", [{ genre: "FORME" }]);
    expect(manquee.incoherenceRelevee).toBe(false);
    expect(manquee.aVerifier.join(" ")).toMatch(/incohérence/u);
    const trouvee = noterUneRedaction(r("R03"), "Texte.", [{ genre: "INCOHERENCE" }]);
    expect(trouvee.incoherenceRelevee).toBe(true);
  });

  it("aucune relecture rendue n'est pas une relecture vide", () => {
    expect(noterUneRedaction(r("R03"), null, null).incoherenceRelevee).toBeNull();
  });
});
