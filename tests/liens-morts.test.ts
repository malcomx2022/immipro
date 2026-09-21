import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Aucun lien interne ne mène nulle part.
 *
 * Écrit après avoir trouvé quatre boutons morts, tous découverts en
 * cliquant : « Télécharger mes données » renvoyait sur son propre écran,
 * « Télécharger mon dossier » sur une adresse en 404 juste avant une purge
 * irréversible, et « Ouvrir ma checklist » sur une adresse en 404 juste
 * après un paiement. Aucun test ne les voyait, parce qu'un `href` est une
 * chaîne et qu'une chaîne compile.
 *
 * Le test lit les écrans **comme un texte** — même garde-fou de dérive que
 * `schema-domaine` et `api-invariants` — et vérifie que chaque adresse
 * littérale correspond à une page de l'App Router. Il ne peut rien dire des
 * adresses construites par interpolation ; c'est la limite, et elle est
 * assumée : un `href={`/dossiers/${id}`}` a au moins un segment vérifié par
 * le typage des paramètres, une chaîne entière n'en a aucun.
 */
function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

/**
 * Adresses servies, déduites de l'arborescence. Les groupes de routes —
 * `(app)`, `(auth)` — n'ajoutent pas de segment ; les segments dynamiques
 * deviennent un joker.
 */
const ROUTES = fichiers("src/app", /^page\.tsx$/u).map((f) =>
  f
    .replace(/^src\/app/u, "")
    .replace(/\/page\.tsx$/u, "")
    .replace(/\/\([^/]*\)/gu, "")
    .replace(/\[[^\]]+\]/gu, "*")
    .replace(/^$/u, "/"),
);

const sert = (adresse: string): boolean =>
  ROUTES.some((motif) => {
    const segmentsMotif = motif.split("/").filter(Boolean);
    const segments = adresse.split("/").filter(Boolean);
    if (segmentsMotif.length !== segments.length) return false;
    return segmentsMotif.every((m, i) => m === "*" || m === segments[i]);
  });

const ECRANS = [
  ...fichiers("src/app", /\.tsx$/u),
  ...fichiers("src/components", /\.tsx$/u),
];

/**
 * Les adresses littérales d'un écran, ancres et requêtes ôtées.
 *
 * Deux formes, et la seconde manquait — c'est ce qui a laissé passer neuf
 * liens morts dans l'en-tête et le pied de page, c'est-à-dire sur **toutes**
 * les pages publiques :
 *
 * - `href="/tarifs"`, l'attribut JSX ;
 * - `{ href: "/tarifs", libelle: "Tarifs" }`, la donnée qu'un `.map()`
 *   transforme ensuite en attribut.
 *
 * La première version ne voyait que l'attribut. Or une barre de navigation
 * ne s'écrit jamais autrement qu'en table : le test regardait partout sauf
 * là où les liens se rassemblent.
 */
function adressesDe(fichier: string): string[] {
  const source = readFileSync(fichier, "utf8");
  const trouvees = [
    ...source.matchAll(/href="(\/[^"]*)"/gu),
    ...source.matchAll(/href:\s*"(\/[^"]*)"/gu),
  ];
  return [...trouvees].map((m) => m[1]!.split("#")[0]!.split("?")[0]!);
}

describe("aucun lien interne ne mène nulle part", () => {
  it("l'arborescence des routes est lue", () => {
    expect(ROUTES.length).toBeGreaterThan(20);
    expect(ROUTES).toContain("/tableau-de-bord");
    expect(ROUTES).toContain("/dossiers/*/archive");
  });

  const liens = ECRANS.flatMap((f) => adressesDe(f).map((a) => [f, a] as const));

  it("il y a des liens à vérifier", () => {
    expect(liens.length).toBeGreaterThan(10);
  });

  /**
   * Le lien qui ne mène nulle part sans en avoir l'air — S.10.
   *
   * Le critère ne regardait que les adresses commençant par `/`. Un
   * `href="#"` est pourtant une commande morte de plus, de la même famille
   * que le bouton sans `onClick` : il a l'apparence d'un lien, le curseur
   * d'un lien, et ne fait rien. Trouvé en éprouvant par mutation le retrait
   * du bouton de l'annuaire — la mutation qui le remplaçait par un
   * `LienBouton href="#"` passait au vert.
   *
   * Le dépôt n'en contient aucun, et ce test le maintient ainsi.
   */
  it("aucun lien ne pointe sur une ancre vide ou sur rien", () => {
    const morts = ECRANS.flatMap((fichier) => {
      const source = readFileSync(fichier, "utf8");
      return [...source.matchAll(/href=(?:"(#?)"|\{"(#)"\})/gu)].map(
        () => fichier,
      );
    });
    expect(morts).toEqual([]);
  });

  it.each(liens)("%s → %s est servi", (_fichier, adresse) => {
    expect(sert(adresse), `${adresse} n'a pas de page`).toBe(true);
  });

  /**
   * Une porte close est un troisième genre de lien mort : l'adresse est
   * servie, mais derrière une garde. Le pied de page a longtemps proposé
   * « Consultants partenaires » à des visiteurs anonymes, que l'écran
   * renvoyait à la connexion sans dire pourquoi.
   *
   * La garde vit dans le gabarit, jamais dans la page : un lien public qui
   * entre dans `(app)` ou `(auth)` mène donc à un mur, et ce test le
   * refuse. Les deux exceptions sont les portes elles-mêmes — s'inscrire et
   * se connecter, qui sont l'endroit où l'on franchit le mur.
   */
  it("aucun écran public ne mène derrière une garde sans le dire", () => {
    const PORTES = ["/inscription", "/connexion", "/mot-de-passe"];
    const gardees = fichiers("src/app", /^page\.tsx$/u)
      .filter((f) => /\/\((app|auth|admin)\)\//u.test(f))
      .map((f) =>
        f
          .replace(/^src\/app/u, "")
          .replace(/\/page\.tsx$/u, "")
          .replace(/\/\([^/]*\)/gu, "")
          .replace(/\[[^\]]+\]/gu, "*"),
      );
    const sousGarde = (adresse: string) =>
      gardees.some((motif) => {
        const sm = motif.split("/").filter(Boolean);
        const sa = adresse.split("/").filter(Boolean);
        return sm.length === sa.length && sm.every((m, i) => m === "*" || m === sa[i]);
      });

    const murs = fichiers("src/app/(public)", /\.tsx$/u)
      .concat(["src/components/layout/Header.tsx", "src/components/layout/Footer.tsx"])
      .flatMap((fichier) =>
        adressesDe(fichier)
          .filter((a) => !PORTES.includes(a) && sousGarde(a))
          .map((a) => `${fichier} → ${a}`),
      );
    expect(murs).toEqual([]);
  });

  /**
   * Un lien qui pointe sur l'écran où il se trouve est mort d'une autre
   * façon : il est servi, et il ne fait rien. C'est ainsi que
   * « Télécharger mes données » a vécu deux lots sur A-05.
   */
  it("aucun lien ne renvoie à l'écran qui le porte", () => {
    const boucles = ECRANS.flatMap((fichier) => {
      const chemin = fichier
        .replace(/^src\/app/u, "")
        .replace(/\/[^/]+\.tsx$/u, "")
        .replace(/\/\([^/]*\)/gu, "");
      if (!fichier.startsWith("src/app/") || chemin.includes("[")) return [];
      return adressesDe(fichier)
        .filter((a) => a === chemin && a !== "/")
        .map((a) => `${fichier} → ${a}`);
    });
    expect(boucles).toEqual([]);
  });
});
