import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { BarreAdmin } from "@/components/admin/BarreAdmin";
import { FileDeVeille } from "@/app/(admin)/veille/FileDeVeille";
import { EditionRegle } from "@/app/(admin)/regles/[id]/EditionRegle";
import { RevueDesPieces } from "@/app/(admin)/revue/RevueDesPieces";
import { Utilisateurs } from "@/app/(admin)/utilisateurs/Utilisateurs";
import { Paiements } from "@/app/(admin)/paiements/Paiements";
import { Journal } from "@/app/(admin)/journal/Journal";
import { CoutsIa } from "@/app/(admin)/couts-ia/CoutsIa";
import { METRIQUES } from "@/domain/backoffice/couts";
import {
  COLLECTE,
  COLLECTE_PARTIELLE,
  COMPTES,
  DOSSIERS_EN_VERSION_4,
  DOSSIERS_SOUS_LA_VERSION_5,
  ECRITURES_AUDIT,
  FICHES_SUIVIES,
  HISTORIQUE_REGLE,
  OPERATEUR,
  OPERATEUR_MUET,
  PAIEMENTS,
  piecesEnEchec,
  REGLE_BROUILLON,
  REGLE_EN_VIGUEUR,
} from "@/lib/contenu/backoffice";
import { NAVIGATION_ADMIN } from "@/domain/backoffice/navigation";

const rafraichir = vi.fn();
/**
 * L'appel réseau, remplacé — B-02.
 *
 * Les garde-fous qui lisent le source ne suffisaient pas ici : brancher
 * le bouton « Publier » directement sur `setFait("publie")` laisse la
 * fonction `publier()` intacte dans le fichier, orpheline, et tout test
 * qui l'inspecte continue de passer. Il faut cliquer pour voir qu'aucune
 * requête ne part.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: rafraichir }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

const AUJOURDHUI = "2026-09-18";
const MAINTENANT = "2026-09-18T09:41:00Z";
const espaces = (t: string) => t.replace(/[\s  ]/gu, " ");

const editerRegle = ({ peutPublier = true } = {}) =>
  render(
    <EditionRegle
      id="regle-de-test"
      peutPublier={peutPublier}
      enVigueur={REGLE_EN_VIGUEUR}
      brouillon={REGLE_BROUILLON}
      dossiersConcernes={DOSSIERS_EN_VERSION_4}
      dossiersSousLaNouvelleRegle={DOSSIERS_SOUS_LA_VERSION_5}
      historique={HISTORIQUE_REGLE}
    />,
  );

describe("gabarit back-office", () => {
  it("porte la navigation de tous les registres et le lien d'évitement", () => {
    render(
      <BarreAdmin nom="Mireille Agossou" role="Administration" initialesAffichees="MA">
        <h1 id="contenu" tabIndex={-1}>
          Écran
        </h1>
      </BarreAdmin>,
    );
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toBeDefined();
    const nav = screen.getByRole("navigation", { name: "Navigation du back-office" });
    // Le compte suit le domaine plutôt qu'un nombre écrit ici : une
    // entrée ajoutée sans son écran est un défaut, une entrée ajoutée
    // avec le sien ne doit pas faire échouer le gabarit.
    expect(within(nav).getAllByRole("listitem")).toHaveLength(NAVIGATION_ADMIN.length);
    expect(within(nav).getByRole("link", { name: "Journal d'audit" })).toBeDefined();
    expect(within(nav).getByRole("link", { name: "Guides et articles" })).toBeDefined();
  });

  it("nomme l'opérateur connecté, jamais un nom écrit en dur", () => {
    const { container } = render(
      <BarreAdmin nom="Koffi Houngbo" role="Analyste réglementaire" initialesAffichees="KH">
        <p>Écran</p>
      </BarreAdmin>,
    );
    expect(container.textContent).toContain("Koffi Houngbo");
    expect(container.textContent).not.toContain("M. Agossou");
  });
});

describe("B-01 — File de veille", () => {
  const rendre = (collecte = COLLECTE) =>
    render(
      <FileDeVeille fiches={FICHES_SUIVIES} collecte={collecte} aujourdhui={AUJOURDHUI} />,
    );

  it("met le plus en retard en tête et le signale", () => {
    rendre();
    const liste = screen.getByRole("listbox");
    const lignes = within(liste).getAllByRole("option");
    expect(lignes[0]!.textContent).toContain("En retard de 24 j");
  });

  it("fait de la liste un seul arrêt de tabulation, piloté aux flèches", () => {
    rendre();
    const lignes = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(lignes.filter((l) => l.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(lignes[0]!.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    const apres = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(apres[1]!.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "End" });
    const fin = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(fin[fin.length - 1]!.getAttribute("aria-selected")).toBe("true");
  });

  it("marque une source secondaire comme jamais affichée au candidat (INV-4)", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("jamais affiché (INV-4)");
  });

  it("garde la ligne d'une source muette et dit ce qui reste publié", () => {
    const { container } = rendre(COLLECTE_PARTIELLE);
    expect(container.textContent).toContain("13 sources sur 14 relevées");
    expect(container.textContent).toContain("ind.nl n'a pas répondu");
    expect(container.textContent).toContain("Elles restent publiées");
    expect(container.textContent).toContain("Rien n'est dépublié automatiquement");
  });

  it("annonce qu'une publication versionne et alerte", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Toute publication crée une version horodatée");
  });
});

/**
 * B-02 écrit vraiment — arbitrage du 21/09/2026, suite de la revue.
 *
 * Les deux commandes de l'en-tête n'étaient reliées à rien. « Publier »
 * posait un drapeau local et l'écran répondait « Publication demandée. La
 * version 5 devient la référence des nouveaux dossiers », en région
 * vivante, sans qu'aucune requête soit partie. Un veilleur repartait en
 * croyant la règle publiée.
 *
 * Ces tests cliquent, parce que lire le source ne suffit pas : on peut
 * rebrancher le bouton sur l'état local en laissant la fonction d'envoi
 * intacte plus bas dans le fichier, et tout garde-fou qui l'inspecte
 * passe encore.
 */
