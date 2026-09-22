import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChoixDeLaPiece } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/ChoixDeLaPiece";
import { Redaction } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/Redaction";
import { Relecture } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/relecture/Relecture";
import { REMARQUES_MOTIVATION } from "@/lib/contenu/redaction";
import type { Remarque } from "@/domain/redaction/relecture";
import {
  AUCUN_RECOUPEMENT,
  destinationNommee,
  recoupements,
  type Recoupements,
} from "@/domain/redaction/coherence";
import { Alertes } from "@/app/(app)/(dossier)/notifications/Alertes";
import { Services } from "@/app/(app)/(dossier)/services/Services";
import { dossierParId } from "@/lib/contenu/dossiers";
import {
  PIECES_REDIGEABLES,
  SUGGESTION_EN_ATTENTE,
  VERSIONS_MOTIVATION,
} from "@/lib/contenu/redaction";
import {
  ALERTES,
  MOTIF_PARTENAIRE,
  PARTENAIRE,
  REGLE_ANCIENNE,
  REGLE_NOUVELLE,
} from "@/lib/contenu/alertes";
import { tauxCommissionFormate } from "@/domain/payments/pricing";

/**
 * L'appel réseau, remplacé — R-02.
 *
 * Les garde-fous qui lisent le source ne suffisent pas : on peut
 * débrancher `conserverPuis` des boutons en laissant la fonction intacte
 * plus bas dans le fichier, et tout test qui l'inspecte passe encore.
 * C'est la leçon de S.1, sur B-02.
 */
const appels: { url: string; corps: unknown; methode?: string }[] = [];
let reponse: { ok: boolean } = { ok: true };
vi.mock("@/lib/api", () => ({
  appeler: (url: string, options: { corps?: unknown; methode?: string } = {}) => {
    appels.push({ url, corps: options.corps, methode: options.methode });
    return Promise.resolve(
      reponse.ok
        ? { ok: true, donnees: {} }
        : {
            ok: false,
            echec: {
              titre: "Le serveur a refusé",
              corps: "Motif de test.",
              conserve: "Ta saisie est là.",
              action: "Réessayer",
              ton: "echec",
            },
          },
    );
  },
}));

const pousse = vi.fn();
const rafraichit = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pousse, refresh: rafraichit }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

const DOSSIER = dossierParId("nl-4471")!;
const MOTIVATION = PIECES_REDIGEABLES[0]!;
const MAINTENANT = "2026-09-18T09:41:00Z";
const espaces = (t: string) => t.replace(/[\s  ]/gu, " ");

