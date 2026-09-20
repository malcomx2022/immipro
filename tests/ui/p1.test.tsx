import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChoixDeLaPiece } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/ChoixDeLaPiece";
import { Redaction } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/Redaction";
import { Relecture } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/relecture/Relecture";
import { REMARQUES_MOTIVATION } from "@/lib/contenu/redaction";
import { Alertes } from "@/app/(app)/(dossier)/notifications/Alertes";
import { PropositionPartenaire } from "@/app/(app)/(dossier)/dossiers/[id]/PropositionPartenaire";
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

const pousse = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pousse }),
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
        versions={[]}
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

describe("R-03 — Éditeur et versions", () => {
  const rendre = () =>
    render(
      <Redaction
        dossier={DOSSIER}
        piece={MOTIVATION}
        versions={VERSIONS_MOTIVATION}
        suggestion={SUGGESTION_EN_ATTENTE}
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

describe("R-04 — Analyse critique", () => {
  // La page lit la base ; le composant rend. Les remarques du contenu de
  // référence suffisent à vérifier l'écran, sans base de données.
  const relecture = () => (
    <Relecture
      dossier={dossierParId("nl-4471")!}
      type="lettre-motivation"
      remarques={REMARQUES_MOTIVATION}
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

describe("T-03 — Proposition partenaire", () => {
  const rendre = () =>
    render(
      <PropositionPartenaire
        partenaire={PARTENAIRE}
        motif={MOTIF_PARTENAIRE}
        dossierId="nl-4471"
      />,
    );

  it("nomme le motif avant de proposer quoi que ce soit", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Ce point dépasse ce que nous savons faire");
    expect(container.textContent).toContain("refus de visa Schengen en 2024");
  });

  it("annonce la commission dans l'écran, au taux porté par la grille", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    const dialogue = screen.getByRole("dialog");
    expect(espaces(dialogue.textContent ?? "")).toContain(
      `commission de ${espaces(tauxCommissionFormate())} sur cette prestation`,
    );
  });

  it("lit le tarif et la durée dans la grille, pas dans le prototype", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    const texte = espaces(screen.getByRole("dialog").textContent ?? "");
    expect(texte).toContain("20 000 F, 45 minutes");
    expect(texte).not.toContain("25 000 F");
  });

  it("dit que refuser ne coûte rien, et le tient", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    expect(
      screen.getByText("Refuser ne change rien à ton dossier ni à ton pack."),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Voir les créneaux" }).getAttribute("href"),
    ).toBe("/consultants?dossier=nl-4471");
    fireEvent.click(screen.getByRole("button", { name: "Continuer sans consultant" }));
    expect(screen.getByText(/Ton dossier et ton pack sont inchangés/)).toBeDefined();
  });

  it("respecte un refus définitif", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ne plus me proposer de consultant" }),
    );
    expect(screen.getByText(/Nous ne te proposerons plus de partenaire/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Voir la proposition" })).toBeNull();
  });

  it("rappelle qu'ImmiPro n'est pas un cabinet de conseil", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "ImmiPro n'est pas un cabinet de conseil en immigration",
    );
  });
});
