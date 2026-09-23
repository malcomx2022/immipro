import { describe, expect, it } from "vitest";
import { computeCompleteness, versClient } from "@/domain/completeness/score";
import { libelleDenombrement } from "@/components/ui/CompletenessTier";
import {
  CE_QUI_DECIDE,
  CE_QUI_NE_PESE_PAS,
  expliquerLaCompletude,
} from "@/domain/completeness/explication";
import { resumeDuJour, type Dossier } from "@/domain/dossiers/dossier";
import { libelleAPreparer, libelleBlocage, type Piece } from "@/domain/dossiers/piece";

const piece = (code: string, etat: Piece["etat"]): Piece => ({
  id: code,
  code: code.slice(0, 3).toUpperCase(),
  libelle: code,
  famille: "OBLIGATOIRE",
  etat,
  remede: "TELEVERSER",
});

/**
 * Une exigence n'est pas une pièce — correctif du lot précédent.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * `compteurs.obligatoiresManquantes` additionnait les pièces obligatoires
 * non conformes **et** les conditions bloquantes non tenues. Tant que le
 * chemin des écrans passait `conditions: []`, cela ne se voyait pas. Le lot
 * qui a réuni les deux calculs l'a rendu visible : sur un dossier dont
 * toutes les pièces sont conformes et dont une seule condition bloque,
 *
 *     compteurs    : {"obligatoiresManquantes":1,"conformes":2}
 *     dénombrement : « 1 pièce obligatoire manque »
 *
 * — et le candidat descendait d'un écran pour trouver une checklist
 * entièrement verte. La contradiction était visible à l'œil nu.
 *
 * L'explication du palier disait la même chose à l'envers : les conditions
 * y figuraient sous « ce qui ne pèse pas », alors qu'elles venaient de se
 * mettre à peser.
 */
const resultat = (conditionsEchouees: number, piecesManquantes = 0) =>
  versClient(
    computeCompleteness({
      documents: [
        { code: "passeport", libelle: "Passeport", required: true, status: "CONFORME" },
        {
          code: "preuve_fonds",
          libelle: "Ressources",
          required: true,
          status: piecesManquantes > 0 ? "ATTENDUE" : "CONFORME",
        },
      ],
      conditions: Array.from({ length: conditionsEchouees }, (_, i) => ({
        code: `exigence_${i}`,
        bloquant: true,
        satisfaite: false,
        messageEchec: `L'autorité exige la pièce numéro ${i}.`,
      })),
      coherence: 1,
      redaction: 1,
    }),
  );

describe("le compteur distingue une pièce d'une exigence", () => {
  it("ne compte que des pièces parmi les obligatoires manquantes", () => {
    const { compteurs } = resultat(1);

    expect(compteurs.obligatoiresManquantes).toBe(0);
    expect(compteurs.exigencesNonTenues).toBe(1);
    expect(compteurs.conformes).toBe(2);
  });

  it("compte les deux séparément quand les deux manquent", () => {
    const { compteurs } = resultat(2, 1);

    expect(compteurs.obligatoiresManquantes).toBe(1);
    expect(compteurs.exigencesNonTenues).toBe(2);
  });
});

describe("l'en-tête de complétude", () => {
  it("n'annonce pas une pièce manquante sur une checklist entièrement verte", () => {
    const phrase = libelleDenombrement(resultat(1).compteurs);

    expect(phrase).toBe("1 exigence n'est pas remplie");
    expect(phrase).not.toContain("pièce obligatoire");
  });

  it("nomme les deux quand les deux manquent", () => {
    expect(libelleDenombrement(resultat(2, 1).compteurs)).toBe(
      "1 pièce obligatoire manque, 2 exigences ne sont pas remplies",
    );
  });

  it("garde sa phrase d'origine quand rien ne manque", () => {
    expect(libelleDenombrement(resultat(0).compteurs)).toBe(
      "Toutes les pièces demandées sont conformes",
    );
  });

  it("garde sa phrase d'origine quand seules des complémentaires restent", () => {
    expect(
      libelleDenombrement({
        obligatoiresManquantes: 0,
        exigencesNonTenues: 0,
        facultativesManquantes: 2,
        conformes: 3,
      }),
    ).toBe("2 pièces complémentaires restent à traiter");
  });
});

describe("l'explication du palier", () => {
  it("range les conditions parmi ce qui décide, et non parmi ce qui ne pèse pas", () => {
    expect(CE_QUI_DECIDE.some((p) => p.includes("conditions bloquantes"))).toBe(true);
    expect(CE_QUI_NE_PESE_PAS.some((p) => p.includes("conditions"))).toBe(false);
  });

  it("dit qu'aucune pièce ne lève l'exigence, pour ne pas envoyer chercher", () => {
    const { surTonDossier } = expliquerLaCompletude(resultat(1));
    const phrase = surTonDossier.find((p) => p.includes("exigence"))!;

    expect(phrase).toContain("aucune pièce ne la lève");
    expect(phrase).toContain("n'est pas remplie");
  });

  /** L'accord porte sur le verbe, le participe et le pronom à la fois. */
  it("accorde correctement au pluriel", () => {
    const { surTonDossier } = expliquerLaCompletude(resultat(2));
    const phrase = surTonDossier.find((p) => p.includes("exigences"))!;

    expect(phrase).toContain("ne sont pas remplies");
    expect(phrase).toContain("aucune pièce ne les lève");
    expect(phrase).not.toContain("n'est pas remplies");
  });
});

