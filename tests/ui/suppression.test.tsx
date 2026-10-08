import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SuppressionDuCompte } from "@/app/(auth)/compte/suppression/SuppressionDuCompte";
import { Services } from "@/app/(app)/(dossier)/services/Services";
import { dossierParId } from "@/lib/contenu/dossiers";
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
 * T-06 — la redirection est tracée, WF-13. K.A tranché le 20/09/2026.
 *
 * L'écran a changé de surface ; la trace, elle, ne change pas. « Commission
 * au résultat » suppose de savoir quelle offre a été ouverte, et une
 * redirection non enregistrée est une commission que personne ne saurait
 * rattacher — le partenaire n'ayant aucune raison de nous croire sur parole.
 */
const DOSSIER = dossierParId("nl-4471")!;

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

describe("T-06 — suivi de l'offre", () => {
  it("enregistre la redirection avant d'ouvrir le site du partenaire", async () => {
    const appels: string[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      appels.push(`${url} ${init?.body as string}`);
      return reponse({ etat: "REDIRIGEE", url: OFFRE.url });
    }) as unknown as typeof fetch;
    const ouvertures: string[] = [];
    vi.spyOn(window, "open").mockImplementation((u) => {
      ouvertures.push(String(u));
      return null;
    });

    render(<Services dossier={DOSSIER} offres={[OFFRE]} autorisation="accordee" />);
    fireEvent.click(screen.getByRole("link", { name: "Ouvrir le site du partenaire (s'ouvre dans un nouvel onglet)" }));

    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toContain("/api/dossiers/nl-4471/partenaires/ref-1");
    expect(appels[0]).toContain("CRENEAUX");
    // L'ordre compte : la trace d'abord, la fenêtre ensuite.
    await waitFor(() => expect(ouvertures).toEqual([OFFRE.url]));
  });

  it("n'ouvre aucune fenêtre tant que rien n'est enregistré", () => {
    const fetchEspion = vi.fn(() => new Promise<Response>(() => {}));
    global.fetch = fetchEspion as unknown as typeof fetch;
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<Services dossier={DOSSIER} offres={[OFFRE]} autorisation="accordee" />);
    fireEvent.click(screen.getByRole("link", { name: "Ouvrir le site du partenaire (s'ouvre dans un nouvel onglet)" }));

    expect(fetchEspion).toHaveBeenCalled();
    expect(ouvrir).not.toHaveBeenCalled();
  });
});
