import { describe, expect, it } from "vitest";
import {
  annuaireVide,
  filtrerAnnuaire,
  habilitesPour,
  languesDisponibles,
  libelleDelai,
  MENTION_HABILITATION,
} from "@/domain/consultants/annuaire";
import {
  MENTION_TENUE,
  TENUE_MINUTES,
  conditions,
  grouperParJour,
  libelleFormat,
  libelleHeure,
  libelleLimiteAnnulation,
  libelleRendezVous,
  limiteAnnulation,
  mentionFuseau,
  peutConfirmer,
  referenceRendezVous,
  type Creneau,
} from "@/domain/consultants/rendez-vous";
import {
  HORS_PORTEE,
  LIBELLE_PORTEE,
  PORTEE_CONSULTANT,
  peutLire,
} from "@/domain/consultants/access";
import { libelleAPreparer } from "@/domain/dossiers/piece";
import {
  CONSULTATION,
  CONSULTATION_ANNULATION_HEURES,
  CONSULTATION_DUREE_MINUTES,
} from "@/domain/payments/pricing";
import { CONSULTANTS, creneaux, nomDestination } from "@/lib/contenu/consultants";
import { PIECES_DE, PIECES_NL } from "@/lib/contenu/dossiers";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

describe("T-04 — annuaire des consultants", () => {
  it("n'expose que les habilités de la destination", () => {
    expect(habilitesPour(CONSULTANTS, "NL").map((c) => c.id)).toEqual([
      "vermeulen",
      "adjovi",
      "bakker",
    ]);
    expect(habilitesPour(CONSULTANTS, "DE")).toHaveLength(0);
  });

  it("classe par délai de réponse : le plus rapide d'abord", () => {
    expect(filtrerAnnuaire(CONSULTANTS, "NL", null, "TOUS").map((c) => c.id)).toEqual([
      "vermeulen",
      "adjovi",
      "bakker",
    ]);
  });

  it("filtre par langue et par délai", () => {
    expect(filtrerAnnuaire(CONSULTANTS, "NL", "Fon", "TOUS").map((c) => c.id)).toEqual([
      "adjovi",
    ]);
    expect(filtrerAnnuaire(CONSULTANTS, "NL", null, "SOUS_48H").map((c) => c.id)).toEqual([
      "vermeulen",
      "adjovi",
    ]);
  });

  it("propose les langues réellement couvertes, pas une liste fixe", () => {
    expect(languesDisponibles(CONSULTANTS, "NL")).toEqual([
      "Anglais",
      "Fon",
      "Français",
      "Néerlandais",
    ]);
    expect(languesDisponibles(CONSULTANTS, "CA")).toEqual([
      "Anglais",
      "Français",
      "Wolof",
    ]);
  });

  it("dit le délai en heures, puis en jours quand il s'allonge", () => {
    const [vermeulen, , bakker] = habilitesPour(CONSULTANTS, "NL");
    expect(libelleDelai(vermeulen!)).toBe("Répond en 24 h");
    expect(libelleDelai(bakker!)).toBe("Répond en 3 jours");
  });

  it("nomme les destinations couvertes dans l'état vide", () => {
    // « Aucun consultant » seul se lit comme une panne, alors que la
    // couverture s'étend destination par destination.
    const vide = annuaireVide(CONSULTANTS, "DE", nomDestination("DE"), nomDestination)!;
    expect(vide.titre).toBe("Aucun consultant habilité pour l'Allemagne");
    expect(vide.explication).toContain("3 pour les Pays-Bas");
    expect(vide.explication).toContain("2 pour le Canada");
    expect(vide.explication).toContain("vérifie un titre d'exercice local");
    expect(annuaireVide(CONSULTANTS, "NL", "les Pays-Bas", nomDestination)).toBeNull();
  });

  it("distingue ce que l'habilitation atteste de ce qu'elle n'atteste pas", () => {
    expect(MENTION_HABILITATION).toContain("engage le consultant, pas ImmiPro");
    expect(MENTION_HABILITATION).toContain("pas que ta demande aboutira");
    expect(verifierTexte(MENTION_HABILITATION, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
  });
});

describe("T-04 — accord d'accès dérivé du modèle de droits", () => {
  it("annonce exactement ce que peutLire autorise", () => {
    // Un écran qui énumère à part ce que le consultant verra finit par
    // promettre autre chose que ce que le code accorde.
    for (const portee of PORTEE_CONSULTANT) {
      expect(LIBELLE_PORTEE[portee], portee).toBeTruthy();
    }
    expect(Object.keys(LIBELLE_PORTEE).sort()).toEqual([...PORTEE_CONSULTANT].sort());
  });

  it("ne promet jamais l'accès au paiement", () => {
    const t = new Date("2026-09-01T00:00:00Z");
    const decision = peutLire(
      "vermeulen",
      { id: "nl-4471", destination: "NL" },
      [{ consultantId: "vermeulen", destination: "NL", habiliteLe: t }],
      [{ dossierId: "nl-4471", consultantId: "vermeulen", donneLe: t }],
      new Date("2026-09-18T00:00:00Z"),
    );
    expect(decision.autorise).toBe(true);
    if (decision.autorise) {
      const libelles = decision.portee.map((p) => LIBELLE_PORTEE[p]).join(" ");
      expect(libelles).not.toMatch(/paiement|achat/i);
    }
    expect(HORS_PORTEE.join(" ")).toMatch(/moyen de paiement/);
  });
});

describe("T-05 — créneaux et confirmation", () => {
  const aujourdhui = new Date("2026-09-15T08:00:00Z");
  const liste = creneaux(aujourdhui);

  it("groupe les créneaux par jour, dans l'ordre", () => {
    const jours = grouperParJour(liste);
    expect(jours).toHaveLength(3);
    expect(jours[0]!.cle).toBe("2026-09-17");
    expect(jours.map((j) => j.creneaux.length)).toEqual([3, 5, 2]);
  });

  it("montre un créneau déjà pris au lieu de le masquer", () => {
    const jours = grouperParJour(liste);
    const pris = jours[0]!.creneaux.filter((c) => !c.disponible);
    expect(pris).toHaveLength(1);
    expect(libelleHeure(pris[0]!)).toBe("11 h 30");
  });

  it("nomme l'heure et le jour sans abréviation dans la confirmation", () => {
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    expect(libelleHeure(creneau)).toBe("15 h 30");
    expect(libelleRendezVous(creneau)).toBe("Jeudi 17 septembre, 15 h 30");
  });

  it("calcule la limite d'annulation depuis la grille, pas depuis l'écran", () => {
    expect(CONSULTATION_ANNULATION_HEURES).toBe(24);
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    expect(limiteAnnulation(creneau)).toBe("2026-09-16T15:30:00.000Z");
  });

  it("garde l'heure sur la limite d'annulation", () => {
    // Écrite au jour près, la limite ferait annuler trop tard quelqu'un qui
    // s'y fie — et la consultation serait due.
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    expect(libelleLimiteAnnulation(creneau)).toBe("mercredi 16 septembre à 15 h 30");
  });

  it("reprend le tarif et la durée de la grille", () => {
    expect(libelleFormat()).toBe(`${CONSULTATION_DUREE_MINUTES} minutes en visioconférence`);
    const texte = conditions("20 000 F");
    expect(texte).toContain("20 000 F, réglés à ImmiPro");
    expect(texte).toContain("24 h avant le créneau");
    expect(texte).toContain("la consultation est due");
    expect(CONSULTATION.prix.XOF).toBe(20000);
  });

  it("ne confirme rien sans accord ni créneau disponible", () => {
    const [libre] = grouperParJour(liste)[0]!.creneaux;
    const pris = grouperParJour(liste)[0]!.creneaux.find((c) => !c.disponible)!;
    expect(peutConfirmer(false, libre!)).toBe(false);
    expect(peutConfirmer(true, null)).toBe(false);
    expect(peutConfirmer(true, pris)).toBe(false);
    expect(peutConfirmer(true, libre!)).toBe(true);
  });

  it("donne une référence déterministe : une réservation rejouée n'en crée pas deux", () => {
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    const reference = referenceRendezVous(creneau, "vermeulen");
    expect(reference).toBe(referenceRendezVous(creneau, "vermeulen"));
    expect(reference).toMatch(/^RDV-\d{4}-\d{7}$/);
    expect(referenceRendezVous(creneau, "adjovi")).not.toBe(reference);
  });

  it("tient le créneau, et le dit", () => {
    expect(TENUE_MINUTES).toBe(10);
    expect(MENTION_TENUE).toBe("Le créneau est tenu 10 minutes.");
  });

  it("énonce le décalage de fuseau au lieu de le masquer", () => {
    const texte = mentionFuseau("Cotonou", "Amsterdam");
    expect(texte).toContain("dans ton fuseau, Cotonou");
    expect(texte).toContain("Amsterdam");
  });

  it("garde des créneaux à venir quelle que soit la date de rendu", () => {
    // Des créneaux figés finissent tous dans le passé, et l'écran propose
    // alors des rendez-vous impossibles.
    for (const jour of ["2026-09-15", "2027-03-02"]) {
      const a = new Date(`${jour}T08:00:00Z`);
      for (const c of creneaux(a)) expect(new Date(c.debut).getTime()).toBeGreaterThan(a.getTime());
    }
  });
});

describe("T-05 — ce qu'il reste à préparer, sans pourcentage", () => {
  it("nomme les pièces au lieu d'annoncer une part", () => {
    // Le prototype écrivait « Ta checklist est à 80 % : les deux pièces à
    // reprendre sont… » — le dernier pourcentage de l'interface candidat.
    const texte = libelleAPreparer(PIECES_NL);
    expect(texte).toBe(
      "2 pièces obligatoires restent à traiter : passeport et attestation de ressources.",
    );
    expect(texte).not.toMatch(/\d+\s?%/);
    expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
  });

  it("bascule sur les complémentaires quand rien ne bloque", () => {
    const sansBloquante = PIECES_NL.map((p) =>
      p.famille === "OBLIGATOIRE" ? { ...p, etat: "CONFORME" as const } : p,
    );
    expect(libelleAPreparer(sansBloquante)).toContain("pièces complémentaires");
  });

  it("se tait autrement quand tout est conforme", () => {
    const tout = PIECES_NL.map((p) => ({ ...p, etat: "CONFORME" as const }));
    expect(libelleAPreparer(tout)).toContain("Toutes les pièces demandées sont conformes");
  });

  it("accorde le singulier", () => {
    const une = PIECES_DE.slice(0, 1);
    expect(libelleAPreparer(une)).toBe("1 pièce obligatoire reste à traiter : passeport.");
  });
});
