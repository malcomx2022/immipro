import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Double authentification à l'écran — S.214. La connexion en deux temps,
 * l'activation et la désactivation dans « Sécurité », la réinitialisation
 * au back-office. Le serveur est remplacé ; ce qui est éprouvé, c'est ce
 * que l'écran envoie, quand il l'envoie, et ce qu'il dit.
 */
const m = vi.hoisted(() => ({ appeler: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  appeler: m.appeler,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: m.push, refresh: m.refresh }),
  usePathname: () => "/connexion",
}));

import { Connexion } from "@/app/(auth)/connexion/Connexion";
import { DoubleAuthentification } from "@/app/(auth)/compte/securite/DoubleAuthentification";
import { GestionDuSecondFacteur } from "@/app/(admin)/utilisateurs/GestionDuSecondFacteur";
import { TITRE_CONNEXION_A_RECOMMENCER } from "@/domain/comptes/deux-facteurs";

const attendre = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const saisir = (libelle: string, valeur: string) =>
  fireEvent.change(screen.getByLabelText(libelle, { exact: true }), { target: { value: valeur } });
const cliquer = async (nom: string) => {
  fireEvent.click(screen.getByRole("button", { name: nom }));
  await attendre();
};
const desactive = (nom: string) => (screen.getByRole("button", { name: nom }) as HTMLButtonElement).disabled;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A-02 — connexion en deux temps", () => {
  const motDePasse = async () => {
    render(<Connexion />);
    saisir("Adresse email", "awa@exemple.com");
    saisir("Mot de passe", "mot-de-passe-juste");
    await cliquer("Se connecter");
  };

  it("le mot de passe juste mène au code, sans naviguer ; le code juste mène à la suite", async () => {
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { secondFacteur: { requis: true } } });
    await motDePasse();
    expect(m.push).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Double authentification");
    expect(desactive("Vérifier et me connecter")).toBe(true);
    saisir("Code à six chiffres", "123 456");
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { compte: { emailVerifie: true, role: "CANDIDAT" } } });
    await cliquer("Vérifier et me connecter");
    expect(m.appeler).toHaveBeenLastCalledWith("/api/comptes/session/second-facteur", { corps: { code: "123 456" } });
    expect(m.push).toHaveBeenCalledWith("/tableau-de-bord");
  });

  it("un code refusé s'annonce, le champ se vide ; l'écran reste", async () => {
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { secondFacteur: { requis: true } } });
    await motDePasse();
    saisir("Code à six chiffres", "000000");
    m.appeler.mockResolvedValueOnce({
      ok: false,
      echec: { titre: "Code refusé", corps: "Ce code ne correspond pas. Il te reste 4 essais.", action: "Réessayer", ton: "echec" },
    });
    await cliquer("Vérifier et me connecter");
    expect(screen.getByRole("alert").textContent).toMatch(/4 essais/u);
    expect((screen.getByLabelText("Code à six chiffres", { exact: true }) as HTMLInputElement).value).toBe("");
    expect(m.push).not.toHaveBeenCalled();
  });

  it("un défi échu ramène au mot de passe, avec la raison", async () => {
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { secondFacteur: { requis: true } } });
    await motDePasse();
    saisir("Code à six chiffres", "123456");
    m.appeler.mockResolvedValueOnce({
      ok: false,
      echec: { titre: TITRE_CONNEXION_A_RECOMMENCER, corps: "La connexion a expiré. Ressaisis ton adresse.", action: "", ton: "echec" },
    });
    await cliquer("Vérifier et me connecter");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bon retour");
    expect(screen.getByRole("alert").textContent).toMatch(/a expiré/u);
    // Le mot de passe a servi : il ne reste pas dans l'écran.
    expect((screen.getByLabelText("Mot de passe", { exact: true }) as HTMLInputElement).value).toBe("");
  });

  it("un code de secours se saisit dans le même écran, huit caractères", async () => {
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { secondFacteur: { requis: true } } });
    await motDePasse();
    await cliquer("Utiliser un code de secours");
    saisir("Code de secours", "abcd-efg");
    expect(desactive("Vérifier et me connecter")).toBe(true);
    saisir("Code de secours", "abcd-efgh");
    expect(desactive("Vérifier et me connecter")).toBe(false);
  });
});

