import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * « Mon compte » et la gestion des rôles à l'écran — S.208.
 *
 * L'appel réseau est remplacé : on clique pour voir ce qui part, et
 * surtout ce qui ne part pas quand la saisie est refusée.
 */
const appels: { url: string; corps: unknown; methode?: string }[] = [];
let reponse: unknown = { enregistre: true, autorisationsRetirees: 0 };
vi.mock("@/lib/api", () => ({
  appeler: (url: string, options: { corps?: unknown; methode?: string } = {}) => {
    appels.push({ url, corps: options.corps, methode: options.methode });
    return Promise.resolve({ ok: true, donnees: reponse });
  },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { IdentiteDuCompteForm } from "@/app/(auth)/compte/IdentiteDuCompte";
import { Utilisateurs } from "@/app/(admin)/utilisateurs/Utilisateurs";
import type { Compte } from "@/domain/backoffice/comptes";

const IDENTITE = {
  email: "awa@exemple.com",
  emailVerifie: true,
  prenom: "Awa",
  nom: "Koffi",
  nomAffiche: "",
  telephone: "",
  dateNaissance: "",
  pays: "BJ",
  langue: "fr",
  fuseau: "Africa/Porto-Novo",
};

beforeEach(() => {
  appels.length = 0;
  reponse = { enregistre: true, autorisationsRetirees: 0 };
});

describe("Mon compte", () => {
  it("l'adresse est en lecture seule : aucun champ ne la porte", () => {
    const { container } = render(<IdentiteDuCompteForm initial={IDENTITE} interne={false} />);
    expect(container.textContent).toContain("awa@exemple.com");
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Supprimer mon compte" })).toBeDefined();
  });

  it("un nom affiché d'un caractère est refusé sous le champ, rien ne part", async () => {
    render(<IdentiteDuCompteForm initial={IDENTITE} interne={false} />);
    fireEvent.change(screen.getByLabelText("Nom affiché"), { target: { value: "A" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    });
    expect(screen.getByText(/Le nom affiché tient entre 2 et 80 caractères/u)).toBeDefined();
    expect(appels).toHaveLength(0);
  });

  it("une saisie valide part en PUT et l'écran le confirme", async () => {
    render(<IdentiteDuCompteForm initial={IDENTITE} interne={false} />);
    fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "+229 01 97 00 00 00" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    });
    expect(appels).toEqual([
      expect.objectContaining({ url: "/api/comptes/identite", methode: "PUT" }),
    ]);
    expect(screen.getByRole("status").textContent).toBe("Compte enregistré.");
  });

  it("un compte interne n'a pas de lien de suppression (RG-10.4)", () => {
    const { container } = render(<IdentiteDuCompteForm initial={IDENTITE} interne />);
    expect(screen.queryByRole("link", { name: "Supprimer mon compte" })).toBeNull();
    expect(container.textContent).toContain("Un compte interne ne se supprime pas");
  });
});

const COMPTE = (id: string, role: Compte["role"], email: string): Compte => ({
  id,
  nom: email,
  email,
  inscritLe: "2026-10-01T00:00:00.000Z",
  dossiers: 0,
  pack: "aucun",
  consentements: [],
  analysesUtilisees: 0,
  analysesTotal: 0,
  statut: "ACTIF",
  role,
});

describe("B-03 selon le rôle de l'opérateur", () => {
  const comptes = [COMPTE("11111111-1111-4111-8111-111111111111", "VEILLEUR", "kofi@immipro.app")];

  it("un administrateur ne voit ni la création, ni le rôle, ni la suspension d'un compte interne", () => {
    const { container } = render(<Utilisateurs comptes={comptes} acteur={{ id: "a", role: "ADMIN" }} />);
    expect(screen.queryByRole("button", { name: "Créer un compte interne" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Changer le rôle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suspendre le compte" })).toBeNull();
    expect(container.textContent).toContain("seul un super-administrateur le suspend");
  });

  it("le super-administrateur confirme deux fois : le bouton, puis l'adresse ressaisie", async () => {
    reponse = { issue: "change", de: "VEILLEUR", vers: "ADMIN", sessionsFermees: 1 };
    render(<Utilisateurs comptes={comptes} acteur={{ id: "s", role: "SUPER_ADMIN" }} />);
    expect(screen.getByRole("button", { name: "Créer un compte interne" })).toBeDefined();

    fireEvent.change(screen.getByLabelText("Nouveau rôle"), { target: { value: "ADMIN" } });
    fireEvent.change(screen.getByLabelText("Motif du changement"), {
      target: { value: "Responsable de la revue désigné" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Changer le rôle" }));

    // Relu à chaque fois : désactivé, le bouton est enveloppé de sa légende.
    const confirmer = () =>
      screen.getByRole("button", { name: "Confirmer le changement" }) as HTMLButtonElement;
    expect(confirmer().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Adresse du compte"), { target: { value: "kofi@immipro.ap" } });
    expect(confirmer().disabled).toBe(true);
    expect(appels).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Adresse du compte"), { target: { value: "KOFI@immipro.app" } });
    expect(confirmer().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(confirmer());
    });
    expect(appels).toEqual([
      expect.objectContaining({
        url: "/api/admin/comptes/role",
        methode: "POST",
        corps: expect.objectContaining({ role: "ADMIN", confirmation: "KOFI@immipro.app" }),
      }),
    ]);
    expect(screen.getByText(/Une session fermée/u)).toBeDefined();
  });
});
