import { describe, expect, it } from "vitest";
import {
  compterMots,
  dureeEstimee,
  estDerniereQuestion,
  libelleAvancementEntretien,
  libelleRang,
  libelleReponse,
  libelleSuivant,
  nombreDeReponses,
  questionPrecedente,
  questionSuivante,
} from "@/domain/redaction/entretien";
import {
  estCourante,
  libelleAnciennete,
  libelleVersion,
  motsDeLaVersion,
  parOrdreDeLecture,
  versionCourante,
} from "@/domain/redaction/versions";
import {
  compterBloquantes,
  remarqueLongueur,
  resumeRelecture,
  trierRemarques,
  type Remarque,
} from "@/domain/redaction/relecture";
import {
  compterNonLues,
  filtrer,
  libelleContexte,
  libelleMoment,
  libelleProgression,
  titreAlerte,
  toutMarquerLu,
  type Alerte,
} from "@/domain/notifications/alerte";
import {
  ecartMontant,
  libelleImpact,
  mentionArbitrage,
  optionsArbitrage,
} from "@/domain/notifications/divergence";
import { jourEnFrancais } from "@/domain/format/moment";
import {
  COMMISSION_PARTENAIRE,
  CONSULTATION,
  CONSULTATION_DUREE_MINUTES,
  tauxCommissionFormate,
} from "@/domain/payments/pricing";
import {
  LIMITE_MOTS_CONSEILLEE,
  PIECES_REDIGEABLES,
  REMARQUES_MOTIVATION,
  VERSIONS_MOTIVATION,
  remarquesDeLaLettre,
} from "@/lib/contenu/redaction";
import {
  ALERTES,
  REGLE_ANCIENNE,
  REGLE_NOUVELLE,
} from "@/lib/contenu/alertes";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

const MOTIVATION = PIECES_REDIGEABLES[0]!;

