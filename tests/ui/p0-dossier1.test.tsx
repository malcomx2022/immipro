import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TableauDeBord } from "@/app/(app)/(dossier)/tableau-de-bord/TableauDeBord";
import { Comparateur } from "@/app/(app)/(dossier)/comparateur/Comparateur";
import { Profil } from "@/app/(app)/(dossier)/profil/Profil";
import { FicheDetaillee } from "@/app/(app)/(dossier)/fiches/[slug]/FicheDetaillee";
import {
  OuvertureDossier,
  datesProposees,
} from "@/app/(app)/(dossier)/dossiers/nouveau/OuvertureDossier";
import { PAYS_BAS } from "@/lib/contenu/destinations";
import { DOSSIERS } from "@/lib/contenu/dossiers";
import { LIBELLE_PALIER } from "@/domain/completeness/score";

const parametres = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => parametres,
  notFound: () => {
    throw new Error("notFound");
  },
}));

beforeEach(() => {
  for (const cle of [...parametres.keys()]) parametres.delete(cle);
});

describe("C-01 — Tableau de bord", () => {
  const tableau = (aArbitrer = 0) => (
    <TableauDeBord dossiers={DOSSIERS} prenom="Aline" aArbitrer={aArbitrer} />
  );

  it("affiche un palier nommé par dossier, jamais une note", () => {
    const { container } = render(tableau());
    for (const d of DOSSIERS) {
      expect(screen.getAllByText(LIBELLE_PALIER[d.completude.palier]).length).toBeGreaterThan(0);
    }
    const texte = container.textContent ?? "";
    expect(texte).not.toMatch(/\d\s?\/\s?100/);
    expect(texte).not.toMatch(/\d\s?%/);
    expect(texte).not.toMatch(/\bscore\b/i);
  });

  it("donne une seule prochaine action par dossier", () => {
    render(tableau());
    for (const d of DOSSIERS) {
      expect(screen.getByText(`Prochaine action : ${d.prochaineAction}`)).toBeDefined();
    }
  });

  it("résume la journée en comptant ce qu'il reste à reprendre", () => {
    render(tableau());
    expect(screen.getByText(/dossiers ouverts, .* à réunir/)).toBeDefined();
  });

  it("n'affiche le bandeau d'arbitrage que s'il y a une divergence à trancher", () => {
    // Un bandeau qui ne s'éteint jamais cesse d'être lu, et le jour où il
    // annonce un changement critique, personne ne le voit.
    const sans = render(tableau(0));
    expect(sans.container.textContent).not.toContain("attend ta décision");
    sans.unmount();

    const avec = render(tableau(2));
    expect(avec.container.textContent).toContain(
      "2 changements de règle attendent ta décision",
    );
    expect(avec.container.textContent).toContain("rien n'est modifié sans ton accord");
  });

  it("salue par le prénom quand il est connu, et reste neutre sinon", () => {
    const avec = render(tableau());
    expect(screen.getByRole("heading", { name: "Bonjour Aline" })).toBeDefined();
    avec.unmount();

    render(<TableauDeBord dossiers={DOSSIERS} prenom={null} aArbitrer={0} />);
    expect(screen.getByRole("heading", { name: "Mes dossiers" })).toBeDefined();
  });
});

describe("C-02 — Profil", () => {
  // Le profil vient de la page ; l'écran l'édite. Trois champs renseignés,
  // comme un compte qui a repris les réponses du simulateur.
  const initial = {
    nom: "Aline Dossou",
    naissance: "12/04/2004",
    nationalite: "Béninoise",
    diplome: "Licence en gestion",
  };

  it("compte les champs restants au lieu d'afficher une part", () => {
    const { container } = render(<Profil initial={initial} />);
    expect(screen.getByText(/Il manque \d champ/)).toBeDefined();
    expect(container.textContent).not.toMatch(/\d\s?%/);
  });

  it("met le décompte à jour à la frappe, dans une région vivante", () => {
    render(<Profil initial={initial} />);
    const avant = screen.getByText(/Il manque 3 champs/);
    expect(avant.closest("[aria-live='polite']")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Niveau d'anglais attesté"), {
      target: { value: "B2" },
    });
    expect(screen.getByText(/Il manque 2 champs/)).toBeDefined();
  });

  it("dit que rien n'est transmis à une administration", () => {
    const { container } = render(<Profil initial={initial} />);
    expect(container.textContent).toContain(
      "jamais transmises à une administration par ImmiPro",
    );
  });
});

