import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ORIGINE_LOCALE,
  PAGES_STABLES,
  adresseAbsolue,
  origineDuSite,
} from "@/domain/exploitation/plan-du-site";

/**
 * Q.B — le pied de page reste stable, et les liens profonds sont assurés
 * ailleurs. Fermé sans liens dynamiques pour la V1, le 20/09/2026.
 *
 * Le pied de page nommait trois destinations tirées du registre éditorial,
 * qui connaît les slugs mais pas ce qui est publié : « Émirats arabes
 * unis » menait à une fiche en 404, sur chaque écran public. Les lire en
 * base aurait rendu dynamiques toutes les pages du gabarit — le
 * simulateur et les tarifs compris, qui n'ont aucune raison de l'être.
 *
 * Ce qui se vérifie ici tient en deux moitiés : que le pied de page reste
 * sans données, et que les trois mécanismes sur lesquels la décision
 * s'appuie existent réellement.
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

describe("le pied de page reste sans données", () => {
  const pied = lire("src/components/layout/Footer.tsx");

  /**
   * Le composant est partagé par toutes les pages publiques : le rendre
   * asynchrone ou lui faire lire la base les rendrait toutes dynamiques
   * d'un coup. C'est le coût exact que Q.B refuse, et il se paierait sans
   * qu'aucune page ne change de fichier.
   */
  it("il n'est pas asynchrone et ne lit rien", () => {
    expect(pied).not.toMatch(/export async function Footer|async function Footer/u);
    expect(pied).not.toMatch(/@\/server\/|@\/lib\/db|prisma/u);
  });

  /**
   * Et il n'énumère aucune destination, ni depuis un registre — la faute
   * d'origine — ni en dur, qui la recréerait à l'identique : une liste
   * figée ne sait pas ce qui est publié.
   */
  it("il ne nomme aucune destination, ni lue ni codée en dur", () => {
    expect(pied).not.toMatch(/EDITORIAL/u);
    expect(pied).not.toMatch(/\/destinations\/[a-z]/u);
  });

  /** Ce qu'il promet à la place : le catalogue, qui lit la base pour lui. */
  it("il mène au catalogue, qui est la réponse stable", () => {
    expect(pied).toMatch(/href: "\/destinations"/u);
  });

  /**
   * Les pages du gabarit restent statiques. `force-dynamic` n'y apparaît
   * que là où une page lit la base sans segment dynamique — jamais parce
   * qu'un composant partagé l'a contaminée.
   */
  it("le simulateur et les tarifs n'ont aucune raison d'être dynamiques", () => {
    /**
     * Ces deux-là ne lisent rien. L'accueil, lui, est bien dynamique, et
     * pour sa propre raison — il liste les fiches publiées, qu'une
     * dépublication doit pouvoir vider en minutes. Ce que Q.B refuse
     * n'est pas qu'une page soit dynamique quand elle lit la base, c'est
     * qu'un composant partagé rende dynamiques celles qui ne lisent rien.
     * Vérifié en le lisant, après l'avoir supposé statique à tort.
     */
    for (const page of [
      "src/app/(public)/simulateur/page.tsx",
      "src/app/(public)/tarifs/page.tsx",
    ]) {
      expect(lire(page), page).not.toMatch(/force-dynamic/u);
    }
  });
});

describe("les liens profonds sont assurés ailleurs, et vérifiablement", () => {
  /**
   * La décision nomme trois mécanismes : le catalogue, les pages
   * éditoriales, et le plan du site. Les deux premiers existaient ; le
   * troisième, non — la justification reposait sur un mécanisme absent,
   * et `adressesPubliees`, écrite pour lui, n'était appelée par personne.
   */
  it("les trois mécanismes existent", () => {
    for (const page of [
      "src/app/(public)/destinations/page.tsx",
      "src/app/(public)/guides/page.tsx",
      "src/app/(public)/articles/page.tsx",
      "src/app/sitemap.ts",
    ]) {
      expect(() => lire(page), page).not.toThrow();
    }
  });

  it("le plan du site donne enfin un lecteur à ce qui l'attendait", () => {
    const plan = lire("src/app/sitemap.ts");
    expect(plan).toContain("adressesPubliees");
    expect(plan).toContain("fichesPubliees");
  });

  /**
   * **Le piège que Q.5 a déjà documenté.** Un plan du site n'a pas de
   * segment dynamique : Next le pré-rend au build, et le build tourne
   * sans base de données (J.8). Sans `force-dynamic`, la construction
   * échoue — exactement comme pour les trois pages d'index.
   */
  it("il est rendu à la demande, sinon la construction échoue", () => {
    expect(lire("src/app/sitemap.ts")).toMatch(/export const dynamic = "force-dynamic"/u);
  });

  /**
   * Rien qui ne soit publié. Un plan du site est lu par des moteurs : y
   * faire figurer une fiche en brouillon la ferait indexer avant qu'elle
   * existe — la version automatisée du défaut trouvé dans le pied de page.
   */
  it("il ne liste que du publié, et le filtrage est en amont", () => {
    const plan = lire("src/app/sitemap.ts");
    expect(plan).not.toMatch(/db\.|findMany|status: "BROUILLON"/u);
    // Les deux lectures portent « publiées » dans leur nom, et c'est elles
    // qui filtrent en requête (INV-4, même esprit).
    expect(plan).toMatch(/fichesPubliees\(\)/u);
    expect(plan).toMatch(/adressesPubliees\("GUIDE"\)/u);
  });

  /**
   * Et il n'annonce aucune page privée. La liste des pages stables est
   * écrite, pas déduite : `src/app` contient aussi les écrans derrière la
   * garde candidat et tout le back-office, et une déduction inviterait les
   * moteurs sur des murs de connexion — elle inclurait par défaut.
   */
  it("aucune page annoncée ne mène derrière une garde", () => {
    const publiques = fichiers("src/app/(public)", /^page\.tsx$/u).map((f) =>
      f
        .replace(/^src\/app/u, "")
        .replace(/\/page\.tsx$/u, "")
        .replace(/\/\([^/]*\)/gu, "")
        .replace(/^$/u, "/"),
    );
    for (const adresse of PAGES_STABLES) {
      expect(publiques, adresse).toContain(adresse);
    }
  });
});

