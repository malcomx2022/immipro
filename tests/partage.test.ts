import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  etatDuPartage,
  libelleEcheance,
  LIBELLE_ETAT_PARTAGE,
  MENTION_RETRAIT,
  MENTION_REVOCATION,
  PARTAGES_VIDES,
  peutLire,
} from "@/domain/consultants/access";

/**
 * Le retrait d'un accord de partage — RG-12.2.
 *
 * « Révocable à tout moment » était écrit trois fois — la mention de T-04,
 * la case de T-05, et depuis le lot I.E le courrier de confirmation — et
 * rien ne permettait de retirer quoi que ce soit.
 */

const ACCORD = {
  dossierId: "nl-4471",
  consultantId: "vermeulen",
  donneLe: new Date("2026-09-17T10:00:00Z"),
};
const ECHEANCE = new Date("2026-10-01T10:00:00Z");
const PENDANT = new Date("2026-09-20T10:00:00Z");
const APRES = new Date("2026-10-02T10:00:00Z");

describe("un accord a trois états, et ils ne se valent pas", () => {
  it("ouvert tant que l'échéance n'est pas passée", () => {
    expect(etatDuPartage(ACCORD, ECHEANCE, PENDANT)).toBe("actif");
  });

  /**
   * Un accès échu s'est fermé tout seul à la date convenue ; un accès
   * retiré l'a été par quelqu'un. Les confondre ferait croire à un geste
   * qu'on n'a pas fait.
   */
  it("échu se distingue de retiré", () => {
    expect(etatDuPartage(ACCORD, ECHEANCE, APRES)).toBe("echu");
    expect(
      etatDuPartage({ ...ACCORD, revoqueLe: new Date("2026-09-18T10:00:00Z") }, ECHEANCE, PENDANT),
    ).toBe("retire");
  });

  it("un retrait prime sur l'échéance, même après elle", () => {
    // Retirer un accès déjà échu reste un geste : l'écran ne doit pas le
    // réécrire en « échu » et faire croire que le candidat n'a rien fait.
    expect(
      etatDuPartage({ ...ACCORD, revoqueLe: new Date("2026-09-18T10:00:00Z") }, ECHEANCE, APRES),
    ).toBe("retire");
  });

  it("chaque état a son libellé et son échéance lisible", () => {
    expect(LIBELLE_ETAT_PARTAGE.actif).toBe("Accès ouvert");
    expect(libelleEcheance("actif", "1er octobre 2026")).toBe("Jusqu'au 1er octobre 2026");
    expect(libelleEcheance("echu", "1er octobre 2026")).toBe("Échu le 1er octobre 2026");
    // Un accord retiré ne porte pas la date à laquelle il aurait expiré :
    // elle n'a plus eu lieu d'être.
    expect(libelleEcheance("retire", "1er octobre 2026")).toBe("Retiré");
  });
});

describe("le retrait ferme l'accès et le dit", () => {
  /**
   * Le modèle de droits donne déjà la réponse : un accord révoqué n'est
   * plus actif, et `peutLire` refuse pour « sans accord ». Le retrait n'a
   * donc rien à réécrire, il pose une date.
   */
  it("un accord révoqué ne laisse plus lire", () => {
    const habilitations = [
      { consultantId: "vermeulen", destination: "NL", habiliteLe: new Date("2024-03-01") },
    ];
    const dossier = { id: "nl-4471", destination: "NL" };

    expect(peutLire("vermeulen", dossier, habilitations, [ACCORD], PENDANT).autorise).toBe(true);

    const apresRetrait = peutLire(
      "vermeulen",
      dossier,
      habilitations,
      [{ ...ACCORD, revoqueLe: new Date("2026-09-18T10:00:00Z") }],
      PENDANT,
    );
    expect(apresRetrait.autorise).toBe(false);
    if (!apresRetrait.autorise) expect(apresRetrait.motifs).toEqual(["SANS_ACCORD"]);
  });

  /**
   * Quelqu'un qui croit effacer une consultation déjà eue se tromperait sur
   * ce qu'il obtient. La phrase le dit avant le geste.
   */
  it("il ne promet pas d'effacer ce qui a été vu", () => {
    expect(MENTION_RETRAIT).toContain("ferme l'accès immédiatement");
    expect(MENTION_RETRAIT).toContain("restent lisibles");
    expect(MENTION_RETRAIT).not.toMatch(/supprim|efface/iu);
  });

  it("l'absence de partage dit quand un accès s'ouvre", () => {
    expect(PARTAGES_VIDES).toContain("se referme seul");
  });
});

/**
 * La mention nomme un écran. Tant que cet écran ne portait pas les
 * accords, elle envoyait le candidat au mauvais endroit — et le test des
 * liens morts ne pouvait rien y voir : l'adresse était servie.
 */
describe("la mention nomme un écran qui tient sa promesse", () => {
  const A05 = readFileSync("src/app/(auth)/consentements/page.tsx", "utf8");
  const ECRAN = readFileSync("src/app/(auth)/consentements/Consentements.tsx", "utf8");

  it("« Mes consentements » est bien le titre de l'écran nommé", () => {
    expect(MENTION_REVOCATION).toContain("Mes consentements");
    expect(A05).toContain('title: "Mes consentements"');
  });

  it("et cet écran porte les accords de partage", () => {
    expect(ECRAN).toContain("Dossiers partagés");
    expect(ECRAN).toContain("/api/comptes/partages");
  });

  /**
   * Le lien de l'annuaire s'appelait « Gérer mes consentements de partage »
   * et menait au profil, qui n'en parle pas ; celui d'A-05 s'appelait
   * « Mon profil » et menait à l'écran de connexion. Servis tous les deux,
   * donc invisibles au test des liens morts.
   */
  it("les deux liens qui le nommaient y mènent", () => {
    const annuaire = readFileSync(
      "src/app/(app)/(dossier)/consultants/Annuaire.tsx",
      "utf8",
    );
    expect(annuaire).toMatch(/href="\/consentements"[\s\S]{0,200}Gérer mes consentements/u);
    expect(ECRAN).toMatch(/href="\/profil"[\s\S]{0,120}Mon profil/u);
  });
});
