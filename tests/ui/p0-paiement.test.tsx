import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChoixDuPack } from "@/app/(app)/paiement/pack/ChoixDuPack";
import { Recapitulatif } from "@/app/(app)/paiement/recapitulatif/Recapitulatif";
import { Attente } from "@/app/(app)/paiement/attente/Attente";
import { Echec } from "@/app/(app)/paiement/echec/Echec";
import { PACKS } from "@/domain/payments/pricing";
import { DELAI_REESSAI_SECONDES } from "@/domain/paiement/attente";
import { formatMontant } from "@/lib/utils";
import { readFileSync } from "node:fs";
import { LIBELLE_ETAT } from "@/domain/paiement/recu";
import type { PaiementEnCours, Tunnel } from "@/server/lecture/paiements";

const parametres = new URLSearchParams();
const pousse = vi.fn();
const remplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pousse, replace: remplace }),
  useSearchParams: () => parametres,
}));

const reponse = (corps: unknown, statut = 200) =>
  Promise.resolve({
    ok: statut < 400,
    status: statut,
    json: () => Promise.resolve(corps),
  } as Response);

const TUNNEL: Tunnel = {
  dossier: { id: "nl-1", pays: "Pays-Bas", intitule: "Séjour pour études (MVV + VVR)" },
  devise: "XOF",
  paysConnu: true,
  telephone: "97 •• •• 42",
  dejaOuvert: false,
};

const EN_COURS: PaiementEnCours = {
  reference: "IMP-260920-4K7QZA",
  etat: "en_cours",
  statut: "EN_ATTENTE",
  montant: PACKS[0]?.prix.XOF ?? 0,
  devise: "XOF",
  moyen: "Mobile Money",
  achat: PACKS[0]?.libelle ?? "",
  achatCode: PACKS[0]?.code ?? "",
  dossierId: "nl-1",
  telephone: "97 •• •• 42",
};

beforeEach(() => {
  for (const cle of [...parametres.keys()]) parametres.delete(cle);
  pousse.mockClear();
  remplace.mockClear();
});

