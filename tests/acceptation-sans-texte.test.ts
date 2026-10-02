import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOCUMENTS_ACCEPTES,
  documentsALire,
  pageAbsente,
  reserveDeLAcceptation,
  versionAcceptee,
  type DocumentAccepte,
} from "@/domain/comptes/acceptation";
import { PAGES_PUBLIQUES } from "@/domain/exploitation/pages-publiques";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * Deux écrans faisaient accepter des documents qui n'existent pas.
 *
 * Le pied de page portait neuf adresses répondant 404, dont les trois pages
 * légales. P.A les a retirées, et son motif est le bon : « le lien, lui,
 * promettait déjà ce document sans l'avoir ». Q.A a ensuite consigné qui
 * doit les écrire.
 *
 * Les cases d'acceptation n'ont pas suivi. L'inscription fait cocher
 * « j'accepte les conditions d'utilisation et la politique de
 * confidentialité », le récapitulatif de paiement « j'accepte les conditions
 * d'utilisation » : deux pages que le registre déclare absentes et
 * bloquantes, vers lesquelles rien ne mène, et dont aucun des deux écrans ne
 * disait qu'elles n'existent pas.
 *
 * Nommer sans lier est plus discret qu'un lien mort, et pire : un 404 se
 * voit, une mention non cliquable se lit comme un texte qu'on pourrait
 * retrouver ailleurs.
 */
