import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Application, Document } from "@prisma/client";
import { versDossier, delaiInstructionJours } from "@/server/vue/dossier";
import { alertePeremption, libelleAlertePeremption } from "@/domain/dossiers/piece";
import { libelleImpact, type VersionRegle } from "@/domain/notifications/divergence";
import { dateDeDepot } from "@/domain/dossiers/faisabilite";
import { sansCommentaires } from "@/domain/copy/source";
import { PAYS_BAS } from "@/lib/contenu/destinations";
import type { Piece } from "@/domain/dossiers/piece";

/**
 * La date cible n'est pas la date de dépôt.
 *
 * `Application.targetDate` est la **date cible** — rentrée ou prise de
 * poste (DOC-11 WF-09 étape 1) —, et le dépôt s'en déduit en retirant le
 * délai d'instruction. La vue candidat l'appelait `depotVise`, et ce nom a
 * produit trois écrans faux et deux calculs faux.
 *
 * Ce qui est tenu ici : les deux dates existent séparément, et les deux
 * calculs qui se décident au jour du dépôt reçoivent le dépôt. La fenêtre
 * entre les deux fait quatre-vingt-dix jours sur la procédure
 * néerlandaise, et c'est dans cette fenêtre que se lisent tous les cas
 * ci-dessous.
 */

const CIBLE = "2027-09-01";
const INSTRUCTION = 90;
const DEPOT = "2027-06-03";

describe("les deux dates, séparées", () => {
  const regle = (max: number | null) => ({
    rules: max === null ? {} : { delai_traitement_jours: { min: 60, max } },
  });

  const dossier = (regleRules: { rules: unknown } | null) =>
    versDossier(
      {
        id: "d1",
        status: "ACTIF",
        targetDate: new Date(`${CIBLE}T00:00:00Z`),
      } as unknown as Application,
      [] as readonly Document[],
      PAYS_BAS,
      regleRules as never,
    );

  it("porte la cible et le dépôt, et ils diffèrent du délai d'instruction", () => {
    const vue = dossier(regle(INSTRUCTION));
    expect(vue.departVise).toBe(CIBLE);
    expect(vue.depot).toBe(DEPOT);
    expect(dateDeDepot(CIBLE, INSTRUCTION)).toBe(DEPOT);
  });

  /**
   * Sans délai annoncé, le dépôt retombe sur la cible. C'est
   * l'approximation prudente que l'échéancier fait déjà : elle ne prétend
   * pas à une précision qu'on n'a pas, et elle ne raccourcit rien.
   */
  it("sans délai annoncé, le dépôt vaut la cible", () => {
    expect(dossier(regle(null)).depot).toBe(CIBLE);
    expect(dossier(null).depot).toBe(CIBLE);
  });

  it("sans date cible, ni cible ni dépôt", () => {
    const vue = versDossier(
      { id: "d1", status: "BROUILLON", targetDate: null } as unknown as Application,
      [] as readonly Document[],
      PAYS_BAS,
      regle(INSTRUCTION) as never,
    );
    expect(vue.departVise).toBeUndefined();
    expect(vue.depot).toBeUndefined();
  });

  it("lit le délai défensivement — un jsonb peut précéder son schéma", () => {
    expect(delaiInstructionJours({ delai_traitement_jours: { max: 45 } })).toBe(45);
    expect(delaiInstructionJours({ delai_traitement_jours: null })).toBeNull();
    expect(delaiInstructionJours({ delai_traitement_jours: { max: "45" } })).toBeNull();
    expect(delaiInstructionJours({})).toBeNull();
    expect(delaiInstructionJours(null)).toBeNull();
    expect(delaiInstructionJours("rien")).toBeNull();
  });
});

describe("la péremption se juge au jour du dépôt", () => {
  const piece = (perimeLe: string): Piece =>
    ({
      id: "ielts",
      code: "EN",
      libelle: "Test d'anglais",
      famille: "OBLIGATOIRE",
      etat: "CONFORME",
      remede: "TELEVERSER",
      perimeLe,
    }) as unknown as Piece;

  /**
   * Le cas que la vue produisait. Une pièce expirant le 15 juillet est
   * valable le jour du dépôt, le 3 juin — et l'écran annonçait « Expire
   * le 15 juillet 2027, avant le dépôt visé », parce qu'on lui passait la
   * rentrée. Une fausse alarme qui fait refaire une pièce pour rien.
   */
  it("ne signale pas une pièce valable le jour du dépôt", () => {
    const entreLesDeux = piece("2027-07-15");
    expect(alertePeremption(entreLesDeux, DEPOT)).toBe("APRES_LE_DEPOT");
    expect(libelleAlertePeremption(entreLesDeux, DEPOT)).not.toContain("avant le dépôt");

    // Ce que la cible produisait, et qui était faux.
    expect(alertePeremption(entreLesDeux, CIBLE)).toBe("AVANT_LE_DEPOT");
  });

  it("signale toujours une pièce périmée avant le dépôt", () => {
    const avant = piece("2027-05-01");
    expect(alertePeremption(avant, DEPOT)).toBe("AVANT_LE_DEPOT");
    expect(libelleAlertePeremption(avant, DEPOT)).toContain("avant le dépôt visé");
  });

  it("ne dit rien sans date de dépôt ni sans date de péremption", () => {
    expect(alertePeremption(piece("2027-07-15"), undefined)).toBe("AUCUNE");
    expect(libelleAlertePeremption({ ...piece("2027-07-15"), perimeLe: undefined }, DEPOT)).toBeNull();
  });
});

