import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOCUMENTS_ACCEPTES,
  pageAbsente,
  reserveDeLAcceptation,
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
  const PUBLIEE = PAGES_PUBLIQUES.filter((p) => p.adresse !== "/conditions");

  it("les deux documents nommés sont bien ceux que le registre déclare absents", () => {
    for (const cle of Object.keys(DOCUMENTS_ACCEPTES) as DocumentAccepte[]) {
      const { adresse } = DOCUMENTS_ACCEPTES[cle];
      expect(pageAbsente(adresse), adresse).toBe(true);
      // Et bloquantes : ce ne sont pas des pages de confort.
      expect(
        PAGES_PUBLIQUES.find((p) => p.adresse === adresse)?.porte,
        adresse,
      ).toBe("BLOQUANTE");
    }
  });

  it("la réserve nomme ce qui manque, dans l'ordre du libellé", () => {
    const deux = reserveDeLAcceptation(["conditions", "donnees"]);
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
    // Un seul document, au titre pluriel.
    expect(reserveDeLAcceptation(["conditions"])).toContain("ne sont pas encore publiées");
    // Un seul document, au titre singulier.
    const singulier = reserveDeLAcceptation(["donnees"])!;
    expect(singulier).toContain("n'est pas encore publiée");
    expect(singulier).not.toContain("ne sont pas");
    // Deux documents : pluriel, quel que soit leur titre.
    expect(reserveDeLAcceptation(["donnees", "conditions"])).toContain(
      "ne sont pas encore publiées",
    );
  });

  /**
   * La phrase se déduit du registre : le jour où la page est publiée, elle
   * disparaît sans qu'on relise les écrans. C'est la même mécanique que les
   * composantes absentes du classement.
   */
  it("elle disparaît quand la page est publiée", () => {
    expect(reserveDeLAcceptation(["conditions"], PUBLIEE)).toBeNull();
    // L'autre reste : une page publiée n'en publie pas une seconde.
    expect(reserveDeLAcceptation(["conditions", "donnees"], PUBLIEE)).toContain(
      "La politique de confidentialité",
    );
    expect(reserveDeLAcceptation([], PAGES_PUBLIQUES)).toBeNull();
  });

  it("elle ne promet rien et n'invente aucun contenu", () => {
    for (const nommes of [["conditions"], ["conditions", "donnees"]] as DocumentAccepte[][]) {
      const phrase = reserveDeLAcceptation(nommes)!;
      // Aucune date, aucun engagement de publication : le registre dit qui
      // doit écrire ces pages, pas quand.
      expect(phrase).not.toMatch(/bientôt|prochainement|\d{4}|dès que/u);
      expect(phrase).toContain("aucun texte à lire");
    }
  });

  /**
   * Les deux écrans la lisent, et la lisent **avant** la case.
   *
   * N.C exige que rien ne s'intercale entre le consentement et le bouton
   * qu'il déverrouille ; poser la phrase après la case l'aurait rompu, et
   * on apprend de toute façon mieux l'absence avant de cocher qu'après.
   */
  it.each([
    ["src/app/(auth)/inscription/Inscription.tsx", "RESERVE_INSCRIPTION"],
    ["src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx", "RESERVE_PAIEMENT"],
  ])("%s affiche la réserve avant la case", (fichier, constante) => {
    const source = lire(fichier);
    expect(source).toMatch(
      new RegExp(`const ${constante} = reserveDeLAcceptation\\(`, "u"),
    );
    const iReserve = source.indexOf(`{${constante} ?`);
    const iCase = source.indexOf("<Checkbox");
    expect(iReserve).toBeGreaterThan(0);
    expect(iReserve).toBeLessThan(iCase);
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