describe("R-01, R-02 — entretien guidé", () => {
  it("annonce le rang sans jamais afficher de part", () => {
    // Le prototype calculait aussi `Math.round((i + 1) / 8 * 100) + "%"`.
    expect(libelleRang(2, 8)).toBe("Question 3 sur 8");
    expect(verifierTexte(libelleRang(2, 8), INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
  });

  it("estime une durée compatible avec l'avertissement du même écran", () => {
    // « Prévois vingt minutes pour l'entretien et la relecture » : une
    // estimation d'entretien à vingt-cinq minutes contredisait la ligne
    // suivante.
    expect(dureeEstimee(MOTIVATION)).toBe("8 questions · environ 16 minutes");
    expect(dureeEstimee(PIECES_REDIGEABLES[3]!)).toBe("4 questions · environ 8 minutes");
  });

  it("encourage sous un champ vide, puis mesure", () => {
    expect(libelleReponse("   ")).toBe("Deux ou trois phrases suffisent.");
    expect(libelleReponse("Licence en gestion")).toBe("3 mots écrits");
    expect(libelleReponse("Licence")).toBe("1 mot écrit");
    expect(compterMots("")).toBe(0);
  });

  it("borne la navigation aux deux extrémités", () => {
    expect(questionSuivante(7, 8)).toBe(7);
    expect(questionSuivante(0, 8)).toBe(1);
    expect(questionPrecedente(0)).toBe(0);
    expect(estDerniereQuestion(7, 8)).toBe(true);
    expect(libelleSuivant(7, 8)).toBe("Mettre en forme ma lettre");
    expect(libelleSuivant(0, 8)).toBe("Question suivante");
  });

  it("ne compte que les réponses réellement écrites", () => {
    const reponses = { 0: "Licence en gestion", 1: "   ", 3: "Épargne familiale" };
    expect(nombreDeReponses(reponses, 8)).toBe(2);
    expect(libelleAvancementEntretien(reponses, 8)).toBe("2 réponses sur 8");
  });

  it("donne à chaque pièce un jeu de questions qui la concerne", () => {
    const parType = Object.fromEntries(
      PIECES_REDIGEABLES.map((p) => [p.type, p.questions.length]),
    );
    expect(parType).toEqual({
      "lettre-motivation": 8,
      "projet-etudes": 6,
      "intention-retour": 5,
      "prise-en-charge": 4,
    });
    // Une attestation de prise en charge ne demande pas le niveau d'anglais.
    const garant = PIECES_REDIGEABLES.find((p) => p.type === "prise-en-charge")!;
    expect(garant.questions.map((q) => q.section)).not.toContain("LANGUES");
  });

  it("chaque question dit pourquoi elle est posée, avec deux repères", () => {
    for (const piece of PIECES_REDIGEABLES) {
      for (const q of piece.questions) {
        expect(q.motif.length).toBeGreaterThan(20);
        expect(q.reperes).toHaveLength(2);
      }
    }
  });
});

describe("R-03 — versions", () => {
  const maintenant = new Date("2026-09-18T09:41:00Z");

  it("met la plus récente en tête et la marque courante", () => {
    expect(parOrdreDeLecture(VERSIONS_MOTIVATION).map((v) => v.rang)).toEqual([3, 2, 1]);
    expect(versionCourante(VERSIONS_MOTIVATION)?.rang).toBe(3);
    expect(estCourante(VERSIONS_MOTIVATION[2]!, VERSIONS_MOTIVATION)).toBe(true);
    expect(estCourante(VERSIONS_MOTIVATION[0]!, VERSIONS_MOTIVATION)).toBe(false);
  });

  it("compte les mots du texte, pas des paragraphes", () => {
    expect(motsDeLaVersion(VERSIONS_MOTIVATION[2]!)).toBeGreaterThan(100);
    expect(motsDeLaVersion(VERSIONS_MOTIVATION[0]!)).toBeLessThan(
      motsDeLaVersion(VERSIONS_MOTIVATION[2]!),
    );
  });

  it("date en relatif tant que c'est lisible, en absolu au-delà", () => {
    expect(libelleAnciennete("2026-09-18T09:37:00Z", maintenant)).toBe("il y a 4 minutes");
    expect(libelleAnciennete("2026-09-18T07:41:00Z", maintenant)).toBe("il y a 2 heures");
    expect(libelleAnciennete("2026-09-17T21:04:00Z", maintenant)).toBe("hier à 21 h 04");
    expect(libelleAnciennete("2026-09-09T10:12:00Z", maintenant)).toBe("9 septembre 2026");
  });

  it("résume la version courante en une ligne", () => {
    const ligne = libelleVersion(VERSIONS_MOTIVATION[2]!, maintenant);
    expect(ligne).toContain("Version 3");
    expect(ligne).toContain("il y a 4 minutes");
    expect(ligne).toMatch(/\d+ mots$/);
  });
});

describe("R-04 — analyse critique", () => {
  it("met l'incohérence en tête : c'est la seule qui se voit de l'extérieur", () => {
    const avecForme = [
      ...REMARQUES_MOTIVATION,
      remarqueLongueur(412, LIMITE_MOTS_CONSEILLEE, "Hanze")!,
    ];
    expect(trierRemarques(avecForme).map((r) => r.genre)).toEqual([
      "INCOHERENCE",
      "A_RENFORCER",
      "FORME",
    ]);
    expect(compterBloquantes(avecForme)).toBe(1);
  });

  it("résume sans noter la lettre", () => {
    expect(resumeRelecture(REMARQUES_MOTIVATION)).toBe(
      "2 points à traiter, dont une incohérence avec une autre pièce de ton dossier.",
    );
    expect(resumeRelecture([])).toBe("Rien à reprendre sur cette version.");
    const renforcer = REMARQUES_MOTIVATION.filter((r) => r.genre === "A_RENFORCER");
    expect(resumeRelecture(renforcer)).toBe(
      "1 point à traiter, aucune incohérence avec tes autres pièces.",
    );
  });

  it("calcule la remarque de longueur sur le texte, et se tait s'il tient", () => {
    // Le prototype annonçait « 412 mots » au-dessus d'une lettre qui en
    // comptait 134 : le chiffre venait de la maquette, pas du document.
    const trop = remarqueLongueur(412, 400, "Hanze")!;
    expect(trop.titre).toBe("412 mots pour une limite conseillée de 400");
    expect(trop.corps).toContain("12 mots au-dessus");
    expect(remarqueLongueur(400, 400, "Hanze")).toBeNull();
    expect(remarqueLongueur(134, 400, "Hanze")).toBeNull();
    // La lettre de démonstration tient dans la limite : pas de remarque.
    expect(remarquesDeLaLettre().some((r) => r.genre === "FORME")).toBe(false);
  });

  it("montre les deux valeurs qui divergent, pas seulement l'écart", () => {
    const incoherence = REMARQUES_MOTIVATION.find((r) => r.genre === "INCOHERENCE")!;
    expect(incoherence.ecarts).toHaveLength(2);
    expect(incoherence.ecarts![0]!.valeur).not.toBe(incoherence.ecarts![1]!.valeur);
  });

  it("ne note ni ne prédit, dans aucune remarque", () => {
    const textes: Remarque[] = [...REMARQUES_MOTIVATION];
    for (const r of textes) {
      expect(verifierTexte(`${r.titre} ${r.corps}`, INTERDITS_ECRAN_CANDIDAT), r.id).toEqual([]);
    }
  });
});

describe("T-01 — alertes", () => {
  const maintenant = new Date("2026-09-18T13:05:00Z");

  it("filtre par genre et rend les plus récentes d'abord", () => {
    expect(filtrer(ALERTES, "TOUTES")).toHaveLength(ALERTES.length);
    expect(filtrer(ALERTES, "REGLEMENTATION").map((a) => a.id)).toEqual(["de-compte-bloque"]);
    const toutes = filtrer(ALERTES, "TOUTES");
    expect(toutes[0]!.id).toBe("de-compte-bloque");
  });

  it("compte et marque les non lues sans muter la liste", () => {
    expect(compterNonLues(ALERTES)).toBe(2);
    const lues = toutMarquerLu(ALERTES);
    expect(compterNonLues(lues)).toBe(0);
    expect(compterNonLues(ALERTES)).toBe(2);
  });

  it("date en relatif et nomme la source ou le dossier", () => {
    expect(libelleMoment("2026-09-18T11:05:00Z", maintenant)).toBe("Il y a 2 heures");
    expect(libelleMoment("2026-09-17T08:00:00Z", maintenant)).toBe("Hier à 08 h 00");
    const reglementaire = ALERTES.find((a) => a.id === "de-compte-bloque")!;
    expect(libelleContexte(reglementaire, maintenant)).toContain(
      "source : make-it-in-germany.com",
    );
    const echeance = ALERTES.find((a) => a.id === "passeport-echeance")!;
    expect(libelleContexte(echeance, maintenant)).toContain("dossier Pays-Bas");
  });

  it("recalcule le délai d'une échéance au lieu de le figer dans le titre", () => {
    // « Échéance dans 7 jours » écrit dans le texte reste affiché le jour de
    // l'échéance, puis une semaine après.
    const echeance = ALERTES.find((a) => a.id === "passeport-echeance")!;
    expect(titreAlerte(echeance, "2026-09-11")).toBe(
      "Renouvellement du passeport · dans 7 jours",
    );
    expect(titreAlerte(echeance, "2026-09-18")).toBe(
      "Renouvellement du passeport · aujourd'hui",
    );
    expect(titreAlerte(echeance, "2026-09-21")).toBe(
      "Renouvellement du passeport · en retard de 3 jours",
    );
    const sansEcheance = ALERTES.find((a) => a.id === "recu-paiement")!;
    expect(titreAlerte(sansEcheance, "2026-09-18")).toBe(sansEcheance.titre);
  });

  it("annonce une progression en pièces, jamais en note sur cent", () => {
    // Dernier endroit où « 58 à 68 sur 100 » avait survécu à l'arbitrage C-09.
    const avant = { obligatoiresManquantes: 3, facultativesManquantes: 2, conformes: 3 };
    expect(
      libelleProgression(avant, {
        obligatoiresManquantes: 2,
        facultativesManquantes: 2,
        conformes: 4,
      }),
    ).toBe("Une pièce obligatoire de moins à réunir : il en reste 2.");

    expect(
      libelleProgression(avant, {
        obligatoiresManquantes: 1,
        facultativesManquantes: 2,
        conformes: 5,
      }),
    ).toBe("2 pièces obligatoires de moins à réunir : il en reste 1.");

    expect(
      libelleProgression(avant, {
        obligatoiresManquantes: 0,
        facultativesManquantes: 2,
        conformes: 6,
      }),
    ).toBe("Plus aucune pièce obligatoire ne manque à ton dossier.");

    expect(
      libelleProgression(avant, {
        obligatoiresManquantes: 3,
        facultativesManquantes: 1,
        conformes: 4,
      }),
    ).toBe("Une pièce complémentaire de moins à traiter : il en reste 1.");

    expect(
      libelleProgression(avant, {
        obligatoiresManquantes: 3,
        facultativesManquantes: 0,
        conformes: 5,
      }),
    ).toBe("2 pièces complémentaires de moins à traiter : il n'en reste aucune.");
  });

  it("se tait quand rien n'a progressé", () => {
    const etat = { obligatoiresManquantes: 2, facultativesManquantes: 2, conformes: 4 };
    expect(libelleProgression(etat, etat)).toBe("");
  });

  it("aucune alerte ne promet un résultat ni ne note le dossier", () => {
    for (const a of ALERTES) {
      expect(verifierTexte(`${a.titre} ${a.corps}`, INTERDITS_ECRAN_CANDIDAT), a.id).toEqual([]);
    }
  });
});

describe("T-02 — divergence réglementaire", () => {
  it("calcule l'écart entre les deux versions", () => {
    expect(ecartMontant(REGLE_ANCIENNE, REGLE_NOUVELLE)).toBe(696);
  });

  it("dit ce que le changement implique selon la date de dépôt", () => {
    const sansDate = libelleImpact(REGLE_ANCIENNE, REGLE_NOUVELLE, "696 €");
    expect(sansDate).toContain("Ta date de dépôt n'est pas fixée");
    expect(sansDate).toContain("696 € de plus");

    const apres = libelleImpact(REGLE_ANCIENNE, REGLE_NOUVELLE, "696 €", "2027-03-01");
    expect(apres).toContain("c'est la version 5 qui s'appliquera");

    const avant = libelleImpact(REGLE_ANCIENNE, REGLE_NOUVELLE, "696 €", "2026-11-30");
    expect(avant).toContain("la version 4 reste celle de ton dossier");
  });

  it("ne réintroduit aucune conversion de devise", () => {
    // Le taux de 655,957 F a été retiré de P-06 et de $-02 ; le prototype
    // l'avait laissé ici sous la forme « soit environ 456 000 F ».
    for (const depot of [undefined, "2027-03-01", "2026-11-30"]) {
      const texte = libelleImpact(REGLE_ANCIENNE, REGLE_NOUVELLE, "696 €", depot);
      expect(texte).not.toMatch(/\bF\b/);
      expect(texte).not.toContain("environ");
    }
  });

  it("écrit le premier du mois avec son ordinal", () => {
    // Intl écrit « 1 janvier » ; le français met l'ordinal au premier du mois,
    // et nulle part ailleurs.
    expect(jourEnFrancais("2027-01-01")).toBe("1er janvier 2027");
    expect(jourEnFrancais("2027-01-15")).toBe("15 janvier 2027");
    expect(jourEnFrancais("2026-12-31")).toBe("31 décembre 2026");
  });

  it("expose deux options, chacune avec le cas où elle se défend", () => {
    const options = optionsArbitrage(REGLE_ANCIENNE, REGLE_NOUVELLE, "11 208 €", "11 904 €");
    expect(options.map((o) => o.cle)).toEqual(["MIGRER", "CONSERVER"]);
    expect(options[0]!.detail).toContain("11 904 €");
    expect(options[0]!.detail).toContain("1er janvier 2027");
    expect(options[1]!.detail).toContain("31 décembre 2026");
  });

  it("dit ce que chaque arbitrage fera de la checklist", () => {
    expect(mentionArbitrage("MIGRER", "Allemagne")).toContain("mise à jour");
    expect(mentionArbitrage("CONSERVER", "Allemagne")).toContain("version antérieure");
  });
});

describe("T-06 — offre de partenaire", () => {
  it("lit le tarif et la durée dans la grille, pas dans l'écran", () => {
    // Le prototype annonçait 25 000 F pour une heure ; l'arbitrage du 13/09
    // a retenu une consultation de 45 minutes. Le libellé qui les assemblait
    // est parti avec T-03 (K.A) : une consultation se réserve dans
    // l'annuaire, qui écrit son propre tarif depuis la même grille.
    expect(CONSULTATION_DUREE_MINUTES).toBe(45);
    expect(CONSULTATION.prix.XOF).toBe(20000);
  });

  it("porte le taux de commission en code, pas seulement à l'écran", () => {
    expect(COMMISSION_PARTENAIRE).toBe(0.15);
    expect(tauxCommissionFormate().replace(/[\s  ]/gu, " ")).toBe("15 %");
  });
});

describe("datation relative — seuil au jour civil", () => {
  const maintenant = new Date("2026-09-18T09:41:00Z");

  it("reste relatif dans la journée, nomme hier, puis date", () => {
    expect(libelleAnciennete("2026-09-18T09:40:30Z", maintenant)).toBe("à l'instant");
    expect(libelleAnciennete("2026-09-18T09:37:00Z", maintenant)).toBe("il y a 4 minutes");
    expect(libelleAnciennete("2026-09-18T07:41:00Z", maintenant)).toBe("il y a 2 heures");
    // 12 heures plus tôt, mais la veille : « hier à 21 h 04 » dit quand,
    // « il y a 12 heures » oblige à le calculer.
    expect(libelleAnciennete("2026-09-17T21:04:00Z", maintenant)).toBe("hier à 21 h 04");
    expect(libelleAnciennete("2026-09-16T23:59:00Z", maintenant)).toBe("16 septembre 2026");
  });

  it("met la majuscule quand la ligne commence par le moment", () => {
    expect(libelleMoment("2026-09-17T08:00:00Z", maintenant)).toBe("Hier à 08 h 00");
    expect(libelleMoment("2026-09-18T07:41:00Z", maintenant)).toBe("Il y a 2 heures");
  });
});
