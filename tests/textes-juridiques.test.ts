import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLES_DU_PRODUIT, MODELES, PAGES_JURIDIQUES, variablesDuProduit, type ModeleJuridique } from "@/domain/juridique/modeles";
import { empreinte, fautesDuRendu, rendre, variablesDuModele } from "@/domain/juridique/rendu";
import { etatDuTexte, refusDeValidation, republication, type Attestation, type VersionPubliee } from "@/domain/juridique/publication";
import { VARIABLES_JURIDIQUES, motifDeRefus, variable, verifierLesValeurs } from "@/domain/juridique/variables";
import { PACKS } from "@/domain/payments/pricing";

/**
 * S.101 — les textes juridiques : des modèles du dépôt, des variables du
 * back-office, et une page servie seulement après une validation tracée.
 *
 * Ce que ces tests tiennent, sans base :
 *
 * - le registre des variables et les modèles se répondent, clé par clé ;
 * - une variable obligatoire vide bloque, une facultative efface son passage ;
 * - le vocabulaire interdit s'applique au texte rendu, variables comprises ;
 * - la validation exige un relecteur nommé, une date passée, une attestation ;
 * - la republication automatique ne s'applique qu'à un texte validé dont le
 *   modèle n'a pas changé.
 */

/** Des valeurs plausibles pour chaque variable obligatoire. */
const exemple = (v: (typeof VARIABLES_JURIDIQUES)[number]): string => {
  switch (v.nature) {
    case "email":
      return "contact@immipro.app";
    case "telephone":
      return "+229 01 00 00 00 00";
    case "url":
      return "https://immipro.app";
    case "liste":
      return "Premier élément\nSecond élément";
    case "texte":
      return "Premier paragraphe.\n\nSecond paragraphe.";
    case "ligne":
      return `Valeur de ${v.cle}`;
  }
};
const COMPLETES = Object.fromEntries(
  VARIABLES_JURIDIQUES.filter((v) => !v.facultative).map((v) => [v.cle, exemple(v)]),
);

const ATTESTATION: Attestation = {
  relecteur: "Me Dossou, avocat au barreau de Cotonou",
  relueLe: "2026-10-01",
  motif: "Première publication",
  atteste: true,
};

const textes = (m: Pick<ModeleJuridique, "titre" | "chapeau" | "blocs">) =>
  JSON.stringify([m.titre, m.chapeau, m.blocs]);

describe("le registre des variables et les modèles se répondent", () => {
  it("chaque variable d'un modèle est au registre, et chaque variable du registre sert", () => {
    const employees = new Set(PAGES_JURIDIQUES.flatMap((p) => variablesDuModele(MODELES[p])));
    for (const cle of employees) expect(variable(cle), cle).toBeDefined();
    for (const v of VARIABLES_JURIDIQUES) expect(employees.has(v.cle), v.cle).toBe(true);
  });

  it("les clés sont uniques, et celles du produit ne se saisissent pas", () => {
    const cles = VARIABLES_JURIDIQUES.map((v) => v.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const cle of CLES_DU_PRODUIT) expect(variable(cle), cle).toBeUndefined();
  });

  it("chaque variable dit quoi saisir", () => {
    for (const v of VARIABLES_JURIDIQUES) {
      expect(v.libelle.length, v.cle).toBeGreaterThan(3);
      expect(v.aide.length, v.cle).toBeGreaterThan(20);
    }
  });

  it("les quatre pages ont leur modèle, à leur adresse", () => {
    for (const page of PAGES_JURIDIQUES) {
      expect(MODELES[page].page).toBe(page);
      expect(MODELES[page].adresse).toBe(`/${page}`);
    }
  });
});

