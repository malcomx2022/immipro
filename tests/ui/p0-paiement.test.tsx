import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChoixDuPack } from "@/app/(app)/paiement/pack/ChoixDuPack";
import { MENTION_MISE_EN_AVANT } from "@/components/ui/RadioGroup";
import { Recapitulatif } from "@/app/(app)/paiement/recapitulatif/Recapitulatif";
import { Attente } from "@/app/(app)/paiement/attente/Attente";
import { Echec } from "@/app/(app)/paiement/echec/Echec";
import { CONSULTATION, PACKS, RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import { corpsDAchat, tarifDe, type Achat } from "@/domain/payments/achat";
import { corpsDeLEtat } from "@/domain/consultants/tenue";
import { libelleLimite, libelleRendezVous } from "@/domain/consultants/rendez-vous";
import { DELAI_REESSAI_SECONDES } from "@/domain/paiement/attente";
import { formatMontant } from "@/lib/utils";
import { readFileSync } from "node:fs";
import { LIBELLE_ETAT } from "@/domain/paiement/recu";
import type {
  ConsultationPayee,
  PaiementEnCours,
  Tunnel,
} from "@/server/lecture/paiements";

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
  devisesOuvertes: ["XOF", "EUR"],
  paysConnu: true,
  telephone: "97 •• •• 42",
  dejaOuvert: false,
};

