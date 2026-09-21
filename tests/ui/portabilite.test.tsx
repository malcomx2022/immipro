import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MesDonnees } from "@/app/(auth)/compte/mes-donnees/MesDonnees";
import { ArchiveDuDossier } from "@/app/(app)/(dossier)/dossiers/[id]/archive/ArchiveDuDossier";
import type { Archive } from "@/server/lecture/portabilite";

/**
 * Les en-têtes en font partie : c'est d'elles que `telechargerFichier`
 * tire le nom du fichier, le serveur connaissant le périmètre exact. Un
 * stock sans en-têtes ne représentait aucune réponse réelle, et il a fallu
 * que le lecteur s'y casse pour qu'on le remarque.
 */
const reponse = (corps: unknown, statut = 200, nomDeFichier?: string) =>
  Promise.resolve({
    ok: statut < 400,
    status: statut,
    headers: new Headers(
      nomDeFichier
        ? { "content-disposition": `attachment; filename="${nomDeFichier}"` }
        : {},
    ),
    json: () => Promise.resolve(corps),
    blob: () => Promise.resolve(new Blob([JSON.stringify(corps)])),
  } as Response);

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:x"), writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });
});

const ARCHIVE: Archive = {
  dossier: {
    id: "nl-4471",
    pays: "Pays-Bas",
    intitule: "Séjour pour études (MVV + VVR)",
    code: "NL",
    statut: "ACTIF",
    ouvertLe: "2026-09-01T10:00:00.000Z",
    departVise: "2027-09-01",
    purgePrevueLe: "2026-10-20",
    purgeeLe: null,
  },
  regle: { version: 1, source: "https://ind.nl", verifieeLe: "2026-09-11" },
  pieces: [
    {
      id: "p1",
      code: "passeport",
      libelle: "Passeport",
      famille: "OBLIGATOIRE",
      etat: "CONFORME",
      constat: null,
      telechargeable: true,
      purgeeLe: null,
      textes: [],
      analyses: [
        {
          verdict: "CONFORME",
          titre: "Validité suffisante",
          corps: "Ton passeport couvre la durée du séjour.",
          analyseeLe: "2026-09-10",
        },
      ],
    },
    {
      id: "p2",
      code: "lettre_motivation",
      libelle: "Lettre de motivation",
      famille: "OBLIGATOIRE",
      etat: "CONFORME",
      constat: null,
      telechargeable: false,
      purgeeLe: null,
      textes: [
        { rang: 1, motif: null, texte: "Madame, Monsieur,\n\nJe souhaite étudier à Groningue." },
      ],
      analyses: [],
    },
    {
      id: "p3",
      code: "preuve_fonds",
      libelle: "Justificatif de ressources",
      famille: "OBLIGATOIRE",
      etat: "PURGEE",
      constat: null,
      telechargeable: false,
      purgeeLe: "2026-10-20",
      textes: [],
      analyses: [],
    },
  ],
  echeances: [{ libelle: "Prendre rendez-vous au consulat", echeanceLe: "2027-06-01", faite: false }],
};

/**
 * Mes données — A-05, WF-15.
 *
 * L'écran existe parce qu'un lien le promettait et renvoyait sur lui-même.
 */
describe("Mes données", () => {
  it("dit ce qui n'est pas dans le fichier avant de proposer de le prendre", () => {
    const { container } = render(<MesDonnees dossiers={[]} />);
    const texte = container.textContent ?? "";
    expect(texte.indexOf("Ce qu'il ne contient pas")).toBeGreaterThan(-1);
    expect(texte.indexOf("Ce qu'il ne contient pas")).toBeLessThan(
      texte.indexOf("Télécharger mes données"),
    );
  });

  it("dit où trouver ses pièces quand il n'y a pas encore de dossier", () => {
    render(<MesDonnees dossiers={[]} />);
    expect(screen.getByText(/Tu n'as pas encore de dossier/)).toBeDefined();
  });

  it("mène à l'archive de chaque dossier", () => {
    render(
      <MesDonnees
        dossiers={[{ id: "nl-4471", pays: "Pays-Bas", intitule: "Séjour pour études" }]}
      />,
    );
    expect(screen.getByRole("link", { name: /Pays-Bas/ }).getAttribute("href")).toBe(
      "/dossiers/nl-4471/archive",
    );
  });

  it("confirme que le fichier est parti", async () => {
    global.fetch = vi.fn(() => reponse({ meta: {} })) as unknown as typeof fetch;
    render(<MesDonnees dossiers={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Télécharger mes données" }));
    await waitFor(() =>
      expect(screen.getByText("Le fichier est dans tes téléchargements.")).toBeDefined(),
    );
  });

  it("dit ce qui est conservé quand le réseau manque", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    render(<MesDonnees dossiers={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Télécharger mes données" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Tu es hors ligne"),
    );
  });
});

/**
 * Archive d'un dossier — C-11.
 */
describe("Archive d'un dossier", () => {
  it("porte le texte rédigé en entier, pas son titre", () => {
    const { container } = render(<ArchiveDuDossier archive={ARCHIVE} />);
    expect(container.textContent).toContain("Je souhaite étudier à Groningue.");
  });

  it("n'offre pas de télécharger une pièce purgée, et dit pourquoi", () => {
    render(<ArchiveDuDossier archive={ARCHIVE} />);
    // Une seule pièce est téléchargeable : le passeport.
    expect(screen.getAllByRole("button", { name: "Télécharger le fichier" })).toHaveLength(1);
    expect(
      screen.getByText(/Le contenu de cette pièce a été supprimé/),
    ).toBeDefined();
  });

  it("demande le lien au clic, et ne le pose jamais dans la page", async () => {
    const ouvrir = vi.fn();
    Object.defineProperty(window, "open", { value: ouvrir, writable: true });
    global.fetch = vi.fn(() =>
      reponse({ apercu: "https://stockage.invalid/signe" }),
    ) as unknown as typeof fetch;

    const { container } = render(<ArchiveDuDossier archive={ARCHIVE} />);
    // Avant le clic, aucune adresse de stockage n'est dans le document.
    expect(container.innerHTML).not.toContain("stockage.invalid");

    fireEvent.click(screen.getByRole("button", { name: "Télécharger le fichier" }));
    await waitFor(() =>
      expect(ouvrir).toHaveBeenCalledWith(
        "https://stockage.invalid/signe",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  it("dit que la pièce n'est plus là plutôt que d'ouvrir une page vide", async () => {
    global.fetch = vi.fn(() => reponse({ apercu: null })) as unknown as typeof fetch;
    render(<ArchiveDuDossier archive={ARCHIVE} />);
    fireEvent.click(screen.getByRole("button", { name: "Télécharger le fichier" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Ce fichier n'est plus disponible",
      ),
    );
  });

  it("porte la source et la date de la règle appliquée (INV-8)", () => {
    const { container } = render(<ArchiveDuDossier archive={ARCHIVE} />);
    expect(container.textContent).toContain("ind.nl");
    expect(container.textContent).toMatch(/vérifiée le/u);
  });

  it("traite le dossier sans checklist", () => {
    render(<ArchiveDuDossier archive={{ ...ARCHIVE, pieces: [], echeances: [] }} />);
    expect(screen.getByText(/n'a pas encore de checklist/)).toBeDefined();
  });
});