describe("R-01 — Type de pièce", () => {
  const rendre = () =>
    render(<ChoixDeLaPiece dossier={DOSSIER} pieces={PIECES_REDIGEABLES} />);

  it("ne présélectionne aucune pièce et explique le bouton désactivé", () => {
    rendre();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
    expect(screen.getByRole("button", { name: /Commencer l'entretien/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/Choisis d'abord la pièce/)).toBeDefined();
  });

  it("annonce la limite avant l'engagement, pas après", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Nous n'inventons aucun fait");
    expect(container.textContent).toContain("Nous ne notons pas ton texte");
    expect(container.textContent).toContain("Prévois vingt minutes");
  });

  it("ouvre l'entretien de la pièce choisie", () => {
    rendre();
    fireEvent.click(screen.getByRole("radio", { name: /Lettre de motivation/ }));
    expect(
      screen.getByText("Exigée par Hanze University · 8 questions · environ 16 minutes"),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Commencer l'entretien/ }));
    expect(pousse).toHaveBeenCalledWith("/dossiers/nl-4471/redaction/lettre-motivation");
  });
});

describe("R-02 — Entretien guidé", () => {
  const rendre = () =>
    render(
      <Redaction
        dossier={DOSSIER}
        piece={MOTIVATION}
        reponsesEnregistrees={{}}
        versions={[]}
        redactionDisponible={false}
        maintenant={MAINTENANT}
      />,
    );

  it("s'ouvre sur l'entretien quand la pièce n'a pas de version", () => {
    rendre();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      MOTIVATION.questions[0]!.intitule,
    );
    expect(screen.getByText("Question 1 sur 8")).toBeDefined();
  });

  it("compte des questions, jamais une part", () => {
    const { container } = rendre();
    const barre = screen.getByRole("progressbar");
    expect(barre.getAttribute("aria-valuemax")).toBe("8");
    expect(barre.getAttribute("aria-valuenow")).toBe("1");
    expect(container.textContent).not.toMatch(/\d\s?%/);
    expect(container.textContent).not.toMatch(/\bscore\b/i);
  });

  it("dit pourquoi la question est posée et donne deux repères", () => {
    const { container } = rendre();
    expect(screen.getByText("Pourquoi cette question")).toBeDefined();
    expect(container.textContent).toContain(MOTIVATION.questions[0]!.motif);
    for (const repere of MOTIVATION.questions[0]!.reperes) {
      expect(screen.getByText(repere)).toBeDefined();
    }
  });

  it("encourage sous un champ vide, puis compte les mots", () => {
    rendre();
    expect(screen.getByText("Deux ou trois phrases suffisent.")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Ta réponse"), {
      target: { value: "Licence en gestion" },
    });
    expect(screen.getByText("3 mots écrits")).toBeDefined();
  });

  it("avance, recule, et bloque au début", () => {
    rendre();
    expect(screen.getByRole("button", { name: "Question précédente" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Question suivante" }));
    expect(screen.getByText("Question 2 sur 8")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Question précédente" }));
    expect(screen.getByText("Question 1 sur 8")).toBeDefined();
  });

  it("dit ce qu'une question passée laisse de côté", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("le paragraphe correspondant ne sera pas écrit");
  });
});

/**
 * R-02 conserve vraiment — revue de septembre 2026, S.3.
 *
 * « Tes réponses sont conservées à mesure : tu peux interrompre
 * l'entretien et le reprendre. » La phrase était sous le champ depuis le
 * début, et elle était fausse : l'état partait de `{}`, rien ne quittait
 * le navigateur, et `InterviewAnswer` n'était écrite nulle part.
 */
describe("R-02 — les réponses partent au serveur", () => {
  const preparer = ({ ok = true, deja = {} as Record<number, string> } = {}) => {
    appels.length = 0;
    reponse = { ok };
    render(
      <Redaction
        dossier={DOSSIER}
        piece={MOTIVATION}
        reponsesEnregistrees={deja}
        versions={[]}
        redactionDisponible={false}
        maintenant={MAINTENANT}
      />,
    );
  };

  const cliquer = async (nom: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name: nom }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const repondre = (texte: string) =>
    fireEvent.change(screen.getByLabelText("Ta réponse"), { target: { value: texte } });

  it("quitter une question enregistre la réponse", async () => {
    preparer();
    repondre("J'ai choisi ce programme pour son laboratoire de robotique.");
    await cliquer(/Question suivante|Aller à l'éditeur/u);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.methode).toBe("PUT");
    expect(appels[0]!.url).toBe("/api/dossiers/nl-4471/redaction/lettre-motivation");
    expect(appels[0]!.corps).toEqual({
      rang: 0,
      reponse: "J'ai choisi ce programme pour son laboratoire de robotique.",
    });
  });

  /** La saisie n'écrit pas : une requête par caractère saturerait un réseau lent. */
  it("taper n'envoie rien", () => {
    preparer();
    repondre("Une première phrase");
    repondre("Une première phrase, puis une deuxième");
    expect(appels).toHaveLength(0);
  });

  /**
   * Revenir sur une question pour la relire, sans y toucher, n'écrit
   * rien : c'est ce qui distingue une navigation d'une modification.
   */
  it("une réponse inchangée ne repart pas", async () => {
    preparer({ deja: { 0: "Déjà répondu la semaine dernière." } });
    await cliquer(/Question suivante|Aller à l'éditeur/u);
    expect(appels).toHaveLength(0);
  });

  it("l'entretien reprend sur ce qui est déjà en base", () => {
    preparer({ deja: { 0: "Déjà répondu la semaine dernière." } });
    expect(screen.getByLabelText("Ta réponse")).toHaveValue(
      "Déjà répondu la semaine dernière.",
    );
  });

  /** Passer une question efface ce qu'elle contenait, et ne garde rien de vide. */
  it("vider une réponse la retire", async () => {
    preparer({ deja: { 0: "Une réponse à effacer." } });
    repondre("");
    await cliquer(/Passer cette question/u);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.corps).toEqual({ rang: 0, reponse: "" });
  });

  /**
   * La navigation n'attend pas le réseau : bloquer « Question suivante »
   * le temps d'un aller-retour ferait cliquer deux fois sur un téléphone
   * lent. L'écran avance, l'écriture suit.
   */
  it("l'écran avance sans attendre la réponse", async () => {
    preparer();
    repondre("Une réponse.");
    await cliquer(/Question suivante|Aller à l'éditeur/u);
    expect(screen.getByText(/Question 2 sur/u)).toBeDefined();
  });

  it("un refus s'affiche, et la saisie reste", async () => {
    preparer({ ok: false });
    repondre("Une réponse que le serveur va refuser.");
    await cliquer(/Question suivante|Aller à l'éditeur/u);
    expect(screen.getByText("Le serveur a refusé")).toBeDefined();
  });
});

describe("R-03 — Éditeur et versions", () => {
  const rendre = () =>
    render(
      <Redaction
        dossier={DOSSIER}
        piece={MOTIVATION}
        reponsesEnregistrees={{}}
        versions={VERSIONS_MOTIVATION}
        suggestion={SUGGESTION_EN_ATTENTE}
        redactionDisponible={false}
        maintenant={MAINTENANT}
      />,
    );

  it("s'ouvre sur le texte quand la pièce a déjà des versions", () => {
    rendre();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Lettre de motivation");
    expect(screen.getByText(/Version 3 · modifiée il y a 4 minutes · \d+ mots/)).toBeDefined();
  });

  it("marque la version courante et propose de restaurer les autres", () => {
    rendre();
    expect(screen.getByText("Actuelle")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Restaurer" })).toHaveLength(2);
  });

  it("annonce la purge des versions à la clôture (INV-5)", () => {
    const { container } = rendre();
    expect(container.textContent).toContain(
      "conservées jusqu'à la clôture du dossier, puis supprimées",
    );
  });

  it("pose la suggestion sur son paragraphe, et la laisse ignorer", () => {
    const { container } = rendre();
    expect(screen.getByText(SUGGESTION_EN_ATTENTE.texte)).toBeDefined();
    expect(container.textContent).toContain("1 suggestion en attente");
    fireEvent.click(screen.getByRole("button", { name: "Ignorer" }));
    expect(screen.queryByText(SUGGESTION_EN_ATTENTE.texte)).toBeNull();
    expect(container.textContent).toContain("Aucune suggestion en attente");
  });

  it("renvoie l'entretien depuis la suggestion", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Répondre" }));
    expect(screen.getByText("Question 1 sur 8")).toBeDefined();
  });
});

/**
 * R-03 et R-04 — les écritures, et les vides qui parlaient trop.
 *
 * Tests qui **cliquent** : c'est la leçon de S.1, et elle vaut ici deux
 * fois. Un « Restaurer » peut afficher « Restauration… » sans qu'aucune
 * requête soit partie, et un onglet peut s'appeler « Éditeur » sans porter
 * de champ de saisie — aucun test lisant le source ne l'aurait vu.
 */
describe("R-03 — les versions s'écrivent", () => {
  const rendre = ({ disponible = false, versions = VERSIONS_MOTIVATION } = {}) => {
    appels.length = 0;
    reponse = { ok: true };
    return render(
      <Redaction
        dossier={DOSSIER}
        piece={MOTIVATION}
        reponsesEnregistrees={{ 0: "Une.", 1: "Deux.", 2: "Trois.", 3: "Quatre." }}
        versions={versions}
        redactionDisponible={disponible}
        maintenant={MAINTENANT}
      />,
    );
  };

  /**
   * Sans version, l'écran ouvre sur l'entretien — c'est voulu : la personne
   * est en train d'y répondre, et l'éditeur est là où elle arrive en le
   * terminant. La barre d'onglets n'existe que de l'autre côté.
   */
  const allerALEditeur = () => {
    for (let i = 0; i < MOTIVATION.questions.length; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Passer cette question" }));
    }
  };

  it("porte un vrai champ de saisie, pas des paragraphes en lecture seule", () => {
    rendre();
    const champ = screen.getByLabelText("Ton texte");
    expect(champ.tagName).toBe("TEXTAREA");
    expect((champ as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
  });

  it("enregistre une réécriture, et n'enregistre rien d'inchangé", async () => {
    rendre();
    const champ = screen.getByLabelText("Ton texte");

    // Inchangé : le bouton porte sa raison et ne part pas.
    const bouton = screen.getByRole("button", { name: /Enregistrer une version/ });
    expect(bouton).toHaveProperty("disabled", true);
    expect(screen.getByText(/Rien n'a changé/)).toBeDefined();

    fireEvent.change(champ, { target: { value: "Un texte entièrement réécrit." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enregistrer une version/ }));
    });

    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe(
      "/api/dossiers/nl-4471/redaction/lettre-motivation/version",
    );
    expect(appels[0]!.methode).toBe("POST");
    expect(appels[0]!.corps).toEqual({
      geste: "reecriture",
      texte: "Un texte entièrement réécrit.",
    });
  });

  it("refuse d'enregistrer un texte vide, et dit ce que cela effacerait", () => {
    rendre();
    fireEvent.change(screen.getByLabelText("Ton texte"), { target: { value: "  " } });
    expect(
      screen.getByRole("button", { name: /Enregistrer une version/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/effacerait/)).toBeDefined();
  });

  it("restaure une version antérieure par son rang", async () => {
    rendre();
    const restaurer = screen.getAllByRole("button", { name: "Restaurer" });
    expect(restaurer.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(restaurer[0]!);
    });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.corps).toMatchObject({ geste: "restauration" });
    expect((appels[0]!.corps as { rang: number }).rang).toBeGreaterThan(0);
  });

  /**
   * La dégradation que le registre des dépendances décrit, et qu'aucune
   * ligne ne tenait : l'écran dit ce qui manque plutôt que d'afficher une
   * version vide.
   */
  it("dit que la mise en forme n'est pas disponible, sans proposer de bouton", () => {
    /**
     * Sans version, l'écran ouvre sur l'entretien — c'est voulu : la
     * personne est en train d'y répondre. Le message d'état vit dans
     * l'éditeur, où elle arrive en finissant l'entretien.
     */
    const { container } = rendre({ versions: [] });
    allerALEditeur();
    expect(container.textContent).toContain("La mise en forme n'est pas disponible");
    expect(container.textContent).toContain("rien n'est perdu");
    expect(screen.queryByRole("button", { name: /Proposer un premier texte/ })).toBeNull();
    // Et rien ne renvoie vers une analyse d'un texte qui n'existe pas.
    expect(screen.queryByRole("link", { name: /analyse critique/ })).toBeNull();
  });

  it("propose la mise en forme quand le service est branché", async () => {
    rendre({ disponible: true, versions: [] });
    allerALEditeur();
    appels.length = 0;
    const bouton = screen.getByRole("button", { name: /Proposer un premier texte/ });
    await act(async () => {
      fireEvent.click(bouton);
    });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.corps).toEqual({ geste: "mise-en-forme" });
  });

  it("porte la mention d'aide à la rédaction sous le champ", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("aide à la rédaction");
    expect(container.textContent).toContain("relève de ta responsabilité");
  });

  /**
   * La lettre s'affichait deux fois : le champ n'existait pas, et les
   * paragraphes étaient rendus en lecture seule sous lui. Une seule
   * occurrence, dans le champ — zéro voudrait dire que le texte a disparu.
   */
  it("n'affiche pas le texte en double", () => {
    const { container } = rendre();
    const debut = VERSIONS_MOTIVATION[0]!.paragraphes[0]!.texte.slice(0, 40);
    const occurrences = (container.textContent ?? "").split(debut).length - 1;
    expect(occurrences).toBe(1);
    expect((screen.getByLabelText("Ton texte") as HTMLTextAreaElement).value).toContain(
      debut,
    );
  });
});

describe("R-04 — un vide ne vaut pas un avis", () => {
  const rendre = (props: {
    remarques: readonly Remarque[] | null;
    texteExistant?: boolean;
    recoupements?: Recoupements;
    /** Par défaut absent : ces cas éprouvent ce que l'écran dit sans service. */
    analysePossible?: boolean;
  }) =>
    render(
      <Relecture
        dossier={dossierParId("nl-4471")!}
        type="lettre-motivation"
        remarques={props.remarques}
        recoupements={props.recoupements ?? AUCUN_RECOUPEMENT}
        texteExistant={props.texteExistant ?? true}
        analysePossible={props.analysePossible ?? false}
        relectureLe="2026-09-11"
      />,
    );

  /**
   * Le défaut : la page répondait « Rien à reprendre sur cette version. »
   * alors qu'aucune analyse n'avait tourné, et son bandeau de source le
   * datait. Un avis favorable rendu sans avoir lu.
   */
  it("ne rend aucun avis quand rien n'a été analysé", () => {
    const { container } = rendre({ remarques: null });
    expect(container.textContent).not.toContain("Rien à reprendre");
    expect(container.textContent).toContain("sans l'avoir lu");
    // Le bandeau ne date pas une relecture qui n'a pas eu lieu.
    expect(container.textContent).not.toContain("2026");
    expect(container.textContent).not.toContain("relecture automatique ImmiPro");
  });

  it("dit « rien à reprendre » seulement après avoir lu", () => {
    const { container } = rendre({ remarques: [] });
    expect(container.textContent).toContain("Rien à reprendre");
    expect(container.textContent).toContain("relecture automatique ImmiPro");
  });

  it("dit qu'il n'y a pas encore de texte", () => {
    const { container } = rendre({ remarques: null, texteExistant: false });
    expect(container.textContent).toContain("pas encore de texte à analyser");
    expect(container.textContent).not.toContain("Rien à reprendre");
  });

  /**
   * RG-08.3 — les recoupements déterministes tournent sans service. Un
   * écart trouvé sans analyse ne doit ni disparaître derrière « cette
   * version n'a pas été analysée », ni se présenter comme une relecture.
   */
  it("montre l'écart recoupé alors que le fond n'a pas été lu", () => {
    const croisements = recoupements("Je souhaite étudier au Canada.", {
      destination: destinationNommee("NL")!,
      niveauLangueMin: "B2",
    });
    const { container } = rendre({ remarques: null, recoupements: croisements });
    expect(container.textContent).toContain("Ta lettre nomme le Canada");
    expect(container.textContent).toContain("écart relevé");
    expect(container.textContent).toContain("n'a pas été analysé");
    // Ni avis favorable, ni bandeau datant une relecture qui n'a pas eu lieu.
    expect(container.textContent).not.toContain("Rien à reprendre");
    expect(container.textContent).not.toContain("relecture automatique ImmiPro");
  });

  /**
   * Sans cette liste, « rien ne diverge » se lirait comme « tout a été
   * vérifié », et le candidat croirait ses pièces jointes confrontées à sa
   * lettre alors qu'aucune n'a été lue.
   */
  it("dit ce qui n'a pas été recoupé", () => {
    const croisements = recoupements("Je souhaite étudier aux Pays-Bas.", {
      destination: destinationNommee("NL")!,
      niveauLangueMin: "B2",
    });
    const { container } = rendre({ remarques: null, recoupements: croisements });
    expect(screen.getByText("Ce que nous avons recoupé")).toBeDefined();
    expect(screen.getByText("Ce que nous n'avons pas recoupé")).toBeDefined();
    expect(container.textContent).toContain("pièces jointes");
    expect(container.textContent).toContain("rien ne diverge");
  });

  /** Rien de comparable : l'écran ne prétend pas avoir recoupé. */
  it("n'annonce aucun recoupement quand rien n'était comparable", () => {
    const { container } = rendre({ remarques: null });
    expect(screen.queryByText("Ce que nous avons recoupé")).toBeNull();
    expect(container.textContent).toContain("sans l'avoir lu");
  });

  /** « Corriger le passage » n'était relié à rien : c'est un lien vers l'éditeur. */
  it("mène à l'éditeur depuis chaque remarque", () => {
    rendre({ remarques: REMARQUES_MOTIVATION });
    const liens = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"))
      .filter((h) => h === "/dossiers/nl-4471/redaction/lettre-motivation");
    expect(liens.length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: /Corriger le passage/ })).toBeNull();
  });
});

describe("R-04 — Analyse critique", () => {
  // La page lit la base ; le composant rend. Les remarques du contenu de
  // référence suffisent à vérifier l'écran, sans base de données.
  const relecture = () => (
    <Relecture
      dossier={dossierParId("nl-4471")!}
      type="lettre-motivation"
      remarques={REMARQUES_MOTIVATION}
      recoupements={AUCUN_RECOUPEMENT}
      texteExistant
      analysePossible
      relectureLe="2026-09-11"
    />
  );

  it("met l'incohérence en tête et montre les deux valeurs", async () => {
    render(relecture());
    expect(screen.getByText("Incohérence entre pièces")).toBeDefined();
    expect(screen.getByText("juillet 2026")).toBeDefined();
    expect(screen.getByText("18 septembre 2026")).toBeDefined();
  });

  it("résume sans noter la lettre ni prédire la décision", async () => {
    const { container } = render(relecture());
    const texte = container.textContent ?? "";
    expect(texte).toContain("dont une incohérence avec une autre pièce");
    // Le nombre de mots annoncé ne peut plus contredire le texte affiché.
    expect(texte).not.toContain("412 mots");
    expect(texte).toContain("Nous ne notons pas ta lettre");
    expect(texte).not.toMatch(/\d\s?\/\s?100/);
    expect(texte).not.toMatch(/\d\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
  });

  it("porte la date de relecture et rappelle qu'elle ne remplace personne", async () => {
    const { container } = render(relecture());
    expect(container.textContent).toMatch(/Information vérifiée le 11\/09\/2026/);
    expect(container.textContent).toContain("ne remplace pas la lecture d'un consultant");
  });
});

describe("T-01 — Alertes", () => {
  const divergence = {
    pays: "Allemagne",
    ancienne: REGLE_ANCIENNE,
    nouvelle: REGLE_NOUVELLE,
    detecteeLe: "2026-09-09",
    verifieeLe: "2026-09-11",
    source: "make-it-in-germany.com",
  };
  const rendre = () =>
    render(
      <Alertes alertes={ALERTES} maintenant="2026-09-18T13:05:00Z" divergence={divergence} />,
    );

  it("dit ce que le changement implique pour le dossier, avec sa source", () => {
    const { container } = rendre();
    expect(screen.getByText("Le compte bloqué allemand passe à 11 904 €")).toBeDefined();
    expect(container.textContent).toContain("Ton dossier Allemagne est concerné");
    expect(container.textContent).toContain("source : make-it-in-germany.com");
  });

  it("annonce la progression en pièces, sans note sur cent", () => {
    const { container } = rendre();
    expect(container.textContent).toContain(
      "Une pièce obligatoire de moins à réunir : il en reste 2.",
    );
    expect(container.textContent).not.toMatch(/\d\s?\/\s?100/);
    expect(container.textContent).not.toMatch(/sur 100/);
  });

  it("date l'échéance depuis aujourd'hui, pas depuis la rédaction de l'alerte", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Renouvellement du passeport · aujourd'hui");
  });

  it("filtre par catégorie", () => {
    rendre();
    fireEvent.click(screen.getByRole("tab", { name: "Réglementation" }));
    expect(screen.queryByText("Reçu de paiement disponible")).toBeNull();
    expect(screen.getByText("Le compte bloqué allemand passe à 11 904 €")).toBeDefined();
  });

  it("marque tout lu, puis désactive le bouton en disant pourquoi", () => {
    rendre();
    expect(screen.getByText("2 alertes non lues.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Tout marquer lu" }));
    expect(screen.getByText("Aucune alerte non lue.")).toBeDefined();
    expect(screen.getByText("Toutes tes alertes sont déjà lues.")).toBeDefined();
  });

  it("ne porte pas l'état non lu par la seule couleur", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Non lue.");
  });
});

