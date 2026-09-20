import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { versXOF, convertible, MENTION_NON_COMPARABLE } from "@/domain/format/change";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * Les lectures retenues pendant qu'un arbitrage est ouvert.
 *
 * Cinq points de `docs/prototype/ECARTS-A-ARBITRER.md` attendent une
 * décision qui n'appartient pas au code : un régime comptable, un contrat
 * de partenaire, une source de taux, un service d'analyse, une règle à
 * réécrire. Pour chacun, le code a dû faire quelque chose en attendant, et
 * il a retenu la lecture la plus prudente.
 *
 * Rien ne tenait ces lectures. Un arbitrage se tranche des mois plus tard,
 * et d'ici là la prudence s'érode d'un écran à l'autre sans que personne
 * ne le décide : c'est ainsi qu'une plateforme se retrouve à faire ce
 * qu'elle a écrit ne pas faire. Ces tests rendent la dérive visible — et
 * chacun d'eux est fait pour être **modifié** le jour où l'arbitrage
 * tombe, jamais contourné.
 *
 * Ils lisent les sources comme un texte, même garde-fou que
 * `schema-domaine`, `api-invariants` et `liens-morts`.
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
const SOURCES = [
  ...fichiers("src", /\.tsx?$/u),
];

/* ------------------------------------------------------------------ *
 * L.A — le barème interne relève-t-il du droit d'accès ?
 * ------------------------------------------------------------------ */

describe("L.A — le barème interne ne sort pas, tant que l'article 15 n'a pas tranché", () => {
  /**
   * L'article 20 (portabilité) ne couvre que les données fournies par la
   * personne ; l'article 15 (accès) ne fait pas cette distinction.
   * L'export retient la lecture compatible avec C-09 : un palier et un
   * dénombrement, jamais le nombre. Le jour où le droit d'accès l'emporte,
   * c'est ce test qui change — pas l'export en silence.
   */
  it("aucune lecture ne sérialise le nombre", () => {
    const fautives = fichiers("src/server/lecture", /\.ts$/u).filter((f) =>
      lire(f).includes("internalScore"),
    );
    expect(fautives).toEqual([]);
  });

  it("aucune route ne le renvoie non plus", () => {
    const fautives = fichiers("src/app/api", /^route\.ts$/u).filter((f) =>
      /internalScore\s*[,:]/u.test(lire(f)),
    );
    expect(fautives).toEqual([]);
  });

  it("l'export dit la complétude en palier et en dénombrement", () => {
    const portabilite = lire("src/server/lecture/portabilite.ts");
    expect(portabilite).toContain("palier");
    expect(portabilite).toContain("obligatoiresManquantes");
  });
});

/* ------------------------------------------------------------------ *
 * K.A — la proposition commerciale dans la checklist, tranché le 20/09
 * ------------------------------------------------------------------ */