describe("le rendu", () => {
  it("avec toutes les variables, chaque texte est complet, sans variable restante ni formulation refusée", () => {
    for (const page of PAGES_JURIDIQUES) {
      const rendu = rendre(MODELES[page], COMPLETES);
      expect(rendu.manquantes, page).toEqual([]);
      expect(textes(rendu), page).not.toMatch(/\{\{|\}\}/u);
      expect(fautesDuRendu(rendu), page).toEqual([]);
    }
  });

  it("une variable obligatoire vide est nommée, jamais remplacée par un blanc", () => {
    const { rccm: _retire, ...sansRccm } = COMPLETES;
    const rendu = rendre(MODELES["mentions-legales"], sansRccm);
    expect(rendu.manquantes).toEqual(["rccm"]);
    expect(textes(rendu)).not.toMatch(/RCCM\s*$/mu);
    expect(rendre(MODELES.contact, {}).manquantes).toContain("email_contact");
  });

  it("une variable facultative vide efface son passage", () => {
    const sans = rendre(MODELES.contact, COMPLETES);
    expect(textes(sans)).not.toContain("Téléphone");
    expect(sans.manquantes).toEqual([]);
    const avec = rendre(MODELES.contact, { ...COMPLETES, telephone: "+229 01 00 00 00 00" });
    expect(textes(avec)).toContain("Téléphone : +229 01 00 00 00 00");
  });

  it("un texte se déplie en paragraphes, une liste en éléments", () => {
    const rendu = rendre(MODELES.conditions, COMPLETES);
    const paragraphes = rendu.blocs.filter((b) => b.type === "paragraphe").map((b) => (b as { texte: string }).texte);
    expect(paragraphes).toContain("Premier paragraphe.");
    expect(paragraphes).toContain("Second paragraphe.");
    const donnees = rendre(MODELES["donnees-personnelles"], { ...COMPLETES, sous_traitants: "- Infomaniak, hébergement, Suisse\n• Stripe, paiements par carte" });
    const items = donnees.blocs.flatMap((b) => (b.type === "liste" ? b.items : []));
    expect(items).toContain("Infomaniak, hébergement, Suisse");
    expect(items).toContain("Stripe, paiements par carte");
  });

  it("la grille des prix est celle que l'écran de paiement facture", () => {
    const grille = variablesDuProduit().grille_des_prix!;
    for (const pack of PACKS) {
      expect(grille).toContain(`Pack ${pack.libelle} — ${pack.prix.XOF.toLocaleString("fr-FR")} F ou ${pack.prix.EUR.toLocaleString("fr-FR")} €`);
    }
  });

  it("une promesse saisie dans une variable est refusée, une négation passe", () => {
    const promesse = rendre(MODELES.conditions, { ...COMPLETES, responsabilite: "Avec ImmiPro, visa garanti." });
    expect(fautesDuRendu(promesse).map((f) => f.code)).toContain("visa-garanti");
    const negation = rendre(MODELES.conditions, { ...COMPLETES, responsabilite: "ImmiPro ne garantit pas l'obtention du visa." });
    expect(fautesDuRendu(negation)).toEqual([]);
  });

  it("l'empreinte suit le texte du modèle, et lui seul", () => {
    const m = MODELES.contact;
    expect(empreinte(m)).toBe(empreinte({ ...m }));
    expect(empreinte({ ...m, chapeau: `${m.chapeau} ` })).not.toBe(empreinte(m));
    expect(new Set(PAGES_JURIDIQUES.map((p) => empreinte(MODELES[p]))).size).toBe(4);
  });
});

describe("la vérification d'une valeur", () => {
  const v = (cle: string) => variable(cle)!;

  it("vide, elle s'enregistre comme un brouillon", () => {
    expect(motifDeRefus(v("email_contact"), "")).toBeNull();
  });

  it.each([
    ["email_contact", "pas-une-adresse", /adresse électronique/u],
    ["telephone", "01 00 00 00", /indicatif international/u],
    ["denomination", "ImmiPro\nSAS", /une ligne/u],
    ["retractation", "Voir {{autre}}", /réservés aux variables/u],
  ])("%s : « %s » est refusée, avec le geste attendu", (cle, valeur, motif) => {
    expect(motifDeRefus(v(cle), valeur)).toMatch(motif);
  });

  it("une clé inconnue est refusée", () => {
    expect(verifierLesValeurs({ siege: "Cotonou" })).toEqual({
      siege: "« siege » n'est pas une variable des textes juridiques.",
    });
  });
});

describe("la validation", () => {
  it("passe avec les variables, un relecteur nommé, une date passée et l'attestation", () => {
    expect(refusDeValidation("conditions", COMPLETES, ATTESTATION, "2026-10-02")).toEqual([]);
  });

  it("nomme les variables manquantes par leur libellé", () => {
    const refus = refusDeValidation("contact", {}, ATTESTATION, "2026-10-02");
    expect(refus[0]).toMatch(/Renseigner ces \d+ variables/u);
    expect(refus[0]).toContain("« Adresse électronique de contact » (Le contact)");
  });

  it.each([
    [{ relecteur: "Moi" }, /Nommer le relecteur/u],
    [{ relueLe: "2026-10-03" }, /futur/u],
    [{ relueLe: "hier" }, /date de la relecture/u],
    [{ motif: "" }, /motif/u],
    [{ atteste: false }, /attestation/u],
  ] as const)("refuse %o", (changement, motif) => {
    const refus = refusDeValidation("contact", COMPLETES, { ...ATTESTATION, ...changement }, "2026-10-02");
    expect(refus.join(" ")).toMatch(motif);
  });
});

