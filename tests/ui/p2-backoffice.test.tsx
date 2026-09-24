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
import {
  GARDE_FOUS,
  MENTION_GARDE_FOU_NON_TENU,
  METRIQUES,
  libelleDesGardeFous,
  metriquesMesurees,
  serieQuotidienne,
  type Depassement,
  type Journee,
} from "@/domain/backoffice/couts";
import { SANS_INDEX_DES_REGLES } from "@/domain/backoffice/veille";
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
/**
 * Les téléchargements — S.7.
 *
 * Même raison que le mock ci-dessus : « Exporter la période » pouvait
 * afficher « Préparation… » et ne rien demander à personne. Les appels
 * sont enregistrés pour qu'un test lise l'URL partie, avec son périmètre.
 */
const telechargements: { url: string; nom: string }[] = [];
let reponseDuTelechargement: { ok: boolean } = { ok: true };
vi.mock("@/lib/telechargement", () => ({
  telechargerFichier: (url: string, nom: string) => {
    telechargements.push({ url, nom });
    return Promise.resolve(
      reponseDuTelechargement.ok
        ? { ok: true, donnees: undefined }
        : {
            ok: false,
            echec: {
              titre: "Le fichier n'a pas pu être préparé",
              corps: "Motif de test.",
              conserve: "Rien n'a changé.",
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

  /**
   * Ce test affirmait « Rien n'est dépublié automatiquement », et c'était
   * faux : RG-14.1 dépublie toute fiche dont la relecture est en retard,
   * et un cron l'applique chaque nuit à trois heures. L'écran confondait
   * deux cas distincts — une source qui ne répond pas, et une fiche que
   * personne n'a relue — et les disait tous deux inoffensifs.
   */
  it("une source muette ne dépublie rien, et l'écran le dit", () => {
    const { container } = rendre(COLLECTE_PARTIELLE);
    expect(container.textContent).toContain("13 sources sur 14 relevées");
    expect(container.textContent).toContain("ind.nl n'a pas répondu");
    expect(container.textContent).toContain("Elles restent publiées");
    expect(container.textContent).toContain("Une source injoignable ne dépublie rien");
  });

  /** L'autre cas, celui que l'écran taisait. */
  it("une relecture en retard dépublie, et l'écran le dit aussi", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("repasse automatiquement en brouillon");
    expect(container.textContent).toContain("3 h");
    expect(container.textContent).toContain("RG-14.1");
    // L'ancienne phrase, qui rassurait précisément là où il faut alarmer.
    expect(container.textContent).not.toContain("Rien n'est dépublié automatiquement");
  });

  /**
   * WF-14 étape 2, branche « inchangé » — et ces tests cliquent, parce
   * que lire le source ne suffit pas (leçon de S.1).
   *
   * Tant que ce bouton n'écrivait rien, une fiche relue et trouvée
   * identique restait en retard, et le cron de trois heures finissait par
   * la dépublier : le travail était fait, et le produit se comportait
   * comme s'il ne l'avait pas été.
   */
  it("marquer relue part au serveur", async () => {
    appels.length = 0;
    rafraichir.mockClear();
    reponse = { ok: true };
    rendre();
    fireEvent.click(
      screen.getByRole("button", { name: /Marquer comme relue sans changement/u }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.methode).toBe("PUT");
    expect(appels[0]!.url).toBe("/api/admin/veille");
    expect(appels[0]!.corps).toHaveProperty("id");
    expect(rafraichir).toHaveBeenCalled();
  });

  it("un refus s'affiche plutôt que de se perdre", async () => {
    appels.length = 0;
    reponse = { ok: false };
    rendre();
    fireEvent.click(
      screen.getByRole("button", { name: /Marquer comme relue sans changement/u }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Le serveur a refusé")).toBeDefined();
  });

  /** Les quatre boutons sans route sont partis, comme en B-03. */
  it("n'offre plus ce que le produit ne sait pas faire", () => {
    rendre(COLLECTE_PARTIELLE);
    for (const disparu of [
      /Journal des collectes/u,
      /Nouvelle fiche/u,
      /^Relever /u,
      /Déclarer un incident/u,
    ]) {
      expect(screen.queryByRole("button", { name: disparu }), String(disparu)).toBeNull();
    }
  });

  it("annonce qu'une publication versionne et alerte", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Toute publication crée une version horodatée");
  });

  /**
   * L'état vide est le seul écran où le veilleur n'a rien d'autre à
   * cliquer, et il offrait « Voir les règles publiées » vers
   * `/regles/nl-etudes` — une adresse qu'aucune fiche ne porte, servie en
   * 404. Il dit maintenant par où une fiche revient, et n'offre aucune
   * porte : le back-office n'a pas d'index des règles.
   */
  it("la file vide dit par où une fiche revient, sans lien à cliquer", () => {
    const { container } = render(
      <FileDeVeille fiches={[]} collecte={COLLECTE} aujourdhui={AUJOURDHUI} />,
    );
    expect(container.textContent).toContain("Aucun écart à arbitrer");
    expect(container.textContent).toContain(SANS_INDEX_DES_REGLES);
    expect(screen.queryByRole("link", { name: /règles publiées/u })).toBeNull();
    for (const lien of screen.queryAllByRole("link")) {
      expect(lien.getAttribute("href"), lien.textContent ?? "").not.toMatch(/^\/regles\//u);
    }
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
        jourIso="2026-09-18"
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
        jourIso="2026-09-18"
      />,
    );
    expect(container.textContent).toContain("ne répond plus");
    expect(container.textContent).toContain("aucun n'est marqué en échec");
    expect(container.textContent).toContain("un chiffre partiel présenté comme un total");
    expect(espaces(container.textContent ?? "")).not.toContain("60 000 F");
  });

  /**
   * Le bouton partait dans le vide. Il pouvait afficher « Préparation… »
   * indéfiniment sans qu'aucune requête soit sortie : c'est la leçon de
   * S.1, et elle ne se voit qu'en cliquant.
   */
  it("l'export du grand livre part, avec la journée en ISO", async () => {
    telechargements.length = 0;
    reponseDuTelechargement = { ok: true };
    render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR}
        journee="Journée du 18 septembre 2026"
        jourIso="2026-09-18"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Exporter le grand livre/ }));
    });
    expect(telechargements).toHaveLength(1);
    expect(telechargements[0]!.url).toBe("/api/admin/paiements/export?jour=2026-09-18");
    expect(telechargements[0]!.nom).toBe("immipro-grand-livre-2026-09-18.csv");
  });

  /**
   * L'export part même pendant l'incident : ce sont ses totaux que le
   * serveur retient, pas ses lignes. Retenir le fichier entier ferait
   * croire que la journée n'existe pas.
   */
  it("l'export reste possible pendant l'incident", async () => {
    telechargements.length = 0;
    render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR_MUET}
        journee="Journée du 18 septembre 2026"
        jourIso="2026-09-18"
      />,
    );
    const bouton = screen.getByRole("button", { name: /Exporter le grand livre/ });
    expect(bouton).toHaveProperty("disabled", false);
    await act(async () => {
      fireEvent.click(bouton);
    });
    expect(telechargements).toHaveLength(1);
  });

  it("affiche le refus du serveur sans inventer sa propre formulation", async () => {
    telechargements.length = 0;
    reponseDuTelechargement = { ok: false };
    const { container } = render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR}
        journee="Journée du 18 septembre 2026"
        jourIso="2026-09-18"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Exporter le grand livre/ }));
    });
    reponseDuTelechargement = { ok: true };
    expect(container.textContent).toContain("Le fichier n'a pas pu être préparé");
  });

  /** Aucune route, et `interrogation` n'est pas branchée. */
  it("ne propose plus un rapprochement manuel qui n'existe pas", () => {
    render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR}
        journee="Journée du 18 septembre 2026"
        jourIso="2026-09-18"
      />,
    );
    expect(screen.queryByRole("button", { name: /rapprochement/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rapprocher/ })).toBeNull();
  });

  it("garde les paiements en attente, transaction inconnue", () => {
    render(
      <Paiements
        paiements={PAIEMENTS}
        operateur={OPERATEUR_MUET}
        journee="Journée du 18 septembre 2026"
        jourIso="2026-09-18"
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

  /**
   * La promesse la plus précise de l'écran était celle qu'aucune ligne de
   * code ne soutenait. Le bouton emporte le périmètre affiché — période
   * **et** catégories cochées : exporter autre chose que ce qu'on regarde
   * est la façon la plus simple de rapporter d'un contrôle un fichier qui
   * ne répond pas à la question posée.
   */
  it("l'export emporte la période affichée", async () => {
    telechargements.length = 0;
    reponseDuTelechargement = { ok: true };
    rendre({ du: "2026-09-01", au: "2026-09-30" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Exporter la période/ }));
    });
    expect(telechargements).toHaveLength(1);
    expect(telechargements[0]!.url).toBe(
      "/api/admin/journal/export?du=2026-09-01&au=2026-09-30",
    );
    expect(telechargements[0]!.nom).toBe(
      "immipro-journal-audit-2026-09-01_2026-09-30.csv",
    );
  });

  it("l'export emporte aussi les catégories cochées", async () => {
    telechargements.length = 0;
    rendre();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paiements", pressed: false }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Exporter la période/ }));
    });
    expect(telechargements[0]!.url).toContain("categorie=PAIEMENT");
  });

  it("ne comble jamais une période vide", () => {
    const { container } = rendre({ du: "2026-09-01", au: "2026-09-07" });
    expect(container.textContent).toContain("Aucune écriture entre");
    expect(container.textContent).toContain("ne comble jamais une période vide");
    expect(container.textContent).toContain("L'export d'une période vide reste possible");
  });
});

