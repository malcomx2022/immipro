import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Inscription } from "@/app/(auth)/inscription/Inscription";
import { Connexion } from "@/app/(auth)/connexion/Connexion";
import { Verification } from "@/app/(auth)/verification/Verification";
import { MotDePasse } from "@/app/(auth)/mot-de-passe/MotDePasse";
import { Consentements } from "@/app/(auth)/consentements/Consentements";
import { CONSENTEMENTS } from "@/domain/comptes/consentements";

const parametres = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => parametres,
}));

beforeEach(() => {
  for (const cle of [...parametres.keys()]) parametres.delete(cle);
});

describe("A-01 — Inscription", () => {
  it("n'ouvre pas de compte tant que les conditions ne sont pas acceptées", () => {
    render(<Inscription />);
    const creer = screen.getByRole("button", { name: "Créer mon compte" });
    expect(creer).toBeDisabled();
    expect(creer).toHaveAccessibleDescription(
      "Acceptez les conditions d'utilisation pour créer le compte.",
    );
  });

  it("ne pré-coche pas les conditions", () => {
    render(<Inscription />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("annonce la raison qui bloque encore, une fois les conditions acceptées", () => {
    render(<Inscription />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Créer mon compte" })).toHaveAccessibleDescription(
      "Le mot de passe doit faire au moins dix caractères.",
    );
  });

  it("annonce le consentement aux pièces d'identité comme demandé ailleurs", () => {
    render(<Inscription />);
    expect(
      screen.getByText(/est demandé séparément, au moment du premier téléversement/),
    ).toBeDefined();
  });

  it("commente la force du mot de passe à la frappe", () => {
    render(<Inscription />);
    const champ = screen.getByLabelText("Mot de passe");
    fireEvent.change(champ, { target: { value: "abc" } });
    expect(screen.getByText("Trop court, il manque des caractères.")).toBeDefined();
    fireEvent.change(champ, { target: { value: "douze-caracteres" } });
    expect(screen.getByText("Solide.")).toBeDefined();
  });
});

describe("A-02 — Connexion", () => {
  it("ne coche pas « Rester connecté » par défaut, et dit pourquoi", () => {
    render(<Connexion />);
    expect(screen.getByRole("checkbox", { name: /Rester connecté/ })).not.toBeChecked();
    expect(screen.getByText(/cybercafé qui n'est pas le tien/)).toBeDefined();
  });

  it("n'annonce aucune note chiffrée de dossier (arbitrage C-09)", () => {
    const { container } = render(<Connexion />);
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/sur 100/i);
    expect(texte).not.toMatch(/\d\s?%/);
  });

  it("mène au mot de passe oublié et à l'inscription", () => {
    render(<Connexion />);
    expect(screen.getByRole("link", { name: "Mot de passe oublié" })).toHaveAttribute(
      "href",
      "/mot-de-passe",
    );
    expect(screen.getByRole("link", { name: "S'inscrire" })).toHaveAttribute(
      "href",
      "/inscription",
    );
  });
});

describe("A-03 — Vérification email", () => {
  it("normalise la saisie et n'active la validation qu'à six chiffres", () => {
    render(<Verification />);
    const champ = screen.getByLabelText("Code de vérification");
    fireEvent.change(champ, { target: { value: "12 34-5" } });
    expect(champ).toHaveValue("12345");
    expect(screen.getByRole("button", { name: "Vérifier mon adresse" })).toBeDisabled();

    fireEvent.change(champ, { target: { value: "123456" } });
    expect(screen.getByText("Code complet.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Vérifier mon adresse" })).toBeEnabled();
  });

  it("laisse reporter la vérification, et dit ce que le report coûte", () => {
    render(<Verification />);
    expect(screen.getByRole("button", { name: "Plus tard" })).toBeEnabled();
    expect(
      screen.getByText(/pas recevoir les alertes de changement de règles/),
    ).toBeDefined();
  });
});

describe("A-04 — Mot de passe", () => {
  it("part de la demande et enchaîne sur le lien envoyé", () => {
    render(<MotDePasse />);
    expect(
      screen.getByRole("heading", { name: "Réinitialise ton mot de passe" }),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("Adresse email"), {
      target: { value: "aline.dossou@email.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    expect(screen.getByRole("heading", { name: "Lien envoyé" })).toBeDefined();
  });

  it("ouvre directement l'étape du nouveau mot de passe depuis le lien reçu", () => {
    parametres.set("etape", "nouveau");
    render(<MotDePasse />);
    expect(
      screen.getByRole("heading", { name: "Choisis un nouveau mot de passe" }),
    ).toBeDefined();
  });

  it("refuse d'enregistrer tant que les deux saisies diffèrent, et le dit", () => {
    parametres.set("etape", "nouveau");
    render(<MotDePasse />);
    const enregistrer = screen.getByRole("button", {
      name: "Enregistrer le mot de passe",
    });
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "douze-caracteres" },
    });
    fireEvent.change(screen.getByLabelText("Confirme le mot de passe"), {
      target: { value: "autre-chose" },
    });
    expect(enregistrer).toBeDisabled();
    expect(enregistrer).toHaveAccessibleDescription(
      "Les deux saisies doivent être identiques.",
    );
    expect(screen.getByText("Les deux mots de passe diffèrent.")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Confirme le mot de passe"), {
      target: { value: "douze-caracteres" },
    });
    expect(
      screen.getByRole("button", { name: "Enregistrer le mot de passe" }),
    ).toBeEnabled();
  });

  it("ignore une étape inconnue dans l'adresse plutôt que de rendre un écran vide", () => {
    parametres.set("etape", "n-importe-quoi");
    render(<MotDePasse />);
    expect(
      screen.getByRole("heading", { name: "Réinitialise ton mot de passe" }),
    ).toBeDefined();
  });
});

describe("A-05 — Consentements", () => {
  it("n'active aucune autorisation au premier passage (RG-02.1)", () => {
    render(<Consentements />);
    const interrupteurs = screen.getAllByRole("switch");
    expect(interrupteurs).toHaveLength(CONSENTEMENTS.length);
    for (const i of interrupteurs) expect(i).not.toBeChecked();
    expect(screen.getByText("0 autorisation sur 5 active")).toBeDefined();
  });

  it("annonce chaque interrupteur avec ce qu'il autorise", () => {
    render(<Consentements />);
    const identite = screen.getByRole("switch", {
      name: "Analyse de mes pièces d'identité",
    });
    expect(identite).toHaveAccessibleDescription(/Passeport, carte d'identité/);
  });

  it("bascule une autorisation et met le décompte à jour", () => {
    render(<Consentements />);
    const alertes = screen.getByRole("switch", {
      name: "Alertes de changement de règles",
    });
    fireEvent.click(alertes);
    expect(alertes).toBeChecked();
    expect(screen.getByText("1 autorisation sur 5 active")).toBeDefined();
  });

  it("écrit que le refus des pièces d'identité ne bloque pas le compte", () => {
    render(<Consentements />);
    expect(
      screen.getByText(/ne bloque pas ton\s+compte/),
    ).toBeDefined();
  });
});
