import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import PageChecklist from "@/app/(app)/(dossier)/dossiers/[id]/page";
import PageCompletude from "@/app/(app)/(dossier)/dossiers/[id]/completude/page";
import PageEcheancier from "@/app/(app)/(dossier)/dossiers/[id]/echeancier/page";
import { PieceDuDossier } from "@/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier";
import { Cloture } from "@/app/(app)/(dossier)/dossiers/[id]/cloture/Cloture";
import {
  ANALYSE_RESSOURCES,
  PIECES_NL,
  QUOTA,
  dossierParId,
} from "@/lib/contenu/dossiers";
import { LIBELLE_PALIER } from "@/domain/completeness/score";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

const DOSSIER = dossierParId("nl-4471")!;
const params = Promise.resolve({ id: "nl-4471" });

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

describe("C-06 — Checklist", () => {
  it("affiche un palier et un dénombrement, jamais une note sur cent", async () => {
    const { container } = render(await PageChecklist({ params }));
    expect(screen.getAllByText(LIBELLE_PALIER.INCOMPLET).length).toBeGreaterThan(0);
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/\d\s?\/\s?100/);
    expect(texte).not.toMatch(/\d\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
  });

  it("range les pièces en obligatoires et complémentaires, avec l'avancement", async () => {
    render(await PageChecklist({ params }));
    expect(screen.getByText("Obligatoires")).toBeDefined();
    expect(screen.getByText("3 sur 5 conformes")).toBeDefined();
    expect(screen.getByText("Complémentaires")).toBeDefined();
  });

  it("fait de chaque ligne un lien atteignable au clavier (règle 5)", async () => {
    render(await PageChecklist({ params }));
    const ligne = screen.getByRole("link", { name: /Passeport/ });
    expect(ligne.getAttribute("href")).toBe("/dossiers/nl-4471/pieces/passeport");
  });

  it("garde le constat suivi de l'action sur une pièce à corriger", async () => {
    render(await PageChecklist({ params }));
    expect(screen.getByText(/Lance le renouvellement avant de déposer/)).toBeDefined();
  });

  it("ne dit pas « expire bientôt » d'une pièce valable au-delà du dépôt", async () => {
    const { container } = render(await PageChecklist({ params }));
    expect(container.textContent).toContain("Valable jusqu'au 3 mars 2027");
    expect(container.textContent).not.toContain("Expire bientôt");
  });

  it("annonce ce qui bloque, sans parler de pièces à reprendre", async () => {
    const { container } = render(await PageChecklist({ params }));
    expect(screen.getByText("2 pièces bloquent le dépôt")).toBeDefined();
    expect(container.textContent).not.toContain("à reprendre");
  });

  it("porte la source et la date de vérification (INV-8)", async () => {
    const { container } = render(await PageChecklist({ params }));
    expect(container.textContent).toMatch(/Information vérifiée le .* source : ind\.nl/);
  });
});

describe("C-09 — Complétude", () => {
  it("nomme le palier et dénombre, sans aucune note ni part", async () => {
    const { container } = render(await PageCompletude({ params }));
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
    render(await PageCompletude({ params }));
    const bloque = screen.getByRole("heading", { name: "Ce qui bloque le dépôt" })
      .parentElement!.parentElement!;
    expect(within(bloque).getByRole("link", { name: /Passeport/ })).toBeDefined();
    expect(screen.getByRole("heading", { name: "À traiter ensuite" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Déjà conforme" })).toBeDefined();
  });

  it("rappelle qu'un dossier complet n'est pas un dossier accepté", async () => {
    const { container } = render(await PageCompletude({ params }));
    expect(container.textContent).toContain("Un dossier complet n'est pas un dossier accepté");
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
    expect(screen.getByText("Montant exigé")).toBeDefined();
    expect(container.textContent).toContain("Lecture automatique, susceptible d'erreur");
    expect(screen.getByRole("link", { name: "Signaler une erreur de lecture" })).toBeDefined();
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
  it("groupe les échéances par mois et dit ce que chaque date implique", async () => {
    const { container } = render(await PageEcheancier({ params }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Échéancier");
    expect(screen.getByRole("heading", { name: "Octobre 2026" })).toBeDefined();
    expect(container.textContent).toContain(
      "Compte six à huit semaines de délai à la Direction de l'émigration",
    );
  });

  it("marque la pièce périssable comme une date au plus tôt", async () => {
    const { container } = render(await PageEcheancier({ params }));
    expect(container.textContent).toContain("Pièce périssable — date au plus tôt");
  });

  it("ne garantit pas les délais administratifs", async () => {
    const { container } = render(await PageEcheancier({ params }));
    expect(container.textContent).toContain(
      "des moyennes observées, non garanties",
    );
  });

  it("dit ce qu'il manque au brouillon plutôt que d'afficher un calendrier vide", async () => {
    const { container } = render(
      await PageEcheancier({ params: Promise.resolve({ id: "de-8820" }) }),
    );
    expect(container.textContent).toContain("L'échéancier attend ta date de dépôt");
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
