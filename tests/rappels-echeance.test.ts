import { describe, expect, it } from "vitest";
import {
  CADENCE_JOURS,
  HORIZON_HEBDOMADAIRE_JOURS,
  JOURS_APRES_ECHEANCE,
  JOURS_URGENCE,
  delai,
  echeanceVivante,
  enClair,
  rappelDuJour,
  type DossierARappeler,
  type EcheanceARappeler,
} from "@/domain/dossiers/rappels";

/**
 * Les rappels d'échéance — WF-09 étape 3, RG-09.2.
 *
 * Le défaut, constaté avant d'écrire une ligne : la file
 * `echeancier.rappel` était déclarée avec le motif « l'envoi attend la
 * messagerie », et le transport SMTP avait été branché le matin même.
 *
 *     échéances en base       : 3
 *       dont dépassée         : test_langue, il y a 3 jours
 *       dont à moins de 7 j   : rdv_consulaire, dans 4 jours
 *     transport de courrier   : SMTP (branché)
 *     un ouvrier la traite ?  : non
 *     quelqu'un y poste ?     : personne
 *     notifications d'échéance: 0
 */

const AUJOURDHUI = "2026-09-22";

const dans = (jours: number): string => {
  const d = new Date(`${AUJOURDHUI}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

const echeance = (
  code: string,
  jours: number,
  reste: Partial<EcheanceARappeler> = {},
): EcheanceARappeler => ({
  code,
  libelle: `Faire ${code}`,
  date: dans(jours),
  faite: false,
  rappeleeLe: null,
  ...reste,
});

const dossier = (
  echeances: EcheanceARappeler[],
  dernierRappelLe: string | null = null,
): DossierARappeler => ({ intitule: "NL — etudes", echeances, dernierRappelLe });

describe("ce qui mérite un rappel, et ce qui n'en mérite plus", () => {
  it("une échéance faite ne se rappelle jamais", () => {
    expect(echeanceVivante(echeance("x", 3, { faite: true }), AUJOURDHUI, 30)).toBe(false);
  });

  /**
   * Rappeler chaque semaine pendant six mois une date passée depuis
   * longtemps n'est plus un rappel, c'est un reproche.
   */
  it("une échéance dépassée depuis trop longtemps sort du rappel, pas de l'écran", () => {
    expect(echeanceVivante(echeance("x", -JOURS_APRES_ECHEANCE), AUJOURDHUI, 30)).toBe(true);
    expect(echeanceVivante(echeance("x", -JOURS_APRES_ECHEANCE - 1), AUJOURDHUI, 30)).toBe(false);
  });

  it("une échéance au-delà de l'horizon attend son tour", () => {
    expect(echeanceVivante(echeance("x", HORIZON_HEBDOMADAIRE_JOURS), AUJOURDHUI, 30)).toBe(true);
    expect(echeanceVivante(echeance("x", HORIZON_HEBDOMADAIRE_JOURS + 1), AUJOURDHUI, 30)).toBe(false);
  });
});

describe("la cadence, et l'exception qui lui échappe", () => {
  /**
   * RG-09.2 : « un email hebdomadaire, sauf urgence à moins de 7 jours ».
   * Une urgence qui attendrait lundi arriverait après la date.
   */
  it("une urgence part tout de suite, même à un jour du dernier rappel", () => {
    const rappel = rappelDuJour(
      dossier([echeance("rdv", 4)], dans(-1)),
      AUJOURDHUI,
    );
    expect(rappel?.motif).toBe("urgence");
    expect(rappel?.objet).toContain("arrive");
  });

  it("une échéance dépassée est une urgence, et l'objet le dit", () => {
    const rappel = rappelDuJour(dossier([echeance("test", -3)]), AUJOURDHUI);
    expect(rappel?.motif).toBe("urgence");
    expect(rappel?.objet).toContain("dépassée");
    expect(rappel?.corps).toContain("dépassée de 3 jours");
  });

  /**
   * Le point qui décide de tout : une urgence renvoyée chaque jour
   * jusqu'à la date est la façon la plus sûre de se faire filtrer — et
   * le filtre emporte aussi le rappel qui comptait.
   */
  it("une urgence déjà rappelée ne repart pas le lendemain", () => {
    const deja = echeance("rdv", 3, { rappeleeLe: dans(-1) });
    expect(rappelDuJour(dossier([deja], dans(-1)), AUJOURDHUI)).toBeNull();
  });

  it("hors urgence, rien ne part avant une semaine", () => {
    const loin = [echeance("depot", 20)];
    expect(rappelDuJour(dossier(loin, dans(-(CADENCE_JOURS - 1))), AUJOURDHUI)).toBeNull();
    expect(rappelDuJour(dossier(loin, dans(-CADENCE_JOURS)), AUJOURDHUI)?.motif).toBe(
      "hebdomadaire",
    );
  });

  it("un dossier jamais rappelé reçoit sa première passe", () => {
    expect(rappelDuJour(dossier([echeance("depot", 20)], null), AUJOURDHUI)?.motif).toBe(
      "hebdomadaire",
    );
  });

  it("rien à dire, rien n'est envoyé", () => {
    expect(rappelDuJour(dossier([], null), AUJOURDHUI)).toBeNull();
    expect(rappelDuJour(dossier([echeance("loin", 90)], null), AUJOURDHUI)).toBeNull();
    // Toutes faites : le dossier avance, et le silence est le bon message.
    expect(
      rappelDuJour(dossier([echeance("depot", 3, { faite: true })], null), AUJOURDHUI),
    ).toBeNull();
  });
});

describe("un courrier, et non une ligne par échéance", () => {
  /**
   * Le groupement n'est pas une économie d'envois : c'est ce qui garde le
   * canal lisible. Deux urgences le même jour partent ensemble.
   */
  it("une urgence emporte les autres échéances proches dans le même courrier", () => {
    const rappel = rappelDuJour(
      dossier([echeance("rdv", 4), echeance("langue", -2), echeance("depot", 25)]),
      AUJOURDHUI,
    );
    expect(rappel?.motif).toBe("urgence");
    // Les deux proches, et pas celle à 25 jours : le courrier d'urgence
    // porte ce qui est urgent, pas l'échéancier entier.
    expect(rappel?.echeances.map((e) => e.code)).toEqual(["langue", "rdv"]);
  });

  it("la passe hebdomadaire porte tout le mois, urgences comprises", () => {
    const rappel = rappelDuJour(
      dossier([echeance("rdv", 4, { rappeleeLe: dans(-1) }), echeance("depot", 25)], dans(-8)),
      AUJOURDHUI,
    );
    expect(rappel?.motif).toBe("hebdomadaire");
    expect(rappel?.echeances.map((e) => e.code)).toEqual(["rdv", "depot"]);
  });

  /**
   * Chaque ligne porte le délai **et** la date : « dans 4 jours » seul
   * oblige à compter, « le 26 septembre » seul oblige à ouvrir un
   * calendrier.
   */
  it("chaque ligne dit le délai et la date en toutes lettres", () => {
    const rappel = rappelDuJour(dossier([echeance("rdv", 4)]), AUJOURDHUI);
    expect(rappel?.corps).toContain("dans 4 jours");
    expect(rappel?.corps).toContain(enClair(dans(4)));
    // Jamais un format à deux lectures.
    expect(rappel?.corps).not.toMatch(/\d{2}\/\d{2}/u);
  });

  /**
   * INV-1 et INV-2 : le courrier informe d'une date. Il ne dit pas ce
   * qu'une date manquée coûterait, ni ce que le dossier vaut.
   */
  it("ne se prononce ni sur l'issue ni sur les conséquences", () => {
    const rappel = rappelDuJour(
      dossier([echeance("test", -3), echeance("rdv", 2)]),
      AUJOURDHUI,
    );
    expect(rappel?.corps).not.toMatch(/refus|rejet|chances|risque|compromis|perdu/iu);
    expect(rappel?.objet).not.toMatch(/urgent\s*!|dernier rappel/iu);
  });
});

describe("les libellés de délai", () => {
  it("disent le sens du temps sans faire compter", () => {
    expect(delai(AUJOURDHUI, dans(0))).toBe("aujourd'hui");
    expect(delai(AUJOURDHUI, dans(1))).toBe("dans 1 jour");
    expect(delai(AUJOURDHUI, dans(JOURS_URGENCE))).toBe(`dans ${JOURS_URGENCE} jours`);
    expect(delai(AUJOURDHUI, dans(-1))).toBe("dépassée de 1 jour");
    expect(delai(AUJOURDHUI, dans(-5))).toBe("dépassée de 5 jours");
  });

  it("écrivent le mois, jamais un nombre à deux lectures", () => {
    expect(enClair("2026-09-26")).toBe("26 septembre 2026");
    expect(enClair("2026-01-01")).toBe("1 janvier 2026");
  });
});
