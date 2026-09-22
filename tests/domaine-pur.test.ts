import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * « `src/domain/` ne connaît ni Prisma, ni Next, ni le réseau. »
 *
 * C'est la première règle d'architecture de `CLAUDE.md`, et **rien ne la
 * tenait**. Elle s'est respectée jusqu'ici parce qu'on la relisait, ce
 * qui est exactement la forme de garde que ce dépôt remplace lot après
 * lot : une règle vraie tant que personne ne se trompe.
 *
 * Elle a failli céder dans ce lot même. `domain/redaction/commande.ts` a
 * d'abord importé ses types depuis `server/redaction/redacteur.ts` — des
 * formes de données, sans rien de serveur, et c'était pourtant
 * l'inversion que la règle interdit : le domaine aurait dépendu de la
 * couche qui l'appelle, et l'aurait entraînée dans ses tests.
 *
 * Ce que la règle protège n'est pas une élégance. Un domaine qui
 * n'importe ni Prisma ni Next se teste sans base, sans serveur et sans
 * réseau — c'est ce qui rend les 1 900 tests de ce dépôt rapides au
 * point qu'on les lance à chaque édition.
 */

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

/** Les imports d'un fichier, sans les commentaires qui pourraient en citer. */
function importsDe(source: string): string[] {
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^[ \t]*\/\/.*$/gmu, "");
  return [...sansCommentaires.matchAll(/(?:from|import)\s+["']([^"']+)["']/gu)].map(
    (m) => m[1]!,
  );
}

const MODULES_DU_DOMAINE = fichiers("src/domain");

describe("le domaine ne connaît ni Prisma, ni Next, ni le réseau", () => {
  it("couvre bien tout le domaine", () => {
    // Une garde qui ne lirait aucun fichier passerait toujours.
    expect(MODULES_DU_DOMAINE.length).toBeGreaterThan(30);
  });

  /**
   * Prisma d'abord : c'est l'import qui coûte le plus cher. Un type
   * `@prisma/client` dans le domaine y fait entrer le client généré, donc
   * une variable d'environnement et une connexion, dans des modules que
   * le simulateur public charge.
   */
  it("n'importe pas Prisma", () => {
    const fautifs = MODULES_DU_DOMAINE.filter((f) =>
      importsDe(readFileSync(f, "utf8")).some((i) => i.startsWith("@prisma/")),
    );
    expect(fautifs).toEqual([]);
  });

  it("n'importe ni Next ni React", () => {
    const fautifs = MODULES_DU_DOMAINE.filter((f) =>
      importsDe(readFileSync(f, "utf8")).some(
        (i) => i === "react" || i.startsWith("next/") || i === "next",
      ),
    );
    expect(fautifs).toEqual([]);
  });

  /**
   * Et il ne remonte pas dans la couche qui l'appelle.
   *
   * `@/server`, `@/app`, `@/lib` : les trois sont en aval. Un import
   * vers l'un d'eux retourne la dépendance, et fait entrer par la porte
   * de derrière ce que les deux règles précédentes ferment — `@/lib/db`
   * est Prisma, `@/lib/storage` est le réseau.
   */
  it("ne remonte pas vers le serveur, l'application ou les bibliothèques", () => {
    const fautifs = MODULES_DU_DOMAINE.flatMap((f) => {
      const interdits = importsDe(readFileSync(f, "utf8")).filter((i) =>
        /^@\/(server|app|lib|components)\//u.test(i),
      );
      return interdits.map((i) => `${f} → ${i}`);
    });
    expect(fautifs).toEqual([]);
  });

  /** Aucun appel réseau, sous aucune de ses formes. */
  it("n'appelle pas le réseau", () => {
    const fautifs = MODULES_DU_DOMAINE.filter((f) => {
      const source = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/^[ \t]*\/\/.*$/gmu, "");
      return /\bfetch\s*\(|\bXMLHttpRequest\b|from ["']node:(http|https|net)["']/u.test(source);
    });
    expect(fautifs).toEqual([]);
  });
});
