import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ATTEND_UNE_SUITE,
  DOSSIERS_MAX,
  LIBELLE_STATUT,
  peutOuvrirUnDossier,
  resumeDuJour,
  trierDossiers,
  type Dossier,
} from "@/domain/dossiers/dossier";
import {
  CHAMPS_PROFIL,
  champsRestants,
  corpsDuProfil,
  libelleAvancementProfil,
  profilComplet,
} from "@/domain/comptes/profil";
import { DOSSIERS } from "@/lib/contenu/dossiers";
import { ETATS_FIGES, ETATS_OUVERTS, type EtatStocke } from "@/domain/dossiers/etat";
import { versStatut } from "@/server/vue/dossier";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

const dossier = (statut: Dossier["statut"], obligatoires: number): Dossier => ({
  id: statut,
  destination: DOSSIERS[0]!.destination,
  statut,
  completude: {
    palier: "INCOMPLET",
    ready: false,
    missing: [],
    compteurs: {
      obligatoiresManquantes: obligatoires,
      exigencesNonTenues: 0,
      facultativesManquantes: 0,
      conformes: 0,
    },
  },
  prochaineAction: "Téléverser le passeport.",
});

describe("dossiers — WF-09", () => {
  it("met en tête ce qui demande une action", () => {
    const tries = trierDossiers([
      dossier("CLOTURE", 0),
      dossier("BROUILLON", 3),
      dossier("ACTIF", 1),
    ]);
    expect(tries.map((d) => d.statut)).toEqual(["ACTIF", "BROUILLON", "CLOTURE"]);
  });

  it("borne le nombre de dossiers en parallèle", () => {
    expect(DOSSIERS_MAX).toBe(3);
    expect(peutOuvrirUnDossier([dossier("ACTIF", 1), dossier("BROUILLON", 2)])).toBe(true);
    expect(
      peutOuvrirUnDossier([dossier("ACTIF", 1), dossier("BROUILLON", 2), dossier("PRET", 0)]),
    ).toBe(false);
  });

  /*
    RF-1, FON-01. Le tableau de bord comptait la liste entière : trois
    démarches finies retiraient « Ouvrir un nouveau dossier ». Et un
    dossier en pause, qui attend une décision, ne comptait pas côté
    serveur.
  */
  it("ne compte que les dossiers qui attendent une suite, pause comprise", () => {
    expect(
      peutOuvrirUnDossier([dossier("CLOTURE", 0), dossier("CLOTURE", 0), dossier("CLOTURE", 0)]),
    ).toBe(true);
    expect(
      peutOuvrirUnDossier([dossier("SOUMIS", 0), dossier("ACTIF", 1), dossier("PRET", 0)]),
    ).toBe(true);
    expect(
      peutOuvrirUnDossier([dossier("ACTIF", 1), dossier("BROUILLON", 2), dossier("EN_PAUSE", 0)]),
    ).toBe(false);
  });

  it("compte côté serveur exactement ce que l'écran compte", () => {
    const tous: EtatStocke[] = [
      "BROUILLON",
      "ACTIF",
      "PRET",
      "SOUMIS",
      "SUSPENDU",
      "ISSUE_DECLAREE",
      "ABANDONNE",
      "ARCHIVE",
    ];
    for (const etat of tous) {
      expect(ETATS_OUVERTS.includes(etat), etat).toBe(ATTEND_UNE_SUITE.includes(versStatut(etat)));
      // Un état est ouvert ou figé, jamais les deux, jamais aucun.
      expect(ETATS_OUVERTS.includes(etat), etat).toBe(!ETATS_FIGES.includes(etat));
    }
  });

  it("accorde le résumé du jour, et le tait quand il n'y a rien", () => {
    expect(resumeDuJour([])).toBe("");
    expect(resumeDuJour([dossier("ACTIF", 1)])).toBe(
      "1 dossier ouvert, 1 pièce obligatoire à réunir.",
    );
    expect(resumeDuJour([dossier("ACTIF", 1), dossier("BROUILLON", 2)])).toBe(
      "2 dossiers ouverts, 3 pièces obligatoires à réunir.",
    );
    // « à reprendre » décrirait une correction ; le compteur dénombre ce qui
    // manque, y compris ce qui n'a jamais été déposé.
    expect(resumeDuJour([dossier("PRET", 0)])).toBe(
      "1 dossier ouvert, rien ne bloque un dépôt.",
    );
  });

  it("nomme chaque statut sans jargon de machine", () => {
    for (const libelle of Object.values(LIBELLE_STATUT)) {
      expect(libelle).not.toMatch(/[A-Z]{3,}|_/);
    }
  });
});

