import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Checklist } from "@/app/(app)/(dossier)/dossiers/[id]/Checklist";
import { aideDeLEtape } from "@/domain/dossiers/aide-de-letape";
import { Completude } from "@/app/(app)/(dossier)/dossiers/[id]/completude/Completude";
import { Echeancier } from "@/app/(app)/(dossier)/dossiers/[id]/echeancier/Echeancier";
import { ECHEANCES_NL } from "@/lib/contenu/dossiers";
import {
  evaluerLeCalendrier,
  premiereDateCibleTenable,
} from "@/domain/dossiers/faisabilite";
import { PieceDuDossier } from "@/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier";
import { Cloture } from "@/app/(app)/(dossier)/dossiers/[id]/cloture/Cloture";
import { Depot } from "@/app/(app)/(dossier)/dossiers/[id]/depot/Depot";
import { DemandeDeCorrection } from "@/app/(app)/(dossier)/dossiers/[id]/DemandeDeCorrection";
import { CONSERVATION_SOUMIS_MOIS } from "@/domain/dossiers/conservation";
import { PREFERENCES_PAR_DEFAUT, phraseDesRappels } from "@/domain/dossiers/preferences-rappels";
import {
  ANALYSE_RESSOURCES,
  PIECES_NL,
  QUOTA,
  dossierParId,
} from "@/lib/contenu/dossiers";
import { LIBELLE_PALIER } from "@/domain/completeness/score";
import { VALEUR_NON_LUE } from "@/domain/dossiers/analyse";
import { MENTION_AU_CHOIX, SANS_EXIGENCE_CHIFFREE } from "@/domain/dossiers/verification";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

const DOSSIER = dossierParId("nl-4471")!;

/**
 * Les pages lisent la base ; les composants rendent. Les tests d'écran
 * portent donc sur les composants, avec les données du contenu de
 * référence — ce qui les rend vérifiables sans base de données, et vérifie
 * autre chose que la lecture.
 */
const AUJOURDHUI = "2026-09-18";
/** Les réglages d'origine, sur un transport qui a prouvé qu'il envoie. */
const RAPPELS = phraseDesRappels(PREFERENCES_PAR_DEFAUT, "OPERATIONNEL");

const attestation = PIECES_NL.find((p) => p.id === "attestation-de-ressources")!;
const motivation = PIECES_NL.find((p) => p.id === "lettre-motivation")!;
const passeport = PIECES_NL.find((p) => p.id === "passeport")!;

const rendrePiece = (props: Partial<Parameters<typeof PieceDuDossier>[0]> = {}) =>
  render(
    <PieceDuDossier
      dossier={DOSSIER}
      piece={attestation}
      quota={QUOTA}
      analyse={ANALYSE_RESSOURCES}
      prixRecharge="3 000 F"
      volumeRecharge={10}
      {...props}
    />,
  );

/**
 * Le dossier témoin, rendu — toutes les pièces conformes, une exigence de
 * la règle figée qu'aucune pièce ne lève.
 *
 * Les deux écrans qui portent une barre d'action le rendent, et aucun n'a
 * le droit d'y écrire « Rien ne bloque le dépôt ».
 */
const conformes = PIECES_NL.map((p) => ({ ...p, etat: "CONFORME" as const }));
const DOSSIER_BLOQUE = {
  ...DOSSIER,
  completude: {
    palier: "INCOMPLET" as const,
    ready: false,
    missing: [
      {
        code: "attestation_prealable",
        message: "L'autorité exige une attestation préalable de l'établissement.",
        bloquant: true,
        origine: "exigence" as const,
      },
    ],
    compteurs: {
      obligatoiresManquantes: 0,
      exigencesNonTenues: 1,
      facultativesManquantes: 0,
      conformes: conformes.length,
    },
  },
};

