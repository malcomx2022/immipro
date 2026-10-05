import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TableauDeBord } from "@/app/(app)/(dossier)/tableau-de-bord/TableauDeBord";
import { Comparateur } from "@/app/(app)/(dossier)/comparateur/Comparateur";
import { Profil } from "@/app/(app)/(dossier)/profil/Profil";
import { FicheDetaillee } from "@/app/(app)/(dossier)/fiches/[slug]/FicheDetaillee";
import { LISTE_VIDE } from "@/domain/destinations/fiche";
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
  /*
    Le profil vient de la page ; l'écran l'édite. L'écran n'affiche que ce
    que le produit sait garder : la date de naissance et la nationalité
    étaient rendues, comptées, puis jetées avant l'envoi faute de colonne,
    et cette fixture les portait — l'essai vérifiait donc un décompte de
    champs dont deux ne se seraient jamais enregistrés.
  */
  const initial = { nom: "Aline Dossou", diplome: "Licence en gestion" };

  it("compte les champs restants au lieu d'afficher une part", () => {
    const { container } = render(<Profil initial={initial} />);
    expect(screen.getByText(/Il manque \d champ/)).toBeDefined();
    expect(container.textContent).not.toMatch(/\d\s?%/);
  });

  it("met le décompte à jour à la frappe, dans une région vivante", () => {
    render(<Profil initial={initial} />);
    const avant = screen.getByText(/Il manque 1 champ/);
    expect(avant.closest("[aria-live='polite']")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Niveau d'anglais attesté"), {
      target: { value: "B2" },
    });
    expect(
      screen.getByText("Profil complet. Ta checklist tient compte de toutes ces informations."),
    ).toBeDefined();
  });

  /**
   * Et l'écran n'affiche rien qu'il ne sache enregistrer : c'est la même
   * garde que côté domaine, prise depuis le rendu, là où le candidat voit
   * les champs.
   */
  it("n'affiche aucun champ qu'il jetterait à l'envoi", () => {
    const { container } = render(<Profil initial={initial} />);
    for (const orphelin of [
      "Date de naissance",
      "Nationalité",
      "Personnes à charge",
      "Refus de visa antérieur",
    ]) {
      expect(container.textContent, `« ${orphelin} » n'a nulle part où aller`).not.toContain(
        orphelin,
      );
    }
  });

  /**
   * Le numéro Mobile Money — 03/10/2026. « Renseigner mon numéro », sur le
   * récapitulatif de paiement, menait ici, et rien ne permettait de le
   * saisir. Il est hors du décompte : il n'affine pas la checklist.
   */
  it("propose le numéro Mobile Money, l'envoie au format attendu, sans le compter", async () => {
    const corps: unknown[] = [];
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      corps.push(JSON.parse(String(options?.body)));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ enregistre: true }) } as Response);
    });
    const { container } = render(<Profil initial={initial} telephone="" />);
    const champ = screen.getByLabelText("Numéro Mobile Money");
    expect(champ.id).toBe("telephone");
    expect(screen.getByText(/Il manque 1 champ/)).toBeDefined();

    fireEvent.change(champ, { target: { value: "+229 01 97 00 00 42" } });
    expect(screen.getByText(/Il manque 1 champ/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(corps).toHaveLength(1));
    expect(corps[0]).toMatchObject({ telephone: "+2290197000042" });
    expect(container.textContent).toContain("+229 pour le Bénin");
  });

  it("n'envoie pas de numéro quand le champ est vide", async () => {
    const corps: unknown[] = [];
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      corps.push(JSON.parse(String(options?.body)));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ enregistre: true }) } as Response);
    });
    render(<Profil initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(corps).toHaveLength(1));
    expect(corps[0]).not.toHaveProperty("telephone");
  });

  it("dit que rien n'est transmis à une administration des visas, et à quoi sert la facturation", () => {
    const { container } = render(<Profil initial={initial} />);
    expect(container.textContent).toContain(
      "ImmiPro ne le transmet jamais à une administration chargée des visas",
    );
    expect(container.textContent).toContain("figurent sur tes factures, conservées dix ans");
  });

  it("envoie toujours le nom et l'adresse de facturation, vides compris (M.C)", async () => {
    const corps: Record<string, unknown>[] = [];
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      corps.push(JSON.parse(String(options?.body)));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ enregistre: true }) } as Response);
    });
    render(<Profil initial={initial} facturation={{ nom: "Awa Koffi", adresse: "" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(corps).toHaveLength(1));
    expect(corps[0]).toMatchObject({ facturationNom: "Awa Koffi", facturationAdresse: "" });
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

  /**
   * ── Trois onglets se taisaient ──────────────────────────────────────
   *
   * Sondé avant correction, sur une fiche dont les listes sont vides :
   *
   *     Conditions   → ""
   *     Coûts        → ""
   *     Réserves     → ""
   *
   * Un panneau blanc sous l'onglet qu'on vient de choisir. Le cas n'est pas
   * théorique : `reserves` porte `.default([])` dans le schéma, et ni
   * `conditions` ni `pieces_requises` n'ont de minimum.
   */
  describe("quand une section n'a rien à montrer", () => {
    const depouillee = {
      ...PAYS_BAS,
      conditions: [],
      reperes: [],
      reserves: [],
      piecesAReunir: 0,
    };

    it.each([
      ["Conditions", LISTE_VIDE.conditions],
      ["Coûts", LISTE_VIDE.couts],
      ["Réserves", LISTE_VIDE.reserves],
    ])("l'onglet %s dit ce qu'il en est au lieu de se taire", (onglet, phrase) => {
      render(<FicheDetaillee fiche={depouillee} />);
      fireEvent.click(screen.getByRole("tab", { name: onglet }));

      const panneau = screen.getByRole("tabpanel");
      expect(panneau.textContent).not.toBe("");
      expect(panneau.textContent).toContain(phrase);
    });

    /*
      « Aucune réserve » se lirait comme « aucun risque » — une promesse sur
      une décision qui ne nous appartient pas. La phrase dit que le
      référentiel n'en consigne pas, et le test tient cette nuance-là.
    */
    it("ne transforme pas une absence de réserve en absence de risque", () => {
      render(<FicheDetaillee fiche={depouillee} />);
      fireEvent.click(screen.getByRole("tab", { name: "Réserves" }));

      expect(screen.getByRole("tabpanel").textContent).toContain(
        "pas qu'il n'y a rien à surveiller",
      );
    });

    /* « 0 pièce à réunir … le détail, pièce par pièce » promettait un
       détail sur une liste vide. */
    it("ne promet pas un détail pièce par pièce sur une checklist vide", () => {
      render(<FicheDetaillee fiche={depouillee} />);
      fireEvent.click(screen.getByRole("tab", { name: "Pièces" }));

      const panneau = screen.getByRole("tabpanel");
      expect(panneau.textContent).toContain("Aucune pièce n'est consignée");
      expect(panneau.textContent).not.toContain("pièce par pièce");
      expect(panneau.textContent).not.toContain("0 pièce");
    });
  });
});