describe("« Sécurité » — activer, puis désactiver", () => {
  const inactive = { disponible: true, active: false, activeLe: null, enCours: false, codesRestants: 0 };
  const active = { disponible: true, active: true, activeLe: "2026-11-04T10:00:00.000Z", enCours: false, codesRestants: 9 };

  it("sans clé sur le serveur, aucun interrupteur : l'écran le dit", () => {
    render(<DoubleAuthentification etat={{ ...inactive, disponible: false }} />);
    expect(screen.getByText(/Pas encore disponible sur ce serveur/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activer la double authentification" })).toBeNull();
  });

  it("mot de passe, code QR et clé, premier code, puis dix codes de secours montrés une fois", async () => {
    render(<DoubleAuthentification etat={inactive} />);
    await cliquer("Activer la double authentification");
    saisir("Mot de passe", "mot-de-passe-juste");
    m.appeler.mockResolvedValueOnce({
      ok: true,
      donnees: { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", adresse: "otpauth://totp/ImmiPro:a?secret=JBSWY3DPEHPK3PXP" },
    });
    await cliquer("Continuer");
    expect(m.appeler).toHaveBeenLastCalledWith("/api/comptes/second-facteur", {
      corps: { action: "preparer", motDePasse: "mot-de-passe-juste" },
    });
    expect(screen.getByRole("img", { name: /Code QR/u })).toBeTruthy();
    expect(screen.getByTestId("secret-totp").textContent).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(desactive("Confirmer l'activation")).toBe(true);

    saisir("Code à six chiffres", "123456");
    const codes = Array.from({ length: 10 }, (_, i) => `ABCD-EF${"GHJKMNPQRS"[i]}${i + 2 > 9 ? "Z" : i + 2}`);
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { codesDeSecours: codes, sessionsFermees: 1 } });
    await cliquer("Confirmer l'activation");
    expect(m.appeler).toHaveBeenLastCalledWith("/api/comptes/second-facteur", { corps: { action: "activer", code: "123456" } });
    expect(screen.getByTestId("codes-de-secours").querySelectorAll("li")).toHaveLength(10);
    expect(screen.getByText(/ne s'afficheront plus/u)).toBeTruthy();
    expect(m.refresh).not.toHaveBeenCalled();
    await cliquer("J'ai noté mes codes");
    expect(screen.queryByTestId("codes-de-secours")).toBeNull();
    expect(m.refresh).toHaveBeenCalled();
  });

  it("un mauvais mot de passe s'affiche sous le champ, rien n'avance", async () => {
    render(<DoubleAuthentification etat={inactive} />);
    await cliquer("Activer la double authentification");
    saisir("Mot de passe", "faux");
    m.appeler.mockResolvedValueOnce({
      ok: false,
      echec: { titre: "Certaines réponses sont à corriger", corps: "", action: "", ton: "echec", champs: { motDePasse: "Ce mot de passe ne correspond pas à ton compte." } },
    });
    await cliquer("Continuer");
    expect(screen.getByText(/ne correspond pas à ton compte/u)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Code QR/u })).toBeNull();
  });

  it("la désactivation demande un premier clic, puis mot de passe et code", async () => {
    render(<DoubleAuthentification etat={active} />);
    expect(screen.getByText(/9 codes de secours restants sur 10/u)).toBeTruthy();
    await cliquer("Désactiver");
    expect(m.appeler).not.toHaveBeenCalled();
    expect(desactive("Confirmer la désactivation")).toBe(true);
    saisir("Mot de passe", "mot-de-passe-juste");
    expect(desactive("Confirmer la désactivation")).toBe(true);
    saisir("Code de l'application ou code de secours", "ABCD-EFGH");
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { sessionsFermees: 2 } });
    await cliquer("Confirmer la désactivation");
    expect(m.appeler).toHaveBeenCalledWith("/api/comptes/second-facteur", {
      corps: { action: "desactiver", motDePasse: "mot-de-passe-juste", code: "ABCD-EFGH" },
    });
    expect(screen.getByRole("status").textContent).toMatch(/désactivée/u);
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe("B-03 — réinitialiser le second facteur, double confirmation", () => {
  it("motif, premier clic, adresse ressaisie : seulement alors la requête part", async () => {
    render(<GestionDuSecondFacteur compte={{ id: "u-1", email: "awa@exemple.com" }} />);
    expect(desactive("Réinitialiser la double authentification")).toBe(true);
    fireEvent.change(screen.getByLabelText("Motif de la réinitialisation"), {
      target: { value: "Téléphone perdu, identité vérifiée" },
    });
    await cliquer("Réinitialiser la double authentification");
    expect(m.appeler).not.toHaveBeenCalled();
    expect(desactive("Confirmer la réinitialisation")).toBe(true);
    fireEvent.change(screen.getByLabelText("Adresse du compte"), { target: { value: "awa@exemple.co" } });
    expect(desactive("Confirmer la réinitialisation")).toBe(true);
    fireEvent.change(screen.getByLabelText("Adresse du compte"), { target: { value: "AWA@exemple.com" } });
    m.appeler.mockResolvedValueOnce({ ok: true, donnees: { reinitialise: true, sessionsFermees: 1 } });
    await cliquer("Confirmer la réinitialisation");
    expect(m.appeler).toHaveBeenCalledWith("/api/admin/comptes/second-facteur", {
      methode: "POST",
      corps: { userId: "u-1", motif: "Téléphone perdu, identité vérifiée", confirmation: "AWA@exemple.com" },
    });
    expect(screen.getByRole("status").textContent).toMatch(/retirée et sessions fermées/u);
  });
});

describe("S.215 — compte interne : obligatoire", () => {
  const base = { disponible: true, enCours: false, codesRestants: 10 };

  it("inactive : l'écran dit que le back-office reste fermé et propose l'activation", () => {
    render(<DoubleAuthentification etat={{ ...base, active: false, activeLe: null }} obligatoire />);
    expect(screen.getByRole("alert").textContent).toMatch(/Obligatoire pour ton rôle.*back-office reste fermé/su);
    expect(screen.getByRole("button", { name: "Activer la double authentification" })).toBeTruthy();
  });

  it("sans clé sur le serveur : il dit que l'exploitant doit la poser", () => {
    render(<DoubleAuthentification etat={{ ...base, disponible: false, active: false, activeLe: null }} obligatoire />);
    expect(screen.getByRole("alert").textContent).toMatch(/DEUX_FACTEURS_CLE/u);
    expect(screen.queryByText(/Pas encore disponible sur ce serveur\. Ton compte/u)).toBeNull();
  });

  it("active : « Désactiver » n'est pas offert, l'écran dit quoi faire pour changer de téléphone", () => {
    render(<DoubleAuthentification etat={{ ...base, active: true, activeLe: "2026-11-04T10:00:00.000Z" }} obligatoire />);
    expect(screen.queryByRole("button", { name: "Désactiver" })).toBeNull();
    expect(screen.getByText(/ne se désactive pas/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Générer de nouveaux codes de secours" })).toBeTruthy();
  });
});