describe("C-06 — Checklist", () => {
  /**
   * La fausse alarme que le nom du champ produisait.
   *
   * Le dossier vise la rentrée du 15 avril ; le dépôt tombe au 15 janvier.
   * Une pièce qui expire le 1er mars est valable le jour du dépôt — et la
   * checklist annonçait « Expire le 1er mars 2027, avant le dépôt visé »,
   * parce qu'on lui passait la rentrée. Trois mois de fenêtre, et un
   * candidat qui refait une pièce pour rien.
   */
  it("n'alarme pas sur une pièce valable le jour du dépôt", () => {
    const entreLesDeux = PIECES_NL.map((p) =>
      p.id === "test-anglais" ? { ...p, perimeLe: "2027-03-01" } : p,
    );
    const { container } = render(
      <Checklist dossier={DOSSIER} pieces={entreLesDeux} />,
    );
    expect(DOSSIER.depot).toBe("2027-01-15");
    expect(DOSSIER.departVise).toBe("2027-04-15");
    expect(container.textContent).not.toContain("avant le dépôt visé");
    expect(container.textContent).toContain("Valable jusqu'au 1 mars 2027");
  });

  it("alarme bien sur une pièce périmée avant le dépôt", () => {
    const tropTot = PIECES_NL.map((p) =>
      p.id === "test-anglais" ? { ...p, perimeLe: "2026-12-01" } : p,
    );
    const { container } = render(<Checklist dossier={DOSSIER} pieces={tropTot} />);
    expect(container.textContent).toContain("avant le dépôt visé");
  });

  /**
   * K.A, tranché le 20/09/2026 — l'espace dossier porte une aide, jamais
   * une offre.
   */
  it("n'affiche aucune offre commerciale, quoi qu'on lui passe", () => {
    const { container } = render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/commission|partenaire|prestation/iu);
  });

  /**
   * Trouvé à l'écran, pas en relisant le code : l'encadré d'aide suivait
   * « Prochaine action : ajouter ton passeport », et se lisait comme la
   * suite de cette phrase alors qu'il parlait de l'assurance maladie. Une
   * aide qui ne nomme pas son étape en désigne une autre.
   */
  it("l'aide de l'étape nomme la pièce dont elle parle", () => {
    const aide = aideDeLEtape("assurance_maladie", "Assurance maladie");
    expect(aide).not.toBeNull();
    const { container } = render(
      <Checklist dossier={DOSSIER} pieces={PIECES_NL} aide={aide} />,
    );
    const encadre = screen.getByRole("heading", { name: aide!.titre }).parentElement!;
    expect(encadre.textContent).toContain("Assurance maladie");
    // Et rien de commercial n'est entré par cette porte.
    expect(container.textContent).not.toMatch(/commission|partenaire/iu);
  });

  it("affiche un palier et un dénombrement, jamais une note sur cent", async () => {
    const { container } = render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(screen.getAllByText(LIBELLE_PALIER.INCOMPLET).length).toBeGreaterThan(0);
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/\d\s?\/\s?100/);
    expect(texte).not.toMatch(/\d\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
  });

  it("range les pièces en obligatoires et complémentaires, avec l'avancement", async () => {
    render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(screen.getByText("Obligatoires")).toBeDefined();
    expect(screen.getByText("3 sur 5 conformes")).toBeDefined();
    expect(screen.getByText("Complémentaires")).toBeDefined();
  });

  it("fait de chaque ligne un lien atteignable au clavier (règle 5)", async () => {
    render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    const ligne = screen.getByRole("link", { name: /Passeport/ });
    expect(ligne.getAttribute("href")).toBe("/dossiers/nl-4471/pieces/passeport");
  });

  it("garde le constat suivi de l'action sur une pièce à corriger", async () => {
    render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(screen.getByText(/Lance le renouvellement avant de déposer/)).toBeDefined();
  });

  it("ne dit pas « expire bientôt » d'une pièce valable au-delà du dépôt", async () => {
    const { container } = render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(container.textContent).toContain("Valable jusqu'au 3 mars 2027");
    expect(container.textContent).not.toContain("Expire bientôt");
  });

  it("annonce ce qui bloque, sans parler de pièces à reprendre", async () => {
    const { container } = render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(screen.getByText("2 pièces bloquent le dépôt")).toBeDefined();
    expect(container.textContent).not.toContain("à reprendre");
  });

  it("porte la source et la date de vérification (INV-8)", async () => {
    const { container } = render(<Checklist dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(container.textContent).toMatch(/Information vérifiée le .* source : ind\.nl/);
  });

  /**
   * L'écran se contredisait sur soixante-dix lignes : l'en-tête annonçait
   * « Dossier incomplet — 1 exigence n'est pas remplie », la barre d'action
   * « Rien ne bloque le dépôt ». Elle concluait à partir des seules pièces,
   * qui sont toutes conformes ici.
   */
  it("ne dit pas « rien ne bloque » sous un en-tête qui dit l'inverse", () => {
    const { container } = render(
      <Checklist dossier={DOSSIER_BLOQUE} pieces={conformes} />,
    );
    const texte = container.textContent ?? "";

    expect(texte).toContain("1 exigence n'est pas remplie");
    expect(texte).toContain("1 exigence bloque le dépôt");
    expect(texte).not.toContain("Rien ne bloque le dépôt");
  });
});