describe("B-02 — les commandes partent vraiment au serveur", () => {
  const preparer = ({ ok = true, peutPublier = true } = {}) => {
    appels.length = 0;
    rafraichir.mockClear();
    reponse = { ok };
    editerRegle({ peutPublier });
    fireEvent.change(screen.getByLabelText("Motif du changement"), {
      target: { value: "Relevé de la source officielle du 18 septembre." },
    });
  };

  const cliquer = async (nom: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name: nom }));
    // Deux tours de boucle : l'enregistrement puis la publication.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("enregistrer le brouillon n'envoie que les deux textes édités", async () => {
    preparer();
    await cliquer(/Enregistrer le brouillon/u);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.methode).toBe("PUT");
    expect(appels[0]!.url).toBe("/api/admin/regles/regle-de-test");
    // Ni payload, ni source, ni date de relecture : l'écran ne les
    // affiche pas, il ne les décide pas.
    expect(appels[0]!.corps).toEqual({
      champ: "textes",
      libelleCandidat: REGLE_BROUILLON.libelleCandidat,
      reserveCandidat: REGLE_BROUILLON.reserveCandidat,
    });
  });

  /**
   * La publication relit le payload en base pour le valider : publier
   * sans enregistrer mettrait en vigueur le texte d'avant pendant que
   * l'écran montre celui d'après.
   */
  it("publier enregistre d'abord, puis publie", async () => {
    preparer();
    await cliquer(/Publier la version/u);
    expect(appels.map((a) => a.methode ?? "POST")).toEqual(["PUT", "POST"]);
    expect(appels[1]!.corps).toEqual({
      motif: "Relevé de la source officielle du 18 septembre.",
    });
    expect(rafraichir).toHaveBeenCalled();
  });

  it("après la réponse, l'écran dit ce qui a été publié", async () => {
    preparer();
    await cliquer(/Publier la version/u);
    expect(screen.getByText(/Version 5 publiée/u)).toBeDefined();
  });

  /** Le cœur de la correction : rien ne s'annonce sans réponse. */
  it("un refus du serveur n'annonce aucune publication", async () => {
    preparer({ ok: false });
    await cliquer(/Publier la version/u);
    expect(screen.queryByText(/publiée/u)).toBeNull();
    expect(screen.getByText("Le serveur a refusé")).toBeDefined();
    // Et l'enregistrement ayant échoué le premier, la publication n'est
    // même pas tentée.
    expect(appels).toHaveLength(1);
  });

  it("un enregistrement sans publication ne parle pas de publication", async () => {
    preparer();
    await cliquer(/Enregistrer le brouillon/u);
    expect(screen.queryByText(/publiée/u)).toBeNull();
    expect(screen.getByText(/Brouillon enregistré/u)).toBeDefined();
  });

  /** RG-14.2 : qui rédige n'est pas qui publie, et l'écran le dit avant le clic. */
  it("un veilleur ne peut pas publier, et sait pourquoi", async () => {
    preparer({ peutPublier: false });
    const bouton = screen.getByRole("button", { name: /Publier la version/u });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAccessibleDescription(/RG-14\.2/u);
    await cliquer(/Publier la version/u);
    expect(appels).toHaveLength(0);
  });
});

