import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Simulateur } from "@/app/(public)/simulateur/Simulateur";
import { Resultats } from "@/app/(public)/resultats/Resultats";
import { Tarifs } from "@/app/(public)/tarifs/Tarifs";
import { AccueilSimulateur } from "@/app/(public)/AccueilSimulateur";
import { PACKS, RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

const pousser = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pousser(url) }),
}));

/**
 * Réponse du serveur, posée par chaque test qui en attend une. Les écrans
 * appellent désormais l'API : la mimer ici vérifie le branchement, là où une
 * donnée importée depuis un fichier de contenu ne vérifiait que le rendu.
 */
function repondre(charge: unknown, statut = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: statut < 400,
    status: statut,
    json: async () => charge,
  } as Response);
}

beforeEach(() => {
  pousser.mockClear();
  window.sessionStorage.clear();
  global.fetch = vi.fn().mockRejectedValue(new Error("aucune réponse posée"));
});

describe("P-02 — Simulateur", () => {
  it("pose la première question et son aide", () => {
    render(<Simulateur />);
    expect(
      screen.getByRole("heading", { name: "Quel est ton objectif ?" }),
    ).toBeDefined();
    expect(screen.getByText(/Tu pourras changer de destination/)).toBeDefined();
    expect(screen.getByText("1 / 6")).toBeDefined();
  });

  it("n'autorise pas de continuer sans réponse, et dit pourquoi", () => {
    render(<Simulateur />);
    const continuer = screen.getByRole("button", { name: "Continuer" });
    expect(continuer).toBeDisabled();
    expect(continuer).toHaveAccessibleDescription(
      "Choisis une réponse pour continuer.",
    );
  });

  it("les réponses se choisissent aux flèches, en un seul arrêt de tabulation (revue M12)", () => {
    render(<Simulateur />);
    const options = screen.getAllByRole("radio");
    expect(options.filter((o) => o.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(options[0]).toHaveAttribute("tabindex", "0");
    // Comme un groupe radio natif : la flèche part de l'option qui a le focus.
    fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
    expect(options[1]).toBeChecked();
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1]!, { key: "End" });
    expect(options.at(-1)).toBeChecked();
    // Choisir ne fait pas avancer : « Continuer » reste le geste qui passe à la suite.
    expect(screen.getByText("1 / 6")).toBeDefined();
  });

  it("marque la réponse retenue par aria-checked", () => {
    render(<Simulateur />);
    fireEvent.click(screen.getByRole("radio", { name: /Étudier/ }));
    expect(screen.getByRole("radio", { name: /Étudier/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });

  it("déplace le focus sur le titre à chaque étape (règle clavier 7)", async () => {
    render(<Simulateur />);
    // Au premier rendu le focus ne bouge pas (règle clavier 6).
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(screen.getByRole("radio", { name: /Étudier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => {
      const titre = screen.getByRole("heading", {
        name: "Quel est ton plus haut diplôme obtenu ?",
      });
      expect(document.activeElement).toBe(titre);
      expect(titre).toHaveAttribute("tabindex", "-1");
    });
  });

  it("garde les réponses le temps de la session, et pas au-delà", () => {
    const { unmount } = render(<Simulateur />);
    fireEvent.click(screen.getByRole("radio", { name: /Travailler/ }));
    unmount();

    render(<Simulateur />);
    expect(screen.getByRole("radio", { name: /Travailler/ })).toBeChecked();

    window.sessionStorage.clear();
    unmount();
  });

  it("mène aux résultats depuis la dernière question", async () => {
    render(<Simulateur />);
    for (let i = 0; i < 6; i++) {
      const choix = screen.getAllByRole("radio")[0];
      fireEvent.click(choix as HTMLElement);
      const suite = screen.getByRole("button", {
        name: i === 5 ? "Voir mes destinations" : "Continuer",
      });
      fireEvent.click(suite);
    }
    await waitFor(() => expect(pousser).toHaveBeenCalledWith("/resultats"));
  });
});

describe("P-01 — bloc de départ du simulateur", () => {
  it("ouvre une feuille du bas par champ et enregistre la réponse", async () => {
    render(<AccueilSimulateur />);
    const champ = screen.getByRole("button", { name: /Objectif/ });
    fireEvent.click(champ);

    const feuille = await screen.findByRole("dialog");
    expect(feuille).toHaveAccessibleName("Quel est ton objectif ?");

    fireEvent.click(screen.getByRole("button", { name: "Étudier" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Étudier/ })).toBeDefined();
  });
});

describe("P-03 — Résultats", () => {
  it("montre son état vide quand rien n'a été répondu, avec la reprise", async () => {
    render(<Resultats />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Aucune réponse à classer pour le moment" }),
      ).toBeDefined(),
    );
    expect(screen.getByRole("link", { name: "Lancer le simulateur" })).toHaveAttribute(
      "href",
      "/simulateur",
    );
  });

  it("classe ce que le serveur renvoie, et nomme l'écart de chaque écartée", async () => {
    repondre({
      retenues: [
        {
          rang: "1",
          slug: "pays-bas",
          code: "NL",
          pays: "Pays-Bas",
          motifs: [{ texte: "B2 exigé, tu déclares B2.", favorable: true }],
          mention: { source: "ind.nl", verifieeLe: "2026-09-11" },
        },
      ],
      ecartees: [
        {
          code: "CH",
          pays: "Suisse",
          motif: "Le budget déclaré ne couvre pas la première année.",
          ecart: "12 000 000 F demandés, 2 000 000 F au-dessus de ton budget.",
        },
      ],
      aucuneNePasse: false,
      composantesAbsentes: ["qualité de vie", "coût de la vie"],
    });
    window.sessionStorage.setItem(
      "immipro.simulation",
      JSON.stringify({ objectif: "Étudier", budget: "8 à 12 millions F" }),
    );
    render(<Resultats />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Une destination correspond à ton profil" }),
      ).toBeDefined(),
    );
    expect(screen.getByText("Étudier, 8 à 12 millions F")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Pays-Bas" })).toBeDefined();
    // L'écart est chiffré : c'est ce qui rend le manque franchissable.
    expect(screen.getByText(/2 000 000 F au-dessus de ton budget/)).toBeDefined();
    expect(screen.getByText(/ne prédit aucune décision de l'administration/)).toBeDefined();
  });

  it("le titre suit le résultat, il n'annonce pas trois destinations quand il n'y en a aucune", async () => {
    repondre({
      retenues: [],
      ecartees: [
        {
          code: "NL",
          pays: "Pays-Bas",
          motif: "Niveau de langue non atteint.",
          ecart: "B2 exigé, tu déclares B1.",
          mention: { source: "ind.nl", verifieeLe: "2026-09-11" },
        },
      ],
      aucuneNePasse: true,
      composantesAbsentes: ["qualité de vie", "coût de la vie"],
    });
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "Étudier" }));
    render(<Resultats />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Aucune destination ne réunit encore tes conditions",
        }),
      ).toBeDefined(),
    );
    // RG-01.3 : ce qui manque est montré, chiffré, au lieu d'un écran vide.
    expect(screen.getByText("B2 exigé, tu déclares B1.")).toBeDefined();
  });

  it("le réseau coupé dit ce qui est conservé et propose de réessayer", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("réseau"));
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "Étudier" }));
    render(<Resultats />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("Tu es hors ligne");
    expect(alerte.textContent).toContain("tu n'as rien à ressaisir");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeDefined();
  });

  /**
   * I.A — le classement dit ce qu'il a pesé, et ce qu'il n'a pas pu peser.
   * Le serveur le savait depuis le premier jour ; l'écran ne le lisait pas.
   */
  it("nomme les critères comparés et ceux qui manquent, sans citer de part", async () => {
    repondre({
      retenues: [
        {
          rang: "1",
          slug: "pays-bas",
          code: "NL",
          pays: "Pays-Bas",
          motifs: [{ texte: "B2 exigé, tu déclares B2.", favorable: true }],
          mention: { source: "ind.nl", verifieeLe: "2026-09-11" },
        },
      ],
      ecartees: [],
      aucuneNePasse: false,
      composantesAbsentes: ["qualité de vie", "coût de la vie"],
    });
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "Étudier" }));
    const { container } = render(<Resultats />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Pays-Bas" })).toBeDefined());
    expect(screen.getByText(/compare quatre critères publiés/)).toBeDefined();
    expect(
      screen.getByText(/Deux critères prévus n'y entrent pas, faute d'une source datée/),
    ).toBeDefined();
    // Aucune destination écartée : la source doit tout de même être là.
    expect(screen.getByText(/ne prédit aucune décision de l'administration/)).toBeDefined();
    // Arbitrage C-09 : les poids ordonnent, ils ne s'affichent pas.
    expect(container.textContent ?? "").not.toMatch(/\d+\s?%/u);
  });

  it("l'écran où rien ne passe porte lui aussi sa source", async () => {
    repondre({
      retenues: [],
      ecartees: [
        {
          code: "NL",
          pays: "Pays-Bas",
          motif: "Niveau de langue non atteint.",
          ecart: "B2 exigé, tu déclares B1.",
          mention: { source: "ind.nl", verifieeLe: "2026-09-11" },
        },
      ],
      aucuneNePasse: true,
      composantesAbsentes: ["qualité de vie", "coût de la vie"],
    });
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "Étudier" }));
    render(<Resultats />);

    await waitFor(() => expect(screen.getByText("B2 exigé, tu déclares B1.")).toBeDefined());
    expect(screen.getByText(/source : ind\.nl/)).toBeDefined();
  });

  it("n'annonce aucune décision de l'administration", async () => {
    repondre({ retenues: [], ecartees: [], aucuneNePasse: true, composantesAbsentes: [] });
    window.sessionStorage.setItem(
      "immipro.simulation",
      JSON.stringify({ objectif: "Étudier" }),
    );
    const { container } = render(<Resultats />);
    await waitFor(() => expect(screen.queryAllByRole("heading").length).toBeGreaterThan(0));
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/probabilit/i);
    expect(texte).not.toMatch(/garanti/i);
  });

  describe("« Ouvrir un dossier » selon la session", () => {
    const UNE_RETENUE = {
      retenues: [
        {
          rang: "1",
          slug: "pays-bas-etudes",
          code: "NL",
          pays: "Pays-Bas",
          motifs: [{ texte: "B2 exigé, tu déclares B2.", favorable: true }],
          mention: { source: "ind.nl", verifieeLe: "2026-09-11" },
        },
      ],
      ecartees: [],
      aucuneNePasse: false,
      composantesAbsentes: [],
    };

    it("un candidat connecté va à l'ouverture de dossier, sur la destination en tête", async () => {
      repondre(UNE_RETENUE);
      window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "Étudier" }));
      render(<Resultats connecte />);
      const lien = await screen.findByRole("link", { name: "Ouvrir un dossier" });
      expect(lien).toHaveAttribute("href", "/dossiers/nouveau?destination=pays-bas-etudes");
    });

    it("un visiteur va à l'inscription, comme avant", async () => {
      repondre(UNE_RETENUE);
      window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ objectif: "Étudier" }));
      render(<Resultats />);
      const lien = await screen.findByRole("link", { name: "Ouvrir un dossier" });
      expect(lien).toHaveAttribute("href", "/inscription");
    });
  });
});

