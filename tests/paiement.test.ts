import { describe, expect, it } from "vitest";
import {
  attenteExpiree,
  DELAI_REESSAI_SECONDES,
  DUREE_ATTENTE_SECONDES,
  etatDeLEtape,
  ETAPES_ATTENTE,
  PERIODE_RELEVE_SECONDES,
  rebours,
  reessaiPropose,
  secondesDepuisReleve,
  secondesRestantes,
} from "@/domain/paiement/attente";
import { echecPourMotif, masquerNumero } from "@/domain/paiement/echec";
import {
  commandeInitiale,
  commandePayable,
  obstacleAuPaiement,
  obstacleAuRecapitulatif,
} from "@/domain/paiement/commande";
import { PACKS } from "@/domain/payments/pricing";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

describe("attente Mobile Money — $-03", () => {
  it("laisse cinq minutes, relève toutes les trois secondes", () => {
    expect(DUREE_ATTENTE_SECONDES).toBe(300);
    expect(PERIODE_RELEVE_SECONDES).toBe(3);
    expect(secondesRestantes(0)).toBe(300);
    expect(secondesRestantes(299)).toBe(1);
  });

  it("met en forme le rebours sans jamais passer sous zéro", () => {
    expect(rebours(0)).toBe("5:00");
    expect(rebours(48)).toBe("4:12");
    expect(rebours(300)).toBe("0:00");
    expect(rebours(9999)).toBe("0:00");
    expect(attenteExpiree(300)).toBe(true);
    expect(attenteExpiree(299)).toBe(false);
  });

  it("ne propose de réessayer qu'après quatre-vingt-dix secondes", () => {
    // Plus tôt, relancer pousse à payer deux fois.
    expect(reessaiPropose(0)).toBe(false);
    expect(reessaiPropose(DELAI_REESSAI_SECONDES - 1)).toBe(false);
    expect(reessaiPropose(DELAI_REESSAI_SECONDES)).toBe(true);
  });

  it("montre un fil de trois étapes dont une seule est en cours", () => {
    expect(ETAPES_ATTENTE).toHaveLength(3);
    const etats = ETAPES_ATTENTE.map(etatDeLEtape);
    expect(etats.filter((e) => e === "en_cours")).toHaveLength(1);
    expect(etats).toEqual(["faite", "en_cours", "a_venir"]);
  });

  it("borne la relève à sa période", () => {
    expect(secondesDepuisReleve(0)).toBe(0);
    expect(secondesDepuisReleve(4)).toBe(1);
    expect(secondesDepuisReleve(-5)).toBe(0);
  });
});

describe("échec de paiement — $-05", () => {
  it("distingue le délai dépassé du refus, et dit ce qui est conservé", () => {
    const delai = echecPourMotif("delai_depasse", "5 000 F", "97 •• •• 42");
    const solde = echecPourMotif("solde_insuffisant", "5 000 F", "97 •• •• 42");
    expect(delai.titre).not.toBe(solde.titre);
    expect(delai.corps).toContain("dossier est conservé");
    expect(solde.corps).toContain("dossier est conservé");
  });

  it("propose trois vérifications au candidat, sans code technique", () => {
    for (const motif of ["delai_depasse", "solde_insuffisant"] as const) {
      const echec = echecPourMotif(motif, "5 000 F", "97 •• •• 42");
      expect(echec.verifications).toHaveLength(3);
      for (const v of echec.verifications) {
        expect(v).not.toMatch(/HTTP|\b[45]\d\d\b|fedapay|stripe|timeout/i);
      }
    }
  });

  it("ne promet rien et ne note rien", () => {
    for (const motif of ["delai_depasse", "solde_insuffisant"] as const) {
      const e = echecPourMotif(motif, "5 000 F", "97 •• •• 42");
      for (const texte of [e.titre, e.corps, ...e.verifications]) {
        expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
      }
    }
  });

  it("masque le numéro, sans jamais l'afficher en entier", () => {
    expect(masquerNumero("97000042")).toBe("97 •• •• 42");
    expect(masquerNumero("97 00 00 42")).toBe("97 •• •• 42");
    expect(masquerNumero("12")).toBe("•• •• •• ••");
  });
});

describe("commande — $-01 et $-02", () => {
  it("ne présélectionne aucun pack", () => {
    const commande = commandeInitiale("XOF", "97000042");
    expect(commande.pack).toBeNull();
    expect(obstacleAuRecapitulatif(commande)).toBe("Choisissez un pack pour continuer.");
  });

  it("ne pré-coche pas les conditions", () => {
    expect(commandeInitiale("XOF", "97000042").conditionsAcceptees).toBe(false);
  });

  it("ne rend la commande payable qu'avec un pack et les conditions acceptées", () => {
    const base = commandeInitiale("XOF", "97000042");
    const pack = PACKS[0];
    expect(commandePayable(base)).toBe(false);

    const avecPack = { ...base, pack: pack ?? null };
    expect(obstacleAuPaiement(avecPack)).toBe(
      "Acceptez les conditions d'utilisation pour payer.",
    );

    const prete = { ...avecPack, conditionsAcceptees: true };
    expect(obstacleAuPaiement(prete)).toBeNull();
    expect(commandePayable(prete)).toBe(true);
  });
});