describe("la republication après un changement de variables", () => {
  const modele = MODELES.contact;
  const validee = (variables: Record<string, string>, empreinteDuModele = empreinte(modele)): VersionPubliee => ({
    rang: 1,
    empreinte: empreinteDuModele,
    variables: rendre(modele, variables).employees,
    relecteur: ATTESTATION.relecteur,
    relueLe: ATTESTATION.relueLe,
  });

  it("republie un texte validé dont une variable a changé", () => {
    const apres = { ...COMPLETES, email_contact: "support@immipro.app" };
    expect(republication(modele, validee(COMPLETES), apres)).toEqual({ republier: true });
  });

  it("ne publie jamais un texte qui n'a pas été validé", () => {
    expect(republication(modele, null, COMPLETES)).toEqual({ republier: false, raison: "jamais_valide" });
  });

  it("ne republie pas un texte dont le modèle a changé depuis la validation : il est à revalider", () => {
    const ancienne = validee(COMPLETES, "00000000");
    expect(republication(modele, ancienne, { ...COMPLETES, email_contact: "support@immipro.app" })).toEqual({
      republier: false,
      raison: "texte_change",
    });
    expect(etatDuTexte(modele, ancienne)).toBe("A_REVALIDER");
    expect(etatDuTexte(modele, validee(COMPLETES))).toBe("PUBLIE");
    expect(etatDuTexte(modele, null)).toBe("NON_PUBLIE");
  });

  it("ne republie pas pour une variable qu'il n'emploie pas", () => {
    expect(republication(modele, validee(COMPLETES), { ...COMPLETES, rccm: "Autre numéro" })).toEqual({
      republier: false,
      raison: "inchange",
    });
  });

  it("garde la version validée quand une variable obligatoire est vidée", () => {
    expect(republication(modele, validee(COMPLETES), { ...COMPLETES, email_contact: "" })).toEqual({
      republier: false,
      raison: "incomplet",
    });
  });

  it("garde la version validée quand une nouvelle valeur porte une promesse", () => {
    expect(
      republication(modele, validee(COMPLETES), { ...COMPLETES, remboursement_demande: "Remboursement immédiat, visa garanti." }),
    ).toEqual({ republier: false, raison: "formulation_refusee" });
  });
});

describe("aucune version publiée ne se réécrit", () => {
  /**
   * Même règle que `EditorialVersion` et le journal d'audit : l'absence
   * d'écrivain, vérifiée dans les sources. Un texte qu'on pourrait corriger
   * après coup ne prouverait plus ce qu'un candidat a accepté.
   */
  it("aucun code ne met à jour ni ne supprime une publication juridique", () => {
    for (const f of [
      "src/server/juridique/ecriture.ts",
      "src/server/juridique/lecture.ts",
      "src/app/api/admin/textes-juridiques/variables/route.ts",
      "src/app/api/admin/textes-juridiques/[page]/validation/route.ts",
    ]) {
      const source = readFileSync(f, "utf8");
      expect(source, f).not.toMatch(/legalPublication\.(update|updateMany|delete|deleteMany|upsert)/u);
    }
  });

  it("la base refuse une page inconnue et une validation sans relecteur", () => {
    const sql = readFileSync("prisma/migrations/20261002150000_textes_juridiques/migration.sql", "utf8");
    expect(sql).toMatch(/legal_publication_page_connue/u);
    expect(sql).toMatch(/legal_publication_relecteur_nomme/u);
  });

  it("les routes d'écriture sont réservées à l'administration", () => {
    for (const f of [
      "src/app/api/admin/textes-juridiques/variables/route.ts",
      "src/app/api/admin/textes-juridiques/[page]/validation/route.ts",
    ]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/acces: "admin"/u);
    }
    expect(readFileSync("src/app/(admin)/textes-juridiques/page.tsx", "utf8")).toMatch(/exigerAdmin\(/u);
  });
});
