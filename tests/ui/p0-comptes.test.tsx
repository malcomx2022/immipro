import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Inscription } from "@/app/(auth)/inscription/Inscription";
import { Connexion } from "@/app/(auth)/connexion/Connexion";
import { Verification } from "@/app/(auth)/verification/Verification";
import { MotDePasse } from "@/app/(auth)/mot-de-passe/MotDePasse";
import { Consentements } from "@/app/(auth)/consentements/Consentements";
import { CONSENTEMENTS, ETAT_INITIAL } from "@/domain/comptes/consentements";
import { RENDEZ_VOUS_VIDES } from "@/domain/consultants/annulation";

const parametres = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => parametres,
}));

const PARTAGES = [
  {
    id: "acc-1",
    consultant: "Marieke Vermeulen",
    cabinet: "Vermeulen Immigration",
    dossier: "Pays-Bas — Séjour pour études",
    dossierId: "nl-4471",
    donneLe: "17 septembre 2026",
    etat: "actif" as const,
    echeance: "Jusqu'au 1er octobre 2026",
  },
  {
    id: "acc-2",
    consultant: "Karim Benali",
    cabinet: "Benali & Associés",
    dossier: "Suisse — Autorisation de séjour pour études",
    dossierId: "ch-2",
    donneLe: "2 août 2026",
    etat: "retire" as const,
    echeance: "Retiré",
  },
];

/**
 * A-05 lit désormais trois choses : les autorisations générales, les
 * accords de partage et les rendez-vous à venir. Les appels se
 * distinguent par l'adresse — servir la même réponse à tous rendrait
 * l'état des interrupteurs indéfini, et une liste sans son champ n'est
 * pas une liste vide.
 *
 * Les annulations sont comptées : le geste doit atteindre le serveur, et
 * un écran qui retirerait la ligne sans appeler passerait l'essai.
 */
const annulations: string[] = [];

const repondrePartages = (
  partages: unknown[] = [],
  rendezVous: unknown[] = [],
  suite = "Ton rendez-vous est annulé.",
) => {
  annulations.length = 0;
  global.fetch = vi.fn().mockImplementation(
    (url: string, options?: { method?: string }) =>
      new Promise<Response>((resoudre) => {
        const adresse = String(url);
        if (adresse.includes("/annulation")) {
          annulations.push(adresse);
          void options;
        }
        setTimeout(
          () =>
            resoudre({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve(
                  adresse.includes("/annulation")
                    ? { mention: suite }
                    : adresse.includes("/rendez-vous")
                      ? { rendezVous }
                      : adresse.includes("/partages")
                        ? { partages }
                        : { consentements: CONSENTEMENTS, etat: { ...ETAT_INITIAL } },
                ),
            } as Response),
          25,
        );
      }),
  );
};

const RENDEZ_VOUS = [
  {
    reference: "RV-AB12CD",
    consultant: "Sofie Vermeulen",
    cabinet: "Vermeulen Immigration",
    dossier: "Pays-Bas — Séjour pour études",
    quand: "vendredi 9 octobre à 15 h 30",
    limite: "jeudi 8 octobre à 15 h 30",
    issue: "REMBOURSABLE" as const,
    avertissement:
      "Ton rendez-vous du vendredi 9 octobre à 15 h 30 sera annulé et la consultation remboursée.",
  },
];

beforeEach(() => {
  for (const cle of [...parametres.keys()]) parametres.delete(cle);
  vi.restoreAllMocks();
  repondrePartages();
});

