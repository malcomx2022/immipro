import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LIBELLE_ETAT,
  MENTION_SUITE,
  MOTS_PAR_MINUTE,
  corpsSchema,
  dureeLecture,
  estPublic,
  messageDeRefusEditorial,
  publiable,
  slugDe,
  sommaireDe,
  textesDuDocument,
  verifierLeDocument,
  DATE_AFFICHEE,
  RUBRIQUE_VIDE,
  dateDeLaRubrique,
  ordonner,
  type Bloc,
  type Corps,
  type EnTete,
} from "@/domain/editorial/document";
import { NAVIGATION_ADMIN } from "@/domain/backoffice/navigation";
import { ECHECS } from "@/server/http/echecs";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * Le code sans ses commentaires. Ceux du projet citent volontiers ce qu'ils
 * remplacent — « `generateStaticParams` ne peut plus rien énumérer » — et
 * viser le mot plutôt que le code ferait échouer la bonne explication.
 */
const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

const APPEL = {
  titre: "Voir si les Pays-Bas te correspondent",
  texte: "Six questions, aucun compte à créer.",
  action: "Lancer le simulateur",
  href: "/simulateur",
};

const corps = (blocs: Bloc[]): Corps => ({ blocs, appel: APPEL });

/**
 * Back-office de publication — J.C, B-08.
 *
 * Deux écrans publics lisaient un fichier du dépôt. Ce qui se vérifie ici,
 * c'est d'abord le point d'application que `CLAUDE.md` annonçait et qui
 * n'existait pas : un guide pays passe la même liste qu'un développeur.
 */
describe("le troisième point d'application du vocabulaire interdit", () => {
  it("une promesse dans un guide bloque sa publication", () => {
    // `CLAUDE.md` : « un administrateur qui saisit une promesse dans un
    // guide pays bute sur la même règle qu'un développeur, et sa
    // publication est bloquée tant que la formulation est refusée. »
    const document = { titre: "Étudier aux Pays-Bas", chapeau: "Ce que coûte l'année." };
    const avecPromesse = corps([
      { type: "paragraphe", texte: "Avec ce guide, ton visa est garanti." },
    ]);
    expect(publiable(document, avecPromesse)).toBe(false);
    const fautes = verifierLeDocument(document, avecPromesse);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]?.chemin).toBe("Bloc 1");
  });

  it("la négation reste reconnue, ici comme ailleurs", () => {
    // C'est exactement la phrase qu'un guide doit pouvoir écrire.
    const document = { titre: "Guide", chapeau: "Chapeau." };
    const negation = corps([
      {
        type: "paragraphe",
        texte: "ImmiPro ne garantit pas l'obtention du visa : la décision appartient à l'autorité.",
      },
    ]);
    expect(verifierLeDocument(document, negation)).toEqual([]);
  });

  it("aucun texte visible n'échappe à la liste", () => {
    // Titre, chapeau, chaque bloc, chaque item, et les trois champs de
    // l'appel à l'action : un seul oubli rouvre le trou.
    const textes = textesDuDocument(
      { titre: "T", chapeau: "C" },
      corps([
        { type: "encadre", titre: "ET", texte: "EC" },
        { type: "liste", items: ["I1", "I2"] },
        { type: "citation", texte: "CI" },
      ]),
    );
    expect(textes.map((t) => t.texte).sort()).toEqual(
      [
        "C",
        "CI",
        "EC",
        "ET",
        "I1",
        "I2",
        "Lancer le simulateur",
        "Six questions, aucun compte à créer.",
        "T",
        "Voir si les Pays-Bas te correspondent",
      ].sort(),
    );
  });

  it("le refus cite la formulation et dit où la corriger", () => {
    const fautes = verifierLeDocument(
      { titre: "Guide", chapeau: "Nos chances d'obtention sont élevées." },
      corps([{ type: "paragraphe", texte: "Texte." }]),
    );
    const message = messageDeRefusEditorial(fautes[0]!);
    expect(message).toMatch(/Reformule « Chapeau »/u);
    expect(message).toMatch(/chances d'obtention/u);
  });
});

