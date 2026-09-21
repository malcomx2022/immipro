import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  HABILITATIONS_SANS_ECRIVAIN,
  REMPLIES_PAR_LA_DEMONSTRATION,
  habilitationDe,
} from "@/domain/exploitation/habilitations";

/**
 * Les tables qu'aucune ligne du produit ne remplit — S.10.
 *
 * Le balayage qui a trouvé la paire est devenu ce garde-fou. Il tient les
 * deux sens : une table de vérification sans écrivain doit être nommée au
 * registre, et une table nommée doit rester sans écrivain — le jour où
 * l'écran qui la remplit existe, ce test échoue et force à retirer
 * l'entrée. Un registre qu'on oublie de vider est un registre qui ment.
 */

const fichiers = (racine: string): string[] =>
  readdirSync(racine).flatMap((entree) => {
    const chemin = join(racine, entree);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });

const SOURCES = fichiers("src")
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const SEED = fichiers("prisma/seed")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

const MODELES = [
  ...SCHEMA.matchAll(/^model (\w+) \{/gmu),
].map((m) => m[1]!);

const enMinuscule = (modele: string) => modele[0]!.toLowerCase() + modele.slice(1);

/**
 * Les clés de relation qui pointent vers un modèle, lues dans le schéma.
 *
 * C'est le point qui m'a piégé. Une écriture imbriquée se fait sous le nom
 * de la **relation**, pas sous celui du modèle : `activations: { create: … }`
 * crée des `PartnerActivation`. Dériver la clé du nom du modèle marche pour
 * `accreditations` ← `Accreditation` et tombe pour celle-là — et mon test
 * affirmait donc que le jeu de démonstration n'écrivait pas
 * `PartnerActivation`, alors qu'il en crée une. La base l'a démenti.
 *
 * Les clés se lisent donc dans le schéma : tout champ dont le type est le
 * modèle visé, au singulier ou en tableau.
 */
function clesDeRelation(modele: string): string[] {
  const champs = [
    ...SCHEMA.matchAll(new RegExp(`^\\s{2,}(\\w+)\\s+${modele}(\\[\\])?[\\s?]`, "gmu")),
  ].map((m) => m[1]!);
  return [...new Set([enMinuscule(modele), `${enMinuscule(modele)}s`, ...champs])];
}

const ECRITURES = "(create|createMany|update|updateMany|upsert|delete|deleteMany)";

function aUnEcrivain(modele: string, corpus: string): boolean {
  const direct = new RegExp(`\\.${enMinuscule(modele)}\\.${ECRITURES}\\(`, "u");
  if (direct.test(corpus)) return true;

  /**
   * Imbriqué : une clé de relation, puis une création dans la fenêtre qui
   * suit. La fenêtre plutôt qu'une forme fixe, parce que la vraie écriture
   * du produit est `deadlines: dateCible ? { create: … } : undefined` — un
   * ternaire s'y glisse entre la clé et l'accolade.
   */
  for (const cle of clesDeRelation(modele)) {
    for (const trouve of corpus.matchAll(new RegExp(`\\b${cle}:`, "gu"))) {
      const fenetre = corpus.slice(trouve.index, trouve.index + 120);
      if (/\b(create|createMany|connectOrCreate|upsert)\b/u.test(fenetre)) return true;
    }
  }
  return false;
}

describe("aucune table de vérification ne manque au registre", () => {
  it("le balayage trouve quelque chose à balayer", () => {
    expect(MODELES.length).toBeGreaterThan(20);
    expect(SOURCES.length).toBeGreaterThan(10_000);
  });

  /**
   * Le critère qui avait tort, tenu en exemple : `Deadline` est écrite en
   * imbriqué à l'ouverture d'un dossier, et un critère qui ne lit que
   * `db.deadline.create(` la déclare orpheline.
   */
  it("reconnaît une écriture imbriquée, pas seulement un appel direct", () => {
    expect(aUnEcrivain("Deadline", SOURCES)).toBe(true);
    expect(aUnEcrivain("Application", SOURCES)).toBe(true);
    // Et ne trouve pas d'écrivain là où il n'y en a pas.
    expect(aUnEcrivain("Accreditation", SOURCES)).toBe(false);
  });

  /**
   * Les deux sens du registre. Une table sans écrivain doit y être ; une
   * table qui y est doit rester sans écrivain.
   */
  it("nomme exactement les tables que le produit ne remplit pas", () => {
    const orphelines = MODELES.filter((m) => !aUnEcrivain(m, SOURCES));
    expect(orphelines.sort()).toEqual(
      [
        ...HABILITATIONS_SANS_ECRIVAIN.map((h) => h.table),
        ...REMPLIES_PAR_LA_DEMONSTRATION,
      ].sort(),
    );
  });

  /**
   * Toutes sont écrites par le jeu de démonstration, les vérifications
   * comprises — et c'est précisément le piège : la démonstration montre un
   * annuaire garni que la production n'aura jamais. Le même piège qu'en
   * S.6, où elle inventait un coût que le produit ne savait pas calculer.
   *
   * Ce qui sépare les deux listes n'est donc pas qui les écrit, mais ce que
   * leur absence bloque : une vérification manquante ferme une surface
   * entière, une table de démonstration la laisse seulement vide.
   */
  it("la démonstration les écrit toutes, y compris les vérifications", () => {
    for (const table of [
      ...REMPLIES_PAR_LA_DEMONSTRATION,
      ...HABILITATIONS_SANS_ECRIVAIN.map((h) => h.table),
    ]) {
      expect(aUnEcrivain(table, SEED), table).toBe(true);
    }
  });

  /** La clé de relation se lit dans le schéma, pas dans le nom du modèle. */
  it("suit une relation dont la clé ne porte pas le nom du modèle", () => {
    // `activations: { create: … }` crée des `PartnerActivation`.
    expect(clesDeRelation("PartnerActivation")).toContain("activations");
    expect(clesDeRelation("Accreditation")).toContain("accreditations");
  });

  /** Chaque entrée dit ce qu'elle bloque, qui doit agir, et ce qu'on fait sans. */
  it("chaque entrée nomme sa conséquence et sa compétence", () => {
    expect(HABILITATIONS_SANS_ECRIVAIN.length).toBeGreaterThan(0);
    for (const h of HABILITATIONS_SANS_ECRIVAIN) {
      expect(h.consequence.length, h.table).toBeGreaterThan(30);
      expect(h.competence.length, h.table).toBeGreaterThan(10);
      expect(h.enAttendant.length, h.table).toBeGreaterThan(40);
      expect(h.regle, h.table).toMatch(/RG-\d+\.\d+/u);
      // Jamais ce que le produit ferait avec : ce qu'il fait sans.
      expect(h.enAttendant, h.table).not.toMatch(/sera |pourra |permettra /u);
    }
  });

  it("se lit par table", () => {
    expect(habilitationDe("Accreditation")?.regle).toBe("RG-12.1");
    expect(habilitationDe("Transaction")).toBeUndefined();
  });

  /**
   * La conséquence de l'annuaire vide, vérifiée là où elle se produit : la
   * lecture filtre sur les accréditations non révoquées, donc sans ligne
   * elle ne rend personne.
   */
  it("la lecture de l'annuaire filtre bien sur l'habilitation", () => {
    const lecture = readFileSync("src/server/lecture/consultants.ts", "utf8");
    /**
     * Le filtre doit être **sur l'inclusion**, pas ailleurs dans le
     * fichier : « accreditations » et « revokedAt: null » apparaissent
     * chacun deux fois, et un critère qui les cherche séparément reste
     * vert quand on retire celui qui compte.
     */
    expect(lecture).toMatch(
      /include:\s*\{\s*accreditations:\s*\{\s*where:\s*\{\s*revokedAt:\s*null/u,
    );
  });

  it("la lecture des partenaires filtre bien sur l'activation", () => {
    const lecture = readFileSync("src/server/lecture/partenaires.ts", "utf8");
    expect(lecture).toMatch(/activations:\s*\{\s*some:/u);
  });
});
