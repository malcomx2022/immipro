import { describe, expect, it } from "vitest";
import { computeCompleteness, versClient } from "@/domain/completeness/score";
import { libelleDenombrement } from "@/components/ui/CompletenessTier";
import {
  CE_QUI_DECIDE,
  CE_QUI_NE_PESE_PAS,
  expliquerLaCompletude,
} from "@/domain/completeness/explication";
import { resumeDuJour, type Dossier } from "@/domain/dossiers/dossier";
import { prochaineAction } from "@/server/vue/dossier";
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
  const compteurs = (obligatoiresManquantes: number, exigencesNonTenues: number) => ({
    obligatoiresManquantes,
    exigencesNonTenues,
  });

  it("n'annonce pas « rien ne bloque » quand une exigence bloque", () => {
    expect(libelleBlocage(compteurs(0, 1))).toBe("1 exigence bloque le dépôt");
  });

  it("nomme les deux, et accorde le verbe sur l'ensemble", () => {
    expect(libelleBlocage(compteurs(1, 1))).toBe("1 pièce et 1 exigence bloquent le dépôt");
    expect(libelleBlocage(compteurs(2, 3))).toBe("2 pièces et 3 exigences bloquent le dépôt");
  });

  it("garde ses phrases d'origine quand aucune exigence n'est en jeu", () => {
    expect(libelleBlocage(compteurs(0, 0))).toBe("Rien ne bloque le dépôt");
    expect(libelleBlocage(compteurs(1, 0))).toBe("1 pièce bloque le dépôt");
    expect(libelleBlocage(compteurs(2, 0))).toBe("2 pièces bloquent le dépôt");
  });

  /*
    Les deux phrases lisent désormais le même objet, et c'est tout
    l'intérêt : le test ne peut plus les faire diverger même en le
    voulant. Il reste parce qu'il dit ce que l'écran affiche.
  */
  it("dit la même chose que l'en-tête sur le même dossier", () => {
    const { compteurs: mesure } = resultat(1);

    expect(libelleDenombrement(mesure)).toContain("exigence");
    expect(libelleBlocage(mesure)).toContain("exigence");
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
    const phrase = libelleAPreparer(conformes, { obligatoiresManquantes: 0, exigencesNonTenues: 1 });

    expect(phrase).not.toContain("l'appel peut porter sur le fond");
    expect(phrase).toBe(
      "1 exigence de la règle de ton dossier reste à lever, et aucune pièce ne la lève : c'est le premier sujet à porter à l'appel.",
    );
  });

  it("met l'exigence avant les pièces : elle ne se règle pas en téléversant", () => {
    const phrase = libelleAPreparer([...conformes, piece("diplome", "ATTENDUE")], {
      obligatoiresManquantes: 1,
      exigencesNonTenues: 1,
    });

    expect(phrase.indexOf("exigence")).toBeLessThan(phrase.indexOf("diplome"));
    expect(phrase).toContain("1 pièce obligatoire reste à traiter : diplome.");
  });

  it("accorde au pluriel", () => {
    expect(
      libelleAPreparer(conformes, { obligatoiresManquantes: 0, exigencesNonTenues: 2 }),
    ).toContain(
      "2 exigences de la règle de ton dossier restent à lever, et aucune pièce ne les lève",
    );
  });

  it("garde sa phrase d'origine quand rien ne reste", () => {
    expect(
      libelleAPreparer(conformes, { obligatoiresManquantes: 0, exigencesNonTenues: 0 }),
    ).toBe(
      "Toutes les pièces demandées sont conformes : l'appel peut porter sur le fond du dossier.",
    );
  });
});

