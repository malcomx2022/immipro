import { describe, expect, it } from "vitest";
import {
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
  libelleAvancementProfil,
  profilComplet,
} from "@/domain/comptes/profil";
import { DOSSIERS } from "@/lib/contenu/dossiers";
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
