import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sansCommentaires } from "@/domain/copy/source";
import { ETATS_VIVANTS } from "@/domain/consultants/annulation";
import {
  TENUE_MINUTES,
  echeanceDeTenue,
  tenueEchue,
} from "@/domain/consultants/tenue";
import {
  annuaireVide,
  filtrerAnnuaire,
  habilitesPour,
  languesDisponibles,
  libelleDelai,
  MENTION_HABILITATION,
} from "@/domain/consultants/annuaire";
import {
  FUSEAU_AFFICHAGE,
  MENTION_TENUE,
  conditions,
  grouperParJour,
  libelleFormat,
  libelleHeure,
  libelleLimite,
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
import { completudeDesPieces, libelleAPreparer } from "@/domain/dossiers/piece";
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

  /**
   * L'heure écrite dans la grille est celle que le candidat lit — I.E,
   * seconde moitié.
   *
   * Les créneaux étaient **posés** en UTC pendant que les formateurs les
   * rendent dans le fuseau d'affichage : une grille écrite « 09:00,
   * 11:30, 15:30 » s'affichait « 10 h 00, 12 h 30, 16 h 30 ». Les essais
   * de ce fichier attendaient l'heure décalée, c'est-à-dire le défaut ;
   * celui-ci tient la règle plutôt que le résultat d'alors.
   */
  it("chaque créneau s'affiche à l'heure où il est écrit", () => {
    const attendues = ["09 h 00", "11 h 30", "15 h 30"];
    expect(grouperParJour(liste)[0]!.creneaux.map(libelleHeure)).toEqual(attendues);
  });

  /**
   * Les formateurs rendent l'heure du fuseau d'affichage, sous une phrase
   * qui annonce « les horaires sont donnés dans ton fuseau, Cotonou » —
   * c'est la première moitié du lot I.E. La seconde a posé les créneaux
   * dans ce même fuseau : l'heure écrite et l'heure lue coïncident enfin.
   */
  it("nomme l'heure et le jour sans abréviation dans la confirmation", () => {
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    expect(libelleHeure(creneau)).toBe("15 h 30");
    expect(libelleRendezVous(creneau)).toBe("Jeudi 17 septembre, 15 h 30");
  });

  it("le fuseau d'affichage est déclaré en un seul endroit", () => {
    expect(FUSEAU_AFFICHAGE).toBe("Africa/Porto-Novo");
    // La phrase de l'écran nomme Cotonou : le fuseau doit être le sien, pas
    // celui du serveur.
    expect(mentionFuseau("Cotonou", "Amsterdam")).toContain("ton fuseau, Cotonou");
  });

  it("calcule la limite d'annulation depuis la grille, pas depuis l'écran", () => {
    expect(CONSULTATION_ANNULATION_HEURES).toBe(24);
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    expect(limiteAnnulation(creneau)).toBe("2026-09-16T14:30:00.000Z");
  });

  it("garde l'heure sur la limite d'annulation", () => {
    // Écrite au jour près, la limite ferait annuler trop tard quelqu'un qui
    // s'y fie — et la consultation serait due.
    const creneau = grouperParJour(liste)[0]!.creneaux[2]!;
    expect(libelleLimiteAnnulation(creneau)).toBe("mercredi 16 septembre à 15 h 30");
  });

  /**
   * Après la réservation, la limite affichée est celle que le serveur a
   * stockée — la grille peut avoir changé entre-temps, la condition
   * acceptée ce jour-là, non.
   */
  it("la limite stockée s'affiche telle quelle", () => {
    expect(libelleLimite("2026-09-16T15:30:00.000Z")).toBe(
      "mercredi 16 septembre à 16 h 30",
    );
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

  /**
   * Ce test s'appelait déjà « tient le créneau, et le dit », et ne
   * vérifiait que la phrase : `TENUE_MINUTES` valait dix, la mention le
   * répétait, et rien ne tenait quoi que ce soit — le rendez-vous
   * naissait confirmé, sans paiement ni échéance. Il porte maintenant
   * sur le mécanisme, et la phrase en découle.
   */
  it("tient le créneau, et le dit de la même durée", () => {
    const debut = new Date("2026-09-21T10:00:00Z");
    const echeance = echeanceDeTenue(debut);
    expect((echeance.getTime() - debut.getTime()) / 60_000).toBe(TENUE_MINUTES);
    expect(MENTION_TENUE).toContain(`${TENUE_MINUTES} minutes`);

    // Avant l'échéance elle tient, après elle ne tient plus rien.
    expect(tenueEchue(echeance, new Date(echeance.getTime() - 1))).toBe(false);
    expect(tenueEchue(echeance, new Date(echeance.getTime() + 1))).toBe(true);
    // Une tenue sans échéance ne tient pas : la base la refuse, et le
    // domaine ne la considère jamais comme valable.
    expect(tenueEchue(null, debut)).toBe(true);
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
    const texte = libelleAPreparer(PIECES_NL, completudeDesPieces(PIECES_NL).compteurs);
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
    expect(
      libelleAPreparer(sansBloquante, completudeDesPieces(sansBloquante).compteurs),
    ).toContain("pièces complémentaires");
  });

  it("se tait autrement quand tout est conforme", () => {
    const tout = PIECES_NL.map((p) => ({ ...p, etat: "CONFORME" as const }));
    expect(libelleAPreparer(tout, completudeDesPieces(tout).compteurs)).toContain(
      "Toutes les pièces demandées sont conformes",
    );
  });

  it("accorde le singulier", () => {
    const une = PIECES_DE.slice(0, 1);
    expect(libelleAPreparer(une, completudeDesPieces(une).compteurs)).toBe(
      "1 pièce obligatoire reste à traiter : passeport.",
    );
  });
});

/**
 * ── « Une seule règle, à deux endroits qui ne peuvent plus diverger » ──
 *
 * C'est ce que dit l'en-tête d'`ETATS_VIVANTS`, écrit après le défaut qui
 * a coûté à un candidat l'accord de partage rempli pour rien : `creneaux()`
 * affichait libre un créneau que l'unicité refusait ensuite.
 *
 * La phrase n'était pas encore vraie de `creneaux()` elle-même, ni des
 * trois autres requêtes qui recopiaient `["RESERVE", "REPORTE"]` à côté
 * d'`ETATS_ANNULABLES`. Aucune ne divergeait — elles portaient les mêmes
 * valeurs —, et rien n'aurait dit laquelle mettre à jour le jour où un
 * état s'ajoute.
 *
 * La garde est donc sur la forme : hors du module qui les définit, ces
 * deux listes ne s'écrivent pas, elles se lisent.
 */
describe("les états d'un rendez-vous s'écrivent à un seul endroit", () => {
  it("aucune requête ne recopie la liste des états", () => {
    const fichiers = [
      "src/server/lecture/consultants.ts",
      "src/server/acces/consultations.ts",
      "src/server/acces/suppression.ts",
      "src/server/consultations/annulation.ts",
    ];
    for (const chemin of fichiers) {
      const source = sansCommentaires(readFileSync(chemin, "utf8"));
      expect(source, `${chemin} recopie les états annulables`).not.toMatch(
        /\[\s*"RESERVE"\s*,\s*"REPORTE"\s*\]/u,
      );
      expect(source, `${chemin} recopie les états vivants`).not.toMatch(
        /\[\s*"TENU"\s*,\s*"RESERVE"\s*,\s*"REPORTE"\s*\]/u,
      );
    }
  });

  /**
   * Et la liste des états vivants est celle de l'unicité partielle de la
   * base : c'est la contrainte qui décide, l'affichage ne fait que la
   * refléter. Les voir se contredire est ce qui a produit le défaut.
   */
  it("les états vivants sont ceux de l'unicité partielle en base", () => {
    const migration = readFileSync(
      "prisma/migrations/20260924100000_creneau_vivant/migration.sql",
      "utf8",
    );
    const clause = migration.match(/WHERE status IN \(([^)]*)\)/u)?.[1] ?? "";
    const enBase = clause
      .split(",")
      .map((e) => e.trim().replace(/'/gu, ""))
      .sort();
    expect(enBase).toEqual([...ETATS_VIVANTS].sort());
  });

  /**
   * L'horloge de l'appelant, et elle seule. `creneaux()` en reçoit une pour
   * dater les créneaux proposés, et comparait les tenues à `new Date()` :
   * deux instants dans une fonction qui n'en connaît qu'un.
   */
  it("les créneaux ne lisent pas une seconde horloge", () => {
    const source = sansCommentaires(
      readFileSync("src/server/lecture/consultants.ts", "utf8"),
    );
    // Le corps seul : la signature porte `aujourdhui = new Date()`, qui est
    // l'horloge par défaut de l'appelant et non une seconde lecture.
    const signature = source.indexOf("export async function creneaux(");
    const corps = source.slice(
      source.indexOf("\n", signature),
      source.indexOf("export interface Partage"),
    );
    expect(corps).not.toContain("new Date()");
  });
});