describe("T-02 — Divergence réglementaire", () => {
  const divergence = {
    pays: "Allemagne",
    ancienne: REGLE_ANCIENNE,
    nouvelle: REGLE_NOUVELLE,
    detecteeLe: "2026-09-09",
    verifieeLe: "2026-09-11",
    source: "make-it-in-germany.com",
  };
  const ouvrir = () => {
    render(
      <Alertes alertes={ALERTES} maintenant="2026-09-18T13:05:00Z" divergence={divergence} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Choisir la version à appliquer" }),
    );
  };

  it("s'ouvre en boîte de dialogue modale depuis l'alerte", () => {
    ouvrir();
    const dialogue = screen.getByRole("dialog");
    expect(dialogue.getAttribute("aria-modal")).toBe("true");
    expect(dialogue.textContent).toContain("Une exigence a changé pour l'Allemagne");
  });

  it("pose les deux versions et ce que le changement implique", () => {
    ouvrir();
    const dialogue = screen.getByRole("dialog");
    expect(espaces(dialogue.textContent ?? "")).toContain("11 208 €");
    expect(espaces(dialogue.textContent ?? "")).toContain("11 904 €");
    expect(espaces(dialogue.textContent ?? "")).toContain("696 € de plus");
  });

  it("ne réintroduit pas la conversion en francs retirée de $-02", () => {
    ouvrir();
    expect(screen.getByRole("dialog").textContent).not.toContain("456 000");
  });

  it("ne tranche pas seule : aucune option cochée, bouton désactivé", () => {
    ouvrir();
    const dialogue = screen.getByRole("dialog");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
    expect(
      screen.getByRole("button", { name: "Appliquer mon choix" }),
    ).toHaveProperty("disabled", true);
    expect(dialogue.textContent).toContain("Nous ne modifions rien sans ton accord");
  });

  it("annonce ce que l'arbitrage retenu fera de la checklist", () => {
    ouvrir();
    fireEvent.click(screen.getByRole("radio", { name: /Migrer vers la version 5/ }));
    expect(screen.getByRole("button", { name: "Migrer vers la version 5" })).toBeDefined();
    expect(screen.getByText("Ta checklist Allemagne sera mise à jour.")).toBeDefined();
  });

  it("se ferme par Échap, sans valider (règle clavier 5)", () => {
    ouvrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * T-06 — Services partenaires. K.A, tranché le 20/09/2026.
 *
 * L'arbitrage déplace les offres hors de l'espace dossier. Ce qui se teste
 * ici n'est donc plus « la carte s'affiche au bon moment » — elle ne
 * s'affiche plus du tout dans la checklist — mais que les garanties ont
 * suivi l'offre sur sa nouvelle surface. Elles portaient sur la nature de
 * l'offre, pas sur l'écran : elles valent donc à l'identique.
 */
const OFFRE = {
  id: "ref-1",
  partenaire: {
    id: "p1",
    nom: "Cabinet Adjovi & Associés",
    ville: "Cotonou",
    qualification: "courtier agréé, 9 ans d'exercice",
    destinations: ["NL"],
  },
  motif: {
    constat: "Ton dossier demande une pièce : assurance maladie.",
    raison: "Nous ne la fournissons pas nous-mêmes ; un partenaire le fait.",
  },
  etape: "assurance_maladie",
  genre: "ASSURANCE_SANTE" as const,
  url: "https://exemple.invalid/assurance",
};

describe("T-06 — Services partenaires", () => {
  const rendre = () =>
    render(<Services dossier={DOSSIER} offres={[OFFRE]} autorise />);

  it("rattache chaque offre à une pièce que le dossier demande", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Un partenaire peut te fournir cette pièce");
    expect(container.textContent).toContain("assurance maladie");
  });

  it("annonce la commission dans l'écran, au taux porté par la grille", () => {
    const { container } = rendre();
    expect(espaces(container.textContent ?? "")).toContain(
      `commission de ${espaces(tauxCommissionFormate())} sur cette prestation`,
    );
  });

  it("dit que refuser ne coûte rien, et ne demande rien pour partir", () => {
    const { container } = rendre();
    expect(container.textContent).toContain(
      "Refuser ne change rien à ton dossier ni à ton pack.",
    );
    // Plus de « ne plus me proposer » : rien n'est proposé. L'interrupteur
    // vit avec les autres consentements, et l'écran y renvoie.
    expect(screen.queryByRole("button", { name: /ne plus me proposer/iu })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Ne plus voir d'offres de partenaire" }).getAttribute("href"),
    ).toBe("/consentements");
  });

  it("signale la nature commerciale du lien avant d'y envoyer", () => {
    rendre();
    const lien = screen.getByRole("link", { name: "Ouvrir le site du partenaire" });
    expect(lien.getAttribute("href")).toBe("https://exemple.invalid/assurance");
    expect(lien.getAttribute("rel")).toContain("sponsored");
    expect(lien.getAttribute("target")).toBe("_blank");
  });

  it("n'annonce pas le tarif d'une consultation sous un courtier", () => {
    // Trouvé à l'écran au lot WF-13, et la règle survit au déplacement :
    // la carte annonçait « Premier entretien : 20 000 F, 45 minutes » sous
    // une assurance maladie.
    const { container } = rendre();
    expect(container.textContent).not.toContain("Premier entretien");
    expect(container.textContent).not.toContain("45 minutes");
  });

  it("rappelle qu'ImmiPro n'est pas un cabinet de conseil", () => {
    const { container } = rendre();
    expect(container.textContent).toContain(
      "ImmiPro n'est pas un cabinet de conseil en immigration",
    );
  });

  it("dit pourquoi la page est vide, plutôt que de ne rien dire", () => {
    const { container } = render(
      <Services dossier={DOSSIER} offres={[]} autorise />,
    );
    expect(container.textContent).toContain("Aucun partenaire n'est référencé");
    expect(container.textContent).toContain("vérification destination par destination");
  });

  it("dit que l'autorisation est coupée, et où la rétablir", () => {
    const { container } = render(
      <Services dossier={DOSSIER} offres={[]} autorise={false} />,
    );
    expect(container.textContent).toContain("Tu as coupé les offres de partenaire");
    expect(
      screen.getByRole("link", { name: "Ouvrir mes consentements" }).getAttribute("href"),
    ).toBe("/consentements");
  });
});