describe("B-02 — un administrateur ne peut pas publier une promesse", () => {
  it("refuse la saisie à l'enregistrement et bloque la publication", () => {
    editerRegle();
    const libelle = screen.getByLabelText("Libellé affiché au candidat");
    fireEvent.change(libelle, {
      target: { value: "95 % de réussite sur cette procédure." },
    });

    expect(libelle.getAttribute("aria-invalid")).toBe("true");
    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("95 %");
    expect(alerte.textContent).toContain("Reformule");
    expect(
      screen.getByRole("button", { name: /Publier la version 5/ }),
    ).toHaveProperty("disabled", true);
  });

  it("laisse écrire la phrase qui protège", () => {
    editerRegle();
    fireEvent.change(screen.getByLabelText("Réserve affichée en contexte"), {
      target: { value: "ImmiPro ne garantit pas l'obtention du visa." },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exige un motif avant de publier, et le dit", () => {
    editerRegle();
    const publier = screen.getByRole("button", { name: /Publier la version 5/ });
    expect(publier).toHaveProperty("disabled", true);
    expect(screen.getByText(/Renseigne le motif du changement/)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Motif du changement"), {
      target: { value: "Mise à jour du barème officiel allemand." },
    });
    expect(screen.getByRole("button", { name: /Publier la version 5/ })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("montre l'effet de la publication, migrations à zéro (INV-3)", () => {
    const { container } = editerRegle();
    expect(container.textContent).toContain("Dossiers migrés");
    expect(container.textContent).toContain("Aucun dossier n'est migré automatiquement");
    const effet = screen.getByText("Dossiers migrés").closest("div")!;
    expect(effet.textContent).toContain("0");
  });

  it("compare les deux versions en gardant les champs inchangés", () => {
    const { container } = editerRegle();
    expect(container.textContent).toContain("Différences avec la version 4");
    expect(espaces(container.textContent ?? "")).toContain("11 208 €");
    expect(espaces(container.textContent ?? "")).toContain("11 904 €");
    expect(container.textContent).toContain("Inchangé");
  });
});

describe("B-05 — Revue manuelle", () => {
  const rendre = () =>
    render(
      <RevueDesPieces
        pieces={piecesEnEchec(new Date(MAINTENANT))}
        maintenant={MAINTENANT}
      />,
    );

  /**
   * L'écran promettait que l'ouverture était tracée et ne traçait rien :
   * le bouton posait un drapeau local et affichait « aperçu de la pièce ·
   * page 1 sur 3 », qui ne correspondait à aucun fichier. Le motif
   * conditionne désormais l'ouverture, et l'aperçu vient du serveur.
   */
  it("ne précharge aucune pièce, et n'en ouvre aucune sans motif", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("l'ouverture d'une pièce est un acte tracé");
    expect(container.textContent).not.toContain("aperçu de la pièce");

    const ouvrir = screen.getByRole("button", { name: "Ouvrir la pièce" });
    expect(ouvrir).toBeDisabled();
    expect(ouvrir).toHaveAccessibleDescription(/pourquoi tu ouvres cette pièce/u);
  });

  it("refuse « non conforme » seul, comme le code se l'interdit", () => {
    rendre();
    const champ = screen.getByLabelText("Message envoyé au candidat");
    fireEvent.change(champ, { target: { value: "Non conforme" } });
    expect(screen.getByRole("alert").textContent).toContain("constat sans suite");
    expect(
      screen.getByRole("button", { name: /Enregistrer et passer/ }),
    ).toHaveProperty("disabled", true);
  });

  it("accepte un message qui dit la mesure puis le geste", () => {
    rendre();
    fireEvent.change(screen.getByLabelText("Motif de l'accès et de la décision"), {
      target: { value: "Revue manuelle après échec d'extraction." },
    });
    fireEvent.change(screen.getByLabelText("Message envoyé au candidat"), {
      target: {
        value:
          "Ton relevé s'arrête en juin, il en faut trois consécutifs. Demande à ta banque un relevé couvrant juin, juillet et août.",
      },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Enregistrer et passer/ }),
    ).toHaveProperty("disabled", false);
  });

  /**
   * Les deux commandes partent vraiment — et ces tests cliquent, parce
   * que lire le source ne suffit pas : on peut rebrancher un bouton sur
   * l'état local en laissant la fonction d'envoi intacte plus bas dans
   * le fichier, et tout garde-fou qui l'inspecte passe encore (leçon de
   * S.1, sur B-02).
   */
  describe("l'ouverture et la décision partent au serveur", () => {
    const preparer = ({ ok = true } = {}) => {
      appels.length = 0;
      rafraichir.mockClear();
      reponse = { ok };
      rendre();
      fireEvent.change(screen.getByLabelText("Motif de l'accès et de la décision"), {
        target: { value: "Revue manuelle après échec d'extraction." },
      });
    };

    const cliquer = async (nom: RegExp) => {
      fireEvent.click(screen.getByRole("button", { name: nom }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    /** RG-15.1 : l'accès est journalisé avec son motif, ou il n'a pas lieu. */
    it("ouvrir la pièce appelle la route de consultation, motif compris", async () => {
      preparer();
      await cliquer(/Ouvrir la pièce/u);
      expect(appels).toHaveLength(1);
      expect(appels[0]!.url).toMatch(/\/api\/admin\/revue\/.+\/consultation$/u);
      expect(appels[0]!.corps).toEqual({
        motif: "Revue manuelle après échec d'extraction.",
      });
    });

    /**
     * Et l'aperçu vient du serveur. L'ancien écran en dessinait un —
     * « page 1 sur 3 » — qui ne correspondait à aucun fichier : c'était
     * un service absent qu'on simulait, ce que le produit refuse (I.C).
     */
    it("aucun aperçu ne s'invente : un refus n'en montre aucun", async () => {
      preparer({ ok: false });
      await cliquer(/Ouvrir la pièce/u);
      expect(screen.queryByTitle(/Aperçu de/u)).toBeNull();
      expect(screen.getByText("Le serveur a refusé")).toBeDefined();
    });

    it("trancher envoie la décision, le message et le motif", async () => {
      preparer();
      fireEvent.change(screen.getByLabelText("Message envoyé au candidat"), {
        target: {
          value:
            "Ton relevé s'arrête en juin, il en faut trois consécutifs. Demande à ta banque un relevé couvrant juin, juillet et août.",
        },
      });
      await cliquer(/Enregistrer et passer/u);
      expect(appels).toHaveLength(1);
      expect(appels[0]!.corps).toEqual({
        decision: "A_CORRIGER",
        message:
          "Ton relevé s'arrête en juin, il en faut trois consécutifs. Demande à ta banque un relevé couvrant juin, juillet et août.",
        motif: "Revue manuelle après échec d'extraction.",
      });
      expect(rafraichir).toHaveBeenCalled();
    });

    /** Sans motif, rien ne part — ni l'ouverture, ni la décision. */
    it("sans motif, aucune des deux commandes ne part", async () => {
      appels.length = 0;
      reponse = { ok: true };
      rendre();
      fireEvent.change(screen.getByLabelText("Message envoyé au candidat"), {
        target: {
          value:
            "Ton relevé s'arrête en juin, il en faut trois consécutifs. Demande à ta banque un relevé couvrant juin, juillet et août.",
        },
      });
      await cliquer(/Ouvrir la pièce/u);
      await cliquer(/Enregistrer et passer/u);
      expect(appels).toHaveLength(0);
    });

    /**
     * « Rendre l'analyse au candidat » proposait un choix que le produit
     * n'offre pas : c'est la décision qui recrédite, et la ligne
     * au-dessus du bouton dit laquelle.
     */
    it("aucun second bouton ne propose un choix que la décision a déjà fait", () => {
      rendre();
      expect(screen.queryByRole("button", { name: /Rendre l'analyse/u })).toBeNull();
      expect(screen.queryByRole("button", { name: /pièces traitées/u })).toBeNull();
      expect(screen.queryByRole("button", { name: /Motifs d'échec/u })).toBeNull();
    });
  });

  it("dit si la décision recrédite le quota du candidat", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("ne recrédite pas le quota");
    fireEvent.click(screen.getByRole("button", { name: "Illisible" }));
    expect(container.textContent).toContain("le quota du candidat est recrédité");
  });

  it("affiche la trace technique sans la donner au candidat", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("confidence 0.41");
    expect(container.textContent).toContain("Ce que la lecture automatique a renvoyé");
  });
});

describe("B-03 — Utilisateurs", () => {
  const rendre = () => render(<Utilisateurs comptes={COMPTES} />);

  it("dit ce que l'opérateur ne peut pas voir", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Ce que tu ne peux pas voir");
    expect(container.textContent).toContain("que depuis la file de revue");
  });

  it("nomme le critère qui exclut le reste quand la recherche ne rend rien", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Email non vérifié" }));
    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "aline" } });

    expect(screen.getByText(/Aucun compte ne correspond à « aline » avec ce filtre/)).toBeDefined();
    expect(screen.getByText(/Retire le filtre pour le voir/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Retirer le filtre/ }));
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  /**
   * La liste d'actions était fausse dans les deux sens : trois boutons
   * sans route, et la suspension — dont la route existe depuis le début —
   * absente de l'écran.
   */
  it("n'offre plus ce que le produit ne sait pas faire", () => {
    rendre();
    for (const disparu of [
      /Renvoyer l'email de vérification/u,
      /Recréditer des analyses/u,
      /Traiter la demande de suppression/u,
      /Exporter la sélection/u,
    ]) {
      expect(screen.queryByRole("button", { name: disparu }), String(disparu)).toBeNull();
    }
  });

  it("offre la suspension, dont la route existe", () => {
    rendre();
    const bouton = screen.getByRole("button", { name: "Suspendre le compte" });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAccessibleDescription(/Écris pourquoi/u);
    // La conséquence est dite avant le clic : la suspension ferme les
    // sessions ouvertes, et l'opérateur doit le savoir.
    expect(screen.getByText(/Les sessions ouvertes se ferment immédiatement/u)).toBeDefined();
  });

  /**
   * Ces tests cliquent, parce que lire le source ne suffit pas : on peut
   * débrancher le bouton en laissant la fonction intacte plus bas dans le
   * fichier, et tout garde-fou qui l'inspecte passe encore (leçon de S.1).
   */
  it("suspendre part au serveur avec son motif", async () => {
    appels.length = 0;
    rafraichir.mockClear();
    reponse = { ok: true };
    rendre();
    fireEvent.change(screen.getByLabelText("Motif de la décision"), {
      target: { value: "Compte signalé pour usurpation d'identité." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suspendre le compte" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.methode).toBe("PUT");
    expect(appels[0]!.url).toBe("/api/admin/utilisateurs");
    expect(appels[0]!.corps).toMatchObject({
      suspendre: true,
      motif: "Compte signalé pour usurpation d'identité.",
    });
    expect(rafraichir).toHaveBeenCalled();
  });

  it("sans motif, rien ne part", async () => {
    appels.length = 0;
    reponse = { ok: true };
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Suspendre le compte" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(appels).toHaveLength(0);
  });
});

describe("B-04 — Paiements", () => {
  it("affiche le total quand l'opérateur répond", () => {
    const { container } = render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR}
        journee="Journée du 18 septembre 2026"
      />,
    );
    expect(espaces(container.textContent ?? "")).toContain("60 000 F");
    expect(container.textContent).not.toContain("n'est pas affiché pendant l'incident");
  });

  it("retire le total et n'accuse aucun paiement pendant l'incident", () => {
    const { container } = render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR_MUET}
        journee="Journée du 18 septembre 2026"
      />,
    );
    expect(container.textContent).toContain("ne répond plus");
    expect(container.textContent).toContain("aucun n'est marqué en échec");
    expect(container.textContent).toContain("un chiffre partiel présenté comme un total");
    expect(espaces(container.textContent ?? "")).not.toContain("60 000 F");
  });

  it("garde les paiements en attente, transaction inconnue", () => {
    render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR_MUET}
        journee="Journée du 18 septembre 2026"
      />,
    );
    expect(screen.getAllByText("En attente de rapprochement").length).toBeGreaterThan(0);
  });
});

describe("B-06 — Journal d'audit", () => {
  const rendre = (periode = { du: "2026-09-01", au: "2026-09-30" }) =>
    render(<Journal ecritures={ECRITURES_AUDIT} periode={periode} />);

  it("annonce l'immuabilité et la conservation", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Écritures non modifiables, conservation 5 ans");
    expect(container.textContent).toContain("Aucune entrée ne peut être supprimée");
  });

  it("montre le motif déclaré d'un accès à une pièce", () => {
    const { container } = rendre();
    expect(container.textContent).toContain(
      "Motif déclaré : revue manuelle après échec d'analyse",
    );
  });

  it("ne comble jamais une période vide", () => {
    const { container } = rendre({ du: "2026-09-01", au: "2026-09-07" });
    expect(container.textContent).toContain("Aucune écriture entre");
    expect(container.textContent).toContain("ne comble jamais une période vide");
    expect(container.textContent).toContain("L'export d'une période vide reste possible");
  });
});

describe("B-07 — Coûts IA", () => {
  it("n'affiche aucune valeur, et dit pourquoi", () => {
    const { container } = render(<CoutsIa metriques={METRIQUES} />);
    expect(container.textContent).toContain("Aucune mesure enregistrée");
    expect(container.textContent).toContain("un chiffre posé ici serait repris comme une spécification");
    expect(screen.getAllByText("—").length).toBe(4);
  });

  it("nomme les métriques et leur source de calcul", () => {
    const { container } = render(<CoutsIa metriques={METRIQUES} />);
    expect(container.textContent).toContain("somme de AiUsage.costXof sur la période");
    expect(container.textContent).toContain("Coût IA par dossier payant");
  });

  it("exprime les garde-fous en ratio, avec leur conséquence", () => {
    const { container } = render(<CoutsIa metriques={METRIQUES} />);
    expect(espaces(container.textContent ?? "")).toContain("15 % du prix du pack");
    expect(container.textContent).toContain("le pack est vendu trop bas");
    expect(container.textContent).toContain("3 × la médiane des 7 derniers jours");
    expect(container.textContent).toContain("la file passe en revue humaine");
  });

  it("désactive l'export en disant qu'il n'y a rien à exporter", () => {
    render(<CoutsIa metriques={METRIQUES} />);
    expect(
      screen.getByRole("button", { name: /Exporter le détail des appels/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/il n'y a rien à exporter/)).toBeDefined();
  });

  it("ne montre aucune donnée de candidat", () => {
    const { container } = render(<CoutsIa metriques={METRIQUES} />);
    expect(container.textContent).toContain("Aucune donnée de candidat");
  });
});