describe("C-05 — Ouverture de dossier", () => {
  // La destination est résolue par la page serveur et passée en propriété :
  // l'écran de saisie ne connaît plus le référentiel.
  const ouverture = () => (
    <OuvertureDossier
      fiche={PAYS_BAS}
      apercu={["Passeport", "Lettre d'admission"]}
    />
  );

  it("n'ouvre rien tant que la date de dépôt n'est pas choisie", () => {
    render(ouverture());
    const creer = screen.getByRole("button", { name: "Créer mon dossier" });
    expect(creer).toBeDisabled();
    expect(creer).toHaveAccessibleDescription(
      "Choisis une date de départ visée, même approximative.",
    );
  });

  it("accepte « Je ne sais pas encore » comme réponse", () => {
    render(ouverture());
    fireEvent.click(screen.getByRole("radio", { name: /Je ne sais pas encore/ }));
    expect(screen.getByRole("button", { name: "Créer mon dossier" })).toBeEnabled();
  });

  it("envoie la destination de la fiche, pas un identifiant technique (02/10/2026)", async () => {
    const corps: unknown[] = [];
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      corps.push(JSON.parse(String(options?.body)));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ id: "dossier-1", statut: "BROUILLON" }),
      } as Response);
    });
    render(ouverture());
    fireEvent.click(screen.getByRole("radio", { name: /Je ne sais pas encore/ }));
    fireEvent.click(screen.getByRole("button", { name: "Créer mon dossier" }));
    await waitFor(() => expect(corps).toHaveLength(1));
    expect(corps[0]).toEqual({ destination: PAYS_BAS.slug });
  });

  it("affiche la destination que la page lui a donnée", () => {
    render(ouverture());
    expect(
      screen.getByRole("heading", { name: /Ouvre ton dossier Pays-Bas/ }),
    ).toBeDefined();
  });

  /**
   * La question demandait le dépôt, le champ stockait la rentrée : un
   * candidat qui répondait « je dépose le 15 janvier » se voyait fixer un
   * dépôt au 17 octobre, tout son échéancier avançant de quatre-vingt-dix
   * jours. La question porte sur ce que le champ contient.
   */
  it("demande la date de départ, pas la date de dépôt", () => {
    const { container } = render(ouverture());
    expect(screen.getByText("Quand veux-tu être sur place ?")).toBeDefined();
    expect(container.textContent).not.toContain("Quand veux-tu déposer");
    expect(container.textContent).toContain("La date de dépôt s'en déduit");
    // Et les options proposées sont bien des rentrées.
    const dates = datesProposees(new Date("2026-09-21T00:00:00Z"));
    for (const date of dates) {
      if (!date.iso) continue;
      expect(["09", "02"]).toContain(date.iso.slice(5, 7));
    }
    /*
      Les rentrées tombent le premier du mois, et le français y met
      l'ordinal. L'écran formatait les dates lui-même : tant que les
      options étaient le 15 et le 2, la règle ne se voyait pas.
    */
    expect(dates.map((d) => d.libelle)).toContain("1er septembre 2027");
    expect(dates.map((d) => d.libelle)).not.toContain("1 septembre 2027");
  });

  it("propose des dates de départ toujours à venir, jamais figées", () => {
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
    render(<OuvertureDossier fiche={null} apercu={[]} />);
    expect(
      screen.getByRole("heading", { name: "Aucune destination n'est ouverte en ce moment" }),
    ).toBeDefined();
  });
});