describe("K.A (tranché) — l'espace dossier n'héberge aucune offre commerciale", () => {
  /**
   * RG-13.1 demandait une proposition « contextuelle à l'étape » ; RG-13.2
   * interdisait « toute proposition commerciale dans l'espace dossier ».
   * L'étape de checklist *est* l'espace dossier, et le garde-fou tenait en
   * attendant la décision : une seule proposition, sur le seul écran qui
   * l'affichait déjà.
   *
   * La décision ne cherche pas le compromis, elle déplace la frontière :
   * entre une aide fonctionnelle et une offre commerciale, et non entre
   * une offre et plusieurs. Le test suit — il ne compte plus les écrans,
   * il tient la nature de ce qui s'affiche.
   */
  const ESPACE_DOSSIER = fichiers("src/app/(app)/(dossier)/dossiers", /\.tsx$/u);

  it("aucun écran du dossier ne monte une offre", () => {
    const fautifs = ESPACE_DOSSIER.filter((f) => /<OffrePartenaire\b/u.test(lire(f)));
    expect(fautifs).toEqual([]);
  });

  /**
   * Le vocabulaire plutôt que le composant : une offre réécrite à la main,
   * sans passer par le composant dédié, resterait une offre.
   *
   * Les commentaires sont retirés d'abord — celui qui explique pourquoi une
   * offre n'a pas sa place ici emploie forcément les mots qu'il proscrit.
   * Le même balayage sert au garde-fou du vocabulaire interdit.
   */
  it("aucun écran du dossier ne parle de prix, de commission ni de partenaire", () => {
    const commercial = /\b(commission|partenaire|prestation|tarif)\b/iu;
    const fautifs = ESPACE_DOSSIER.filter((f) => commercial.test(sansCommentaires(lire(f))));
    expect(fautifs).toEqual([]);
  });

  /**
   * Ce qui reste est l'aide que la règle réécrite autorise. Elle explique
   * quoi faire — et rien de ce qu'elle écrit ne vend quoi que ce soit.
   */
  it("l'aide de l'étape ne nomme ni prestataire, ni prix, ni commission", () => {
    const aide = lire("src/domain/dossiers/aide-de-letape.ts");
    const textes = [...aide.matchAll(/(titre|corps):\s*\n?\s*"([^"]+)"/gu)].map((m) => m[2]!);
    expect(textes.length).toBeGreaterThan(4);
    for (const texte of textes) {
      expect(texte, texte).not.toMatch(
        /\b(partenaire|commission|tarif|prix|offre|prestation|\d+\s?(F|€))\b/iu,
      );
    }
  });

  /** L'offre vit sur la surface dédiée, et nulle part ailleurs. */
  it("la lecture d'affiliation n'est appelée que par la surface dédiée", () => {
    const appelants = fichiers("src/app", /\.tsx?$/u).filter((f) =>
      /offresDuDossier\(/u.test(lire(f)),
    );
    expect(appelants).toEqual(["src/app/(app)/(dossier)/services/page.tsx"]);
  });
});

/* ------------------------------------------------------------------ *
 * I.B — le budget n'est comparable qu'en zone euro
 * ------------------------------------------------------------------ */

describe("I.B (tranché) — aucune parité n'est écrite en dur hors du régime de change", () => {
  /**
   * Tranché le 20/09/2026. ImmiPro ne compare pas les budgets libellés dans
   * une devise à cours variable tant qu'aucune source de change datée et
   * surveillée n'est intégrée. Les destinations concernées restent
   * présentées — les écarter serait plus dommageable que de les garder avec
   * leur limite annoncée — mais le budget sort de leur classement.
   *
   * La décision ne referme pas la porte : elle fixe la condition d'entrée
   * d'un taux, une source datée et surveillée. Ces tests restent donc, et
   * c'est le jour où cette source arrive qu'ils changent — le moment où
   * l'on vérifie qu'elle est bien citée.
   */
  it("seules les monnaies à parité sûre se convertissent", () => {
    expect(versXOF(100, "EUR")).toBe(65_596);
    expect(versXOF(100, "XOF")).toBe(100);
    for (const devise of ["CHF", "AED", "USD", "CAD"] as const) {
      expect(versXOF(100, devise), devise).toBeNull();
      expect(convertible(devise), devise).toBe(false);
    }
  });

  it("l'absence de conversion se dit, elle ne se devine pas", () => {
    expect(MENTION_NON_COMPARABLE).toMatch(/taux de change/u);
    expect(MENTION_NON_COMPARABLE).not.toMatch(/erreur|indisponible/iu);
  });

  it("le module ne porte qu'une seule parité", () => {
    const change = lire("src/domain/format/change.ts");
    const nombres = [...change.matchAll(/^export const \w+ = ([\d_.]+);/gmu)];
    expect(nombres.map((m) => m[1])).toEqual(["655.957"]);
  });
});

/* ------------------------------------------------------------------ *
 * N.A — le rail de paiement suit la devise, et rien d'autre
 * ------------------------------------------------------------------ */

describe("N.A — le rail se déduit, il ne se choisit pas", () => {
  /**
   * Francs CFA par Mobile Money, euros par carte. Les trois « autres
   * moyens » du prototype supposaient un choix d'opérateur qui n'est
   * modélisé nulle part. Savoir si le produit en veut un suppose que
   * FedaPay en expose un — question ouverte.
   *
   * En attendant, `provider` se déduit de la devise à la création. Le
   * laisser entrer depuis le client serait une façon silencieuse de
   * trancher : quelqu'un paierait en euros par Mobile Money, et la
   * réconciliation interrogerait le mauvais fournisseur.
   */
  it("le fournisseur est dérivé de la devise, à un seul endroit", () => {
    const paiements = lire("src/server/acces/paiements.ts");
    expect(paiements).toMatch(/provider:\s*devise === "XOF" \? "FEDAPAY" : "STRIPE"/u);
  });

  it("aucune route n'accepte un fournisseur du client", () => {
    const fautives = fichiers("src/app/api", /^route\.ts$/u).filter((f) => {
      const source = lire(f);
      // Le schéma d'entrée, et lui seul : `provider` en sortie est légitime.
      const corps = /corps:\s*z\.object\(\{([\s\S]*?)\n\s*\}\)/u.exec(source)?.[1] ?? "";
      return /\b(provider|fournisseur|operateur)\b/u.test(corps);
    });
    expect(fautives).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * I.D — l'antivirus de WF-06, tranché le 20/09
 * ------------------------------------------------------------------ */

describe("I.D (tranché) — rien ne déclare un balayage qui n'a pas eu lieu", () => {
  /**
   * L'arbitrage est fermé, le garde-fou reste — et il a changé de cible.
   *
   * Il refusait un champ de balayage, parce qu'aucun n'aurait pu être vrai.
   * Le champ existe désormais, et ce qu'il faut tenir est l'inverse : que
   * rien ne l'écrive sans qu'un moteur ait lu le fichier. C'est la seule
   * façon de tricher qui reste, et elle est silencieuse.
   */
  it("le balayeur non branché rend l'absence, jamais la santé", () => {
    const antivirus = lire("src/server/securite/antivirus.ts");
    expect(antivirus).toMatch(/NON_BRANCHE: Balayeur = async \(\) => null/u);
    // Aucun repli vers « saine » : ni valeur par défaut, ni court-circuit
    // quand le moteur ne répond pas.
    expect(antivirus).not.toMatch(/\?\?\s*\{\s*etat:\s*"SAINE"/u);
    const balayage = lire("src/server/jobs/balayage.ts");
    expect(balayage).toMatch(/if \(!verdict\) throw new BalayageIndisponible/u);
    expect(balayage).not.toMatch(/catch[\s\S]{0,120}"SAINE"/u);
  });

  /**
   * La cohérence de l'état ne se garde pas qu'en TypeScript : une date de
   * balayage absente sur un état décidé le rendrait invérifiable après
   * coup, et une clé d'objet survivante sur une version infectée resterait
   * présignable.
   */
  it("la base tient l'état, pas seulement le code", () => {
    const migration = lire(
      "prisma/migrations/20260920000500_quarantaine_et_balayage/migration.sql",
    );
    expect(migration).toContain("document_version_balayage_date");
    expect(migration).toContain("document_version_menace_seulement_si_infectee");
    expect(migration).toContain("document_version_infectee_sans_octets");
    expect(lire("prisma/schema.prisma")).toMatch(/scanState\s+ScanState\s+@default\(EN_QUARANTAINE\)/u);
  });

  /**
   * Les trois sorties que la décision ferme : téléchargeable,
   * prévisualisable, transmis à l'extraction. Chacune passe par la même
   * fonction du domaine, et une quatrième aura à y passer aussi.
   */
  it("aucune des trois sorties ne s'ouvre sans balayage", () => {
    expect(lire("src/server/acces/pieces.ts")).toMatch(
      /if \(!consultable\(version\.scanState\)\) return null/u,
    );
    expect(lire("src/server/jobs/analyse.ts")).toMatch(
      /if \(!transmissibleALAnalyse\(version\.scanState\)\) return/u,
    );
    expect(lire("src/server/lecture/portabilite.ts")).toMatch(
      /consultable\(derniere\.scanState\)/u,
    );
  });

  /** Sans moteur, le dépôt se refuse — il ne s'accepte pas en attendant. */
  it("le dépôt refuse ce qu'il ne pourrait pas contrôler", () => {
    const depot = lire("src/app/api/dossiers/[id]/pieces/[pieceId]/depot/route.ts");
    expect(depot).toMatch(/if \(!antivirusConfigure\(\)\) throw echec\("televersement_indisponible"\)/u);
    // Le job d'analyse n'est plus mis en file au dépôt : il l'est après la
    // promotion, et c'est ce qui rend l'ordre impossible à inverser.
    expect(depot).toContain("JOBS.BALAYAGE_PIECE");
    expect(depot).not.toContain("JOBS.ANALYSE_DOCUMENT");
  });

  /**
   * Ce que la décision n'autorise toujours pas : promettre. Un état de
   * balayage est un fait daté ; « fichier sûr » est une assurance, et un
   * candidat qui la lit en tire ce que rien ne fonde — pas plus qu'un
   * consultant à qui la pièce est transmise.
   */
  it("aucun texte ne promet un fichier sain", () => {
    const affirmations =
      /\b(sans virus|exempt de virus|fichier s[ûu]r|garanti sans|v[ée]rifi[ée] contre les virus)\b/iu;
    const fautifs = SOURCES.filter((f) => affirmations.test(lire(f)));
    expect(fautifs).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Le lien avec le document, dans les deux sens.
 * ------------------------------------------------------------------ */

describe("chaque garde-fou cite un arbitrage, et dit s'il est ouvert", () => {
  const ECARTS = lire("docs/prototype/ECARTS-A-ARBITRER.md");
  const CE_FICHIER = lire("tests/arbitrages-ouverts.test.ts");

  /** Encore ouverts : la lecture est provisoire, le test la tient. */
  const OUVERTS = ["L.A", "N.A"];
  /**
   * Tranchés, et dont la règle décidée survit au garde-fou. Le test ne
   * disparaît pas avec l'arbitrage : une décision qui pose une condition —
   * « pas de taux sans source datée » — a plus besoin d'être tenue qu'une
   * lecture provisoire.
   */
  const TRANCHES = ["I.B", "I.D", "K.A"];

  /**
   * Le bloc d'un arbitrage s'arrête au suivant, et non au bout de neuf
   * cents signes. La première version comptait les caractères : le bloc
   * d'I.D débordait sur celui d'I.E, si bien que la mention « Tranché »
   * du voisin répondait pour lui. Un test qui passe grâce au paragraphe
   * d'à côté ne teste rien.
   */
  const bloc = (code: string) => {
    const depart = ECARTS.search(new RegExp(`\\*\\*${code.replace(".", "\\.")} —`, "u"));
    expect(depart, code).toBeGreaterThan(-1);
    const suite = ECARTS.slice(depart + 4);
    const fin = suite.search(/\*\*[A-Z]\.[A-Z] —/u);
    return fin === -1 ? suite : suite.slice(0, fin);
  };

  /**
   * Un arbitrage se tranche, et le garde-fou qui le cite devient un
   * vestige : il continue de refuser une dérive que la décision vient
   * peut-être d'autoriser. Ce test force à repasser ici le jour où l'un
   * d'eux se ferme — c'est ainsi qu'I.B a été relu le 20/09.
   */
  it("les codes cités sont ceux du relevé", () => {
    const cites = [
      ...new Set(
        [...CE_FICHIER.matchAll(/^describe\("([A-Z]\.[A-Z])(?: \(tranché\))? —/gmu)].map(
          (m) => m[1]!,
        ),
      ),
    ].sort();
    expect(cites).toEqual([...OUVERTS, ...TRANCHES].sort());

    for (const code of cites) {
      expect(ECARTS, code).toMatch(new RegExp(`\\*\\*${code.replace(".", "\\.")} —`, "u"));
    }
  });

  it("les ouverts ne portent pas la mention qui les fermerait", () => {
    for (const code of OUVERTS) {
      expect(bloc(code), code).not.toMatch(/\*\*Tranché/u);
    }
  });

  it("les tranchés la portent, et le test le dit dans son intitulé", () => {
    for (const code of TRANCHES) {
      expect(bloc(code), code).toMatch(/\*\*Tranché/u);
      expect(CE_FICHIER, code).toContain(`describe("${code} (tranché) —`);
    }
  });
});
