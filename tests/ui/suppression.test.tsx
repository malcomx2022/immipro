import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SuppressionDuCompte } from "@/app/(auth)/compte/suppression/SuppressionDuCompte";
import { PropositionPartenaire } from "@/app/(app)/(dossier)/dossiers/[id]/PropositionPartenaire";
import { PARTENAIRE, MOTIF_PARTENAIRE } from "@/lib/contenu/alertes";
import { CE_QUI_RESTE } from "@/domain/comptes/suppression";

const reponse = (corps: unknown, statut = 200) =>
  Promise.resolve({
    ok: statut < 400,
    status: statut,
    json: () => Promise.resolve(corps),
  } as Response);

beforeEach(() => {
  vi.restoreAllMocks();
});

/**
 * Suppression de compte — A-05, RG-10.4.
 *
 * L'écran le plus irréversible du produit. Ce qui se teste ici n'est pas
 * qu'il fonctionne — c'est qu'il ne puisse pas être déclenché par
 * inadvertance, et qu'il n'ait rien caché avant de l'être.
 */
describe("Suppression de compte", () => {
  it("ne peut pas être déclenchée sans confirmation", () => {
    render(<SuppressionDuCompte email="aline.dossou@email.com" />);
    const bouton = screen.getByRole("button", {
      name: "Supprimer définitivement mon compte",
    });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAccessibleDescription(
      "Saisis ton mot de passe pour confirmer la suppression.",
    );
  });

  it("nomme le compte concerné, et ce qui survit à la suppression", () => {
    const { container } = render(
      <SuppressionDuCompte email="aline.dossou@email.com" />,
    );
    expect(container.textContent).toContain("aline.dossou@email.com");
    for (const ligne of CE_QUI_RESTE) {
      expect(container.textContent).toContain(ligne);
    }
  });

  it("confirme au lieu de renvoyer ailleurs sans un mot", async () => {
    global.fetch = vi.fn(() => reponse({ supprime: true })) as unknown as typeof fetch;
    render(<SuppressionDuCompte email="aline.dossou@email.com" />);
    fireEvent.change(screen.getByLabelText("Ton mot de passe, pour confirmer"), {
      target: { value: "demonstration-2026" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Supprimer définitivement mon compte" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Ton compte est supprimé" })).toBeDefined(),
    );
    // Et l'adresse est rendue au réseau : quelqu'un peut se réinscrire.
    expect(screen.getByText(/ouvrir un nouveau compte avec la même adresse/)).toBeDefined();
  });

  it("rend le mot de passe refusé actionnable, sans supprimer quoi que ce soit", async () => {
    global.fetch = vi.fn(() =>
      reponse(
        {
          echec: {
            titre: "Ce mot de passe ne correspond pas",
            corps: "Vérifie ta saisie, ou réinitialise ton mot de passe.",
            conserve: "Ton compte et tes dossiers sont intacts.",
            action: "Réessayer",
            ton: "echec",
          },
        },
        400,
      ),
    ) as unknown as typeof fetch;

    render(<SuppressionDuCompte email="aline.dossou@email.com" />);
    fireEvent.change(screen.getByLabelText("Ton mot de passe, pour confirmer"), {
      target: { value: "faux" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Supprimer définitivement mon compte" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Ton compte et tes dossiers sont intacts.",
      ),
    );
    expect(
      screen.queryByRole("heading", { name: "Ton compte est supprimé" }),
    ).toBeNull();
  });

  it("dit ce qui est conservé quand le réseau manque", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    render(<SuppressionDuCompte email="aline.dossou@email.com" />);
    fireEvent.change(screen.getByLabelText("Ton mot de passe, pour confirmer"), {
      target: { value: "demonstration-2026" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Supprimer définitivement mon compte" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Tu es hors ligne"),
    );
    expect(
      screen.queryByRole("heading", { name: "Ton compte est supprimé" }),
    ).toBeNull();
  });
});

/**
 * T-03 — l'issue est enregistrée, WF-13.
 *
 * Le composant se rend sans ligne de suivi (les tests de P1 le font), mais
 * dès qu'il en a une, chaque issue part au serveur : c'est ce qui rend
 * « ne plus me proposer » vrai plus d'une seconde.
 */
describe("T-03 — suivi de la proposition", () => {
  it("enregistre le refus définitif sans faire attendre", async () => {
    const appels: string[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      appels.push(`${url} ${init?.body as string}`);
      return reponse({ etat: "DECLINEE" });
    }) as unknown as typeof fetch;

    render(
      <PropositionPartenaire
        partenaire={PARTENAIRE}
        motif={MOTIF_PARTENAIRE}
        dossierId="nl-4471"
        referenceId="ref-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ne plus me proposer de consultant" }),
    );

    // L'écran a déjà répondu : il n'attend pas le serveur pour tenir parole.
    expect(screen.getByText(/Nous ne te proposerons plus de partenaire/)).toBeDefined();
    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toContain("/api/dossiers/nl-4471/partenaires/ref-1");
    expect(appels[0]).toContain("NE_PLUS_PROPOSER");
  });

  it("n'annonce pas le tarif d'un consultant sous un courtier", () => {
    // Trouvé à l'écran, pas en relisant le code : la carte affichait
    // « Premier entretien : 20 000 F, 45 minutes » sous une assurance
    // maladie, et renvoyait vers l'annuaire des consultants.
    render(
      <PropositionPartenaire
        partenaire={{
          id: "p1",
          nom: "Cabinet Adjovi & Associés",
          ville: "Cotonou",
          qualification: "courtier agréé, 9 ans d'exercice",
          destinations: ["NL"],
        }}
        motif={{
          constat: "Ton dossier demande une pièce : assurance maladie.",
          raison: "Nous ne la fournissons pas nous-mêmes ; un partenaire le fait.",
        }}
        dossierId="nl-4471"
        genre="ASSURANCE_SANTE"
        url="https://exemple.invalid/assurance"
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Un partenaire peut te fournir cette pièce",
    );
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    const dialogue = screen.getByRole("dialog");
    expect(dialogue.textContent).not.toContain("Premier entretien");
    expect(dialogue.textContent).not.toContain("45 minutes");

    // La redirection sort du site, et l'écran le dit avant d'y envoyer.
    const lien = screen.getByRole("link", { name: "Ouvrir le site du partenaire" });
    expect(lien.getAttribute("href")).toBe("https://exemple.invalid/assurance");
    expect(lien.getAttribute("rel")).toContain("sponsored");
    expect(lien.getAttribute("target")).toBe("_blank");

    // Et la divulgation de commission reste, quel que soit le partenaire.
    expect(dialogue.textContent).toContain("commission");
  });

  it("n'appelle rien sans ligne de suivi", () => {
    const fetchEspion = vi.fn();
    global.fetch = fetchEspion as unknown as typeof fetch;
    render(
      <PropositionPartenaire
        partenaire={PARTENAIRE}
        motif={MOTIF_PARTENAIRE}
        dossierId="nl-4471"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Voir la proposition" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer sans consultant" }));
    expect(fetchEspion).not.toHaveBeenCalled();
  });
});