describe("une adresse de plan du site est absolue", () => {
  /** Un moteur ne sait pas quoi faire d'un chemin. */
  it("elle porte son origine", () => {
    expect(adresseAbsolue("https://immipro.test", "/tarifs")).toBe("https://immipro.test/tarifs");
  });

  /**
   * `https://site.test` et `https://site.test/` sont deux adresses pour un
   * moteur : la racine s'annonce avec sa barre, et une origine qui en
   * porte une déjà n'en produit pas deux.
   */
  it("la racine garde sa barre, et n'en prend pas deux", () => {
    expect(adresseAbsolue("https://immipro.test", "/")).toBe("https://immipro.test/");
    expect(adresseAbsolue("https://immipro.test/", "/")).toBe("https://immipro.test/");
    expect(adresseAbsolue("https://immipro.test/", "/tarifs")).toBe("https://immipro.test/tarifs");
  });

  /** Le domaine ne lit pas l'environnement : l'origine lui est passée. */
  it("l'origine vient de la route, pas du domaine", () => {
    expect(lire("src/domain/exploitation/plan-du-site.ts")).not.toMatch(/process\.env/u);
    expect(lire("src/app/sitemap.ts")).toMatch(/process\.env\.APP_URL/u);
  });
});

describe("metadataBase — l'origine vient d'APP_URL, avec un repli local sûr", () => {
  it("une origine valide est gardée, sans chemin ni requête", () => {
    expect(origineDuSite("https://immipro.test").href).toBe("https://immipro.test/");
    expect(origineDuSite(" https://immipro.test/app?x=1 ").href).toBe("https://immipro.test/");
    expect(origineDuSite("http://localhost:4000").href).toBe("http://localhost:4000/");
  });

  it("absente, vide, relative ou d'un autre protocole : le repli local", () => {
    for (const valeur of [undefined, "", "   ", "immipro.test", "/chemin", "ftp://immipro.test", "javascript:alert(1)"]) {
      expect(origineDuSite(valeur).href, String(valeur)).toBe(`${ORIGINE_LOCALE}/`);
    }
  });

  it("le gabarit racine et le plan du site lisent la même origine", () => {
    const racine = lire("src/app/layout.tsx");
    expect(racine).toMatch(/metadataBase: origineDuSite\(process\.env\.APP_URL\)/u);
    expect(lire("src/app/sitemap.ts")).toMatch(/origineDuSite\(process\.env\.APP_URL\)\.origin/u);
  });
});

describe("« Comment ça marche » — le parcours implémenté, périmètre V1", () => {
  const page = lire("src/app/(public)/comment-ca-marche/page.tsx");

  it("elle est au plan du site et au pied de page", () => {
    expect(PAGES_STABLES).toContain("/comment-ca-marche");
    expect(lire("src/components/layout/Footer.tsx")).toMatch(/href: "\/comment-ca-marche"/u);
  });

  it("elle porte ses métadonnées et un titre atteignable par le lien d'évitement", () => {
    expect(page).toMatch(/export const metadata: Metadata = \{\s*title: "Comment ça marche"/u);
    expect(page).toMatch(/id="contenu"\s*tabIndex=\{-1\}/u);
    expect(page).toMatch(/<ol/u);
  });

  /** Ses nombres sont ceux que le produit applique, lus et non recopiés. */
  it("aucun nombre du parcours n'est recopié", () => {
    for (const constante of [
      "ANALYSES_AJOUTEES",
      "DELAIS_D_ALERTE",
      "JALONS_DE_SUIVI",
      "CONSERVATION_SOUMIS_MOIS",
      "PROLONGATION_MOIS",
      "PURGE_JOURS",
      "PACKS",
    ]) {
      expect(page, constante).toMatch(new RegExp(`import \\{[^}]*\\b${constante}\\b`, "u"));
    }
    const textes = page.slice(page.indexOf("const ETAPES"), page.indexOf("export default"));
    expect(textes).not.toMatch(/\b(?:10|20|30|60|12|6|90)\b(?! ?\})/u);
  });

  it("rien de ce qui est hors V1 n'y est promis", () => {
    const textes = page.slice(page.indexOf("const ETAPES"));
    expect(textes).not.toMatch(/Google|SMS|partenaire/iu);
    expect(textes).not.toMatch(/passage[^.]*Pro/u);
  });
});
