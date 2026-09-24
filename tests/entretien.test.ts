import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sansCommentaires } from "@/domain/copy/source";

/** Tous les fichiers de code sous une racine, essais exclus. */
function sources(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...sources(chemin));
    else if (/\.tsx?$/u.test(chemin) && !chemin.includes(".test.")) sortie.push(chemin);
  }
  return sortie;
}

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
      return { issue: "envoye" };
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

/**
 * Le garde-fou qui manquait : un expéditeur écrit doit être appelé.
 *
 * `envoyerConfirmationEntretien` portait six essais sur son contenu et cet
 * en-tête : « Aucun courrier ne partait : le candidat réservait
 * quarante-cinq minutes payantes et ne recevait rien, alors que l'écran lui
 * annonçait le contraire. » Le défaut y était écrit au passé, et **aucun
 * appelant de production ne l'appelait** — seuls ces essais-ci. Aucune
 * notification en base non plus. Exécuté avant correction :
 *
 *     rendez-vous : RESERVE
 *     courriels partis : 0 []
 *     notifications en base : 0
 *
 * Six essais sur le contenu d'un courrier ne disent rien de son départ, et
 * c'est ce qu'ils ont laissé passer : ils l'appelaient eux-mêmes. Le
 * garde-fou ne porte donc pas sur ce lot mais sur la **forme** du défaut —
 * `RAPPEL_ECHEANCIER` a vécu la même chose, déclarée sans écrivain.
 */
describe("tout expéditeur écrit part de quelque part", () => {
  const COURRIER = "src/server/courrier.ts";

  /*
    Un **expéditeur** est ce qui appelle `expedier` : c'est le critère du
    code, pas une liste de noms. Une liste se contourne en y ajoutant le
    nom du jour, et le transport, son accesseur et les remises à zéro
    d'essai y auraient figuré pour de bonnes raisons — laissant la place
    pour une mauvaise.
  */
  const expediteurs = (source: string): string[] => {
    const noms: string[] = [];
    for (const m of source.matchAll(/^export (?:async function|const) (\w+)/gmu)) {
      const suite = source.slice(m.index, source.indexOf("\nexport ", m.index! + 1));
      // `expedier` s'exclut : elle **est** l'envoi, elle ne l'appelle pas.
      if (m[1] !== "expedier" && /\bexpedier\(/u.test(suite)) noms.push(m[1]!);
    }
    return noms;
  };

  it("chaque fonction d'envoi a un appelant hors des essais", () => {
    const source = sansCommentaires(readFileSync(COURRIER, "utf8"));
    const envoyeurs = expediteurs(source);
    expect(envoyeurs.length).toBeGreaterThan(3);
    // Celui du lot en fait partie : sans cela l'essai passerait à vide.
    expect(envoyeurs).toContain("envoyerConfirmationEntretien");

    const production = sources("src").filter((f) => f !== COURRIER);
    const orphelins = envoyeurs.filter(
      (n) =>
        !production.some((f) =>
          new RegExp(`\\b${n}\\b`, "u").test(sansCommentaires(readFileSync(f, "utf8"))),
        ),
    );
    expect(orphelins).toEqual([]);
  });

  it("et la confirmation part de la confirmation, pas d'ailleurs", () => {
    /*
      Elle ne peut partir que là où la notification signée confirme : ni le
      retour du navigateur, ni une relève de statut, ni un geste
      d'opérateur n'y mènent (RG-05.1, INV-7).
    */
    const appelants = sources("src").filter(
      (f) =>
        f !== COURRIER &&
        /\benvoyerConfirmationEntretien\b/u.test(sansCommentaires(readFileSync(f, "utf8"))),
    );
    expect(appelants).toEqual(["src/server/acces/consultations.ts"]);
  });

  it("le canal durable est écrit dans la transaction, le courrier après", () => {
    /*
      Un rendez-vous confirmé sans notification laisserait le candidat sans
      trace si le relais est muet. Et l'inverse de la passe de divergence,
      qui envoie avant de marquer : là-bas une passe rejoue, ici rien ne
      rejoue, et annoncer un rendez-vous que la transaction n'aurait pas
      retenu serait pire qu'un courrier manquant.
    */
    const vue = sansCommentaires(readFileSync("src/server/acces/consultations.ts", "utf8"));
    const confirmation = vue.slice(vue.indexOf("export async function confirmerLaConsultation"));
    const avis = confirmation.indexOf("tx.notification.create");
    const courrier = confirmation.indexOf("envoyerConfirmationEntretien");
    const finTransaction = confirmation.indexOf("const confirme = await db.$transaction");
    expect(avis).toBeGreaterThan(finTransaction);
    expect(courrier).toBeGreaterThan(avis);
    // Et son échec ne défait rien.
    expect(confirmation).toMatch(/envoyerConfirmationEntretien\([\s\S]*?\)\.catch\(/u);
  });
});
