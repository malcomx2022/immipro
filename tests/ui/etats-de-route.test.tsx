import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const rafraichir = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: rafraichir, push: vi.fn() }),
  usePathname: () => "/adresse-inconnue",
}));

// Composant serveur asynchrone (revue M14) : simulé, comme dans gabarit.test.
vi.mock("@/components/juridique/LiensJuridiques", () => ({ LiensJuridiques: () => null }));

import { ChargementDePage } from "@/components/etats/ChargementDePage";
import { EchecDeRendu } from "@/components/etats/EchecDeRendu";
import { PageIntrouvable } from "@/components/etats/PageIntrouvable";
import IntrouvableRacine from "@/app/not-found";
import {
  ECRAN_HORS_LIGNE,
  PAGE_INTROUVABLE,
  SERVICE_INTERROMPU,
  pageEnEchec,
  type Espace,
  type EtatDEcranTexte,
} from "@/domain/etats/ecrans";

/**
 * Pages d'état des routes — revue du 07/10/2026, E8 (D-15).
 *
 * Aucune route n'avait de `not-found`, d'`error` ni de `loading` : 41
 * appels à `notFound()` affichaient la 404 anglaise de Next, et une base
 * indisponible l'écran d'erreur anglais du framework.
 */
function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else acc.push(p);
  }
  return acc;
}
const APP = join("src", "app");
const SOURCES = fichiers(APP).filter((f) => f.endsWith(".tsx") && !f.includes(`${APP}/api/`));

