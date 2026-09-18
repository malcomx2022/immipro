import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Annuaire } from "@/app/(app)/(dossier)/consultants/Annuaire";
import { PriseDeRendezVous } from "@/app/(app)/(dossier)/consultants/[id]/rendez-vous/PriseDeRendezVous";
import { CONSULTANTS, consultantParId, creneaux } from "@/lib/contenu/consultants";
import { PIECES_NL, dossierParId } from "@/lib/contenu/dossiers";
import { ALLEMAGNE } from "@/lib/contenu/destinations";
import { PORTEE_CONSULTANT, LIBELLE_PORTEE } from "@/domain/consultants/access";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

const DOSSIER = dossierParId("nl-4471")!;
const VERMEULEN = consultantParId("vermeulen")!;
const AUJOURDHUI = new Date("2026-09-15T08:00:00Z");
const espaces = (t: string) => t.replace(/[\s  ]/gu, " ");

describe("T-04 — Annuaire", () => {
  const rendre = (destination = "NL", dossier = DOSSIER) =>
    render(
      <Annuaire dossier={dossier} consultants={CONSULTANTS} destination={destination} />,
    );

  it("liste les habilités de la destination, le plus rapide d'abord", () => {
    rendre();
    const liens = screen.getAllByRole("link", { name: "Voir les créneaux" });
    expect(liens).toHaveLength(3);
    expect(liens[0]!.getAttribute("href")).toBe(
      "/consultants/vermeulen/rendez-vous?dossier=nl-4471",
    );
  });

  it("annonce le tarif unique, lu dans la grille", () => {
    const { container } = rendre();
    expect(espaces(container.textContent ?? "")).toContain(
      "Consultation 20 000 F · 45 min · tarif unique ImmiPro",
    );
    expect(espaces(container.textContent ?? "")).not.toContain("25 000 F");
  });

  it("sépare ce que l'habilitation atteste de l'issue de la demande", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("engage le consultant, pas ImmiPro");
    expect(container.textContent).toContain("pas que ta demande aboutira");
    expect(container.textContent).not.toMatch(/\d+\s?%/);
  });

  it("filtre par langue, et le filtre se retire", () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Fon" }));
    expect(screen.getAllByRole("link", { name: "Voir les créneaux" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Fon" }));
    expect(screen.getAllByRole("link", { name: "Voir les créneaux" })).toHaveLength(3);
  });

  it("nomme les destinations couvertes quand aucune habilitation n'existe", () => {
    const { container } = rendre("DE", { ...DOSSIER, destination: ALLEMAGNE });
    expect(container.textContent).toContain("Aucun consultant habilité pour l'Allemagne");
    expect(container.textContent).toContain("3 pour les Pays-Bas");
    expect(container.textContent).toContain("vérifie un titre d'exercice local");
  });

  it("dit que le dossier avance sans consultant", () => {
    const { container } = rendre("DE", { ...DOSSIER, destination: ALLEMAGNE });
    expect(container.textContent).toContain(
      "Les pièces, l'analyse et l'échéancier ne dépendent pas d'un consultant",
    );
    expect(
      screen.getByRole("link", { name: "Continuer sans consultant" }),
    ).toBeDefined();
  });
});

describe("T-05 — Accord d'accès", () => {
  const rendre = () =>
    render(
      <PriseDeRendezVous
        dossier={DOSSIER}
        pieces={PIECES_NL}
        consultant={VERMEULEN}
        creneaux={creneaux(AUJOURDHUI)}
      />,
    );

  it("demande l'accord avant les créneaux", () => {
    rendre();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Ouvrir ton dossier à Maître A. Vermeulen",
    );
    expect(screen.queryByText("Choisis un créneau")).toBeNull();
  });

  it("annonce exactement ce que le modèle de droits accorde", () => {
    const { container } = rendre();
    for (const portee of PORTEE_CONSULTANT) {
      expect(screen.getByText(LIBELLE_PORTEE[portee]), portee).toBeDefined();
    }
    expect(container.textContent).toContain("Ton moyen de paiement et tes achats");
    expect(container.textContent).toContain("Tes dossiers pour d'autres destinations");
  });

  it("dit que l'accord se retire avant de le demander", () => {
    const { container } = rendre();
    expect(container.textContent).toContain(
      "Le consultant ne voit rien tant que tu n'as pas donné ton accord",
    );
    expect(container.textContent).toContain("Mes consentements");
    expect(container.textContent).toContain("inscrite au journal");
  });

  it("ne pré-coche pas l'accord et explique le bouton bloqué", () => {
    rendre();
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    expect(
      screen.getByRole("button", { name: /Donner mon accord/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/sans lui, le consultant ne voit rien/)).toBeDefined();
  });

  it("ouvre les créneaux une fois l'accord donné", () => {
    rendre();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Donner mon accord/ }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Choisis un créneau",
    );
  });
});