describe("A-01 — Inscription", () => {
  it("n'ouvre pas de compte tant que les conditions ne sont pas acceptées", () => {
    render(<Inscription publiees={{}} />);
    const creer = screen.getByRole("button", { name: "Créer mon compte" });
    expect(creer).toBeDisabled();
    expect(creer).toHaveAccessibleDescription(
      "Accepte les conditions d'utilisation pour créer le compte.",
    );
  });

  it("ne pré-coche pas les conditions", () => {
    render(<Inscription publiees={{}} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("annonce la raison qui bloque encore, une fois les conditions acceptées", () => {
    render(<Inscription publiees={{}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Créer mon compte" })).toHaveAccessibleDescription(
      "Le mot de passe doit faire au moins dix caractères.",
    );
  });

  it("annonce le consentement aux pièces d'identité comme demandé ailleurs", () => {
    render(<Inscription publiees={{}} />);
    expect(
      screen.getByText(/est demandé séparément, au moment du premier téléversement/),
    ).toBeDefined();
  });

  it("commente la force du mot de passe à la frappe", () => {
    render(<Inscription publiees={{}} />);
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

describe("A-03 — Correction de l'adresse", () => {
  it("écrit l'adresse en cours, et ne renvoie plus vers les consentements", () => {
    const { container } = render(<Verification email="aline.dosou@email.com" />);
    expect(screen.getByText("aline.dosou@email.com")).toBeDefined();
    expect(container.querySelector('a[href="/consentements"]')).toBeNull();
  });

  it("corrige l'adresse sur place, avec le mot de passe, et annonce le nouvel email", async () => {
    const appels: { url: string; methode?: string; corps?: string }[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      appels.push({ url, methode: options?.method, corps: options?.body as string });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ email: "aline.dossou@email.com" }),
      } as Response);
    });
    render(<Verification email="aline.dosou@email.com" />);

    const bascule = screen.getByRole("button", { name: "Corriger mon adresse email" });
    expect(bascule).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bascule);
    expect(bascule).toHaveAttribute("aria-expanded", "true");

    const envoyer = screen.getByRole("button", { name: "Corriger et recevoir un code" });
    expect(envoyer).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nouvelle adresse email"), {
      target: { value: "aline.dossou@email.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "un mot de passe assez long" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Corriger et recevoir un code" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeDefined());
    expect(appels[0]?.url).toBe("/api/comptes/adresse");
    expect(appels[0]?.methode).toBe("PUT");
    expect(JSON.parse(appels[0]!.corps!)).toEqual({
      email: "aline.dossou@email.com",
      motDePasse: "un mot de passe assez long",
    });
    expect(screen.getByRole("status").textContent).toMatch(/Un email part à aline\.dossou@email\.com/);
    // L'adresse affichée est la nouvelle.
    expect(screen.getAllByText("aline.dossou@email.com").length).toBeGreaterThan(0);
    expect(screen.queryByText("aline.dosou@email.com")).toBeNull();
  });

  it("un mot de passe refusé s'affiche sous son champ", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        echec: {
          titre: "Certains champs sont à reprendre",
          corps: "x",
          action: "Corriger",
          ton: "echec",
          champs: { motDePasse: "Ce mot de passe ne correspond pas à ton compte." },
        },
      }),
    } as Response);
    render(<Verification email="aline.dosou@email.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Corriger mon adresse email" }));
    fireEvent.change(screen.getByLabelText("Nouvelle adresse email"), {
      target: { value: "aline.dossou@email.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "faux" } });
    fireEvent.click(screen.getByRole("button", { name: "Corriger et recevoir un code" }));
    expect(await screen.findByText("Ce mot de passe ne correspond pas à ton compte.")).toBeDefined();
  });
});