describe("le résumé du tableau de bord", () => {
  const dossier = (completude: ReturnType<typeof resultat>): Dossier =>
    ({
      id: "d",
      destination: { slug: "s", pays: "P", resume: "", autorite: "" },
      statut: "ACTIF",
      completude,
      prochaineAction: "",
      pieces: [],
    }) as unknown as Dossier;

  it("n'annonce pas « rien ne bloque » quand une exigence bloque", () => {
    const phrase = resumeDuJour([dossier(resultat(1))]);

    expect(phrase).not.toContain("rien ne bloque");
    expect(phrase).toBe("1 dossier ouvert, 1 exigence à lever.");
  });

  it("nomme les deux quand les deux manquent", () => {
    expect(resumeDuJour([dossier(resultat(2, 1))])).toBe(
      "1 dossier ouvert, 1 pièce obligatoire à réunir et 2 exigences à lever.",
    );
  });

  it("dit « rien ne bloque » quand rien ne bloque", () => {
    expect(resumeDuJour([dossier(resultat(0))])).toBe("1 dossier ouvert, rien ne bloque un dépôt.");
  });
});

/**
 * La barre d'action et l'en-tête, sur le même écran — C-09.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * `libelleBlocage` ne comptait que des pièces. Depuis que le calcul des
 * écrans évalue les conditions de la règle figée, C-09 affichait les deux
 * phrases ensemble, à quelques lignes d'écart :
 *
 *     en-tête : « 1 exigence n'est pas remplie »
 *     blocage : « Rien ne bloque le dépôt »
 *     palier  : INCOMPLET — prêt : false
 */
describe("la barre d'action ne contredit pas l'en-tête", () => {
  const pieces = (bloquantes: number): Piece[] => [
    ...Array.from({ length: bloquantes }, (_, i) => piece(`manquante_${i}`, "ATTENDUE")),
    piece("passeport", "CONFORME"),
  ];

  it("n'annonce pas « rien ne bloque » quand une exigence bloque", () => {
    expect(libelleBlocage(pieces(0), 1)).toBe("1 exigence bloque le dépôt");
  });

  it("nomme les deux, et accorde le verbe sur l'ensemble", () => {
    expect(libelleBlocage(pieces(1), 1)).toBe("1 pièce et 1 exigence bloquent le dépôt");
    expect(libelleBlocage(pieces(2), 3)).toBe("2 pièces et 3 exigences bloquent le dépôt");
  });

  it("garde ses phrases d'origine quand aucune exigence n'est en jeu", () => {
    expect(libelleBlocage(pieces(0))).toBe("Rien ne bloque le dépôt");
    expect(libelleBlocage(pieces(1))).toBe("1 pièce bloque le dépôt");
    expect(libelleBlocage(pieces(2))).toBe("2 pièces bloquent le dépôt");
  });

  it("dit la même chose que l'en-tête sur le même dossier", () => {
    const { compteurs } = resultat(1);

    expect(libelleDenombrement(compteurs)).toContain("exigence");
    expect(libelleBlocage(pieces(0), compteurs.exigencesNonTenues)).toContain("exigence");
  });
});

/**
 * Ce qu'il reste à préparer avant un rendez-vous — T-05.
 *
 * La phrase la plus coûteuse de la famille : elle prépare un appel payant
 * de quarante-cinq minutes. Sur un dossier dont toutes les pièces sont
 * conformes et qu'une exigence tient à « incomplet », elle disait :
 *
 *     « Toutes les pièces demandées sont conformes : l'appel peut porter
 *       sur le fond du dossier. »
 *
 * Le candidat entrait dans l'appel en croyant n'avoir rien à y régler, et
 * le seul sujet qui restait n'était pas nommé — alors que c'est
 * exactement ce qu'un consultant sait débloquer et pas la plateforme.
 */
describe("ce qu'il reste à préparer avant un rendez-vous", () => {
  const conformes = [piece("passeport", "CONFORME"), piece("preuve_fonds", "CONFORME")];

  it("nomme l'exigence plutôt que d'annoncer un dossier sans reste", () => {
    const phrase = libelleAPreparer(conformes, 1);

    expect(phrase).not.toContain("l'appel peut porter sur le fond");
    expect(phrase).toBe(
      "1 exigence de la règle de ton dossier reste à lever, et aucune pièce ne la lève : c'est le premier sujet à porter à l'appel.",
    );
  });

  it("met l'exigence avant les pièces : elle ne se règle pas en téléversant", () => {
    const phrase = libelleAPreparer([...conformes, piece("diplome", "ATTENDUE")], 1);

    expect(phrase.indexOf("exigence")).toBeLessThan(phrase.indexOf("diplome"));
    expect(phrase).toContain("1 pièce obligatoire reste à traiter : diplome.");
  });

  it("accorde au pluriel", () => {
    expect(libelleAPreparer(conformes, 2)).toContain(
      "2 exigences de la règle de ton dossier restent à lever, et aucune pièce ne les lève",
    );
  });

  it("garde sa phrase d'origine quand rien ne reste", () => {
    expect(libelleAPreparer(conformes)).toBe(
      "Toutes les pièces demandées sont conformes : l'appel peut porter sur le fond du dossier.",
    );
  });
});