describe("profil — C-02, arbitrage C-09 appliqué", () => {
  it("compte ce qui reste au lieu d'afficher une part", () => {
    const vide = {};
    expect(champsRestants(vide)).toBe(CHAMPS_PROFIL.length);
    expect(libelleAvancementProfil(vide)).toBe(
      `Il manque ${CHAMPS_PROFIL.length} champs. Chaque champ rempli affine ta checklist.`,
    );
  });

  it("accorde le décompte au singulier", () => {
    const presque = Object.fromEntries(
      CHAMPS_PROFIL.slice(0, -1).map((c) => [c.cle, "renseigné"]),
    );
    expect(champsRestants(presque)).toBe(1);
    expect(libelleAvancementProfil(presque)).toContain("Il manque 1 champ.");
  });

  it("se déclare complet quand tout est renseigné", () => {
    const complet = Object.fromEntries(CHAMPS_PROFIL.map((c) => [c.cle, "renseigné"]));
    expect(profilComplet(complet)).toBe(true);
    expect(libelleAvancementProfil(complet)).toContain("Profil complet");
  });

  it("ne compte pas un champ rempli d'espaces", () => {
    expect(champsRestants({ nom: "   " })).toBe(CHAMPS_PROFIL.length);
  });

  it("n'exprime jamais l'avancement en pourcentage", () => {
    for (const profil of [{}, { nom: "Aline" }]) {
      const texte = libelleAvancementProfil(profil);
      expect(texte).not.toMatch(/\d\s?%/);
      expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    }
  });

  /**
   * ── La garde qui manquait ─────────────────────────────────────────
   *
   * Les essais ci-dessus comparent le décompte à `CHAMPS_PROFIL.length` :
   * ils restent verts quelle que soit la liste, et c'est par là que quatre
   * champs sans colonne ont vécu. « Profil complet. Ta checklist tient
   * compte de toutes ces informations. » se disait d'un écran qui jetait
   * la date de naissance, la nationalité, les personnes à charge et le
   * refus antérieur avant d'envoyer.
   *
   * La garde porte donc sur la forme : **tout champ affiché a une
   * destination dans le corps envoyé, et toute destination est acceptée
   * par le contrat de la route.** Les deux sens, parce qu'un seul laisse
   * passer l'un des deux défauts.
   */
  it("tout champ affiché a une destination, et toute destination est acceptée", async () => {
    // Sens 1 — chaque champ pèse sur le corps. Un champ qui n'irait
    // nulle part laisserait le corps identique, rempli ou vide.
    const nu = corpsDuProfil({});
    for (const champ of CHAMPS_PROFIL) {
      const rempli = corpsDuProfil({ [champ.cle]: "Valeur Deux" });
      expect(rempli, `« ${champ.libelle} » n'a aucune destination`).not.toEqual(nu);
    }

    // Sens 2 — chaque clé composée est acceptée par le contrat de la
    // route. Le schéma y est lu tel qu'il est écrit : une clé renommée
    // d'un côté et pas de l'autre partirait sinon dans le vide.
    const contrat = await readFile("src/app/api/comptes/profil/route.ts", "utf8");
    const accepte = contrat.slice(contrat.indexOf("export const PUT"));
    for (const cle of Object.keys(corpsDuProfil({}))) {
      expect(accepte, `« ${cle} » n'est pas acceptée par la route`).toMatch(
        new RegExp(`^\\s*${cle}:`, "mu"),
      );
    }
  });

  /**
   * Vider un champ est un geste, et il doit partir : le serveur distingue
   * une clé absente — qui laisse la colonne intacte, et c'est ce qui
   * protège les réponses du simulateur — d'une valeur vide, qui l'efface.
   * Le corps porte donc toujours toutes ses clés.
   */
  it("le corps porte toutes ses clés, vides comprises", () => {
    const nu = corpsDuProfil({});
    expect(Object.keys(nu).sort()).toEqual(["diplome", "langues", "nom", "prenom"]);
    expect(nu).toEqual({ prenom: "", nom: "", diplome: "", langues: { en: "" } });
  });

  it("coupe le nom au premier blanc, et garde le reste entier", () => {
    expect(corpsDuProfil({ nom: "Awa Diallo Sow" })).toMatchObject({
      prenom: "Awa",
      nom: "Diallo Sow",
    });
    expect(corpsDuProfil({ nom: "  Awa  " })).toMatchObject({ prenom: "Awa", nom: "" });
  });
});

describe("arbitrage C-09 — aucune note de dossier nulle part", () => {
  it("les dossiers de démonstration n'exposent qu'un palier et des compteurs", () => {
    for (const d of DOSSIERS) {
      expect(d.completude).not.toHaveProperty("interne");
      expect(d.completude).toHaveProperty("palier");
      expect(d.completude).toHaveProperty("compteurs");
      expect(verifierTexte(d.prochaineAction, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    }
  });
});

describe("normaliserTelephone — le format que l'API exige (RG-02.3)", () => {
  it("retire espaces, points, tirets et parenthèses ; lit 00 comme +", async () => {
    const { normaliserTelephone } = await import("@/domain/comptes/profil");
    expect(normaliserTelephone("+229 01 97 00 00 42")).toBe("+2290197000042");
    expect(normaliserTelephone("00229.01.97.00.00.42")).toBe("+2290197000042");
    expect(normaliserTelephone("(+225) 07-00-00-00-00")).toBe("+2250700000000");
  });

  it("ne devine pas l'indicatif d'un numéro local", async () => {
    const { normaliserTelephone } = await import("@/domain/comptes/profil");
    expect(normaliserTelephone("01 97 00 00 42")).toBe("0197000042");
  });
});