describe("ce qui se dérive, et ne se saisit donc pas", () => {
  it("le sommaire suit les intertitres", () => {
    // Il était saisi à côté d'eux, et un test surveillait la duplication.
    // La classe de défaut disparaît avec le champ.
    const blocs: Bloc[] = [
      { type: "paragraphe", texte: "Chapô." },
      { type: "intertitre", texte: "Le budget réel" },
      { type: "paragraphe", texte: "Détail." },
      { type: "intertitre", texte: "Les bourses" },
    ];
    expect(sommaireDe(blocs)).toEqual(["Le budget réel", "Les bourses"]);
  });

  it("une entrée de sommaire sans section est désormais impossible", () => {
    // Le prototype annonçait « Le permis de recherche d'emploi », section
    // que le corps ne contenait pas : un lien mort au sommaire.
    const blocs: Bloc[] = [{ type: "paragraphe", texte: "Sans intertitre." }];
    expect(sommaireDe(blocs)).toEqual([]);
  });

  it("la durée de lecture se compte, et ne vaut jamais zéro", () => {
    const court: Bloc[] = [{ type: "paragraphe", texte: "Trois mots seulement." }];
    expect(dureeLecture(court)).toBe("1 min");
    const long: Bloc[] = [
      { type: "paragraphe", texte: Array.from({ length: MOTS_PAR_MINUTE * 6 }, () => "mot").join(" ") },
    ];
    expect(dureeLecture(long)).toBe("6 min");
  });

  it("la durée compte aussi les listes et les encadrés", () => {
    const avec: Bloc[] = [
      { type: "liste", items: [Array.from({ length: 400 }, () => "mot").join(" ")] },
    ];
    expect(dureeLecture(avec)).toBe("2 min");
  });

  it("la mention finale ne se saisit pas : elle suit le genre (INV-1)", () => {
    expect(MENTION_SUITE.GUIDE).toMatch(/ne constitue pas un conseil juridique/u);
    expect(MENTION_SUITE.ARTICLE).toMatch(/ne constitue pas un conseil juridique/u);
    expect(MENTION_SUITE.GUIDE).not.toBe(MENTION_SUITE.ARTICLE);
  });
});

