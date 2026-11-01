import { describe, expect, it } from "vitest";
import {
  AGE_MAJORITE,
  BORNES_AGE,
  BORNES_NOM_AFFICHE,
  PAYS_DE_RESIDENCE,
  ageAu,
  estMineur,
  indicatifAdmis,
  nomAfficheParDefaut,
  validerIdentite,
  type SaisieDIdentite,
} from "@/domain/comptes/profil";
import { FUSEAUX_PROPOSES } from "@/domain/dossiers/preferences-rappels";
import {
  ESSAIS_AVANT_BLOCAGE,
  aBloquer,
  finDuBlocage,
  verdictDeConnexion,
} from "@/domain/comptes/connexion";

/**
 * « Mon compte » — S.210. Bornes exactes de chaque champ, à un près de
 * chaque côté, telles que le domaine les décide pour l'écran et le serveur.
 */
const AUJOURDHUI = "2026-10-31";
const FUSEAUX = FUSEAUX_PROPOSES.map((f) => f.id);
const VALIDE: SaisieDIdentite = {
  prenom: "Awa",
  nom: "Koffi",
  nomAffiche: "",
  telephone: "+229 01 97 00 00 00",
  dateNaissance: "1995-04-12",
  pays: "BJ",
  langue: "fr",
  fuseau: "Africa/Porto-Novo",
};
const valider = (partiel: Partial<SaisieDIdentite>) => validerIdentite({ ...VALIDE, ...partiel }, AUJOURDHUI, FUSEAUX);
const champsRefuses = (partiel: Partial<SaisieDIdentite>) => {
  const lu = valider(partiel);
  return lu.ok ? [] : Object.keys(lu.champs);
};

describe("une saisie complète passe et se normalise", () => {
  it("rend les colonnes à écrire", () => {
    expect(valider({})).toEqual({
      ok: true,
      identite: {
        prenom: "Awa",
        nom: "Koffi",
        nomAffiche: null,
        telephone: "+2290197000000",
        dateNaissance: "1995-04-12",
        pays: "BJ",
        langue: "fr",
        fuseau: "Africa/Porto-Novo",
        mineur: false,
      },
    });
  });

  it("les champs facultatifs vides vident la colonne", () => {
    const lu = valider({ telephone: "", dateNaissance: "", pays: "", prenom: " ", nom: "" });
    expect(lu).toMatchObject({ ok: true, identite: { telephone: null, dateNaissance: null, pays: null, prenom: null, nom: null } });
  });

  it("le nom affiché vaut par défaut prénom et nom", () => {
    expect(nomAfficheParDefaut(" Awa ", "Koffi")).toBe("Awa Koffi");
    expect(nomAfficheParDefaut(null, "Koffi")).toBe("Koffi");
    expect(nomAfficheParDefaut("", undefined)).toBe("");
  });
});

describe(`nom affiché : ${BORNES_NOM_AFFICHE.min} à ${BORNES_NOM_AFFICHE.max} caractères`, () => {
  it.each([
    ["x", false],
    ["xy", true],
    ["x".repeat(80), true],
    ["x".repeat(81), false],
  ])("« %s » → %s", (nomAffiche, accepte) => {
    expect(champsRefuses({ nomAffiche }).includes("nomAffiche")).toBe(!accepte);
  });

  it("prénom et nom : 80 acceptés, 81 refusés", () => {
    expect(champsRefuses({ prenom: "x".repeat(80) })).toEqual([]);
    expect(champsRefuses({ prenom: "x".repeat(81) })).toEqual(["prenom"]);
    expect(champsRefuses({ nom: "x".repeat(81) })).toEqual(["nom"]);
  });
});