const EN_COURS: PaiementEnCours = {
  reference: "IMP-260920-4K7QZA",
  etat: "en_cours",
  statut: "EN_ATTENTE",
  cause: null,
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
    expect(continuer).toHaveAccessibleDescription("Choisis un pack pour continuer.");
  });

  it("affiche les montants du domaine, pas une copie", () => {
    const { container } = render(<ChoixDuPack tunnel={TUNNEL} />);
    for (const pack of PACKS) {
      expect(container.textContent).toContain(formatMontant(pack.prix.XOF, "XOF"));
    }
  });

  /**
   * ── Deux packs sur trois n'expliquaient rien ────────────────────────
   *
   * La description n'allait qu'au pack conseillé. Rendu avant correction :
   *
   *     Essentiel · 5 000 F
   *     Dossier · 15 000 F     Couvre l'ensemble des pièces exigées…
   *     Dossier Pro · 45 000 F
   *
   * Pro coûte trois fois Dossier et ne disait rien — alors que la grille
   * écrit sa phrase, et que `tarification.test.ts` vérifie déjà que les
   * trois en portent une.
   */
  it("donne à chaque pack ce que la grille écrit de lui", () => {
    const { container } = render(<ChoixDuPack tunnel={TUNNEL} />);
    for (const pack of PACKS) {
      expect(container.textContent, pack.code).toContain(pack.justification);
    }
  });

  /*
    La mise en avant ne se lisait que dans le cadre coloré et dans le fait
    d'être la seule option décrite — une couleur et une absence. Elle
    s'écrit, ce qui est aussi ce que le commentaire de `RadioOption`
    exigeait déjà sans que rien ne le tienne.
  */
  it("écrit la mise en avant plutôt que de la peindre", () => {
    render(<ChoixDuPack tunnel={TUNNEL} />);
    const misEnAvant = PACKS.filter((p) => p.misEnAvant);
    expect(misEnAvant).toHaveLength(1);

    const marque = screen.getAllByText(MENTION_MISE_EN_AVANT);
    expect(marque).toHaveLength(1);
    expect(marque[0]?.closest("[role=radio]")?.textContent).toContain(
      misEnAvant[0]?.libelle as string,
    );
  });

  /*
    Elle entre dans le nom accessible de l'option : lue à la voix, elle
    s'entend. C'est toute la raison de l'écrire — la couleur ne s'entend
    pas, et le cadre non plus.
  */
  it("la mention s'entend, elle n'est pas décorative", () => {
    render(<ChoixDuPack tunnel={TUNNEL} />);
    const conseille = PACKS.find((p) => p.misEnAvant)!;

    expect(
      screen.getByRole("radio", {
        name: new RegExp(`${conseille.libelle}.*${MENTION_MISE_EN_AVANT}`, "su"),
      }),
    ).toBeDefined();
  });

  it("ne vend ni popularité ni superlatif", () => {
    render(<ChoixDuPack tunnel={TUNNEL} />);
    expect(screen.queryByText(/le plus choisi|populaire|meilleur/i)).toBeNull();
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
  /**
   * N.C, tranché le 20/09/2026 — la zone d'action contient son prérequis.
   *
   * À 390 px, la barre collante recouvrait la case qui déverrouille son
   * propre bouton : barre 715→844, case 757→865. « Elle reste
   * atteignable » ne suffit pas — le consentement doit être visible au
   * moment de l'action.
   *
   * Le test porte sur la structure, pas sur des pixels : jsdom ne met rien
   * en page, et une mesure y serait une fiction. Mais c'est précisément ce
   * que la décision demande — que la zone d'action *contienne* le
   * consentement — et une structure se vérifie sans moteur de rendu.
   */
  it("la case vit dans la zone d'action, immédiatement avant le bouton", () => {
    const { container } = render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={{ libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    const bouton = screen.getByRole("button", { name: /Payer/u });
    const etiquette = container.querySelector('input[type="checkbox"]')!.closest("label")!;

    // La zone d'action est le parent de la case : elle doit contenir le
    // bouton. Désactivé, celui-ci s'enveloppe pour porter sa raison — on
    // compare donc les conteneurs, pas les nœuds.
    const zone = etiquette.parentElement!;
    expect(zone.contains(bouton)).toBe(true);

    // Et immédiatement avant : rien ne s'intercale entre les deux.
    const suivant = etiquette.nextElementSibling!;
    expect(suivant === bouton || suivant.contains(bouton)).toBe(true);
  });

  /**
   * Aucune marge compensatoire : une valeur calée sur une hauteur de barre
   * se dément au premier bloc d'échec, qui la fait grandir — au moment
   * précis où le candidat cherche la case.
   */
  it("la barre n'est plus collante ici, et aucune marge ne la compense", () => {
    const source = readFileSync(
      "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
      "utf8",
    );
    expect(source).not.toMatch(/sticky bottom-0/u);
    expect(source).not.toMatch(/pb-\[\d|mb-\[\d|paddingBottom/u);
  });

  it("ne coche pas les conditions d'avance", () => {
    render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={{ libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("ne débite pas tant que les conditions ne sont pas acceptées", () => {
    render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={{ libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    const payer = screen.getByRole("button", { name: /Payer/ });
    expect(payer).toBeDisabled();
    expect(payer).toHaveAccessibleDescription(
      "Accepte les conditions d'utilisation pour payer.",
    );

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Payer/ })).toBeEnabled();
  });

  it("répète le montant sur le bouton, avant tout déclenchement", () => {
    const montant = formatMontant(PACKS[0]?.prix.XOF ?? 0, "XOF");
    render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={{ libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(screen.getByRole("button", { name: `Payer ${montant}` })).toBeDefined();
  });

  it("n'annonce aucun taux de change entre les deux grilles", () => {
    const { container } = render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={{ libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(container.textContent).toContain("ce n'est pas une conversion");
    expect(container.textContent).not.toMatch(/taux de change|655/i);
  });

  it("masque le numéro Mobile Money", () => {
    const { container } = render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={{ libelle: PACKS[0]!.libelle, prix: PACKS[0]!.prix }}
        deviseInitiale="XOF"
      />,
    );
    expect(container.textContent).toContain("97 •• •• 42");
    expect(container.textContent).not.toContain("97000042");
  });
});

/**
 * Le corps réellement envoyé, pour chacun des trois achats.
 *
 * ── Ce que ce bloc retient ──────────────────────────────────────────
 *
 * L'écran affichait une consultation correctement — libellé et montant
 * venaient de la grille — et l'envoyait sous l'étiquette d'un pack,
 * parce qu'il redevinait la catégorie sur le code : tout ce qui n'était
 * pas `recharge` partait en pack.
 *
 * Aucun test ne pouvait le voir : ils ne rendaient qu'un pack, et aucun
 * n'ouvrait le corps de la requête. Ceux-ci cliquent pour de bon, et
 * lisent ce qui part sur le fil.
 */
describe("$-02 — ce qui part quand on clique", () => {
  const partirPayer = () => {
    const aller = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: aller },
    });
    return aller;
  };

  /** Rend l'écran pour un achat, accepte les conditions, et paie. */
  const payer = async (achat: Achat) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ reference: "IMP-260921-ZZZZZZ", url: "https://exemple.test/payer" }),
    } as unknown as Response);
    const aller = partirPayer();

    render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={achat}
        tarif={tarifDe(achat)!}
        deviseInitiale="XOF"
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Payer/u }));
    await waitFor(() => expect(aller).toHaveBeenCalled());

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/paiements");
    return JSON.parse(String((options as RequestInit).body)) as {
      dossierId: string;
      achat: unknown;
      devise: string;
    };
  };

  it("un pack part comme un pack, avec son code", async () => {
    const corps = await payer({ type: "pack", code: PACKS[0]!.code });
    expect(corps.achat).toEqual({ type: "pack", code: PACKS[0]!.code });
    expect(corps).toMatchObject({ dossierId: "nl-1", devise: "XOF" });
  });

  it("une recharge part comme une recharge, sans code de pack", async () => {
    const corps = await payer({ type: "recharge" });
    expect(corps.achat).toEqual({ type: "recharge" });
  });

  /**
   * Le défaut, exactement. Avant le correctif, ce corps valait
   * `{ type: "pack", code: "consultation" }` — le serveur l'acceptait,
   * l'enregistrait, et n'ouvrait rien en face.
   */
  it("une consultation part comme une consultation, jamais comme un pack", async () => {
    const corps = await payer({ type: "consultation" });
    expect(corps.achat).toEqual({ type: "consultation" });
    expect(corps.achat).not.toHaveProperty("code");
  });

  it("affiche le libellé et le montant de chaque achat, et n'en recopie aucun", async () => {
    for (const achat of [
      { type: "pack", code: PACKS[0]!.code },
      { type: "recharge" },
      { type: "consultation" },
    ] as const) {
      const tarif = tarifDe(achat)!;
      const { container, unmount } = render(
        <Recapitulatif publiees={{}} tunnel={TUNNEL} achat={achat} tarif={tarif} deviseInitiale="XOF" />,
      );
      expect(container.textContent).toContain(tarif.libelle);
      expect(container.textContent).toContain(formatMontant(tarif.prix.XOF, "XOF"));
      unmount();
    }

    // Les trois montants sont distincts : afficher l'un pour l'autre se
    // verrait. Et aucun n'est écrit dans le composant.
    const source = readFileSync(
      "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
      "utf8",
    );
    for (const montant of [PACKS[0]!.prix.XOF, RECHARGE_ANALYSES.prix.XOF, CONSULTATION.prix.XOF]) {
      expect(source).not.toContain(String(montant));
    }
  });

  it("le corps envoyé est celui que le domaine sérialise, sans recomposition", async () => {
    for (const achat of [
      { type: "pack", code: PACKS[0]!.code },
      { type: "recharge" },
      { type: "consultation" },
    ] as const) {
      const corps = await payer(achat);
      expect(corps.achat).toEqual(corpsDAchat(achat));
      cleanup();
    }
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

  /**
   * L'écran d'attente pour une consultation — arbitrage du 22/09/2026.
   *
   * Signalé depuis trois lots : « l'écran d'attente de paiement est celui
   * des packs ». Un candidat qui venait de payer quarante-cinq minutes
   * d'entretien lisait « Nous recevons la confirmation, ton pack
   * s'ouvre », et rien ne nommait le créneau qu'il attendait.
   */
  const CONSULTATION_EN_COURS: PaiementEnCours = {
    ...EN_COURS,
    achat: CONSULTATION.libelle,
    achatCode: "consultation",
    montant: CONSULTATION.prix.XOF,
  };

  const RENDEZ_VOUS: ConsultationPayee = {
    reference: "RV-260922-AB12",
    debut: "2026-09-24T15:30:00.000Z",
    dureeMinutes: 45,
    consultant: "Marieke Vermeulen",
    tenuJusqua: "2026-09-22T10:20:00.000Z",
    confirme: false,
  };

  it("annonce le créneau réservé, et non un pack qui s'ouvre", () => {
    const { container } = render(
      <Attente attente={CONSULTATION_EN_COURS} consultation={RENDEZ_VOUS} />,
    );
    expect(container.textContent).toContain("ton créneau est réservé");
    expect(container.textContent).not.toContain("ton pack s'ouvre");
  });

  /** Ce qui manquait le plus : savoir ce qu'on attend. */
  it("nomme le créneau et le consultant", () => {
    const { container } = render(
      <Attente attente={CONSULTATION_EN_COURS} consultation={RENDEZ_VOUS} />,
    );
    expect(container.textContent).toContain("Marieke Vermeulen");
    expect(container.textContent).toContain(
      libelleRendezVous({ debut: RENDEZ_VOUS.debut, disponible: false }),
    );
    expect(container.textContent).toContain(corpsDeLEtat("EN_ATTENTE"));
  });

  /**
   * Les deux décomptes ne se confondent pas : l'attente dure cinq
   * minutes, la tenue vingt. Voir le premier s'épuiser ne veut pas dire
   * que le créneau est perdu.
   */
  it("distingue le délai de confirmation de la tenue du créneau", () => {
    const { container } = render(
      <Attente attente={CONSULTATION_EN_COURS} consultation={RENDEZ_VOUS} />,
    );
    expect(container.textContent).toContain(libelleLimite(RENDEZ_VOUS.tenuJusqua!));
    expect(container.textContent).toMatch(
      /porte sur la confirmation du paiement, pas sur le créneau/u,
    );
  });

  it("dit ce qu'abandonner fait au créneau, et où en reprendre un", () => {
    render(<Attente attente={CONSULTATION_EN_COURS} consultation={RENDEZ_VOUS} />);
    const abandon = screen.getByRole("link", { name: "Abandonner et libérer le créneau" });
    expect(abandon.getAttribute("href")).toBe("/consultants?dossier=nl-1");
    expect(screen.queryByRole("link", { name: "Annuler le paiement" })).toBeNull();
  });

  /** Et le cas du pack ne bouge pas d'un mot. */
  it("un pack garde son fil, sa contrepartie et son lien d'annulation", () => {
    const { container } = render(<Attente attente={EN_COURS} />);
    expect(container.textContent).toContain("ton pack s'ouvre");
    expect(container.textContent).not.toContain("créneau");
    expect(
      screen.getByRole("link", { name: "Annuler le paiement" }).getAttribute("href"),
    ).toBe("/tableau-de-bord");
  });

  it("une recharge annonce ses analyses, pas un pack", () => {
    const { container } = render(
      <Attente attente={{ ...EN_COURS, achatCode: "recharge" }} />,
    );
    expect(container.textContent).toContain("tes analyses sont créditées");
    expect(container.textContent).not.toContain("ton pack s'ouvre");
  });

  /**
   * Le bloc du créneau ne s'affiche que s'il y a un créneau à montrer.
   * Une consultation dont le rendez-vous a disparu ne doit pas faire
   * planter l'écran d'un paiement peut-être déjà encaissé.
   */
  it("une consultation sans rendez-vous lu reste un écran lisible", () => {
    const { container } = render(<Attente attente={CONSULTATION_EN_COURS} />);
    expect(container.textContent).toContain("ton créneau est réservé");
    expect(container.textContent).not.toContain(corpsDeLEtat("EN_ATTENTE"));
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
  });
});

describe("$-05 — Échec", () => {
  /**
   * ── Un pack retiré de l'offre perdait le chemin du retour ─────────
   *
   * `achatDepuisLeCode` rendait `null` pour un code absent de la grille —
   * la règle du paramètre d'adresse, appliquée à un code que nous avions
   * nous-mêmes écrit. Cet écran n'avait pas de repli, là où la page
   * d'attente et celle de confirmation en avaient un : le candidat dont
   * le paiement échouait sur un pack entre-temps retiré lisait un écran
   * d'échec sans un seul lien pour y revenir.
   *
   * La catégorie est désormais toujours connue ; ce qui peut manquer,
   * c'est le tarif — et c'est lui qui décide de la reprise.
   */
  it("nomme encore le pack quand son code a quitté la grille, sans proposer de le racheter", () => {
    render(
      <Echec
        paiement={{ ...EN_COURS, achatCode: "essentiel_2025", etat: "sans_suite", statut: "EXPIREE" }}
        motif={null}
      />,
    );
    // Aucune reprise : le récapitulatif n'aurait pas de montant à afficher.
    expect(
      screen.queryByRole("link", { name: /Reprendre le paiement|Réessayer/u }),
    ).toBeNull();
    // Et pas davantage la phrase réservée à une consultation, que ce
    // paiement n'est pas.
    expect(screen.queryByText(/créneau/u)).toBeNull();
  });

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
      screen.getByRole("heading", { name: "Ton solde n'a pas couvert le paiement" }),
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

  /**
   * L'échec d'une consultation — la coordination avec T-05.
   *
   * « Réessayer le paiement » renvoyait au récapitulatif avec le code de
   * l'achat : pour une consultation, cela rouvrait un paiement dont plus
   * aucun créneau n'était tenu — `libererLaTenue` a supprimé le
   * rendez-vous avec l'échec. La notification signée n'aurait rien eu à
   * confirmer, et le candidat aurait payé une consultation sans horaire.
   */
  const CONSULTATION_ECHOUEE: PaiementEnCours = {
    ...EN_COURS,
    etat: "sans_suite",
    statut: "ECHOUEE",
    achat: CONSULTATION.libelle,
    achatCode: "consultation",
    montant: CONSULTATION.prix.XOF,
  };

  it("une consultation échouée ne renvoie jamais au récapitulatif", () => {
    render(<Echec paiement={CONSULTATION_ECHOUEE} motif={null} />);
    for (const lien of screen.getAllByRole("link")) {
      expect(lien.getAttribute("href")).not.toMatch(/\/paiement\/recapitulatif/u);
    }
    expect(screen.queryByRole("link", { name: "Réessayer le paiement" })).toBeNull();
  });

  it("elle renvoie choisir un créneau, et dit que l'ancien est libre", () => {
    const { container } = render(<Echec paiement={CONSULTATION_ECHOUEE} motif={null} />);
    expect(
      screen.getByRole("link", { name: "Choisir un créneau" }).getAttribute("href"),
    ).toBe("/consultants?dossier=nl-1");
    expect(container.textContent).toContain(corpsDeLEtat("ECHOUE"));
    // Rien ne prétend que le créneau est encore gardé : il ne l'est plus.
    expect(container.textContent).not.toMatch(/créneau reste tenu/u);
  });

  it("le délai dépassé dit autre chose que le refus", () => {
    const { container } = render(
      <Echec paiement={{ ...CONSULTATION_ECHOUEE, statut: "EXPIREE" }} motif={null} />,
    );
    expect(container.textContent).toContain(corpsDeLEtat("LIBERE"));
  });

  it("un pack, lui, se réessaie au récapitulatif", () => {
    render(
      <Echec
        paiement={{ ...EN_COURS, etat: "sans_suite", statut: "ECHOUEE" }}
        motif={null}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Réessayer le paiement" }).getAttribute("href"),
    ).toBe(`/paiement/recapitulatif?dossier=nl-1&achat=${PACKS[0]!.code}&devise=XOF`);
    expect(screen.queryByRole("link", { name: "Choisir un créneau" })).toBeNull();
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
/**
 * Le pilote FedaPay seul — 03/10/2026.
 *
 * L'euro ne se proposait plus seulement à tort : « Payer par carte » menait
 * à un paiement que rien ne pouvait ouvrir. Les écrans suivent désormais
 * les devises ouvertes, lues par le serveur.
 */
describe("$-01 et $-02 — un rail fermé ne se propose pas", () => {
  const PILOTE = { ...TUNNEL, devisesOuvertes: ["XOF" as const] };

  it("le choix du pack ne propose que le franc CFA, et dit pourquoi", () => {
    render(<ChoixDuPack tunnel={PILOTE} />);
    expect(screen.getByRole("radio", { name: "Francs CFA" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Euros" })).toBeNull();
    expect(screen.getByText(/paiement par carte bancaire, en euros, n'est pas encore ouvert/u)).toBeVisible();
  });

  it("le récapitulatif en euros ne laisse pas payer, et renvoie au choix", () => {
    render(
      <Recapitulatif
        publiees={{}}
        tunnel={PILOTE}
        achat={{ type: "pack", code: PACKS[0]!.code }}
        tarif={tarifDe({ type: "pack", code: PACKS[0]!.code })!}
        deviseInitiale="EUR"
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /^Payer/u })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/n'est pas encore ouvert/u);
    expect(screen.getByRole("link", { name: "Revenir au choix du pack" })).toHaveAttribute(
      "href",
      "/paiement/pack?dossier=nl-1",
    );
  });
});