describe("l'ordre d'une rubrique — P.A", () => {
  const entete = (o: Partial<EnTete>): EnTete => ({
    genre: "GUIDE",
    slug: "s",
    titre: "T",
    chapeau: "C",
    surtitre: "Pays",
    dureeLecture: "3 min",
    verifieeLe: "2026-01-01",
    publieLe: "2026-01-01",
    ...o,
  });

  it("les articles vont du plus récent au plus ancien", () => {
    // Un article est daté : un texte de l'an dernier sur une règle qui a
    // changé depuis n'est pas ce qu'on veut lire en premier.
    const liste = [
      entete({ genre: "ARTICLE", slug: "vieux", publieLe: "2025-03-02" }),
      entete({ genre: "ARTICLE", slug: "recent", publieLe: "2026-09-11" }),
      entete({ genre: "ARTICLE", slug: "milieu", publieLe: "2026-01-20" }),
    ];
    expect(ordonner(liste, "ARTICLE").map((e) => e.slug)).toEqual([
      "recent",
      "milieu",
      "vieux",
    ]);
  });

  it("les guides vont par pays, pas par date", () => {
    // Celui qu'on cherche est celui où l'on veut aller, pas le dernier
    // écrit. Classer par date mettrait en tête celui qu'on a eu le temps
    // de rédiger, ce qui n'est une information sur rien.
    const liste = [
      entete({ slug: "suisse", surtitre: "Suisse", publieLe: "2026-09-11" }),
      entete({ slug: "pays-bas", surtitre: "Pays-Bas", publieLe: "2025-01-01" }),
      entete({ slug: "emirats", surtitre: "Émirats arabes unis", publieLe: "2026-05-05" }),
    ];
    expect(ordonner(liste, "GUIDE").map((e) => e.slug)).toEqual([
      "emirats",
      "pays-bas",
      "suisse",
    ]);
  });

  it("l'ordre alphabétique est celui du français", () => {
    // « Émirats » se range à É, pas après « Suisse » comme le ferait une
    // comparaison de codes.
    const liste = [
      entete({ slug: "s", surtitre: "Suisse" }),
      entete({ slug: "e", surtitre: "Émirats arabes unis" }),
    ];
    expect(ordonner(liste, "GUIDE")[0]?.slug).toBe("e");
  });

  it("un guide porte sa date de vérification, un article sa parution", () => {
    // Un guide écrit il y a deux ans mais revérifié le mois dernier vaut
    // mieux qu'un guide publié le mois dernier et jamais relu depuis.
    const guide = entete({ verifieeLe: "2026-09-11", publieLe: "2024-02-02" });
    expect(dateDeLaRubrique(guide)).toBe("2026-09-11");
    expect(DATE_AFFICHEE.GUIDE.libelle).toBe("Vérifié le");

    const article = entete({ genre: "ARTICLE", verifieeLe: "2026-09-11", publieLe: "2024-02-02" });
    expect(dateDeLaRubrique(article)).toBe("2024-02-02");
    expect(DATE_AFFICHEE.ARTICLE.libelle).toBe("Publié le");
  });

  it("le tri ne modifie pas la liste reçue", () => {
    const liste = [entete({ slug: "b", surtitre: "B" }), entete({ slug: "a", surtitre: "A" })];
    ordonner(liste, "GUIDE");
    expect(liste.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("une rubrique vide ne se présente pas comme une panne", () => {
    expect(RUBRIQUE_VIDE.GUIDE).not.toMatch(/erreur|indisponible|panne/iu);
    expect(RUBRIQUE_VIDE.ARTICLE).not.toMatch(/erreur|indisponible|panne/iu);
  });
});

describe("les index de rubrique", () => {
  it("l'en-tête et le pied de page ne promettent plus de 404", () => {
    // Neuf adresses mortes sur toutes les pages publiques, depuis le
    // premier lot. Le test des liens morts ne lisait que les attributs
    // `href="…"`, jamais les tables de liens.
    const liens = lire("tests/liens-morts.test.ts");
    expect(liens).toMatch(/href:\\s\*"/u);
  });

  it("les trois index se rendent à la demande, et le build reste sans base", () => {
    // Une page d'index n'a pas de paramètre dynamique : Next la pré-rend
    // au build, où il n'y a pas de base (J.8), et la construction échoue.
    // Les pages de document, elles, gardent leur cache — leur paramètre
    // n'est énumérable par rien.
    for (const page of [
      "src/app/(public)/guides/page.tsx",
      "src/app/(public)/articles/page.tsx",
      "src/app/(public)/destinations/page.tsx",
    ]) {
      const source = sansCommentaires(lire(page));
      expect(source).toMatch(/export const dynamic = "force-dynamic"/u);
      expect(source).not.toMatch(/generateStaticParams/u);
    }
    for (const page of [
      "src/app/(public)/guides/[pays]/page.tsx",
      "src/app/(public)/articles/[slug]/page.tsx",
    ]) {
      expect(lire(page)).toMatch(/export const revalidate = 3600/u);
    }
  });

  it("tout ce qui change la page publique l'invalide", () => {
    // Oublier l'index laisserait un guide publié invisible une heure
    // depuis la page qui existe pour le trouver.
    //
    // Le compte n'est plus une constante à retenir : il suivait le nombre
    // de chemins, et P.B en a ajouté un — la restauration change aussi ce
    // que le public lit. Ce qui se vérifie est la règle, pas le total :
    // chaque branche qui touche au texte public invalide le cache.
    const route = lire("src/app/api/admin/contenus/[id]/route.ts");
    expect(route).toMatch(/revalidatePath\(CHEMIN\[genre\]\)/u);
    for (const branche of [
      // Enregistrement d'un document déjà publié.
      /document\.status === "PUBLIE"[\s\S]*?revalider\(/u,
      // Retrait.
      /status: "RETIRE"[\s\S]*?revalider\(/u,
      // Restauration d'une version sur un document publié.
      /action === "restaurer"[\s\S]*?revalider\(/u,
      // Publication.
      /motif: `Publication —[\s\S]*?revalider\(/u,
    ]) {
      expect(route, String(branche)).toMatch(branche);
    }
  });

  it("le pied de page n'énumère plus de destinations", () => {
    // Il en nommait trois, tirées du registre éditorial, qui connaît les
    // slugs mais pas ce qui est publié : « Émirats arabes unis » menait à
    // une fiche en 404, sur chaque écran public. Aucun test statique ne
    // peut voir cet état de base — mais la cause, oui : une liste figée
    // dans un composant partagé.
    const pied = lire("src/components/layout/Footer.tsx");
    expect(pied).not.toMatch(/EDITORIAL/u);
    expect(pied).not.toMatch(/\/destinations\/\$\{/u);
    expect(pied).toMatch(/href: "\/destinations"/u);
  });

  it("le catalogue des destinations n'est pas le classement du simulateur", () => {
    // P-02 liste ce qui est couvert ; P-03 classe selon des réponses.
    const catalogue = sansCommentaires(lire("src/app/(public)/destinations/page.tsx"));
    expect(catalogue).toMatch(/fichesPubliees/u);
    expect(catalogue).not.toMatch(/CLASSEMENT|Resultats|classement/u);
  });
});

describe("l'adresse publique", () => {
  it("se dérive du titre, sans accent ni ponctuation", () => {
    expect(slugDe("Étudier aux Pays-Bas depuis le Bénin")).toBe(
      "etudier-aux-pays-bas-depuis-le-benin",
    );
    expect(slugDe("  Relevé bancaire : 4 mois ?  ")).toBe("releve-bancaire-4-mois");
  });

  it("ne produit jamais de tiret en tête ou en queue", () => {
    for (const titre of ["— Guide —", "??!", "  a  "]) {
      const slug = slugDe(titre);
      expect(slug).not.toMatch(/^-|-$/u);
    }
  });

  it("la base refuse une adresse que le slug ne produirait pas", () => {
    const migration = lire(
      "prisma/migrations/20260920000300_backoffice_publication/migration.sql",
    );
    expect(migration).toMatch(/editorial_adresse_publique_lisible/u);
  });
});

describe("ce que la base refuse", () => {
  const migration = lire(
    "prisma/migrations/20260920000300_backoffice_publication/migration.sql",
  );

  it("une publication sans source ni date (INV-8)", () => {
    expect(migration).toMatch(/editorial_publie_porte_sa_source/u);
    expect(migration).toMatch(/"sourceLabel" IS NOT NULL/u);
    expect(migration).toMatch(/"verifiedAt" IS NOT NULL/u);
  });

  it("un brouillon daté, ou un publié sans date", () => {
    expect(migration).toMatch(/editorial_date_de_publication_suit_l_etat/u);
  });

  it("un guide sans pays, un article sans rubrique ni auteur", () => {
    expect(migration).toMatch(/editorial_guide_nomme_son_pays/u);
    expect(migration).toMatch(/editorial_article_nomme_sa_rubrique_et_son_auteur/u);
  });
});

describe("ce que le public voit", () => {
  it("seul un document publié est servi, et le filtre est en requête", () => {
    expect(estPublic("PUBLIE")).toBe(true);
    expect(estPublic("BROUILLON")).toBe(false);
    expect(estPublic("RETIRE")).toBe(false);
    const lecture = lire("src/server/lecture/editorial.ts");
    expect(lecture).toMatch(/where: \{ kind: genre, slug, status: "PUBLIE" \}/u);
  });

  it("le build n'exige plus de base de données (J.8)", () => {
    // Le contenu vient du back-office : `generateStaticParams` ne peut
    // plus rien énumérer sans base, et l'image se construit en intégration
    // continue, où il n'y en a pas.
    for (const page of [
      "src/app/(public)/guides/[pays]/page.tsx",
      "src/app/(public)/articles/[slug]/page.tsx",
    ]) {
      const source = sansCommentaires(lire(page));
      expect(source).not.toMatch(/generateStaticParams/u);
      expect(source).toMatch(/export const revalidate = 3600/u);
    }
  });

  it("la publication invalide l'adresse en cache", () => {
    // Sans cela, une correction publiée resterait invisible une heure.
    const route = lire("src/app/api/admin/contenus/[id]/route.ts");
    expect(route).toMatch(/revalidatePath/u);
  });

  it("un corps illisible ne se rend pas à moitié", () => {
    // Une colonne Json n'a pas de forme : celle d'hier n'est pas celle
    // d'aujourd'hui. Le corps est validé à la lecture comme à l'écriture.
    expect(corpsSchema.safeParse({ blocs: [], appel: APPEL }).success).toBe(false);
    expect(corpsSchema.safeParse({ blocs: [{ type: "inconnu" }], appel: APPEL }).success).toBe(
      false,
    );
    const lecture = lire("src/server/lecture/editorial.ts");
    expect(lecture).toMatch(/corpsSchema\.safeParse/u);
  });

  it("l'appel à l'action ne sort pas du site", () => {
    const externe = { ...APPEL, href: "https://exemple.test" };
    expect(corpsSchema.safeParse({ blocs: [{ type: "paragraphe", texte: "x" }], appel: externe }).success).toBe(
      false,
    );
  });
});

describe("le back-office", () => {
  it("l'écran est dans la navigation, sous la veille", () => {
    const adresses = NAVIGATION_ADMIN.map((e) => e.href);
    expect(adresses).toContain("/contenus");
    expect(adresses.indexOf("/contenus")).toBe(adresses.indexOf("/veille") + 1);
  });

  it("il est réservé au veilleur, pas à l'administrateur (RG-15.3)", () => {
    for (const f of [
      "src/app/api/admin/contenus/route.ts",
      "src/app/api/admin/contenus/[id]/route.ts",
    ]) {
      expect(lire(f)).toMatch(/acces: "veilleur"/u);
    }
    for (const f of [
      "src/app/(admin)/contenus/page.tsx",
      "src/app/(admin)/contenus/[id]/page.tsx",
    ]) {
      expect(lire(f)).toMatch(/exigerVeilleur/u);
    }
  });

  it("l'enregistrement d'un brouillon n'est pas bloqué, seule la publication l'est", () => {
    // Refuser aussi le brouillon pousserait à rédiger ailleurs pour
    // recoller à la fin — c'est-à-dire hors du garde-fou.
    const route = lire("src/app/api/admin/contenus/[id]/route.ts");
    const put = route.slice(route.indexOf("export const PUT"), route.indexOf("export const POST"));
    expect(put).toMatch(/refus: verifierLeDocument/u);
    expect(put).not.toMatch(/throw echec\("champs_invalides", \{\s*champs: Object\.fromEntries\(refus/u);
    const post = route.slice(route.indexOf("export const POST"));
    expect(post).toMatch(/refus\.length > 0/u);
  });

  it("le refus nomme le fait : la publication, pas des champs invalides", () => {
    // Vu en publiant : `champs_invalides` titrait « Certaines réponses ne
    // sont pas exploitables » et parlait de questions, sur un écran de
    // rédaction qui n'en a aucune. Le document est bien formé ; c'est sa
    // formulation qui ne peut pas s'afficher (DOC-12 §16 règle 1).
    const refus = ECHECS.publication_refusee;
    expect(refus.titre).toBe("Cette publication est refusée");
    expect(refus.titre).not.toMatch(/réponse|question/iu);
    expect(refus.conserve).toMatch(/rien de ce que tu as écrit n'est perdu/u);
    // `champs_invalides` reste juste là où il l'est : un corps qui ne
    // passe pas le schéma est bien une saisie invalide.
    const route = lire("src/app/api/admin/contenus/[id]/route.ts");
    const post = route.slice(route.indexOf("export const POST"));
    expect(post).not.toMatch(/echec\("champs_invalides"/u);
    expect(post.match(/echec\("publication_refusee"/gu)).toHaveLength(2);
  });

  it("la publication est journalisée avec son motif", () => {
    const route = lire("src/app/api/admin/contenus/[id]/route.ts");
    expect(route).toMatch(/action: "contenu\.publication"/u);
    expect(route).toMatch(/motif: `Publication — \$\{corps\.motif\}`/u);
    expect(route).toMatch(/motif: `Retrait — \$\{corps\.motif\}`/u);
  });

  it("la date de première publication ne bouge plus", () => {
    // Un article republié après correction n'est pas un article du jour.
    const route = lire("src/app/api/admin/contenus/[id]/route.ts");
    expect(route).toMatch(/publishedAt: vue\.publieLe \? undefined : new Date\(\)/u);
  });

  it("la prose se saisit sur plusieurs lignes", () => {
    // Vu à l'écran : un paragraphe de guide fait quatre ou cinq lignes, et
    // il se tapait dans un champ d'une ligne. Le genre de détail qui pousse
    // à rédiger dans un traitement de texte et à coller ensuite —
    // c'est-à-dire à écrire hors du garde-fou.
    const ecran = lire("src/app/(admin)/contenus/[id]/EditionContenu.tsx");
    expect(ecran).toMatch(/<textarea/u);
    for (const champ of ["Chapeau", "Texte"]) {
      expect(ecran).toMatch(new RegExp(`<Texte\\s+libelle="${champ}"`, "u"));
    }
  });

  it("l'adresse publique s'affiche entière", () => {
    // Le champ montrait « pays-bas » sous un libellé qui promet une
    // adresse ; l'en-tête, lui, affichait « /guides/pays-bas ».
    const ecran = lire("src/app/(admin)/contenus/[id]/EditionContenu.tsx");
    expect(ecran).toMatch(/libelle="Adresse publique"\s+value=\{adresse\}/u);
  });

  it("l'état a un libellé pour chacun de ses trois cas", () => {
    expect(Object.keys(LIBELLE_ETAT).sort()).toEqual(["BROUILLON", "PUBLIE", "RETIRE"]);
  });
});

describe("ce qui a disparu du dépôt", () => {
  it("le registre de contenu n'existe plus", () => {
    // Il était le dernier fichier que les écrans publics lisaient.
    expect(() => lire("src/lib/contenu/editorial.ts")).toThrow();
  });

  it("plus aucun écran public ne lit un fichier de contenu", () => {
    for (const page of [
      "src/app/(public)/guides/[pays]/page.tsx",
      "src/app/(public)/articles/[slug]/page.tsx",
    ]) {
      expect(lire(page)).not.toMatch(/@\/lib\/contenu/u);
      expect(lire(page)).toMatch(/documentPublie/u);
    }
  });
});