describe("P-06 — Tarifs, bascule de devise au clavier (revue M12)", () => {
  it("un arrêt de tabulation, et la flèche passe aux euros", () => {
    render(<Tarifs />);
    const cfa = screen.getByRole("radio", { name: "Francs CFA" });
    const euros = screen.getByRole("radio", { name: "Euros" });
    expect(euros).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(cfa, { key: "ArrowRight" });
    expect(euros).toBeChecked();
    expect(euros).toHaveFocus();
  });
});

describe("P-06 — Tarifs", () => {
  it("affiche les montants du domaine, dans la grille en francs CFA", () => {
    const { container } = render(<Tarifs />);
    expect(screen.getByRole("radio", { name: "Francs CFA" })).toBeChecked();
    // Les prix de l'écran sont ceux de pricing.ts, pas une copie.
    for (const pack of PACKS) {
      expect(container.textContent).toContain(formatMontant(pack.prix.XOF, "XOF"));
    }
    expect(container.textContent).toContain(
      formatMontant(RECHARGE_ANALYSES.prix.XOF, "XOF"),
    );
  });

  it("bascule sur la grille en euros sans annoncer de taux de change", () => {
    const { container } = render(<Tarifs />);
    fireEvent.click(screen.getByRole("radio", { name: "Euros" }));
    expect(screen.getByRole("radio", { name: "Euros" })).toBeChecked();
    const texte = container.textContent ?? "";
    expect(texte).toContain("aucun montant n'est la conversion de l'autre");
    expect(texte).not.toMatch(/taux de change/i);
  });

  it("met en avant le seul pack que le domaine désigne, avec sa justification", () => {
    render(<Tarifs />);
    const misEnAvant = PACKS.filter((p) => p.misEnAvant);
    expect(misEnAvant).toHaveLength(1);
    const badge = screen.getByText(misEnAvant[0]?.justification as string);
    expect(badge).toBeDefined();
    // Le badge dit ce que le pack couvre, jamais qu'il est populaire.
    expect(screen.queryByText(/le plus choisi|populaire/i)).toBeNull();
  });

  /*
    R-E02 (recette du 09/10/2026, S.162) : le badge était `flex-none`. Une
    phrase qui ne rétrécit pas élargissait la page à 436 px sur un écran de
    390, mesuré dans un vrai navigateur. jsdom ne mesure rien : on vérifie
    que rien n'interdit au badge de rétrécir ni de replier son texte.
  */
  it("le badge peut se replier : une phrase ne doit pas élargir l'écran", () => {
    render(<Tarifs />);
    const justification = PACKS.find((p) => p.misEnAvant)?.justification as string;
    const classes = screen.getByText(justification).className.split(/\s+/u);
    for (const interdit of ["flex-none", "shrink-0", "whitespace-nowrap", "truncate"]) {
      expect(classes, interdit).not.toContain(interdit);
    }
    expect(classes).toContain("max-w-full");
  });

  it("dit que les frais versés à l'administration ne passent pas par ImmiPro", () => {
    const { container } = render(<Tarifs />);
    expect(container.textContent).toContain(
      "ne sont pas inclus et ne passent jamais par ImmiPro",
    );
  });
});