describe("A-04 — Mot de passe", () => {
  it("part de la demande et enchaîne sur la saisie du code", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ envoye: true }) } as Response);
    render(<MotDePasse />);
    expect(
      screen.getByRole("heading", { name: "Réinitialise ton mot de passe" }),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("Adresse email"), {
      target: { value: "aline.dossou@email.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Choisis un nouveau mot de passe" }),
      ).toBeDefined(),
    );
    expect(screen.getByLabelText("Code reçu par email")).toBeDefined();
  });

  it("ouvre directement l'étape du nouveau mot de passe depuis le paramètre", () => {
    parametres.set("etape", "nouveau");
    render(<MotDePasse />);
    expect(
      screen.getByRole("heading", { name: "Choisis un nouveau mot de passe" }),
    ).toBeDefined();
  });

  it("le changement annonce qu'il déconnecte l'appareil en cours, pas seulement les autres", () => {
    parametres.set("etape", "nouveau");
    const { container } = render(<MotDePasse />);
    // Le geste se fait après avoir perdu un téléphone : laisser l'appareil
    // perdu connecté l'annulerait.
    expect(container.textContent).toContain("celui-ci compris");
  });

  it("refuse d'enregistrer tant que les deux saisies diffèrent, et le dit", () => {
    parametres.set("etape", "nouveau");
    render(<MotDePasse />);
    const enregistrer = screen.getByRole("button", {
      name: "Enregistrer le mot de passe",
    });
    // La raison affichée est celle du premier manque dans l'ordre de lecture
    // de l'écran : le code vient avant les mots de passe.
    expect(enregistrer).toHaveAccessibleDescription(
      "Saisis les 6 chiffres reçus par email.",
    );
    fireEvent.change(screen.getByLabelText("Code reçu par email"), {
      target: { value: "531044" },
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

  /**
   * RG-12.2 — l'accord donné à un consultant est annoncé révocable par
   * T-04, par la case de T-05 et par le courrier de confirmation. La
   * mention nomme cet écran-ci, qui ne parlait que des autorisations
   * générales : il n'existait aucun endroit pour retirer l'accès.
   */
  /**
   * T-05, RG-12.5 — trois surfaces promettaient « annulation ou report sans
   * frais jusqu'au […] », et aucune n'annulait : `issueDeLAnnulation`
   * n'avait que deux appelants, une lecture d'écran et la suppression de
   * compte. Le seul moyen d'annuler une consultation était d'effacer son
   * dossier.
   */
  it("liste les rendez-vous à venir, avec leur limite d'annulation", async () => {
    repondrePartages([], RENDEZ_VOUS);
    render(<Consentements />);

    expect(await screen.findByText(/vendredi 9 octobre à 15 h 30/)).toBeDefined();
    expect(screen.getByText(/Sofie Vermeulen · Vermeulen Immigration/)).toBeDefined();
    // La limite est celle stockée avec le rendez-vous, pas la grille du jour.
    expect(screen.getByText(/jeudi 8 octobre à 15 h 30/)).toBeDefined();
  });

  it("dit ce que l'annulation coûte avant de la confirmer, jamais après", async () => {
    repondrePartages([], RENDEZ_VOUS);
    render(<Consentements />);

    const annuler = await screen.findByRole("button", { name: "Annuler ce rendez-vous" });
    // Rien n'est encore parti : l'avertissement n'est pas un compte rendu.
    expect(annulations).toEqual([]);
    fireEvent.click(annuler);

    expect(screen.getByText(RENDEZ_VOUS[0]!.avertissement)).toBeDefined();
    expect(annulations).toEqual([]);
    // Et le geste de garder existe : une confirmation sans issue n'en est pas une.
    expect(screen.getByRole("button", { name: "Garder ce rendez-vous" })).toBeDefined();
  });

  it("annule au serveur, et dit la suite que le serveur donne", async () => {
    repondrePartages([], RENDEZ_VOUS, "Ton rendez-vous est annulé et le remboursement est parti.");
    render(<Consentements />);

    fireEvent.click(await screen.findByRole("button", { name: "Annuler ce rendez-vous" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'annulation" }));

    /*
      La suite vient du serveur : lui seul sait si un remboursement a été
      ouvert. L'écrire à l'écran en doublerait la décision, et les deux
      finiraient par diverger.
    */
    expect(
      await screen.findByText(/le remboursement est parti/),
    ).toBeDefined();
    expect(annulations).toHaveLength(1);
    expect(annulations[0]).toContain("RV-AB12CD");
  });

  it("une lecture qui échoue ne se lit pas « aucun rendez-vous »", async () => {
    // Afficher l'état vide sur une lecture ratée ferait croire qu'il n'y a
    // rien à annuler, sur l'écran même où l'on vient annuler.
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).includes("/rendez-vous")
              ? {}
              : { consentements: CONSENTEMENTS, etat: { ...ETAT_INITIAL }, partages: [] },
          ),
      } as Response),
    );
    render(<Consentements />);

    expect(await screen.findByText(/n'ont pas pu être lus/)).toBeDefined();
    expect(screen.queryByText(RENDEZ_VOUS_VIDES)).toBeNull();
  });

  it("aucun rendez-vous : l'écran dit où l'on en prend un", async () => {
    repondrePartages([], []);
    render(<Consentements />);
    expect(await screen.findByText(RENDEZ_VOUS_VIDES)).toBeDefined();
  });

  it("liste les dossiers ouverts à un consultant", async () => {
    repondrePartages(PARTAGES);
    render(<Consentements />);

    // L'attente porte sur ce que la lecture apporte, jamais sur le titre :
    // celui-ci est rendu avant l'appel, et l'attendre n'attend rien. La
    // première écriture de ce test passait en local et échouait en
    // intégration, selon l'ordre des microtâches.
    await waitFor(() =>
      expect(screen.getByText(/Vermeulen Immigration · Pays-Bas/)).toBeDefined(),
    );
    expect(screen.getByRole("heading", { name: "Dossiers partagés" })).toBeDefined();
    expect(screen.getByText(/Accordé le 17 septembre 2026/)).toBeDefined();
  });

  it("ne propose de retirer que ce qui est encore ouvert", async () => {
    repondrePartages(PARTAGES);
    render(<Consentements />);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Retirer l'accès/ })).toHaveLength(1),
    );
    // L'accord retiré reste affiché : une liste qui ne montre que l'ouvert
    // ne permet pas de vérifier qu'on a bien fermé.
    expect(screen.getByText(/Benali & Associés/)).toBeDefined();
    expect(screen.getByText(/Accès retiré/)).toBeDefined();
  });

  it("retire un accès et relit l'état depuis le serveur", async () => {
    repondrePartages(PARTAGES);
    render(<Consentements />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Retirer l'accès/ })).toBeDefined(),
    );

    repondrePartages([{ ...PARTAGES[0]!, etat: "retire", echeance: "Retiré" }, PARTAGES[1]]);
    fireEvent.click(screen.getByRole("button", { name: /Retirer l'accès/ }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Retirer l'accès/ })).toBeNull(),
    );
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-2)!;
    expect(url).toBe("/api/comptes/partages/acc-1/retrait");
    expect((options as RequestInit).method).toBe("POST");
  });

  it("dit ce que le retrait ne fait pas", async () => {
    repondrePartages(PARTAGES);
    const { container } = render(<Consentements />);
    await waitFor(() => expect(screen.getByText(/Le retrait ferme l'accès/)).toBeDefined());
    /*
      Quelqu'un qui croit effacer une consultation déjà eue se tromperait.
      La phrase le disait en citant « les consultations déjà inscrites au
      journal » — un journal que rien n'écrit. Elle dit désormais le même
      fait sans s'appuyer sur lui.
    */
    expect(screen.getByText(/pour l'avenir seulement/)).toBeDefined();
    expect(container.textContent).not.toContain("journal");
  });

  it("aucun partage : l'écran dit quand un accès s'ouvre", async () => {
    render(<Consentements />);
    await waitFor(() =>
      expect(screen.getByText(/Aucun consultant n'a accès à tes dossiers/)).toBeDefined(),
    );
  });
});