describe("T-05 — Créneaux", () => {
  const ouvrirCreneaux = () => {
    render(
      <PriseDeRendezVous
        dossier={DOSSIER}
        pieces={PIECES_NL}
        consultant={VERMEULEN}
        creneaux={creneaux(AUJOURDHUI)}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Donner mon accord/ }));
  };

  it("fait de chaque journée un groupe radio à un seul arrêt (règle clavier 4)", () => {
    ouvrirCreneaux();
    const groupes = screen.getAllByRole("radiogroup");
    expect(groupes).toHaveLength(3);
    // Chaque groupe porte le jour : deux créneaux « 15 h 30 » sur deux jours
    // ne s'annoncent pas pareil.
    expect(groupes[0]!.getAttribute("aria-labelledby")).toBeTruthy();
    // Le jour est annoncé une fois, par le libellé du groupe.
    expect(screen.getAllByText(/sept\./).length).toBe(3);
    const radios = within(groupes[0]!).getAllByRole("radio");
    expect(radios.filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("montre un créneau déjà pris plutôt que de le masquer", () => {
    ouvrirCreneaux();
    // Chaque journée est un groupe nommé : « 11 h 30 » se répète d'un jour à
    // l'autre, et c'est le groupe qui le désambiguïse pour le lecteur d'écran.
    const premierJour = screen.getAllByRole("radiogroup")[0]!;
    const pris = within(premierJour).getByRole("radio", { name: /11 h 30/ });
    expect(pris).toHaveProperty("disabled", true);
    expect(screen.getAllByText("Déjà réservé").length).toBe(1);
  });

  it("annonce le prix, le délai d'annulation et la tenue du créneau", () => {
    ouvrirCreneaux();
    const texte = espaces(document.body.textContent ?? "");
    expect(texte).toContain("20 000 F, réglés à ImmiPro");
    expect(texte).toContain("24 h avant le créneau");
    fireEvent.click(
      within(screen.getAllByRole("radiogroup")[0]!).getByRole("radio", { name: "15 h 30" }),
    );
    expect(screen.getByText("Le créneau est tenu 10 minutes.")).toBeDefined();
  });

  it("énonce le décalage de fuseau", () => {
    ouvrirCreneaux();
    expect(document.body.textContent).toContain("dans ton fuseau, Cotonou");
    expect(document.body.textContent).toContain("Amsterdam");
  });

  it("n'affiche aucune disponibilité hors ligne", () => {
    ouvrirCreneaux();
    fireEvent(window, new Event("offline"));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(document.body.textContent).toContain(
      "Aucune disponibilité n'est montrée plutôt qu'un horaire déjà pris",
    );
    expect(document.body.textContent).toContain(
      "ta checklist, tes pièces déjà déposées et ton échéancier restent consultables",
    );
  });
});

describe("T-05 — Confirmation", () => {
  const confirmer = () => {
    render(
      <PriseDeRendezVous
        dossier={DOSSIER}
        pieces={PIECES_NL}
        consultant={VERMEULEN}
        creneaux={creneaux(AUJOURDHUI)}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Donner mon accord/ }));
    fireEvent.click(
      within(screen.getAllByRole("radiogroup")[0]!).getByRole("radio", { name: "15 h 30" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmer 15 h 30" }));
  };

  it("récapitule le rendez-vous avec sa référence", () => {
    confirmer();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Jeudi 17 septembre, 15 h 30",
    );
    expect(document.body.textContent).toMatch(/RDV-\d{4}-\d{7}/);
  });

  it("nomme les pièces à préparer, sans pourcentage", () => {
    confirmer();
    const texte = document.body.textContent ?? "";
    expect(texte).toContain(
      "2 pièces obligatoires restent à traiter : passeport et attestation de ressources.",
    );
    expect(texte).not.toMatch(/\d+\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
  });

  it("donne la date limite d'annulation sans frais", () => {
    confirmer();
    expect(document.body.textContent).toContain(
      "Annulation ou report sans frais jusqu'au mercredi 16 septembre à 15 h 30",
    );
    expect(document.body.textContent).toContain("la consultation est due");
  });

  it("rappelle que l'accord se retire", () => {
    confirmer();
    expect(document.body.textContent).toContain("que tu peux retirer à tout moment");
  });
});