describe("C-03 — Comparateur", () => {
  const comparateur = () => (
    <Comparateur
      fiches={[PAYS_BAS]}
      valeurs={{
        "pays-bas": {
          cout: "6 900 000 F",
          ressources: "1 130,77 EUR / mois",
          travail: "16 h par semaine",
          apres: "12 mois",
          delai: "60 à 90 jours",
          langue: "en, nl — B2",
          frais: "Aucun",
        },
      }}
      mention={{ source: "ind.nl", verifieeLe: "2026-09-11" }}
      lectureAttentive={{
        titre: "Le travail étudiant se lit de près",
        texte:
          "Pays-Bas : c'est l'employeur qui demande le permis de travail à ton nom, et beaucoup de petits employeurs refusent cette démarche.",
      }}
    />
  );

  it("rend un vrai tableau, avec ses en-têtes de ligne et de colonne", () => {
    render(comparateur());
    const tableau = screen.getByRole("table");
    expect(tableau).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /Pays-Bas/ })).toBeDefined();
    expect(screen.getByRole("rowheader", { name: "Coût 1re année" })).toBeDefined();
  });

  it("ne classe pas les destinations et le dit", () => {
    const { container } = render(comparateur());
    expect(container.textContent).toContain("il ne prédit aucune décision");
  });

  it("explique le critère qui se lit de travers, depuis le tableau affiché", () => {
    render(comparateur());
    expect(screen.getByText(/c'est l'employeur qui demande le permis/)).toBeDefined();
    // L'encadré du prototype citait l'Allemagne et le Canada, absents du
    // tableau : un encadré qui parle de colonnes absentes fait douter de
    // celles qui sont là.
    const texte = screen.getByText(/c'est l'employeur qui demande le permis/).textContent ?? "";
    expect(texte).not.toContain("Allemagne");
    expect(texte).not.toContain("Canada");
  });

  it("distingue deux procédures du même pays", () => {
    render(comparateur());
    // Sans l'intitulé, deux colonnes « Pays-Bas » portent le même en-tête.
    expect(screen.getByRole("columnheader", { name: /Séjour études/ })).toBeDefined();
  });
});

describe("C-04 — Fiche détaillée", () => {
  it("expose ses sections en onglets, un seul arrêt de tabulation", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    const onglets = screen.getAllByRole("tab");
    expect(onglets).toHaveLength(4);
    expect(onglets.filter((o) => o.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("change d'onglet aux flèches", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Coûts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("relie le panneau visible à son onglet", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    const panneau = screen.getByRole("tabpanel");
    const onglet = screen.getByRole("tab", { name: "Conditions" });
    expect(panneau.getAttribute("aria-labelledby")).toBe(onglet.id);
  });

  it("donne les réserves une section à elles, pas un pied de page", () => {
    render(<FicheDetaillee fiche={PAYS_BAS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Réserves" }));
    expect(screen.getByText(/réévalué chaque année en janvier/)).toBeDefined();
  });
});

describe("C-05 — Ouverture de dossier", () => {
  // La destination est résolue par la page serveur et passée en propriété :
  // l'écran de saisie ne connaît plus le référentiel.
  const ouverture = () => (
    <OuvertureDossier
      fiche={PAYS_BAS}
      visaRuleId="00000000-0000-0000-0000-000000000001"
      apercu={["Passeport", "Lettre d'admission"]}
    />
  );

  it("n'ouvre rien tant que la date de dépôt n'est pas choisie", () => {
    render(ouverture());
    const creer = screen.getByRole("button", { name: "Créer mon dossier" });
    expect(creer).toBeDisabled();
    expect(creer).toHaveAccessibleDescription(
      "Choisis une date de dépôt visée, même approximative.",
    );
  });

  it("accepte « Je ne sais pas encore » comme réponse", () => {
    render(ouverture());
    fireEvent.click(screen.getByRole("radio", { name: /Je ne sais pas encore/ }));
    expect(screen.getByRole("button", { name: "Créer mon dossier" })).toBeEnabled();
  });

  it("affiche la destination que la page lui a donnée", () => {
    render(ouverture());
    expect(
      screen.getByRole("heading", { name: /Ouvre ton dossier Pays-Bas/ }),
    ).toBeDefined();
  });

  it("propose des dates de dépôt toujours à venir, jamais figées", () => {
    // Le défaut corrigé est celui des créneaux de consultant (écart H.2) :
    // des dates écrites en dur finissent toutes dans le passé.
    const aujourdhui = new Date("2029-06-01T00:00:00Z");
    for (const date of datesProposees(aujourdhui)) {
      if (!date.iso) continue;
      expect(new Date(date.iso).getTime()).toBeGreaterThan(aujourdhui.getTime());
    }
  });

  it("montre l'aperçu que le référentiel a fourni, pas une liste écrite à la main", () => {
    const { container } = render(ouverture());
    expect(container.textContent).toContain("Lettre d'admission");
  });

  it("dit qu'ouvrir un dossier n'engage aucune démarche administrative", () => {
    const { container } = render(ouverture());
    expect(container.textContent).toContain(
      "ne constitue aucune démarche auprès de l'administration",
    );
  });

  it("sans destination publiée, il le dit au lieu de proposer un formulaire", () => {
    render(<OuvertureDossier fiche={null} visaRuleId="" apercu={[]} />);
    expect(
      screen.getByRole("heading", { name: "Aucune destination n'est ouverte en ce moment" }),
    ).toBeDefined();
  });
});
