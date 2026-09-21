import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MENTION_HISTORIQUE } from "@/domain/editorial/historique";
import { MOTIF_CORRECTION_EN_LIGNE } from "@/server/acces/editorial";
import { VERSIONS_RELUES } from "@/server/lecture/editorial";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * L'historique des publications — P.B, tranché le 20/09/2026 en faveur
 * d'un historique des publications uniquement.
 *
 * Ce qui se vérifie tient en quatre points : une version naît à chaque
 * fois que le texte public change et jamais sur un brouillon, elle est
 * immuable, le journal la référence, et restaurer allonge l'histoire au
 * lieu de la réécrire.
 */

function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}
const lire = (f: string) => readFileSync(f, "utf8");

const ROUTE = "src/app/api/admin/contenus/[id]/route.ts";
const ACCES = "src/server/acces/editorial.ts";

describe("une version naît quand le texte public change", () => {
  const route = lire(ROUTE);

  /**
   * Le bouton « Publier », évidemment. Et la version **avant** la ligne de
   * journal, parce que c'est elle que la ligne référence : une ligne qui
   * citerait un rang inexistant vaudrait moins que pas de rang du tout.
   */
  it("publier enregistre une version, puis la journalise par son rang", () => {
    const post = route.slice(route.indexOf("export const POST"));
    const version = post.lastIndexOf("enregistrerUneVersion(");
    const journal = post.lastIndexOf('motif: `Publication —');
    expect(version).toBeGreaterThan(-1);
    expect(version).toBeLessThan(journal);
    expect(post).toMatch(/details: \{ genre: vue\.genre, slug: vue\.slug, version: rang \}/u);
  });

  /**
   * **Et l'enregistrement d'un document déjà publié, qui est le point.**
   * Cette route invalide le cache de la page dans la foulée : le texte
   * change sous les yeux du public à la seconde, sans passer par le
   * bouton. Ne versionner que le bouton aurait donné un historique troué
   * sur le chemin le plus courant — corriger un guide en ligne — tout en
   * promettant une preuve de ce qui était public.
   */
  it("enregistrer un document déjà publié en crée une aussi", () => {
    const put = route.slice(route.indexOf("export const PUT"), route.indexOf("export const POST"));
    const garde = put.indexOf('document.status === "PUBLIE"');
    expect(garde).toBeGreaterThan(-1);
    const bloc = put.slice(garde);
    expect(bloc).toContain("enregistrerUneVersion(");
    // La version part avec la revalidation : ce qui rend public et ce qui
    // conserve la preuve sont dans la même branche, et ne peuvent pas se
    // séparer par inadvertance.
    expect(bloc).toContain("revalider(");
  });

  /** Un brouillon n'est lu par personne : il ne crée rien. */
  it("un brouillon enregistré n'en crée aucune", () => {
    const put = route.slice(route.indexOf("export const PUT"), route.indexOf("export const POST"));
    const appels = [...put.matchAll(/enregistrerUneVersion\(/gu)];
    expect(appels).toHaveLength(1);
    // Le seul appel est dans la branche du document publié.
    expect(put.indexOf("enregistrerUneVersion(")).toBeGreaterThan(
      put.indexOf('document.status === "PUBLIE"'),
    );
  });

  /**
   * Le rang se calcule dans la transaction qui insère. Calculé avant, deux
   * publications simultanées produiraient deux fois le même — et l'unicité
   * `(docId, rang)` ferme la course au lieu de la laisser passer.
   */
  it("le rang se calcule dans la transaction, et l'unicité ferme la course", () => {
    const acces = lire(ACCES);
    const fonction = /export async function enregistrerUneVersion[\s\S]*?\n\}$/mu.exec(acces)![0];
    expect(fonction).toContain("db.$transaction");
    expect(fonction).toMatch(/tx\.editorialVersion\.findFirst[\s\S]*?orderBy: \{ rang: "desc" \}/u);
    expect(lire("prisma/schema.prisma")).toMatch(/@@unique\(\[docId, rang\]\)/u);
  });

  /**
   * La version photographie l'état lu en base, pas des valeurs recopiées
   * par l'appelant : au premier champ oublié, les deux divergeraient et la
   * preuve ne prouverait plus rien.
   */
  it("elle photographie le document, pas ce qu'on lui passe", () => {
    const acces = lire(ACCES);
    const fonction = /export async function enregistrerUneVersion[\s\S]*?\n\}$/mu.exec(acces)![0];
    expect(fonction).toContain("tx.editorialDoc.findUnique");
    for (const champ of ["title", "standfirst", "body", "sourceLabel", "verifiedAt"]) {
      expect(fonction, champ).toContain(`${champ}: doc.${champ}`);
    }
  });
});