describe("la version applicable se décide au jour du dépôt", () => {
  const ancienne: VersionRegle = {
    numero: 4,
    montant: { valeur: 1000, devise: "EUR" },
    intitule: "sur compte bloqué",
    publieeLe: "2026-01-15",
  };
  const nouvelle: VersionRegle = {
    numero: 5,
    montant: { valeur: 1696, devise: "EUR" },
    intitule: "sur compte bloqué",
    publieeLe: "2026-09-01",
    applicableDepuis: "2027-07-01",
  };

  /**
   * Entrée en vigueur au 1er juillet, dépôt au 3 juin, rentrée au
   * 1er septembre. C'est l'ancienne version qui s'applique — et l'écran
   * annonçait la nouvelle, donc un montant supplémentaire à réunir, parce
   * qu'on lui passait la rentrée.
   */
  it("ne bascule pas sur une version qui entre en vigueur après le dépôt", () => {
    const texte = libelleImpact(ancienne, nouvelle, "696 €", DEPOT);
    expect(texte).toContain("la version 4 reste celle de ton dossier");
    expect(texte).not.toContain("il te faut");

    // Ce que la cible produisait, et qui était faux.
    expect(libelleImpact(ancienne, nouvelle, "696 €", CIBLE)).toContain(
      "c'est la version 5 qui s'appliquera",
    );
  });

  it("bascule quand le dépôt tombe après l'entrée en vigueur", () => {
    expect(libelleImpact(ancienne, nouvelle, "696 €", "2027-08-01")).toContain(
      "c'est la version 5 qui s'appliquera",
    );
  });
});

describe("le nom qui mentait ne revient pas", () => {
  function fichiers(dir: string, acc: string[] = []): string[] {
    for (const nom of readdirSync(dir)) {
      const p = join(dir, nom);
      if (statSync(p).isDirectory()) fichiers(p, acc);
      else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
    }
    return acc;
  }
  const SOURCES = fichiers("src");

  /**
   * Hors commentaires : les commentaires racontent la correction, et
   * doivent pouvoir nommer l'ancien champ. Le code, lui, n'a plus de
   * `depotVise` — c'est `departVise` quand il s'agit de la cible, `depot`
   * quand il s'agit du dépôt.
   */
  it("aucun `depotVise` ne subsiste dans le code", () => {
    const fautifs = SOURCES.filter((f) => sansCommentaires(readFileSync(f, "utf8")).includes("depotVise"));
    expect(fautifs).toEqual([]);
  });

  /**
   * Le garde-fou qui empêche la rechute : les deux calculs qui se
   * décident au jour du dépôt ne peuvent pas recevoir la date cible.
   */
  it("aucun écran ne passe la date cible à un calcul de dépôt", () => {
    const appels = /(libelleAlertePeremption|alertePeremption|libelleImpact)\s*\(([^)]*)\)/gu;
    const fautifs: string[] = [];
    for (const f of SOURCES) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      for (const trouve of code.matchAll(appels)) {
        if (/departVise/u.test(trouve[2] ?? "")) fautifs.push(`${f} — ${trouve[0]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  /**
   * La première version de cette garde ne lisait que les appels, et la
   * rechute ne passe pas par un appel : l'écran transmet la date par une
   * **propriété** `depot`, et le composant appelle avec son paramètre. La
   * mutation « la checklist repasse la date cible » restait au vert.
   *
   * La garde suit donc la donnée là où elle circule : rien de ce qui
   * s'appelle `depot` ne reçoit ce qui s'appelle `départ` ou « cible ».
   */
  it("rien de ce qui s'appelle « dépôt » ne reçoit la date cible", () => {
    const affectations = /\bdepot\s*[=:]\s*\{?\s*([A-Za-z0-9_.?]+)/gu;
    /*
      « departVise » ne suffisait pas : la page des alertes transmettait la
      variable locale `depart`, et la mutation restait au vert. La garde
      porte sur la racine du mot, pas sur le nom d'un champ.
    */
    const suspect = /depart|targetDate|cible/iu;
    const fautifs: string[] = [];
    for (const f of SOURCES) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      for (const trouve of code.matchAll(affectations)) {
        if (suspect.test(trouve[1] ?? "")) fautifs.push(`${f} — ${trouve[0]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