describe("téléphone E.164 : 8 à 15 chiffres, indicatif d'un pays couvert", () => {
  it.each([
    ["+2290123", false, "7 chiffres"],
    ["+22901234", true, "8 chiffres"],
    ["+229012345678901", true, "15 chiffres"],
    ["+2290123456789012", false, "16 chiffres"],
  ])("%s → %s (%s)", (telephone, accepte) => {
    expect(champsRefuses({ telephone }).includes("telephone")).toBe(!accepte);
  });

  it("le message dit combien de chiffres ont été comptés", () => {
    const lu = valider({ telephone: "+2290123" });
    expect(lu.ok).toBe(false);
    if (!lu.ok) expect(lu.champs.telephone).toMatch(/7 chiffres.*entre 8 et 15/u);
  });

  it("« 00 » se lit « + », espaces et tirets retirés", () => {
    expect(valider({ telephone: "00 229-01-97-00-00-00" })).toMatchObject({ ok: true, identite: { telephone: "+2290197000000" } });
  });

  it("refuse un numéro sans indicatif, et un indicatif hors des pays couverts", () => {
    expect(champsRefuses({ telephone: "0197000000" })).toEqual(["telephone"]);
    const hors = valider({ telephone: "+447700900123" });
    expect(hors.ok).toBe(false);
    if (!hors.ok) expect(hors.champs.telephone).toMatch(/Indicatifs admis : \+1, \+31/u);
  });

  it("chaque pays couvert a son indicatif admis", () => {
    for (const p of PAYS_DE_RESIDENCE) expect(indicatifAdmis(`+${p.indicatif}12345678`)).toBe(true);
    expect(indicatifAdmis("+44123456789")).toBe(false);
  });
});

describe(`date de naissance : ${BORNES_AGE.min} à ${BORNES_AGE.max} ans`, () => {
  it.each([
    ["2013-11-01", false, "12 ans, la veille de ses 13 ans"],
    ["2013-10-31", true, "13 ans le jour même"],
    ["1916-10-31", true, "110 ans"],
    ["1915-10-31", false, "111 ans"],
  ])("%s → %s (%s)", (dateNaissance, accepte) => {
    expect(champsRefuses({ dateNaissance }).includes("dateNaissance")).toBe(!accepte);
  });

  it("refuse une date qui n'existe pas", () => {
    expect(champsRefuses({ dateNaissance: "2000-02-30" })).toEqual(["dateNaissance"]);
    expect(champsRefuses({ dateNaissance: "31/10/2000" })).toEqual(["dateNaissance"]);
  });

  it(`mineur : moins de ${AGE_MAJORITE} ans, au jour près`, () => {
    expect(valider({ dateNaissance: "2008-11-01" })).toMatchObject({ ok: true, identite: { mineur: true } });
    expect(valider({ dateNaissance: "2008-10-31" })).toMatchObject({ ok: true, identite: { mineur: false } });
    expect(estMineur("2010-01-01", AUJOURDHUI)).toBe(true);
    expect(estMineur(null, AUJOURDHUI)).toBe(false);
  });

  it("né un 29 février, on prend un an le 1er mars les années non bissextiles", () => {
    expect(ageAu("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageAu("2008-02-29", "2026-03-01")).toBe(18);
  });
});

describe("pays, langue et fuseau : des listes bornées", () => {
  it("refuse un pays, une langue ou un fuseau hors liste", () => {
    expect(champsRefuses({ pays: "XX" })).toEqual(["pays"]);
    expect(champsRefuses({ langue: "de" })).toEqual(["langue"]);
    expect(champsRefuses({ fuseau: "Asia/Tokyo" })).toEqual(["fuseau"]);
    expect(champsRefuses({ langue: "en", pays: "nl", fuseau: "Europe/Amsterdam" })).toEqual([]);
  });
});

/**
 * Le verrouillage de compte n'est pas touché par S.210 : ce test fige son
 * comportement réel. Le compte se bloque **au cinquième** échec
 * (`ESSAIS_AVANT_BLOCAGE` = 5) : après quatre échecs il reste un essai, le
 * cinquième bloque, le sixième est refusé pendant le blocage.
 */
describe("verrouillage de compte — inchangé", () => {
  const maintenant = new Date("2026-10-31T10:00:00.000Z");

  it("quatre échecs : pas de blocage, un dernier essai annoncé", () => {
    expect(ESSAIS_AVANT_BLOCAGE).toBe(5);
    expect(aBloquer(4)).toBe(false);
    expect(verdictDeConnexion(4, null, maintenant)).toEqual({ bloque: false, essaisRestants: 1, reprendDansMinutes: 0 });
  });

  it("le cinquième échec bloque, le sixième est refusé pendant le blocage", () => {
    expect(aBloquer(5)).toBe(true);
    const fin = finDuBlocage(maintenant);
    expect(verdictDeConnexion(5, fin, maintenant).bloque).toBe(true);
    const sixieme = new Date(maintenant.getTime() + 60_000);
    expect(verdictDeConnexion(6, fin, sixieme)).toMatchObject({ bloque: true, essaisRestants: 0 });
  });
});