describe("l'acceptation ne nomme rien qu'on ne puisse lire", () => {
  /** Rien de publié : la situation d'avant la première validation. */
  const RIEN = {};
  /** Les conditions publiées en version 2, la politique de données non. */
  const CONDITIONS = { conditions: 2 };
  const TOUT = { conditions: 2, "donnees-personnelles": 1 };

  it("les deux documents nommés sont des pages bloquantes, servies sur validation", () => {
    for (const cle of Object.keys(DOCUMENTS_ACCEPTES) as DocumentAccepte[]) {
      const { adresse } = DOCUMENTS_ACCEPTES[cle];
      const page = PAGES_PUBLIQUES.find((p) => p.adresse === adresse);
      expect(page?.porte, adresse).toBe("BLOQUANTE");
      expect(page?.surValidation, adresse).toBeDefined();
      // Absent tant qu'aucune version n'est publiée, présent ensuite.
      expect(pageAbsente(cle, RIEN), adresse).toBe(true);
      expect(pageAbsente(cle, TOUT), adresse).toBe(false);
    }
  });

  it("la réserve nomme ce qui manque, dans l'ordre du libellé", () => {
    const deux = reserveDeLAcceptation(["conditions", "donnees"], RIEN);
    expect(deux).toContain("Les conditions d'utilisation");
    expect(deux).toContain("la politique de confidentialité");
    expect(deux!.indexOf("conditions")).toBeLessThan(deux!.indexOf("politique"));
    expect(deux).toContain("ne sont pas encore publiées");
  });

  /**
   * L'accord suit le **nom**, pas le décompte.
   *
   * « Les conditions d'utilisation » est un titre au pluriel : accorder sur
   * le nombre de documents donnait « Les conditions d'utilisation n'est pas
   * encore publiée ». La première version de ce test l'affirmait, et
   * validait donc la faute — c'est la sonde qui l'a montrée, en imprimant la
   * phrase.
   */
  it("l'accord suit le nom du document, pas le nombre de documents", () => {
    expect(reserveDeLAcceptation(["conditions"], RIEN)).toContain("ne sont pas encore publiées");
    const singulier = reserveDeLAcceptation(["donnees"], RIEN)!;
    expect(singulier).toContain("n'est pas encore publiée");
    expect(singulier).not.toContain("ne sont pas");
    expect(reserveDeLAcceptation(["donnees", "conditions"], RIEN)).toContain("ne sont pas encore publiées");
  });

  /**
   * La phrase se déduit de ce qui est publié — en base depuis S.101 — et
   * disparaît sans redéploiement quand le texte est validé.
   */
  it("elle disparaît quand la page est publiée", () => {
    expect(reserveDeLAcceptation(["conditions"], CONDITIONS)).toBeNull();
    // L'autre reste : une page publiée n'en publie pas une seconde.
    expect(reserveDeLAcceptation(["conditions", "donnees"], CONDITIONS)).toContain(
      "La politique de confidentialité",
    );
    expect(reserveDeLAcceptation(["conditions", "donnees"], TOUT)).toBeNull();
    expect(reserveDeLAcceptation([], RIEN)).toBeNull();
  });

  it("elle ne promet rien et n'invente aucun contenu", () => {
    for (const nommes of [["conditions"], ["conditions", "donnees"]] as DocumentAccepte[][]) {
      const phrase = reserveDeLAcceptation(nommes, RIEN)!;
      expect(phrase).not.toMatch(/bientôt|prochainement|\d{4}|dès que/u);
      expect(phrase).toContain("aucun texte à lire");
    }
  });

  /** Un document publié devient un lien ; un document absent n'en devient jamais un. */
  it("seul un texte publié se lit, et se lie", () => {
    expect(documentsALire(["conditions", "donnees"], RIEN)).toEqual([]);
    expect(documentsALire(["conditions", "donnees"], CONDITIONS).map((d) => d.adresse)).toEqual(["/conditions"]);
  });

  /**
   * L'acceptation enregistre la version de chaque texte réellement publié,
   * et rien quand aucun ne l'est : on n'accepte pas un texte qui n'existe pas.
   */
  it("la version acceptée nomme chaque texte publié, et rien d'autre", () => {
    expect(versionAcceptee(["conditions", "donnees"], RIEN)).toBeNull();
    expect(versionAcceptee(["conditions", "donnees"], CONDITIONS)).toBe("conditions v2");
    expect(versionAcceptee(["conditions", "donnees"], TOUT)).toBe("conditions v2 · donnees-personnelles v1");
  });

  /**
   * Les deux écrans la lisent, et la lisent **avant** la case.
   *
   * N.C exige que rien ne s'intercale entre le consentement et le bouton
   * qu'il déverrouille ; poser la phrase après la case l'aurait rompu, et
   * on apprend de toute façon mieux l'absence avant de cocher qu'après.
   */
  it.each([
    "src/app/(auth)/inscription/Inscription.tsx",
    "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
  ])("%s affiche la réserve et les liens avant la case", (fichier) => {
    const source = lire(fichier);
    expect(source).toMatch(/const reserve = reserveDeLAcceptation\(/u);
    const iReserve = source.indexOf("{reserve ?");
    const iLiens = source.indexOf("À lire avant de cocher");
    const iCase = source.indexOf("<Checkbox");
    expect(iReserve).toBeGreaterThan(0);
    expect(iReserve).toBeLessThan(iCase);
    expect(iLiens).toBeGreaterThan(0);
    expect(iLiens).toBeLessThan(iCase);
  });

  /** Les deux routes qui font accepter enregistrent la version acceptée. */
  it.each([
    ["src/app/api/comptes/route.ts", '["conditions", "donnees"]'],
    ["src/app/api/paiements/route.ts", '["conditions"]'],
  ])("%s enregistre l'acceptation avec sa version", (fichier, nommes) => {
    const source = lire(fichier);
    expect(source).toContain(`versionAcceptee(${nommes}, await pagesPubliees())`);
    expect(source).toMatch(/kind: "CGU", granted: true, version/u);
  });

  /**
   * Aucun écran ne recompose la phrase. Deux formulations divergeraient, et
   * la seconde survivrait à la publication de la page qu'elle nomme.
   */
  it("aucun écran n'écrit l'absence à la main", () => {
    for (const fichier of [
      "src/app/(auth)/inscription/Inscription.tsx",
      "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
    ]) {
      expect(lire(fichier)).not.toContain("pas encore publiée");
      expect(lire(fichier)).not.toContain("pas encore publiées");
    }
  });
});
