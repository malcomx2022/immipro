import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  paiementPossible,
  obstacleAuPaiement,
  obstacleAuRecapitulatif,
} from "@/domain/paiement/commande";
import { PACKS } from "@/domain/payments/pricing";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

const lire = (f: string) => readFileSync(f, "utf8");

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
    const delai = echecPourMotif("delai_depasse", "5 000 F", "97 •• •• 42", "MOBILE_MONEY");
    const solde = echecPourMotif("solde_insuffisant", "5 000 F", "97 •• •• 42", "MOBILE_MONEY");
    expect(delai.titre).not.toBe(solde.titre);
    expect(delai.corps).toContain("dossier est conservé");
    expect(solde.corps).toContain("dossier est conservé");
  });

  it("propose trois vérifications au candidat, sans code technique", () => {
    for (const motif of ["delai_depasse", "solde_insuffisant"] as const) {
      const echec = echecPourMotif(motif, "5 000 F", "97 •• •• 42", "MOBILE_MONEY");
      expect(echec.verifications).toHaveLength(3);
      for (const v of echec.verifications) {
        expect(v).not.toMatch(/HTTP|\b[45]\d\d\b|fedapay|stripe|timeout/i);
      }
    }
  });

  it("ne promet rien et ne note rien", () => {
    for (const motif of ["delai_depasse", "solde_insuffisant"] as const) {
      const e = echecPourMotif(motif, "5 000 F", "97 •• •• 42", "MOBILE_MONEY");
      for (const texte of [e.titre, e.corps, ...e.verifications]) {
        expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
      }
    }
  });

  it("masque le numéro, sans jamais l'afficher en entier", () => {
    expect(masquerNumero("97000042")).toBe("97 •• •• 42");
    expect(masquerNumero("97 00 00 42")).toBe("97 •• •• 42");
    expect(masquerNumero("12")).toBe("•• •• •• ••");
    // Les deux chiffres de tête sont ceux de l'opérateur, pas ceux du pays :
    // trouvé à l'écran, sur un numéro enregistré au format international.
    expect(masquerNumero("+22997000042")).toBe("97 •• •• 42");
    expect(masquerNumero("+229 97 00 00 42")).toBe("97 •• •• 42");
    expect(masquerNumero("0022997000042")).toBe("97 •• •• 42");
    // Un numéro composé sans indicatif garde ses deux premiers chiffres.
    expect(masquerNumero("2297000042")).toBe("22 •• •• 42");
  });
});

/**
 * ── Un modèle que personne ne construisait ──────────────────────────
 *
 * Ce module portait un type `Commande` dont l'en-tête annonçait « deux
 * règles tenues par le type » : aucun pack présélectionné, aucune case
 * pré-cochée. Le type ne tenait rien — aucun fichier de `src/` ne le
 * construisait ni ne le lisait. Le tunnel est déjà modélisé par `Achat` et
 * `Tunnel`, que les écrans emploient pour de bon.
 *
 * Les deux phrases de refus, elles, existaient en double : une fois dans le
 * domaine, où ces tests les tenaient, une fois en dur dans l'écran, où le
 * candidat les lisait. La copie tenue était la morte.
 */
describe("commande — $-01 et $-02", () => {
  it("sans pack retenu, $-01 dit lequel choisir", () => {
    expect(obstacleAuRecapitulatif(null)).toBe("Choisis un pack pour continuer.");
    expect(obstacleAuRecapitulatif(PACKS[0] ?? null)).toBeNull();
  });

  it("sans conditions acceptées, $-02 ne paie pas et dit pourquoi", () => {
    expect(obstacleAuPaiement(false)).toBe(
      "Accepte les conditions d'utilisation pour payer.",
    );
    expect(paiementPossible(false)).toBe(false);
    expect(obstacleAuPaiement(true)).toBeNull();
    expect(paiementPossible(true)).toBe(true);
  });

  /**
   * L'ancienne version exigeait un pack pour payer. Une recharge et une
   * consultation n'en ont pas : la règle aurait refusé de les payer si un
   * écran l'avait employée — ce qu'aucun ne faisait.
   */
  it("le pack n'entre pas dans la condition de paiement", () => {
    expect(obstacleAuPaiement(true)).toBeNull();
  });

  /**
   * Les deux défauts vivent dans l'état des écrans, et c'est là qu'on les
   * lit — une fabrique que personne n'appelle ne tient rien.
   */
  it("les deux écrans partent au bon défaut", () => {
    const pack = lire("src/app/(app)/paiement/pack/ChoixDuPack.tsx");
    expect(pack).toMatch(/useState<string \| null>\(null\)/u);
    const recapitulatif = lire(
      "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
    );
    expect(recapitulatif).toMatch(/const \[conditions, setConditions\] = useState\(false\)/u);
  });

  /**
   * Une phrase, un endroit. Si un écran la réécrit, ce test tombe — c'est
   * exactement par là que la divergence était entrée.
   */
  it("aucun écran ne réécrit la phrase de refus", () => {
    for (const fichier of [
      "src/app/(app)/paiement/pack/ChoixDuPack.tsx",
      "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
    ]) {
      const source = lire(fichier);
      expect(source, fichier).not.toContain("Choisis un pack pour continuer.");
      expect(source, fichier).not.toContain("Accepte les conditions d'utilisation pour payer.");
      expect(source, fichier).toMatch(/from "@\/domain\/paiement\/commande"/u);
    }
  });
});