describe("C-09 — Complétude", () => {
  it("nomme le palier et dénombre, sans aucune note ni part", async () => {
    const { container } = render(<Completude dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Complétude de ton dossier",
    );
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/\d\s?\/\s?100/);
    expect(texte).not.toMatch(/\d\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
    expect(texte).toContain("2 pièces obligatoires manquent");
  });

  it("met en tête ce qui bloque le dépôt", async () => {
    render(<Completude dossier={DOSSIER} pieces={PIECES_NL} />);
    const bloque = screen.getByRole("heading", { name: "Ce qui bloque le dépôt" })
      .parentElement!.parentElement!;
    expect(within(bloque).getByRole("link", { name: /Passeport/ })).toBeDefined();
    expect(screen.getByRole("heading", { name: "À traiter ensuite" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Déjà conforme" })).toBeDefined();
  });

  it("rappelle qu'un dossier complet n'est pas un dossier accepté", async () => {
    const { container } = render(<Completude dossier={DOSSIER} pieces={PIECES_NL} />);
    expect(container.textContent).toContain("Un dossier complet n'est pas un dossier accepté");
  });

  /**
   * Une section intitulée « ce qui bloque le dépôt » doit énumérer ce qui
   * bloque le dépôt. Elle n'affichait que des pièces : sur un dossier dont
   * toutes les pièces sont conformes et qu'une exigence de la règle figée
   * tient à « incomplet », elle annonçait « aucune pièce obligatoire ne
   * manque » — vrai sur les pièces, et muet sur le seul blocage.
   */
  describe("quand une exigence de la règle bloque", () => {
    const bloque = DOSSIER_BLOQUE;

    it("énumère l'exigence avec son message, là où l'écran promet les blocages", () => {
      const { container } = render(<Completude dossier={bloque} pieces={conformes} />);

      expect(
        screen.getByRole("heading", { name: "Exigence de la règle à lever" }),
      ).toBeDefined();
      expect(container.textContent).toContain(
        "L'autorité exige une attestation préalable de l'établissement.",
      );
    });

    it("dit qu'aucune pièce ne la lève, pour ne pas envoyer chercher", () => {
      const { container } = render(<Completude dossier={bloque} pieces={conformes} />);
      expect(container.textContent).toContain("Aucune pièce de ta checklist ne lève");
    });

    it("ne propose aucun lien : un dépôt ne lève pas une exigence", () => {
      render(<Completude dossier={bloque} pieces={conformes} />);
      const section = screen
        .getByRole("heading", { name: "Exigence de la règle à lever" })
        .parentElement!;
      expect(within(section).queryByRole("link")).toBeNull();
    });

    it("la barre d'action ne dit plus « rien ne bloque »", () => {
      const { container } = render(<Completude dossier={bloque} pieces={conformes} />);

      expect(container.textContent).toContain("1 exigence bloque le dépôt");
      expect(container.textContent).not.toContain("Rien ne bloque le dépôt");
    });
  });
});

describe("C-07 — Téléversement", () => {
  it("s'ouvre sur le dépôt quand la pièce n'a pas été analysée", () => {
    const { container } = rendrePiece({ piece: motivation, analyse: undefined });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Lettre de motivation");
    expect(screen.getByRole("button", { name: "Ajouter la pièce" })).toBeDefined();
    expect(container.textContent).toContain("Formats acceptés : PDF, JPG, PNG · 10 Mo maximum");
  });

  it("compte les analyses restantes et prévient qu'une nouvelle version en coûte une", () => {
    const { container } = rendrePiece({ piece: motivation, analyse: undefined });
    expect(container.textContent).toContain("Analyses restantes : 12 sur 30");
    expect(container.textContent).toContain(
      "Une nouvelle version de la même pièce consomme une analyse",
    );
  });

  it("laisse le dépôt ouvert quand le quota est épuisé", () => {
    const { container } = rendrePiece({
      piece: motivation,
      analyse: undefined,
      quota: { ...QUOTA, restantes: 0 },
    });
    expect(container.textContent).toContain("Tes 30 analyses du pack Dossier sont utilisées");
    expect(screen.getByRole("button", { name: "Téléverser sans analyse" })).toBeDefined();
    expect(container.textContent).toContain("Une recharge de 10 analyses coûte 3 000 F.");
    expect(container.textContent).toContain("Téléversement toujours possible sans analyse");
  });

  /**
   * S.88 — sur un dossier Essentiel, deux gestes sous deux noms : la
   * recharge ajoute des analyses, le passage à Dossier change la
   * couverture. Aucun ne se présente comme l'autre.
   */
  it("distingue « Ajouter des analyses » de « Passer à Dossier »", () => {
    rendrePiece({
      piece: motivation,
      analyse: undefined,
      quota: { ...QUOTA, restantes: 0 },
      prixPassage: "10 000 F",
    });
    const recharge = screen.getByRole("link", { name: "Ajouter des analyses" });
    expect(recharge.getAttribute("href")).toMatch(/achat=recharge$/u);
    const passage = screen.getByRole("link", { name: "Passer à Dossier — 10 000 F" });
    expect(passage.getAttribute("href")).toMatch(/achat=montee-dossier$/u);
  });

  it("ne propose pas le passage quand il n'est pas ouvert", () => {
    rendrePiece({ piece: motivation, analyse: undefined, quota: { ...QUOTA, restantes: 0 } });
    expect(screen.queryByRole("link", { name: /Passer à Dossier/u })).toBeNull();
    expect(screen.getByRole("link", { name: "Ajouter des analyses" })).toBeDefined();
  });

  it("donne les conseils de prise de vue avec leurs trois cadrages", () => {
    rendrePiece({ piece: passeport, analyse: undefined });
    expect(screen.getByText(/Coupe le flash/)).toBeDefined();
    expect(screen.getByText("À plat — attendu")).toBeDefined();
    expect(screen.getByText("Reflet — à éviter")).toBeDefined();
  });

  it("n'affiche ni photo ni conseil de cadrage sous une pièce à rédiger", () => {
    // Le prototype montrait « Prendre une photo », les trois cadrages et le
    // conseil du relevé bancaire sur toutes les pièces, lettre de motivation
    // comprise : un conseil hors sujet fait douter des autres.
    const { container } = rendrePiece({ piece: motivation, analyse: undefined });
    expect(screen.queryByText("Prendre une photo")).toBeNull();
    expect(container.textContent).not.toContain("Pour une photo lisible");
    expect(container.textContent).not.toContain("application bancaire");
    expect(container.textContent).toContain("rédige-la avec l'entretien guidé");
  });

  it("garde le conseil propre à la pièce là où il s'applique", () => {
    const { container } = rendrePiece({ piece: attestation, analyse: undefined });
    expect(container.textContent).toContain("application bancaire");
  });

  it("refuse un fichier hors format en disant quoi envoyer", () => {
    rendrePiece({ piece: motivation, analyse: undefined });
    const champ = screen.getByLabelText("Choisir un fichier");
    const fichier = new File(["x"], "releve.docx", { type: "application/msword" });
    fireEvent.change(champ, { target: { files: [fichier] } });
    expect(screen.getByRole("alert").textContent).toContain("n'est pas lu");
  });

  it("passe hors ligne sur l'événement réseau, pas sur un échec d'envoi", () => {
    const { container } = rendrePiece({ piece: motivation, analyse: undefined });
    fireEvent(window, new Event("offline"));
    expect(container.textContent).toContain("Connexion perdue");
    expect(screen.getByRole("button", { name: "Réessayer l'envoi" })).toBeDefined();
    fireEvent(window, new Event("online"));
    expect(container.textContent).not.toContain("Connexion perdue");
  });
});

describe("C-08 — Résultat d'analyse", () => {
  it("s'ouvre sur le verdict quand la pièce a été analysée", () => {
    rendrePiece();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Résultat d'analyse");
    expect(screen.getByText("À corriger")).toBeDefined();
    expect(screen.getByText(ANALYSE_RESSOURCES.titre)).toBeDefined();
  });

  it("montre ce qui a été lu en regard de ce qui est exigé", () => {
    const { container } = rendrePiece();
    expect(screen.getByText("Solde disponible")).toBeDefined();
    expect(screen.getByText("10 000 €")).toBeDefined();
    expect(screen.getByText("preuve fonds annuelle")).toBeDefined();
    expect(container.textContent).toContain("Lecture automatique, susceptible d'erreur");
    expect(screen.getByRole("link", { name: "Signaler une erreur de lecture" })).toBeDefined();
  });

  /*
    L'exigence était une ligne de plus sous « Ce que nous avons lu », et
    `valeurAffichee` rendait son absence « non lue ». Deux fautes en une :
    une exigence ne se lit pas dans le fichier du candidat, et « non lue »
    dit à quelqu'un que sa pièce était illisible sur un point où rien
    n'avait été cherché.
  */
  it("sépare ce que la règle demande de ce qui a été lu", () => {
    rendrePiece();
    const section = screen
      .getByRole("heading", { name: "Ce que la règle demande" })
      .closest("section")!;
    expect(section.textContent).toContain("preuve fonds annuelle");
    expect(
      screen.getByRole("heading", { name: "Ce que nous avons lu" }).closest("section")!.textContent,
    ).not.toContain("preuve fonds annuelle");
    // INV-8 : une exigence citée porte sa source et sa date de vérification.
    expect(section.textContent).toContain("ind.nl");
  });

  it("dit qu'aucun seuil n'est attaché plutôt que « non lue »", () => {
    const { container } = rendrePiece({
      analyse: { ...ANALYSE_RESSOURCES, exigences: [] },
    });
    expect(container.textContent).toContain(SANS_EXIGENCE_CHIFFREE);
    expect(container.textContent).not.toContain(VALEUR_NON_LUE);
  });

  /*
    Quatre seuils de salaire ne sont pas quatre exigences cumulées : un seul
    s'applique, et lequel dépend d'un fait que le dossier ne porte pas.
  */
  it("dit qu'un seul seuil s'applique quand la règle en donne plusieurs", () => {
    const { container } = rendrePiece({
      analyse: {
        ...ANALYSE_RESSOURCES,
        exigences: [
          {
            auChoix: true,
            exigences: [
              { intitule: "salaire min moins 30 ans", valeur: "4 357 EUR", bloquante: true },
              { intitule: "salaire min 30 ans et plus", valeur: "5 942 EUR", bloquante: true },
            ],
          },
        ],
      },
    });
    expect(container.textContent).toContain("4 357 EUR");
    expect(container.textContent).toContain("5 942 EUR");
    expect(container.textContent).toContain(MENTION_AU_CHOIX);
  });

  it("ne vaut jamais décision consulaire", () => {
    const { container } = rendrePiece();
    expect(container.textContent).toContain("Elle ne vaut pas décision consulaire");
  });

  it("renvoie au téléversement d'une autre version", () => {
    rendrePiece();
    fireEvent.click(screen.getByRole("button", { name: "Téléverser une autre version" }));
    expect(screen.getByRole("button", { name: "Ajouter la pièce" })).toBeDefined();
  });
});

describe("C-10 — Échéancier", () => {
  /*
    Le verdict et la proposition sont calculés par le domaine, testé à part.
    Ici l'écran est rendu sur un calendrier qui tient : ces tests-là portent
    sur le calendrier lui-même, pas sur l'alerte.
  */
  const CALENDRIER = {
    aujourdhui: AUJOURDHUI,
    dateCible: DOSSIER.departVise ?? null,
    delaiInstructionJours: 60,
    aObtenir: [],
  };
  const VERDICT = evaluerLeCalendrier(CALENDRIER);
  it("groupe les échéances par mois et dit ce que chaque date implique", async () => {
    const { container } = render(<Echeancier dossier={DOSSIER} echeances={ECHEANCES_NL} aujourdhui={AUJOURDHUI} verdict={VERDICT} proposition={null} rappels={RAPPELS} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Échéancier");
    expect(screen.getByRole("heading", { name: "Octobre 2026" })).toBeDefined();
    expect(container.textContent).toContain(
      "Compte six à huit semaines de délai à la Direction de l'émigration",
    );
  });

  it("marque la pièce périssable comme une date au plus tôt", async () => {
    const { container } = render(<Echeancier dossier={DOSSIER} echeances={ECHEANCES_NL} aujourdhui={AUJOURDHUI} verdict={VERDICT} proposition={null} rappels={RAPPELS} />);
    expect(container.textContent).toContain("Pièce périssable — date au plus tôt");
  });

  it("ne garantit pas les délais administratifs", async () => {
    const { container } = render(<Echeancier dossier={DOSSIER} echeances={ECHEANCES_NL} aujourdhui={AUJOURDHUI} verdict={VERDICT} proposition={null} rappels={RAPPELS} />);
    expect(container.textContent).toContain(
      "des moyennes observées, non garanties",
    );
  });

  /**
   * WF-09 étape 4. L'écran comptait les retards — « 3 échéances sont en
   * retard » — et ne disait jamais que la date de départ n'était plus
   * atteignable. Un décompte n'est pas un diagnostic.
   */
  it("annonce le calendrier mort, nomme la pièce et propose une date", () => {
    const mort = {
      aujourdhui: AUJOURDHUI,
      // Dépôt à venir : c'est la pièce qui déborde, pas la date de dépôt.
      dateCible: "2027-09-01",
      delaiInstructionJours: 60,
      aObtenir: [
        {
          code: "passeport",
          libelle: "Passeport biométrique",
          delaiJours: 400,
          obligatoire: true,
          dejaEnMain: false,
        },
      ],
    };
    const { container } = render(
      <Echeancier
        dossier={DOSSIER}
        echeances={ECHEANCES_NL}
        aujourdhui={AUJOURDHUI}
        verdict={evaluerLeCalendrier(mort)}
        proposition={premiereDateCibleTenable(mort)}
        rappels={RAPPELS}
      />,
    );
    expect(container.textContent).toContain("ne peut plus arriver à temps");
    expect(container.textContent).toContain("Passeport biométrique");
    expect(container.textContent).toContain("première date de départ compatible");
    // Le champ part de la date proposée : rien à recopier.
    const champ = screen.getByLabelText("Nouvelle date de départ visée") as HTMLInputElement;
    expect(champ.value).toBe(premiereDateCibleTenable(mort).date);
    expect(screen.getByRole("button", { name: "Replanifier" })).toBeDefined();
  });

  /**
   * La ligne affirmait « Rappels par email activés » alors que rien n'en
   * envoyait, et le profil ne portait aucun réglage à modifier. Elle a
   * ensuite dit qu'aucun rappel ne partait — vrai tant que rien ne lisait
   * l'échéancier.
   *
   * Les rappels par email partent depuis le 22/09/2026 (WF-09 étape 3).
   * Ce que l'écran doit dire est donc ce qui part **et** ce qui ne part
   * pas : le SMS reste annoncé nulle part comme actif, DOC-11 §346 le
   * prévoit sans qu'aucun fournisseur soit branché, et un candidat qui
   * croirait en recevoir un ne regarderait pas ses emails.
   */
  it("dit ce qui part, à quelle cadence, et ce qui ne part pas", () => {
    const { container } = render(
      <Echeancier
        dossier={DOSSIER}
        echeances={ECHEANCES_NL}
        aujourdhui={AUJOURDHUI}
        verdict={VERDICT}
        proposition={null}
        rappels={RAPPELS}
      />,
    );
    const texte = container.textContent ?? "";
    // Jamais un réglage qui n'existe pas.
    expect(texte).not.toContain("Rappels par email activés");
    // Ce qui part, et sa cadence — RG-09.2.
    expect(texte).toContain("rappel par email");
    expect(texte).toMatch(/chaque semaine/u);
    expect(texte).toMatch(/sept jours/u);
    // Et ce qui ne part pas, dit sans détour.
    expect(texte).toMatch(/Rien n'est\s+envoyé par SMS/u);
  });

  /**
   * S.87 — le lien « modifier » revient, parce que l'écran existe. Et la
   * phrase suit le transport : indisponible, elle ne promet plus l'email.
   */
  it("remet le lien vers le réglage, et ne promet pas un email qui ne part pas", () => {
    const { container } = render(
      <Echeancier
        dossier={DOSSIER}
        echeances={ECHEANCES_NL}
        aujourdhui={AUJOURDHUI}
        verdict={VERDICT}
        proposition={null}
        rappels={phraseDesRappels(PREFERENCES_PAR_DEFAUT, "INDISPONIBLE")}
      />,
    );
    const texte = container.textContent ?? "";
    expect(texte).not.toContain("rappel par email");
    expect(texte).toContain("dans tes alertes");
    expect(texte).toContain("indisponible");
    const lien = screen.getByRole("link", { name: "Modifier mes rappels" });
    expect(lien.getAttribute("href")).toMatch(/^\/compte\/rappels\?retour=/u);
  });

  /** « Changer la date de dépôt » menait à un écran qui ne la change pas. */
  it("remplace le lien inerte par le champ qui écrit vraiment", () => {
    render(
      <Echeancier
        dossier={DOSSIER}
        echeances={ECHEANCES_NL}
        aujourdhui={AUJOURDHUI}
        verdict={VERDICT}
        proposition={null}
        rappels={RAPPELS}
      />,
    );
    expect(screen.queryByRole("link", { name: "Changer la date de dépôt" })).toBeNull();
    expect(screen.getByLabelText("Nouvelle date de départ visée")).toBeDefined();
  });

  it("dit ce qu'il manque au brouillon plutôt que d'afficher un calendrier vide", () => {
    const brouillon = dossierParId("de-8820")!;
    const { container } = render(
      <Echeancier dossier={brouillon} echeances={[]} aujourdhui={AUJOURDHUI} verdict={VERDICT} proposition={null} rappels={RAPPELS} />,
    );
    expect(container.textContent).toContain("L'échéancier attend ta date de départ");
  });
});

describe("C-11 — Clôture", () => {
  it("ne présélectionne aucune issue et explique le bouton désactivé", () => {
    render(<Cloture dossier={DOSSIER} />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
    const bouton = screen.getByRole("button", { name: "Clôturer mon dossier" });
    expect(bouton).toHaveProperty("disabled", true);
    expect(screen.getByText(/Choisis d'abord l'issue/)).toBeDefined();
  });

  it("pose la question du détail seulement là où elle apprend quelque chose", () => {
    render(<Cloture dossier={DOSSIER} />);
    fireEvent.click(screen.getByRole("radio", { name: /J'ai obtenu mon visa/ }));
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /Ma demande a été refusée/ }));
    expect(screen.getByLabelText("Quel motif de refus a été indiqué ?")).toBeDefined();
  });

  it("annonce la purge comme une garantie, avec son délai (INV-5)", () => {
    const { container } = render(<Cloture dossier={DOSSIER} />);
    expect(container.textContent).toContain("supprimées de nos serveurs sous 30 jours");
    expect(
      screen.getByRole("link", { name: "Télécharger mon dossier" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: /J'ai obtenu mon visa/ }));
    expect(container.textContent).toContain("Tes pièces seront supprimées sous 30 jours");
  });
});

/**
 * C-11a — Déclaration de dépôt, WF-10 étape 1.
 *
 * La route existait, aucun écran ne l'appelait : aucun dossier ne pouvait
 * devenir « Déposé » par l'interface, et la conservation de l'arbitrage
 * S.78 restait hors du parcours.
 */
describe("C-11a — Déclaration de dépôt", () => {
  const PRET = { ...DOSSIER, statut: "PRET" as const };
  const JOURS = { aujourdhui: "2026-09-25", ouvertLe: "2026-06-01" };

  it("ne pré-coche pas la déclaration, et dit pourquoi le bouton attend", () => {
    render(<Depot dossier={PRET} {...JOURS} />);
    const bouton = screen.getByRole("button", { name: "Déclarer mon dépôt" });
    expect(bouton).toHaveProperty("disabled", true);
    expect(screen.getByText(/Coche d'abord la case/)).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Déclarer mon dépôt" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("dit ce que la déclaration fige, ce qu'elle conserve, et que rien n'est transmis (INV-1)", () => {
    const { container } = render(<Depot dossier={PRET} {...JOURS} />);
    const texte = container.textContent ?? "";
    expect(texte).toContain(`conservées ${CONSERVATION_SOUMIS_MOIS} mois`);
    expect(texte).toContain("ImmiPro ne transmet aucune demande");
    expect(texte).toContain("ne s'annule pas");
  });

  /**
   * S.89 — la date réelle du dépôt : question, aide, préremplie avec le
   * jour du candidat, modifiable, et refusée avant l'envoi quand elle est
   * future ou antérieure à l'ouverture du dossier.
   */
  it("demande la date réelle du dépôt, préremplie avec aujourd'hui", () => {
    const { container } = render(<Depot dossier={PRET} {...JOURS} />);
    const champ = screen.getByLabelText("Quand as-tu déposé ta demande ?") as HTMLInputElement;
    expect(champ.value).toBe("2026-09-25");
    expect(champ.required).toBe(true);
    expect(champ.max).toBe("2026-09-25");
    expect(champ.min).toBe("2026-06-01");
    expect(container.textContent).toContain(
      "Indique la date où tu as remis ou envoyé la demande à l'autorité ou à son prestataire.",
    );
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
  });

  it("refuse une date future ou antérieure à l'ouverture, avec la raison", () => {
    render(<Depot dossier={PRET} {...JOURS} />);
    fireEvent.click(screen.getByRole("checkbox"));
    const champ = screen.getByLabelText("Quand as-tu déposé ta demande ?");
    fireEvent.change(champ, { target: { value: "2026-09-30" } });
    expect(screen.getByText(/n'est pas encore arrivé/u)).toBeDefined();
    expect(screen.getByRole("button", { name: "Déclarer mon dépôt" })).toHaveProperty("disabled", true);
    fireEvent.change(champ, { target: { value: "2026-05-20" } });
    expect(screen.getByText(/le dépôt ne peut pas le précéder/u)).toBeDefined();
    // Une date ancienne mais valide passe : aucun retard n'est refusé.
    fireEvent.change(champ, { target: { value: "2026-06-02" } });
    expect(screen.getByRole("button", { name: "Déclarer mon dépôt" })).toHaveProperty("disabled", false);
  });

  it("envoie la date saisie, pas celle du jour", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ statut: "SOUMIS" }) } as Response),
    );
    global.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<Depot dossier={PRET} {...JOURS} />);
    fireEvent.change(screen.getByLabelText("Quand as-tu déposé ta demande ?"), {
      target: { value: "2026-09-02" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Déclarer mon dépôt" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ deposeLe: "2026-09-02" });
  });

  /**
   * S.90 — la date déclarée ne se modifie pas depuis le dossier : le
   * candidat la signale, et l'écran dit ensuite que la demande attend.
   */
  it("permet de signaler une date de dépôt erronée, sans la modifier", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ deposeLe: "2026-09-01", message: "Demande enregistrée : un membre de l'équipe la vérifie." }),
      } as Response),
    );
    global.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<DemandeDeCorrection dossierId="nl-1" deposeLe="2026-09-10" enAttente={null} />);
    fireEvent.click(screen.getByRole("button", { name: "La date de ton dépôt est fausse ?" }));
    const bouton = () => screen.getByRole("button", { name: "Demander la correction" });
    expect(bouton()).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Date réelle de ton dépôt"), { target: { value: "2026-09-01" } });
    expect(bouton()).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("D'où vient l'erreur ?"), {
      target: { value: "Mon récépissé porte le 1er septembre." },
    });
    fireEvent.click(bouton());
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Demande enregistrée"));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/dossiers/nl-1/depot/correction");
    expect(JSON.parse(String(init.body))).toEqual({
      deposeLe: "2026-09-01",
      explication: "Mon récépissé porte le 1er septembre.",
    });
  });

  it("dit qu'une demande attend, sans rouvrir le formulaire", () => {
    render(
      <DemandeDeCorrection
        dossierId="nl-1"
        deposeLe="2026-09-10"
        enAttente={{ deposeLe: "2026-09-01", demandeeLe: "2026-09-25" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("la date enregistrée reste celle que tu avais déclarée");
    expect(screen.queryByRole("button", { name: /date de ton dépôt est fausse/u })).toBeNull();
  });

  it("n'offre aucun bouton à un dossier qui n'est pas prêt, et dit pourquoi", () => {
    for (const statut of ["ACTIF", "EN_PAUSE", "SOUMIS", "CLOTURE"] as const) {
      const { container, unmount } = render(<Depot dossier={{ ...DOSSIER, statut }} {...JOURS} />);
      expect(screen.queryByRole("button", { name: "Déclarer mon dépôt" }), statut).toBeNull();
      expect(screen.getByRole("link", { name: "Revenir à la checklist" }), statut).toBeDefined();
      expect((container.textContent ?? "").length, statut).toBeGreaterThan(80);
      unmount();
    }
  });

  it("la checklist d'un dossier prêt y mène, et seulement elle", () => {
    const { unmount } = render(<Checklist dossier={PRET} pieces={PIECES_NL} />);
    expect(screen.getByRole("link", { name: "Déclarer mon dépôt" }).getAttribute("href")).toBe(
      `/dossiers/${DOSSIER.id}/depot`,
    );
    unmount();
    render(<Checklist dossier={{ ...DOSSIER, statut: "ACTIF" }} pieces={PIECES_NL} />);
    expect(screen.queryByRole("link", { name: "Déclarer mon dépôt" })).toBeNull();
  });
});

/**
 * Test de bout en bout du 03/10/2026 : le dépôt n'aboutissait pas, et
 * l'autorisation de traiter les pièces d'identité ne pouvait pas être
 * donnée depuis l'écran de dépôt.
 */
describe("C-08 — l'autorisation des pièces d'identité se donne sur place", () => {
  it("sans autorisation, la case est là, décochée, et le dépôt attend", () => {
    rendrePiece({ piece: passeport, analyse: undefined, autorise: false });
    const caseAutorisation = screen.getByRole("checkbox", {
      name: /^J'autorise l'analyse de mes pièces d'identité/,
    });
    expect(caseAutorisation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Ajouter la pièce" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Mes consentements" })).toHaveAttribute(
      "href",
      "/consentements",
    );
  });

  it("cocher enregistre l'autorisation, et la case ne revient pas", async () => {
    const appels: { url: string; corps: unknown }[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      appels.push({ url, corps: JSON.parse(String(options?.body)) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ code: "pieces_identite", accorde: true }),
      } as Response);
    });
    rendrePiece({ piece: passeport, analyse: undefined, autorise: false });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /^J'autorise l'analyse de mes pièces d'identité/ }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: /J'autorise l'analyse/ })).toBeNull(),
    );
    expect(appels).toEqual([
      { url: "/api/comptes/consentements", corps: { code: "pieces_identite", accorde: true } },
    ]);
    expect(screen.getByRole("button", { name: "Ajouter la pièce" })).toBeEnabled();
  });

  it("avec l'autorisation, aucune case ; et aucune date d'autorisation inventée", () => {
    const { container } = rendrePiece({ piece: passeport, analyse: undefined, autorise: true });
    expect(screen.queryByRole("checkbox", { name: /J'autorise l'analyse/ })).toBeNull();
    expect(container.textContent).not.toMatch(/11\/09\/2026/u);
    expect(container.textContent).not.toMatch(/Tu as autorisé/u);
  });
});
