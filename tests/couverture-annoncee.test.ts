import { describe, expect, it } from "vitest";
import { mentionDeLaCouverture } from "@/domain/paiement/contrepartie";
import { PACKS } from "@/domain/payments/pricing";
import {
  INTERDITS_PARTOUT,
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * Ce qu'un pack a payé et que le candidat n'a pas encore pris — $-04.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * Sonde exécutée sur PostgreSQL à l'instant où l'écran s'affiche, après
 * un Pro à 45 000 XOF :
 *
 *     l'écran annonce : « Ton dossier est ouvert. »
 *     destinations    : 3 payées, 1 servie
 *     analyses        : 90 payées, 30 ouvertes
 *
 * Les deux tiers de l'achat lui étaient réservés et n'étaient nommés
 * nulle part — et la couverture ne s'applique qu'à l'ouverture d'un
 * dossier, geste que rien ne lui demandait de faire.
 */
describe("la couverture restante d'un pack", () => {
  it("nomme le reste et le geste qui le débloque", () => {
    const phrase = mentionDeLaCouverture(3, 1)!;

    expect(phrase).toContain("3 destinations");
    expect(phrase).toContain("2 restent à ouvrir");
    expect(phrase).toContain("ouvres un dossier");
    expect(phrase).toContain("sans repayer");
  });

  it("accorde au singulier sans phrase à trous", () => {
    const phrase = mentionDeLaCouverture(3, 2)!;

    expect(phrase).toContain("1 reste à ouvrir");
    expect(phrase).toContain("elle se débloque");
    expect(phrase).not.toContain("restent");
  });

  /*
    Une phrase qui annonce zéro destination restante est un bruit sur un
    écran de confirmation, et « ton pack couvre 1 destination » en est un
    autre : il n'y a rien à aller chercher.
  */
  it("se tait quand il n'y a rien à dire", () => {
    expect(mentionDeLaCouverture(3, 3)).toBeNull();
    expect(mentionDeLaCouverture(1, 1)).toBeNull();
    expect(mentionDeLaCouverture(1, 0)).toBeNull();
    expect(mentionDeLaCouverture(3, 4)).toBeNull();
  });

  /** Le seul pack de la grille qui a quelque chose à annoncer. */
  it("ne parle que des packs multi-destinations de la grille", () => {
    const parlants = PACKS.filter((p) => mentionDeLaCouverture(p.destinations, 1) !== null);

    expect(parlants.map((p) => p.code)).toEqual(["pro"]);
  });

  /*
    C'est une phrase d'écran candidat sur le point le plus sensible du
    parcours — celui où l'on vient de payer. Elle ne promet rien de la
    décision administrative, et ne parle ni de score ni de chances.
  */
  it("ne promet rien (INV-1, INV-2)", () => {
    for (const p of PACKS) {
      const phrase = mentionDeLaCouverture(p.destinations, 0);
      if (!phrase) continue;
      expect(verifierTexte(phrase, INTERDITS_PARTOUT)).toEqual([]);
      expect(verifierTexte(phrase, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    }
  });
});
