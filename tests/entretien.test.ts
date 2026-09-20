import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fichierAgenda,
  nomDuFichierAgenda,
  TYPE_AGENDA,
} from "@/domain/consultants/agenda";
import {
  brancherTransport,
  envoyerConfirmationEntretien,
  type Courrier,
} from "@/server/courrier";
import { libelleLimiteAnnulation } from "@/domain/consultants/rendez-vous";

/**
 * Le rendez-vous confirmé, et ce qui en sort — I.E.
 *
 * Deux sorties, et la même règle pour les deux : ce qui est écrit est ce
 * qui ne bougera plus. Un courriel comme une entrée d'agenda se relisent
 * des semaines plus tard, et une phrase recopiée y mentirait (RG-11.3).
 */

const CRENEAU = { debut: "2026-09-17T15:30:00.000Z", disponible: true };

describe("l'entrée d'agenda — « Ajouter à mon agenda » ne faisait rien", () => {
  const entree = {
    reference: "RDV-1709-0930412",
    debut: CRENEAU.debut,
    dureeMinutes: 45,
    consultant: "Marieke Vermeulen",
    dossier: "Pays-Bas — Séjour pour études",
    adresse: "https://immipro.bj/dossiers/nl-4471",
    produitLe: "2026-09-15T08:00:00.000Z",
  };

  it("porte le créneau et sa fin, calculée depuis la durée", () => {
    const ics = fichierAgenda(entree);
    expect(ics).toContain("DTSTART:20260917T153000Z");
    expect(ics).toContain("DTEND:20260917T161500Z");
  });

  /**
   * L'identifiant est la référence : le même rendez-vous ajouté deux fois
   * met à jour l'entrée au lieu d'en créer une seconde, comme la référence
   * déterministe empêche une seconde réservation.
   */
  it("s'identifie par la référence du rendez-vous", () => {
    expect(fichierAgenda(entree)).toContain("UID:RDV-1709-0930412@immipro.bj");
    expect(nomDuFichierAgenda(entree.reference)).toBe("RDV-1709-0930412.ics");
    expect(TYPE_AGENDA).toContain("text/calendar");
  });

  /**
   * Les séparateurs du format sont des caractères ordinaires du français.
   * « Pays-Bas — Séjour, étudiant » couperait la ligne en trois champs.
   */
  it("échappe les virgules et les points-virgules d'une phrase française", () => {
    const ics = fichierAgenda({ ...entree, dossier: "Pays-Bas ; études, master" });
    expect(ics).toContain("Pays-Bas \; études\\, master");
  });

  it("plie les lignes à 75 octets, sans couper un caractère accentué", () => {
    const ics = fichierAgenda(entree);
    for (const ligne of ics.split("\r\n")) {
      expect(Buffer.byteLength(ligne, "utf8"), ligne).toBeLessThanOrEqual(76);
    }
    // Le pliage se relit : les continuations commencent par une espace.
    expect(ics).toMatch(/\r\n /u);
    expect(ics.split("\r\n").every((l) => !l.includes("�"))).toBe(true);
  });

  /**
   * L'état de la checklist n'entre pas dans un agenda : il aura changé
   * avant l'appel, et l'entrée ne se recalcule pas.
   */
  it("ne recopie aucun état qui bougera", () => {
    const ics = fichierAgenda(entree);
    expect(ics).not.toMatch(/pièces? (obligatoires?|complémentaires?) rest/u);
    expect(ics).toContain(entree.adresse);
  });

  it("les fins de ligne sont celles que la spécification impose", () => {
    const ics = fichierAgenda(entree);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/gu, "")).not.toContain("\n");
  });
});

describe("le courriel de confirmation — il n'existait pas", () => {
  let parti: Courrier | null = null;

  beforeEach(() => {
    parti = null;
    brancherTransport(async (courrier) => {
      parti = courrier;
    });
  });

  const envoyer = (dossier: string | null = "Pays-Bas — Séjour pour études") =>
    envoyerConfirmationEntretien({
      destinataire: "awa@example.bj",
      reference: "RDV-1709-0930412",
      creneau: CRENEAU,
      consultant: "Marieke Vermeulen",
      dossier,
      partageExpireLe: "1er octobre 2026",
    });

  it("écrit les faits qui ne bougeront plus", async () => {
    await envoyer();
    const courrier = parti!;
    expect(courrier.destinataire).toBe("awa@example.bj");
    expect(courrier.objet).toBe("Entretien confirmé — Jeudi 17 septembre, 16 h 30");
    expect(courrier.corps).toContain("Jeudi 17 septembre, 16 h 30");
    expect(courrier.corps).toContain("45 minutes en visioconférence");
    expect(courrier.corps).toContain("RDV-1709-0930412");
    expect(courrier.corps).toContain("Pays-Bas — Séjour pour études");
  });

  /**
   * La limite d'annulation est opposable : écrite au jour près, elle ferait
   * annuler trop tard quelqu'un qui s'y fie, et la consultation serait due.
   */
  it("date la limite d'annulation à l'heure près", async () => {
    await envoyer();
    expect(parti!.corps).toContain(libelleLimiteAnnulation(CRENEAU));
    expect(parti!.corps).toContain("mercredi 16 septembre à 16 h 30");
    expect(parti!.corps).toContain("la consultation est due");
  });

  /**
   * La règle du lot, et celle de RG-11.3 : un email ne se recalcule pas à
   * l'ouverture. Ce qui change est renvoyé à l'écran, jamais recopié.
   */
  it("ne recopie pas l'état de la checklist", async () => {
    await envoyer();
    expect(parti!.corps).not.toMatch(/pièces? (obligatoires?|complémentaires?) rest/u);
    expect(parti!.corps).toContain("ouvre ton dossier");
  });

  it("dit jusqu'à quand le consultant accède au dossier", async () => {
    await envoyer();
    expect(parti!.corps).toContain("jusqu'au 1er octobre 2026");
    expect(parti!.corps).toContain("retirer cet accord à tout moment");
  });

  /** « Dossier : ton dossier » ne dirait rien que l'objet ne dise déjà. */
  it("omet la ligne du dossier quand aucune règle n'est figée", async () => {
    await envoyer(null);
    expect(parti!.corps).not.toContain("Dossier :");
    expect(parti!.corps).toContain("Référence :");
  });

  /** INV-2 : le garde-fou du vocabulaire s'applique aux courriers aussi. */
  it("reste soumis au vocabulaire interdit", async () => {
    await expect(
      envoyerConfirmationEntretien({
        destinataire: "awa@example.bj",
        reference: "RDV-1709-0930412",
        creneau: CRENEAU,
        consultant: "notre avocat",
        dossier: null,
        partageExpireLe: "1er octobre 2026",
      }),
    ).rejects.toThrow(/INV-2/u);
  });

  it("un envoi manqué ne défait pas la réservation", async () => {
    // La route journalise et rend la main : le rendez-vous est écrit, et
    // c'est l'écran qui en porte la preuve.
    brancherTransport(async () => {
      throw new Error("SMTP injoignable");
    });
    const erreur = vi.fn();
    await envoyer().catch(erreur);
    expect(erreur).toHaveBeenCalled();
  });
});