/**
 * B-07 — les états de l'écran de coûts.
 *
 * Trois situations, et elles ne disent pas la même chose : rien
 * d'enregistré, des appels enregistrés sans tarif, des appels enregistrés
 * avec tarif. C'est la deuxième qui manquait — l'écran y affichait « 0,00 F »
 * et « 0,0 % au plus haut » sous un plafond de 15 %.
 */
const SERIE_VIDE: readonly Journee[] = serieQuotidienne([], "2026-09-21", 14);
const SERIE_PLEINE: readonly Journee[] = serieQuotidienne(
  [
    { jour: "2026-09-19", jetons: 12_000, appels: 3 },
    { jour: "2026-09-21", jetons: 4_500, appels: 1 },
  ],
  "2026-09-21",
  14,
);
const CANDIDATS: readonly Depassement[] = [
  { dossierId: "dossier-trop-cher", pack: "DOSSIER", part: 0.22, appels: 9, nature: "marge" },
  { dossierId: "dossier-sage", pack: "ESSENTIEL", part: 0.04, appels: 2, nature: "marge" },
];

/** Le dépassement qui se lit sans tarif : la part du quota de jetons. */
const HORS_QUOTA: readonly Depassement[] = [
  { dossierId: "dossier-gourmand", pack: "ESSENTIEL", part: 10, appels: 12, nature: "quota" },
];

