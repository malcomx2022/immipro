import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import GabaritAdmin from "@/app/(admin)/layout";
import { FileDeVeille } from "@/app/(admin)/veille/FileDeVeille";
import { EditionRegle } from "@/app/(admin)/regles/[id]/EditionRegle";
import { RevueDesPieces } from "@/app/(admin)/revue/RevueDesPieces";
import { Utilisateurs } from "@/app/(admin)/utilisateurs/Utilisateurs";
import { Paiements } from "@/app/(admin)/paiements/Paiements";
import { Journal } from "@/app/(admin)/journal/Journal";
import PageCoutsIa from "@/app/(admin)/couts-ia/page";
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

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

const AUJOURDHUI = "2026-09-18";
const MAINTENANT = "2026-09-18T09:41:00Z";
const espaces = (t: string) => t.replace(/[\s  ]/gu, " ");

const editerRegle = () =>
  render(
    <EditionRegle
      enVigueur={REGLE_EN_VIGUEUR}
      brouillon={REGLE_BROUILLON}
      dossiersConcernes={DOSSIERS_EN_VERSION_4}
      dossiersSousLaNouvelleRegle={DOSSIERS_SOUS_LA_VERSION_5}
      historique={HISTORIQUE_REGLE}
    />,
  );

describe("gabarit back-office", () => {
  it("porte la navigation des six registres et le lien d'évitement", () => {
    render(
      <GabaritAdmin>
        <h1 id="contenu" tabIndex={-1}>
          Écran
        </h1>
      </GabaritAdmin>,
    );
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toBeDefined();
    const nav = screen.getByRole("navigation", { name: "Navigation du back-office" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(6);
    expect(within(nav).getByRole("link", { name: "Journal d'audit" })).toBeDefined();
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

  it("ne précharge aucune pièce : l'ouverture est un acte séparé", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("l'ouverture d'une pièce est un acte tracé");
    expect(screen.getByRole("button", { name: "Ouvrir la pièce" })).toBeDefined();
    expect(container.textContent).not.toContain("aperçu de la pièce");

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir la pièce" }));
    expect(screen.getByText(/aperçu de la pièce/)).toBeDefined();
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

  it("n'offre que les actions qui ont un sens pour le compte retenu", () => {
    rendre();
    expect(
      screen.queryByRole("button", { name: "Renvoyer l'email de vérification" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Email non vérifié" }));
    expect(
      screen.getByRole("button", { name: "Renvoyer l'email de vérification" }),
    ).toBeDefined();
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
    const { container } = render(<PageCoutsIa />);
    expect(container.textContent).toContain("Aucune mesure enregistrée");
    expect(container.textContent).toContain("un chiffre posé ici serait repris comme une spécification");
    expect(screen.getAllByText("—").length).toBe(4);
  });

  it("nomme les métriques et leur source de calcul", () => {
    const { container } = render(<PageCoutsIa />);
    expect(container.textContent).toContain("somme de AiUsage.costXof sur la période");
    expect(container.textContent).toContain("Coût IA par dossier payant");
  });

  it("exprime les garde-fous en ratio, avec leur conséquence", () => {
    const { container } = render(<PageCoutsIa />);
    expect(espaces(container.textContent ?? "")).toContain("15 % du prix du pack");
    expect(container.textContent).toContain("le pack est vendu trop bas");
    expect(container.textContent).toContain("3 × la médiane des 7 derniers jours");
    expect(container.textContent).toContain("la file passe en revue humaine");
  });

  it("désactive l'export en disant qu'il n'y a rien à exporter", () => {
    render(<PageCoutsIa />);
    expect(
      screen.getByRole("button", { name: /Exporter le détail des appels/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/il n'y a rien à exporter/)).toBeDefined();
  });

  it("ne montre aucune donnée de candidat", () => {
    const { container } = render(<PageCoutsIa />);
    expect(container.textContent).toContain("Aucune donnée de candidat");
  });
});
