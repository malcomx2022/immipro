import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  achatDepuisLeCode,
  achatDuParametre,
  codeEnregistre,
  corpsDAchat,
  ouvrableDepuisLeRecapitulatif,
  schemaAchat,
  tarifDe,
  type Achat,
} from "@/domain/payments/achat";
import { CONSULTATION, PACKS, RECHARGE_ANALYSES } from "@/domain/payments/pricing";

/**
 * Le typage des achats — correctif du 21/09/2026.
 *
 * ── Le défaut que ces tests retiennent ──────────────────────────────
 *
 * Le récapitulatif recevait `{ code, libelle, prix }` et redevinait la
 * catégorie sur le code : tout ce qui n'était pas `recharge` partait en
 * pack. Une consultation s'affichait donc juste — bon libellé, bon
 * montant — et se sérialisait `{ type: "pack", code: "consultation" }`.
 *
 * Ce qui suit vérifie que la catégorie se transporte au lieu de se
 * redeviner, et que chaque bout de la chaîne — affichage, corps de
 * requête, montant, code enregistré — dit la même chose de chaque achat.
 */

const LES_TROIS: readonly Achat[] = [
  { type: "pack", code: PACKS[0]!.code },
  { type: "recharge" },
  { type: "consultation" },
];

const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

const lire = (chemin: string): string => readFileSync(chemin, "utf8");

describe("la sérialisation d'un achat", () => {
  it("rend exactement la catégorie affichée, pour les trois achats", () => {
    expect(corpsDAchat({ type: "pack", code: "dossier" })).toEqual({
      type: "pack",
      code: "dossier",
    });
    expect(corpsDAchat({ type: "recharge" })).toEqual({ type: "recharge" });
    expect(corpsDAchat({ type: "consultation" })).toEqual({ type: "consultation" });
  });

  /**
   * Le défaut exactement : une consultation ne part pas en pack.
   *
   * Le code `consultation` était accepté côté serveur comme un pack, et
   * `getPack("consultation")` ne rendant rien, le crédit ne trouvait
   * aucune contrepartie. Le montant partait, l'achat n'existait pas.
   */
  it("une consultation ne part jamais sous l'étiquette d'un pack", () => {
    const corps = corpsDAchat({ type: "consultation" });
    expect(corps.type).toBe("consultation");
    expect(corps).not.toHaveProperty("code");
  });

  it("n'emporte rien de plus que ce que la route accepte", () => {
    // Le champ ajouté à la volée ne doit pas traverser : ce qui n'est pas
    // écrit dans la conversion ne part pas.
    const enrichi = { type: "recharge", secret: "à ne pas envoyer" } as unknown as Achat;
    expect(corpsDAchat(enrichi)).toEqual({ type: "recharge" });
  });

  it("le schéma de la route accepte les trois corps, et rien d'autre", () => {
    for (const achat of LES_TROIS) {
      expect(schemaAchat.parse(corpsDAchat(achat))).toEqual(corpsDAchat(achat));
    }
    expect(schemaAchat.safeParse({ type: "consultation", code: "x" }).success).toBe(true);
    expect(schemaAchat.safeParse({ type: "abonnement" }).success).toBe(false);
    expect(schemaAchat.safeParse({ type: "pack" }).success).toBe(false);
    expect(schemaAchat.safeParse({ type: "pack", code: "" }).success).toBe(false);
  });
});

describe("le paramètre d'adresse et le code enregistré", () => {
  it("relit les trois catégories, et refuse un code inventé", () => {
    expect(achatDuParametre(PACKS[0]!.code)).toEqual({ type: "pack", code: PACKS[0]!.code });
    expect(achatDuParametre("recharge")).toEqual({ type: "recharge" });
    expect(achatDuParametre("consultation")).toEqual({ type: "consultation" });
    expect(achatDuParametre("pack-imaginaire")).toBeNull();
    expect(achatDuParametre("")).toBeNull();
  });

  /** Aller-retour : ce qui s'écrit en base se relit à l'identique. */
  it("le code enregistré se relit en la même catégorie", () => {
    for (const achat of LES_TROIS) {
      expect(achatDepuisLeCode(codeEnregistre(achat))).toEqual(achat);
    }
    expect(codeEnregistre({ type: "pack", code: "pro" })).toBe("pro");
    expect(codeEnregistre({ type: "recharge" })).toBe("recharge");
    expect(codeEnregistre({ type: "consultation" })).toBe("consultation");
  });

  it("un code que la grille ne connaît plus ne devient pas un pack", () => {
    expect(achatDepuisLeCode("pack-retire-de-la-grille")).toBeNull();
  });
});