const coutsIa = (props: Partial<Parameters<typeof CoutsIa>[0]> = {}) =>
  render(
    <CoutsIa
      metriques={METRIQUES}
      serie={SERIE_VIDE}
      candidats={[]}
      tarife={false}
      {...props}
    />,
  );

describe("B-07 — Coûts IA", () => {
  it("n'affiche aucune valeur, et dit pourquoi", () => {
    const { container } = coutsIa();
    expect(container.textContent).toContain("Aucune mesure enregistrée");
    expect(container.textContent).toContain(
      "un chiffre posé ici serait repris comme une spécification",
    );
    expect(screen.getAllByText("—").length).toBe(METRIQUES.length);
  });

  it("nomme les métriques et leur source de calcul", () => {
    const { container } = coutsIa({ tarife: true });
    expect(container.textContent).toContain("AiUsage.inputTokens + outputTokens");
    expect(container.textContent).toContain("Coût IA par dossier payant");
  });

  it("exprime les garde-fous en ratio, avec leur conséquence", () => {
    const { container } = coutsIa();
    expect(espaces(container.textContent ?? "")).toContain("15 % du prix du pack");
    expect(container.textContent).toContain("liste des dépassements");
    expect(container.textContent).toContain("3 × la médiane des 7 derniers jours");
  });

  /**
   * ── Deux des trois garde-fous ne gardaient rien ─────────────────────
   *
   * L'écran listait les trois avec leur conséquence : « au-delà, la file
   * passe en revue humaine », « email à l'équipe produit ». Aucune des deux
   * n'existe. `plafondQuotidien` et `medianeQuotidienne` sont écrits, testés
   * et lus par personne ; la seule bascule en revue humaine du produit se
   * déclenche sur trois tentatives d'analyse en échec, pas sur un coût ; et
   * aucun budget de référence n'existe côté serveur.
   *
   * Un superviseur lisait donc, sur l'écran fait pour le protéger d'une
   * dérive de coût, qu'un frein automatique existait. Le module condamne
   * lui-même la chose : « un seuil sans conséquence n'est pas un garde-fou ».
   */
  it("dit lesquels de ses seuils sont appliqués, et ce qui manque aux autres", () => {
    const { container } = coutsIa();
    const texte = container.textContent ?? "";

    // Le décompte, avant la liste.
    expect(texte).toContain(libelleDesGardeFous());
    expect(libelleDesGardeFous()).toBe("1 seuil appliqué sur 3");

    // Chaque seuil non appliqué le dit, et dit ce qui lui manque.
    const nonTenus = GARDE_FOUS.filter((g) => !g.tenu);
    expect(nonTenus).toHaveLength(2);
    for (const g of nonTenus) expect(texte).toContain(g.manque);
    expect(texte).toContain(MENTION_GARDE_FOU_NON_TENU);

    // Et la conséquence n'est plus affirmée au présent de l'indicatif : ni
    // « la file passe », ni « email à l'équipe produit » tout court.
    expect(texte).not.toContain("la file passe en revue humaine");
    expect(texte).toContain("la file devrait passer en revue humaine");
  });

  it("ne montre aucune donnée de candidat", () => {
    const { container } = coutsIa();
    expect(container.textContent).toContain("Aucune donnée de candidat");
  });

  // ── Le défaut de S.6 : des appels enregistrés, aucun tarif ────────────

  it("ne présente jamais un coût nul quand le tarif manque", () => {
    const { container } = coutsIa({
      tarife: false,
      metriques: metriquesMesurees({
        dossiers: 3,
        jetons: 16_500,
        appels: 4,
        coutMicros: null,
        pirePart: null,
        devise: null,
      }),
      serie: SERIE_PLEINE,
    });

    const texte = espaces(container.textContent ?? "");
    expect(texte).toContain("Les coûts ne sont pas calculés");
    expect(texte).toContain("Un tarif manquant ne vaut pas zéro");
    // Les trois métriques tarifées restent au tiret ; les deux comptées, non.
    expect(screen.getAllByText("—").length).toBe(3);
    expect(texte).toContain("16 500 jetons");
    expect(texte).toContain("4 appels");
    expect(texte).not.toMatch(/0,00\s/);
    expect(texte).not.toContain("0,0 % au plus haut");
  });

  it("ne relève aucune marge sans tarif, et le dit", () => {
    const { container } = coutsIa({ tarife: false, candidats: CANDIDATS });
    expect(container.textContent).toContain(
      "ne peuvent pas être relevés sans tarif",
    );
    expect(container.textContent).not.toContain("dossier-trop-cher");
  });

  /**
   * **La liste ne pouvait pas être non vide sans tarif.** Elle écartait
   * toute ligne dont la marge était inconnue, c'est-à-dire toutes — et
   * un dossier à dix fois le quota de jetons de son pack n'apparaissait
   * nulle part. Le quota, lui, se compare sans connaître le prix de rien.
   */
  it("relève un dossier hors quota même sans tarif", () => {
    const { container } = coutsIa({ tarife: false, candidats: HORS_QUOTA });
    expect(container.textContent).toContain("dossier-gourmand");
    expect(espaces(container.textContent ?? "")).toContain(
      "1 000 % du quota de jetons du pack ESSENTIEL",
    );
    // Et l'écran dit pourquoi cette alerte-là tient sans tarif.
    expect(container.textContent).toContain("se compare sans tarif");
  });

  /** Les deux mesures se lisent côte à côte une fois le tarif posé. */
  it("distingue la marge du quota dans le libellé", () => {
    const { container } = coutsIa({
      tarife: true,
      candidats: [...CANDIDATS, ...HORS_QUOTA],
    });
    const texte = espaces(container.textContent ?? "");
    expect(texte).toContain("du prix du pack DOSSIER");
    expect(texte).toContain("du quota de jetons du pack ESSENTIEL");
  });

  it("nomme le dossier qui dépasse, une fois le tarif posé", () => {
    const { container } = coutsIa({ tarife: true, candidats: CANDIDATS });
    expect(container.textContent).toContain("dossier-trop-cher");
    expect(espaces(container.textContent ?? "")).toContain("22 % du prix du pack DOSSIER");
    expect(container.textContent).toContain("appelle une analyse");
    // Celui qui reste sous le seuil n'encombre pas la liste.
    expect(container.textContent).not.toContain("dossier-sage");
  });

  it("affiche les montants dans la devise du tarif", () => {
    const { container } = coutsIa({
      tarife: true,
      metriques: metriquesMesurees({
        dossiers: 2,
        jetons: 9_000,
        appels: 3,
        coutMicros: 1_250_000,
        pirePart: 0.03,
        devise: "XOF",
      }),
    });
    const texte = espaces(container.textContent ?? "");
    expect(texte).toContain("1,25 XOF");
    expect(texte).toContain("3,0 % au plus haut");
    expect(texte).not.toContain("Les coûts ne sont pas calculés");
  });

  // ── L'histogramme ─────────────────────────────────────────────────────

  it("ne prétend pas avoir des appels quand il n'en a aucun", () => {
    const { container } = coutsIa({ serie: SERIE_VIDE });
    expect(container.textContent).toContain("Aucun appel enregistré");
  });

  it("garde le jour sans appel dans la série, à zéro", () => {
    coutsIa({ serie: SERIE_PLEINE });
    const barres = screen.getByRole("list", { name: /Jetons consommés par jour/ });
    const lu = espaces(barres.textContent ?? "");
    expect(barres.children).toHaveLength(14);
    expect(lu).toContain("aucun appel");
    expect(lu).toContain("12 000 jetons, 3 appels");
    // Le singulier : « 1 appels » se lit sur l'écran, pas dans un test de plus.
    expect(lu).toMatch(/4 500 jetons, 1 appel$/);
  });

  // ── Les deux commandes retirées ───────────────────────────────────────

  it("ne propose plus de modifier des plafonds qui ne se modifient pas", () => {
    coutsIa({ tarife: true });
    expect(screen.queryByRole("button", { name: /Modifier les plafonds/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Exporter/ })).toBeNull();
  });
});