describe("$-01 — Choix du pack", () => {
  it("ne présélectionne aucun pack et dit ce qui bloque", () => {
    render(<ChoixDuPack tunnel={TUNNEL} />);
    for (const radio of screen.getAllByRole("radio", { name: /Essentiel|Dossier/ })) {
      expect(radio).not.toBeChecked();
    }
    const continuer = screen.getByRole("button", { name: "Continuer" });
    expect(continuer).toBeDisabled();
    expect(continuer).toHaveAccessibleDescription("Choisissez un pack pour continuer.");
  });

  it("affiche les montants du domaine, pas une copie", () => {
    const { container } = render(<ChoixDuPack tunnel={TUNNEL} />);
    for (const pack of PACKS) {
      expect(container.textContent).toContain(formatMontant(pack.prix.XOF, "XOF"));
    }
  });

  it("met en avant le seul pack que le domaine désigne, par sa justification", () => {
    render(<ChoixDuPack tunnel={TUNNEL} />);
    const misEnAvant = PACKS.filter((p) => p.misEnAvant);
    expect(misEnAvant).toHaveLength(1);
    expect(screen.getByText(misEnAvant[0]?.justification as string)).toBeDefined();
    expect(screen.queryByText(/le plus choisi|populaire/i)).toBeNull();
  });

  it("débloque la suite une fois un pack retenu, et emporte le dossier", () => {
    // « Continuer » ne débite pas : c'est un lien vers le récapitulatif,
    // seul écran à répéter le montant avant le débit. Il porte donc le
    // dossier et le pack, sinon le récapitulatif ne saurait quoi vendre.
    render(<ChoixDuPack tunnel={TUNNEL} />);
    fireEvent.click(screen.getByRole("radio", { name: /Essentiel/ }));
    const suite = screen.getByRole("link", { name: /Continuer avec Essentiel/ });
    expect(suite.getAttribute("href")).toBe(
      "/paiement/recapitulatif?dossier=nl-1&achat=essentiel&devise=XOF",
    );
  });

  it("dit que les frais versés à l'administration ne passent pas par ImmiPro", () => {
    const { container } = render(<ChoixDuPack tunnel={TUNNEL} />);
    expect(container.textContent).toContain(
      "ne sont pas inclus et ne passent jamais par ImmiPro",
    );
  });

  it("annonce que la recharge ne s'achète pas ici", () => {
    render(<ChoixDuPack tunnel={TUNNEL} />);
    expect(screen.getByText(/n'est pas un pack/)).toBeDefined();
  });
});

describe("$-02 — Récapitulatif", () => {
  it("ne coche pas les conditions d'avance", () => {
    render(
      <Recapitulatif
        tunnel={TUNNEL}
        achat={{ code: PACKS[0]!.code, libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("ne débite pas tant que les conditions ne sont pas acceptées", () => {
    render(
      <Recapitulatif
        tunnel={TUNNEL}
        achat={{ code: PACKS[0]!.code, libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    const payer = screen.getByRole("button", { name: /Payer/ });
    expect(payer).toBeDisabled();
    expect(payer).toHaveAccessibleDescription(
      "Acceptez les conditions d'utilisation pour payer.",
    );

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Payer/ })).toBeEnabled();
  });

  it("répète le montant sur le bouton, avant tout déclenchement", () => {
    const montant = formatMontant(PACKS[0]?.prix.XOF ?? 0, "XOF");
    render(
      <Recapitulatif
        tunnel={TUNNEL}
        achat={{ code: PACKS[0]!.code, libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(screen.getByRole("button", { name: `Payer ${montant}` })).toBeDefined();
  });

  it("n'annonce aucun taux de change entre les deux grilles", () => {
    const { container } = render(
      <Recapitulatif
        tunnel={TUNNEL}
        achat={{ code: PACKS[0]!.code, libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(container.textContent).toContain("ce n'est pas une conversion");
    expect(container.textContent).not.toMatch(/taux de change|655/i);
  });

  it("masque le numéro Mobile Money", () => {
    const { container } = render(
      <Recapitulatif
        tunnel={TUNNEL}
        achat={{ code: PACKS[0]!.code, libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(container.textContent).toContain("97 •• •• 42");
    expect(container.textContent).not.toContain("97000042");
  });
});

describe("$-03 — Attente Mobile Money", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("n'annonce que le statut, jamais le décompte (règle clavier 10)", () => {
    render(<Attente attente={EN_COURS} />);
    const statut = screen.getByRole("status");
    expect(statut).toHaveTextContent("En attente de ta confirmation");
    // Le rebours et la relève sont hors de la région vivante.
    expect(statut.textContent).not.toMatch(/\d:\d\d/);
    expect(screen.getByText("5:00").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("montre un fil de trois étapes, pas un anneau qui tourne", () => {
    render(<Attente attente={EN_COURS} />);
    expect(screen.getByText(/Notification envoyée au/)).toBeDefined();
    expect(screen.getByText("Tu saisis ton code PIN sur ton téléphone")).toBeDefined();
    expect(screen.getByText(/Nous recevons la confirmation/)).toBeDefined();
  });

  it("ne propose « Réessayer » qu'au bout de quatre-vingt-dix secondes", () => {
    render(<Attente attente={EN_COURS} />);
    expect(screen.queryByRole("button", { name: "Réessayer le paiement" })).toBeNull();

    act(() => vi.advanceTimersByTime(DELAI_REESSAI_SECONDES * 1000));
    expect(screen.getByRole("button", { name: "Réessayer le paiement" })).toBeDefined();
  });

  it("ne déplace pas le focus pendant l'attente (règle clavier 6)", () => {
    render(<Attente attente={EN_COURS} />);
    expect(document.activeElement).toBe(document.body);
    act(() => vi.advanceTimersByTime(10_000));
    expect(document.activeElement).toBe(document.body);
  });

  it("annonce l'expiration une fois les cinq minutes écoulées", () => {
    render(<Attente attente={EN_COURS} />);
    act(() => vi.advanceTimersByTime(300_000));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Le délai de confirmation est dépassé",
    );
  });
});

describe("$-05 — Échec", () => {
  it("part du délai dépassé, le cas le moins accusateur", () => {
    render(
      <Echec
        paiement={{ ...EN_COURS, etat: "sans_suite", statut: "EXPIREE" }}
        motif={parametres.get("motif")}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Le délai de confirmation est dépassé" }),
    ).toBeDefined();
  });

  it("distingue le solde insuffisant quand l'opérateur le dit", () => {
    parametres.set("motif", "solde_insuffisant");
    render(
      <Echec
        paiement={{ ...EN_COURS, etat: "sans_suite", statut: "EXPIREE" }}
        motif={parametres.get("motif")}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Le paiement n'a pas abouti" }),
    ).toBeDefined();
  });

  it("retombe sur le délai dépassé pour un motif inconnu", () => {
    parametres.set("motif", "n-importe-quoi");
    render(
      <Echec
        paiement={{ ...EN_COURS, etat: "sans_suite", statut: "EXPIREE" }}
        motif={parametres.get("motif")}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Le délai de confirmation est dépassé" }),
    ).toBeDefined();
  });

  it("dit qu'aucun montant n'a été débité, et propose le repli gratuit", () => {
    const { container } = render(
      <Echec
        paiement={{ ...EN_COURS, etat: "sans_suite", statut: "EXPIREE" }}
        motif={parametres.get("motif")}
      />,
    );
    expect(container.textContent).toContain("Aucun montant n'a été débité");
    // Le repli gratuit est le dossier lui-même : le bouton ne faisait rien.
    expect(
      screen.getByRole("link", { name: "Continuer en Découverte" }).getAttribute("href"),
    ).toBe("/dossiers/nl-1");
  });

  it("n'affiche aucun code technique", () => {
    const { container } = render(
      <Echec
        paiement={{ ...EN_COURS, etat: "sans_suite", statut: "EXPIREE" }}
        motif={parametres.get("motif")}
      />,
    );
    expect(container.textContent).not.toMatch(/HTTP|fedapay|stripe|\b50\d\b/i);
  });
});

describe("$-06 — Reçu", () => {
  it("ne détourne pas la pastille d'état de pièce pour un paiement", () => {
    // « Conforme » qualifie une pièce de dossier ; un paiement est « Payé ».
    const source = readFileSync("src/app/(app)/paiement/recu/[id]/Recu.tsx", "utf8");
    // On vise l'import, pas le mot : le commentaire qui explique la règle
    // cite le composant, et c'est très bien ainsi.
    expect(source).not.toMatch(/import\s*\{[^}]*StatusBadge/);
    expect(LIBELLE_ETAT.paye).toBe("Payé");
  });
});