describe("chaque route a ses pages d'état", () => {
  it("toute page qui appelle notFound() a un not-found dans son groupe, pas seulement à la racine", () => {
    const appelants = SOURCES.filter((f) => /\bnotFound\(/u.test(readFileSync(f, "utf8")));
    expect(appelants.length).toBeGreaterThanOrEqual(25);
    const orphelins = appelants.filter((f) => {
      for (let d = dirname(f); d !== APP; d = dirname(d)) {
        if (existsSync(join(d, "not-found.tsx"))) return false;
      }
      return true;
    });
    expect(orphelins).toEqual([]);
  });

  it("chaque gabarit de groupe a son error.tsx, et la racine aussi", () => {
    const gabarits = SOURCES.filter((f) => f.endsWith("layout.tsx")).map(dirname);
    expect(gabarits.length).toBeGreaterThanOrEqual(6);
    for (const d of gabarits) expect(existsSync(join(d, "error.tsx")), d).toBe(true);
    expect(existsSync(join(APP, "global-error.tsx"))).toBe(true);
  });

  it("les espaces qui attendent le serveur ont un loading", () => {
    for (const d of ["(app)/(dossier)", "(app)/paiement", "(admin)"]) {
      expect(existsSync(join(APP, d, "loading.tsx")), d).toBe(true);
    }
  });

  it("global-error écrit son html en français et son titre d'onglet", () => {
    const src = readFileSync(join(APP, "global-error.tsx"), "utf8");
    expect(src).toContain('<html lang="fr">');
    expect(src).toContain("<title>");
    expect(src).toContain("globals.css");
    expect(src).not.toMatch(/<Header|<Footer/u);
  });
});

describe("les textes", () => {
  const tous: EtatDEcranTexte[] = [
    ...Object.values(PAGE_INTROUVABLE),
    ...(["general", "public", "comptes", "dossier", "paiement", "backoffice"] as Espace[]).map(pageEnEchec),
    ECRAN_HORS_LIGNE,
    SERVICE_INTERROMPU,
  ];

  it("sont français, sans « 404 » ni le texte de Next", () => {
    for (const t of tous) {
      expect(`${t.titre} ${t.corps} ${t.conserve ?? ""}`).not.toMatch(/404|This page|could not be found|error/iu);
    }
  });

  it("le paiement ne dit jamais que rien n'a été débité", () => {
    for (const t of [PAGE_INTROUVABLE.paiement, pageEnEchec("paiement")] as EtatDEcranTexte[]) {
      expect(`${t.corps} ${t.conserve}`).not.toMatch(/débit|aucun montant/iu);
    }
  });
});

describe("PageIntrouvable", () => {
  it.each([
    ["public", "/", "Revenir à l'accueil"],
    ["dossier", "/tableau-de-bord", "Revenir à mes dossiers"],
    ["paiement", "/tableau-de-bord", "Revenir à mes dossiers"],
    ["backoffice", "/veille", "Revenir à la file de veille"],
  ] as const)("%s : titre focalisable et action vers %s", (espace, href, action) => {
    render(<PageIntrouvable espace={espace} />);
    const titre = screen.getByRole("heading", { level: 1 });
    expect(titre).toHaveAttribute("id", "contenu");
    expect(titre).toHaveAttribute("tabindex", "-1");
    expect(titre).toHaveTextContent(PAGE_INTROUVABLE[espace].titre);
    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", href);
    // D-15 : pas d'image d'erreur sur une adresse qui ne mène à rien.
    expect(document.querySelector("img")).toBeNull();
  });

  it("dossier : ce qui est conservé se lit avant l'action", () => {
    render(<PageIntrouvable espace="dossier" />);
    const conserve = screen.getByText(PAGE_INTROUVABLE.dossier.conserve);
    const action = screen.getByRole("link", { name: "Revenir à mes dossiers" });
    expect(conserve.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la racine recompose le gabarit d'acquisition", () => {
    render(<IntrouvableRacine />);
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#contenu");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

describe("EchecDeRendu", () => {
  const erreur = Object.assign(new Error("SELECT secret FROM \"User\""), { digest: "3141592653" });
  let journal: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rafraichir.mockClear();
    journal = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    journal.mockRestore();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("ne montre ni ne journalise le message : seulement l'espace et le digest", () => {
    render(<EchecDeRendu espace="dossier" error={erreur} reset={vi.fn()} />);
    expect(document.body.textContent).not.toContain("SELECT");
    expect(journal).toHaveBeenCalledWith("[rendu]", { espace: "dossier", digest: "3141592653" });
    expect(JSON.stringify(journal.mock.calls)).not.toContain("SELECT");
    // Le digest ne s'affiche pas côté candidat (règle 3).
    expect(document.body.textContent).not.toContain("3141592653");
  });

  it("titre, conservé, illustration d'erreur et sortie de l'espace", () => {
    render(<EchecDeRendu espace="paiement" error={erreur} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cette page n'a pas pu s'afficher");
    expect(screen.getByText(pageEnEchec("paiement").conserve!)).toBeInTheDocument();
    expect(document.querySelector("img")?.getAttribute("src")).toContain("erreur.svg");
    expect(screen.getByRole("link", { name: "Revenir à mes dossiers" })).toHaveAttribute("href", "/tableau-de-bord");
  });

  it("« Réessayer » rafraîchit le serveur puis efface la frontière", () => {
    const reset = vi.fn();
    render(<EchecDeRendu espace="public" error={erreur} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("hors connexion, il le dit au lieu d'accuser la plateforme", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<EchecDeRendu espace="dossier" error={erreur} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tu es hors ligne");
    expect(document.querySelector("img")?.getAttribute("src")).toContain("hors-ligne.svg");
  });

  it("au back-office, la trace est donnée", () => {
    render(<EchecDeRendu espace="backoffice" error={erreur} reset={vi.fn()} />);
    expect(screen.getByText("3141592653")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revenir à la file de veille" })).toHaveAttribute("href", "/veille");
  });
});

describe("ChargementDePage", () => {
  it("annonce le chargement sans déplacer le focus, squelettes cachés", () => {
    render(<ChargementDePage />);
    const statut = screen.getByRole("status");
    expect(statut).toHaveTextContent("Chargement de la page…");
    expect(statut).toHaveAttribute("id", "contenu");
    expect(document.activeElement).toBe(document.body);
    for (const bloc of document.querySelectorAll(".motion-safe\\:animate-pulse")) {
      expect(bloc.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});