/**
 * Le dossier témoin — le garde-fou, plutôt qu'un sixième correctif.
 *
 * ── Ce que six lots ont appris ──────────────────────────────────────
 *
 * Six phrases ont conclu tour à tour à partir des seules pièces : la
 * section des blocages de C-09, sa barre d'action, l'en-tête de
 * dénombrement, le résumé du tableau de bord, le texte de préparation
 * d'un rendez-vous payant, et enfin la barre d'action de C-06 — trouvée
 * par le compilateur, une fois la valeur par défaut retirée. Chacune
 * était rassurante, et chacune l'était sur le seul dossier qu'on ne
 * pouvait pas déposer. Les cinq premières ont été trouvées une par une,
 * chaque correctif produisant la suivante.
 *
 * Le dossier témoin est ce cas-là, écrit une fois : toutes les pièces
 * conformes, une exigence de la règle figée qu'aucune pièce ne lève. Rien
 * de ce que la plateforme dit d'un tel dossier n'a le droit de rassurer.
 *
 * ── Pourquoi un tableau et non six tests ───────────────────────────
 *
 * Le tableau nomme l'invariant au lieu de le répéter, et c'est l'endroit
 * où une septième phrase s'ajoute. Il ne prétend pas la découvrir : aucun
 * test ne lit les sources ici — la leçon de S.1 est qu'un test qui grep
 * le dépôt vérifie l'écriture et non le comportement. Ce qui rend
 * l'omission impossible est ailleurs, dans le type `CompteursDeBlocage` :
 * une phrase qui conclut ne compile plus sans les deux nombres qui
 * décident.
 */
describe("le dossier témoin — toutes les pièces conformes, une exigence en travers", () => {
  const pieces: Piece[] = [
    piece("passeport", "CONFORME"),
    piece("preuve_fonds", "CONFORME"),
  ];
  const completude = resultat(1);
  const { compteurs } = completude;

  const dossier = {
    id: "d",
    destination: { slug: "s", pays: "P", resume: "", autorite: "" },
    statut: "ACTIF",
    completude,
    prochaineAction: "",
    pieces: [],
  } as unknown as Dossier;

  /** Ce qu'aucune de ces phrases n'a le droit de dire sur ce dossier. */
  const RASSURANT =
    /rien ne bloque|toutes les pièces demandées sont conformes|aucune pièce obligatoire ne manque/iu;

  const conclusions: readonly { ou: string; phrase: string }[] = [
    { ou: "C-09 — en-tête de dénombrement", phrase: libelleDenombrement(compteurs) },
    { ou: "C-06 et C-09 — barre d'action", phrase: libelleBlocage(compteurs) },
    { ou: "T-05 — préparation du rendez-vous", phrase: libelleAPreparer(pieces, compteurs) },
    { ou: "C-01 — résumé du tableau de bord", phrase: resumeDuJour([dossier]) },
    {
      ou: "C-01 et C-06 — prochaine action",
      phrase: prochaineAction(pieces, "ACTIF", completude),
    },
  ];

  it.each(conclusions)("$ou ne rassure pas", ({ phrase }) => {
    expect(phrase).not.toMatch(RASSURANT);
  });

  /*
    Le palier est la conclusion que toutes les autres paraphrasent. S'il
    passait à COMPLET, chacune des phrases ci-dessus aurait raison de
    rassurer, et le tableau vérifierait le contraire de ce qu'il croit.
  */
  it("le palier lui-même tient le dossier à incomplet", () => {
    expect(completude.palier).toBe("INCOMPLET");
    expect(completude.ready).toBe(false);
  });

  /*
    Le contrôle négatif : sans l'exigence, ces mêmes phrases rassurent, et
    c'est correct. Sans lui, le tableau passerait aussi sur une version du
    code qui ne sait plus rien dire du tout.
  */
  it("les mêmes phrases rassurent quand plus rien ne bloque", () => {
    const sans = resultat(0);
    const apaise = { ...dossier, completude: sans } as Dossier;

    expect(libelleBlocage(sans.compteurs)).toMatch(RASSURANT);
    expect(libelleAPreparer(pieces, sans.compteurs)).toMatch(RASSURANT);
    expect(resumeDuJour([apaise])).toMatch(RASSURANT);
    expect(prochaineAction(pieces, "ACTIF", sans)).toMatch(RASSURANT);
  });
});
