import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Consultants } from "@/app/(admin)/habilitations/Consultants";
import { APRES_CREATION } from "@/domain/backoffice/consultants";

/**
 * B-09 — la création d'un consultant à l'écran (S.196).
 *
 * La route existait sans écran : un consultant ne s'ajoutait que par
 * l'API. Ces essais cliquent : un bouton qui afficherait « créé » sans
 * rien envoyer passerait un essai qui ne lirait que le source.
 */
const rafraichir = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: rafraichir }),
  usePathname: () => "/habilitations",
}));

const appels: { url: string; corps: unknown; methode?: string }[] = [];
let accepte = true;
vi.mock("@/lib/api", () => ({
  appeler: (url: string, options: { corps?: unknown; methode?: string } = {}) => {
    appels.push({ url, corps: options.corps, methode: options.methode });
    return Promise.resolve(
      accepte
        ? { ok: true, donnees: { id: "c-neuf", visible: false } }
        : {
            ok: false,
            echec: {
              titre: "La fiche n'a pas été créée",
              corps: "Motif de test.",
              conserve: "Ta saisie est là.",
              action: "Réessayer",
              ton: "echec",
            },
          },
    );
  },
}));

const afficher = () =>
  render(<Consultants consultants={[]} destinations={[{ code: "NL", pays: "Pays-Bas" }]} />);

const formulaire = () => {
  const section = screen.getByRole("region", { name: "Ajouter un consultant" });
  const champ = (libelle: string) => within(section).getByLabelText(libelle, { exact: false });
  return {
    section,
    champ,
    // Relu à chaque fois : le bouton se remonte quand sa raison de
    // désactivation paraît ou disparaît.
    get bouton() {
      return within(section).getByRole("button", { name: "Créer le consultant" });
    },
    remplir: (valeurs: Record<string, string>) => {
      for (const [libelle, valeur] of Object.entries(valeurs)) {
        fireEvent.change(champ(libelle), { target: { value: valeur } });
      }
    },
  };
};

const COMPLET = {
  Nom: "Marieke de Vries",
  Cabinet: "De Vries Advocaten",
  Ville: "Amsterdam",
  Qualification: "Avocate, 9 ans",
  "Langues de travail": "Néerlandais, anglais, français",
  "Délai de réponse": "48",
  "Motif de la création": "Fiche ouverte après vérification au tableau de l'ordre.",
};

beforeEach(() => {
  appels.length = 0;
  accepte = true;
  rafraichir.mockClear();
});

describe("B-09 : ajouter un consultant", () => {
  it("le formulaire existe à côté des fiches, même sans aucun consultant", () => {
    afficher();
    const f = formulaire();
    expect(within(f.section).getByRole("heading", { name: "Ajouter un consultant" })).toBeTruthy();
    expect(f.bouton).toHaveProperty("disabled", true);
  });

  it("ne part pas tant qu'un champ est refusé, et le dit sous le champ saisi", () => {
    afficher();
    const f = formulaire();
    f.remplir({ ...COMPLET, "Délai de réponse": "48h" });
    expect(f.bouton).toHaveProperty("disabled", true);
    expect(within(f.section).getAllByText(/en heures, un nombre entier entre 1 et 336/u).length).toBeGreaterThan(0);
    fireEvent.click(f.bouton);
    expect(appels).toHaveLength(0);
  });

  it("envoie le corps de la route, annonce l'invisibilité, vide le formulaire et rafraîchit", async () => {
    afficher();
    const f = formulaire();
    f.remplir(COMPLET);
    expect(f.bouton).toHaveProperty("disabled", false);
    fireEvent.click(f.bouton);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(APRES_CREATION));
    expect(appels).toEqual([
      {
        url: "/api/admin/consultants",
        methode: undefined,
        corps: {
          nom: "Marieke de Vries",
          cabinet: "De Vries Advocaten",
          ville: "Amsterdam",
          qualification: "Avocate, 9 ans",
          langues: ["Néerlandais", "anglais", "français"],
          delaiReponseHeures: 48,
          motif: "Fiche ouverte après vérification au tableau de l'ordre.",
        },
      },
    ]);
    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect((f.champ("Nom") as HTMLInputElement).value).toBe("");
  });

  it("garde la saisie quand la route refuse", async () => {
    accepte = false;
    afficher();
    const f = formulaire();
    f.remplir(COMPLET);
    fireEvent.click(f.bouton);
    await waitFor(() => expect(within(f.section).getByText("La fiche n'a pas été créée")).toBeTruthy());
    expect((f.champ("Nom") as HTMLInputElement).value).toBe("Marieke de Vries");
    expect(screen.queryByRole("status")).toBeNull();
    expect(rafraichir).not.toHaveBeenCalled();
  });
});