describe("une version ne se réécrit pas", () => {
  /**
   * L'immuabilité tient comme celle du journal d'audit (B-06) : par
   * l'absence d'écrivain. Aucune contrainte CHECK n'empêche un UPDATE, et
   * le dépôt n'emploie pas de déclencheur — introduire le premier pour
   * cette table seule aurait créé un mécanisme de plus à connaître, là où
   * la table voisine tient sa promesse autrement.
   */
  it("aucun code ne met à jour ni ne supprime une version", () => {
    const sources = [...fichiers("src", /\.tsx?$/u)];
    const fautifs = sources.filter((f) =>
      /editorialVersion\.(update|updateMany|delete|deleteMany|upsert)\b/u.test(lire(f)),
    );
    expect(fautifs).toEqual([]);
  });

  /** Et la migration dit pourquoi l'immuabilité n'est pas une contrainte. */
  it("la migration dit où tient l'immuabilité", () => {
    const sql = lire("prisma/migrations/20260920000800_historique_des_publications/migration.sql");
    expect(sql).toMatch(/absence d'écrivain/u);
    expect(sql).toContain("version_editoriale_porte_sa_source");
    expect(sql).toContain("version_editoriale_porte_son_motif");
    expect(sql).toContain("version_editoriale_rang_a_partir_de_un");
  });

  /**
   * INV-8 au niveau de la version : les colonnes sont non nulles. Une
   * version qui pourrait s'en passer laisserait croire qu'un document a
   * été public sans source ni date de vérification.
   */
  it("une version porte sa source et sa date, sans exception possible", () => {
    const modele = /model EditorialVersion \{[\s\S]*?\n\}/u.exec(lire("prisma/schema.prisma"))![0];
    expect(modele).toMatch(/sourceLabel String\n/u);
    expect(modele).toMatch(/verifiedAt {2}DateTime\n/u);
    expect(modele).not.toMatch(/sourceLabel String\?/u);
  });
});

describe("restaurer allonge l'histoire au lieu de la réécrire", () => {
  const route = lire(ROUTE);
  const bloc = route.slice(
    route.indexOf('if (corps.action === "restaurer")'),
    route.indexOf("if (!vue.corps)"),
  );

  it("le texte revient sur le document, la version reste où elle est", () => {
    expect(bloc).toContain("db.editorialDoc.update");
    expect(bloc).toContain("champsDeLaVersion(version)");
    expect(bloc).not.toMatch(/editorialVersion\.(update|delete)/u);
  });

  /**
   * Restaurer sur un document publié change ce que le public lit : c'est
   * une publication, et elle crée donc une version de plus. Sur un
   * brouillon, personne ne lit : rien n'est conservé.
   */
  it("sur un document publié, elle crée une version de plus", () => {
    expect(bloc).toMatch(/vue\.etat === "PUBLIE"\s*\?\s*await enregistrerUneVersion/u);
    expect(bloc).toMatch(/: null/u);
  });

  it("le journal dit laquelle a été restaurée, et sous quel rang", () => {
    expect(bloc).toMatch(/restauree: version\.rang/u);
    expect(bloc).toMatch(/\.\.\.\(rang \? \{ version: rang \} : \{\}\)/u);
  });

  /**
   * Un motif est exigé : restaurer écrit en base et se consigne au
   * journal, ce n'est pas un aperçu. Les trois actions partagent la même
   * exigence, et le schéma la porte pour chacune — le rang, lui, n'est
   * demandé qu'à celle qui en a besoin.
   */
  it("elle se motive comme les autres décisions", () => {
    expect(route).toMatch(/const MOTIF = z\.string\(\)\.min\(3\)\.max\(500\)/u);
    const union = /z\.discriminatedUnion\("action", \[[\s\S]*?\]\)/u.exec(route)![0];
    expect([...union.matchAll(/motif: MOTIF/gu)]).toHaveLength(3);
    expect([...union.matchAll(/version: z\.number\(\)/gu)]).toHaveLength(1);
    const ecran = lire("src/app/(admin)/contenus/[id]/EditionContenu.tsx");
    expect(ecran).toContain("raisonDeRestauration");
  });
});

describe("l'administrateur peut relire ce qui était public", () => {
  const ecran = lire("src/app/(admin)/contenus/[id]/EditionContenu.tsx");

  it("l'écran rend l'historique, le texte compris", () => {
    expect(ecran).toContain("Historique des publications");
    expect(ecran).toContain("MENTION_HISTORIQUE");
    expect(ecran).toContain("Relire le texte");
    expect(ecran).toContain("Restaurer cette version");
  });

  /** L'état vide dit quoi faire, il ne promet pas un remplissage futur. */
  it("aucune publication, une phrase qui dit comment en avoir une", () => {
    expect(ecran).toMatch(/Aucune publication pour l&apos;instant\. La première créera la version 1\./u);
  });

  /**
   * Un corps illisible ne se rend pas à moitié, et sa ligne reste : savoir
   * qu'une publication a eu lieu vaut mieux que de ne plus rien savoir
   * d'elle — c'est déjà la règle du document retiré.
   */
  it("une version illisible se dit, et garde sa ligne", () => {
    expect(ecran).toMatch(/ne se relit plus/u);
    const lecture = lire("src/server/lecture/editorial.ts");
    expect(lecture).toMatch(/corps: luVersion\.success \? luVersion\.data : null/u);
  });

  it("la relecture est bornée, et la borne se lit", () => {
    expect(VERSIONS_RELUES).toBe(20);
    expect(lire("src/server/lecture/editorial.ts")).toContain("take: VERSIONS_RELUES");
  });

  /**
   * La mention explique les trois choses qu'on doit savoir avant de
   * cliquer, dont celle qui surprend : on croit revenir à la version 2, on
   * crée la version 5.
   */
  it("la mention dit ce que restaurer veut dire", () => {
    expect(MENTION_HISTORIQUE).toMatch(/brouillon n'en crée aucune/u);
    expect(MENTION_HISTORIQUE).toMatch(/déjà en ligne/u);
    expect(MENTION_HISTORIQUE).toMatch(/nouvelle version/u);
  });

  /**
   * Le motif d'une correction en ligne n'est pas saisi : cette route n'en
   * demande pas, et l'exiger pour corriger une coquille pousserait à ne
   * pas corriger. Il dit donc ce qui s'est passé — ce qui est déjà plus
   * que rien, et ne prétend pas être une justification.
   */
  it("le motif automatique décrit le fait, il ne l'invente pas", () => {
    expect(MOTIF_CORRECTION_EN_LIGNE).toMatch(/déjà publié/u);
    expect(sansCommentaires(MOTIF_CORRECTION_EN_LIGNE)).not.toMatch(/\?/u);
  });
});

/**
 * Deux défauts vus en lisant l'écran plutôt qu'en lisant le code — la
 * section rendait « veilleur-1 · vérifiée le 2026-09-01 ».
 */
describe("l'historique se lit, et pas seulement se stocke", () => {
  const lecture = lire("src/server/lecture/editorial.ts");

  /**
   * La table garde l'identifiant, durable comme dans le journal d'audit :
   * une adresse change, un identifiant non. Mais une colonne d'UUID ne
   * nomme personne, et un historique qu'on consulte doit nommer
   * quelqu'un.
   *
   * **Ce test affirmait un repli qui n'existait pas.** Il exigeait
   * `auteurs.get(...) ?? v.publishedBy`, en expliquant qu'un compte
   * supprimé retomberait sur son identifiant. Il ne retombait pas :
   * RG-10.4 anonymise l'adresse sans supprimer la ligne, donc `get`
   * rendait `supprime-x7k2@…`. Le repli ne servait que le cas où la
   * ligne manque vraiment, et il y affichait une clé primaire en guise
   * de nom. Les deux cas ont maintenant chacun leur libellé (arbitrage
   * du 21/09/2026), et c'est la même convention qu'en B-06.
   */
  it("l'auteur se lit par son nom, et chaque échec dit lequel", () => {
    expect(lecture).toMatch(
      /par: acteurLisible\(v\.publishedBy, auteurs\.get\(v\.publishedBy\) \?\? null\)/u,
    );
    // Le compte est lu avec ce qu'il faut pour distinguer les deux replis.
    expect(lecture).toMatch(/deletedAt: true/u);
    // Et la table, elle, conserve bien l'identifiant.
    const acces = lire(ACCES);
    expect(acces).toMatch(/publishedBy: publication\.par/u);
  });

  /** Une date en français, comme partout ailleurs dans le produit. */
  it("la date de vérification ne s'affiche pas en ISO", () => {
    expect(lecture).toMatch(/verifieeLe: jourEnFrancais\(v\.verifiedAt/u);
  });
});