describe("le tarif, et le montant qui en découle", () => {
  it("vient de la grille, pour chaque catégorie et chaque devise", () => {
    expect(tarifDe({ type: "pack", code: PACKS[0]!.code })).toEqual({
      libelle: PACKS[0]!.libelle,
      prix: PACKS[0]!.prix,
    });
    expect(tarifDe({ type: "recharge" })).toEqual({
      libelle: RECHARGE_ANALYSES.libelle,
      prix: RECHARGE_ANALYSES.prix,
    });
    expect(tarifDe({ type: "consultation" })).toEqual({
      libelle: CONSULTATION.libelle,
      prix: CONSULTATION.prix,
    });
  });

  /**
   * Les trois montants diffèrent : c'est ce qui rend le défaut visible.
   * Si une consultation était tarifée comme un pack, la confusion de
   * catégorie ne se serait jamais vue sur le montant.
   */
  it("les trois achats n'ont pas le même montant", () => {
    const montants = LES_TROIS.map((a) => tarifDe(a)!.prix.XOF);
    expect(new Set(montants).size).toBe(3);
  });

  it("rend l'absence pour un pack hors grille, jamais zéro", () => {
    expect(tarifDe({ type: "pack", code: "inconnu" })).toBeNull();
  });
});

describe("ce que le récapitulatif a le droit d'ouvrir", () => {
  /**
   * Une consultation payée doit correspondre à un créneau tenu.
   *
   * Ouverte depuis $-02, elle ne citerait aucun rendez-vous :
   * `confirmerLaConsultation` cherche un `Appointment` par
   * `transactionId`, n'en trouverait pas, et la notification signée
   * n'aurait rien à confirmer. Somme encaissée, rien de tenu.
   */
  it("un pack et une recharge, jamais une consultation", () => {
    expect(ouvrableDepuisLeRecapitulatif({ type: "pack", code: "dossier" })).toBe(true);
    expect(ouvrableDepuisLeRecapitulatif({ type: "recharge" })).toBe(true);
    expect(ouvrableDepuisLeRecapitulatif({ type: "consultation" })).toBe(false);
  });

  it("l'écran le demande au domaine avant de proposer de payer", () => {
    const source = sansCommentaires(lire("src/app/(app)/paiement/recapitulatif/page.tsx"));
    expect(source).toMatch(/ouvrableDepuisLeRecapitulatif\(achat\)/u);
    expect(source).toMatch(/notFound\(\)/u);
    // La catégorie n'est plus déduite du paramètre dans l'écran.
    expect(source).not.toMatch(/achat === "recharge"|achat === "consultation"/u);
  });

  it("aucun écran n'envoie une consultation au récapitulatif", () => {
    for (const ecran of [
      "src/app/(app)/paiement/echec/Echec.tsx",
      "src/app/(app)/paiement/pack/ChoixDuPack.tsx",
      "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier.tsx",
    ]) {
      const source = sansCommentaires(lire(ecran));
      expect(source, ecran).not.toMatch(/recapitulatif\?[^`"']*achat=consultation/u);
    }
    // Celui qui construit l'adresse depuis le code enregistré demande
    // d'abord au domaine si cet achat s'ouvre là.
    const echec = sansCommentaires(lire("src/app/(app)/paiement/echec/Echec.tsx"));
    expect(echec).toMatch(/ouvrableDepuisLeRecapitulatif\(achat\)/u);
  });
});

describe("la route et la couche d'accès partagent l'union du domaine", () => {
  it("la route n'a plus de conversion forcée vers l'achat", () => {
    const source = lire("src/app/api/paiements/route.ts");
    expect(source).toMatch(/schemaAchat/u);
    // La conversion forcée masquait toute divergence entre le schéma et
    // le type attendu par `montantDe`.
    expect(source).not.toMatch(/as Parameters</u);
    expect(sansCommentaires(source)).not.toMatch(/z\.discriminatedUnion/u);
  });

  it("le code enregistré n'est plus composé en ligne", () => {
    const source = sansCommentaires(lire("src/server/acces/paiements.ts"));
    expect(source).toMatch(/packCode: codeEnregistre\(achat\)/u);
    expect(source).not.toMatch(/achat\.type === "pack" \? achat\.code : achat\.type/u);
    // Le crédit relit le code par le domaine plutôt que par des chaînes.
    expect(source).toMatch(/achatDepuisLeCode\(transaction\.packCode\)/u);
  });
});
