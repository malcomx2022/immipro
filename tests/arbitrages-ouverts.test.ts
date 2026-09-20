import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { versXOF, convertible, MENTION_NON_COMPARABLE } from "@/domain/format/change";
import { sansCommentaires } from "@/domain/copy/source";
import {
  LIBELLE_JALON,
  PREALABLES,
  prealablesDe,
} from "@/domain/exploitation/prealables";
import {
  ADRESSES_SANS_PAGE,
  LIBELLE_PORTE,
  PAGES_PUBLIQUES,
  pagesBloquantes,
} from "@/domain/exploitation/pages-publiques";

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

describe("L.A (sous réserve) — l'export explique sans restituer le barème", () => {
  /**
   * Décision produit provisoire du 20/09/2026, **soumise à validation
   * juridique avant lancement**. L'article 20 (portabilité) ne couvre que
   * les données fournies ; l'article 15 (accès) ne fait pas cette
   * distinction ; l'information sur la logique d'un traitement automatisé
   * est encore autre chose. Le produit ne tranche pas cet arbitrage — il
   * retient, en attendant, la lecture qui explique sans réintroduire le
   * nombre que C-09 a retiré.
   *
   * Ce que le test tient est donc double : le nombre ne sort toujours pas,
   * et l'explication qui le remplace reste une explication — pas une
   * restitution du barème par un autre chemin.
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

  /**
   * L'explication est le pas que la décision autorise. Elle s'arrête là :
   * un coefficient, un total ou une part reviendraient à publier le barème
   * en toutes lettres, ce que la décision réserve au juriste.
   */
  it("l'explication nomme les facteurs sans donner leur poids", () => {
    const explication = lire("src/domain/completeness/explication.ts");
    const textes = [...explication.matchAll(/"([^"]{20,})"/gu)].map((m) => m[1]!);
    expect(textes.length).toBeGreaterThan(4);
    for (const texte of textes) {
      expect(texte, texte).not.toMatch(/\d+\s?%|sur\s?100|coefficient|pond[ée]ration de|\bpoints?\b/iu);
    }
    // Et la limite est dite, plutôt que passée sous silence.
    expect(explication).toMatch(/LIMITE_DE_LA_RESTITUTION/u);
  });

  /**
   * L'explication décrit le calcul qui décide, pas celui que le document
   * décrit. WF-07 énumère quatre composantes pondérées ; le palier montré
   * au candidat n'en pèse qu'une, et réciter les quatre aurait été faux.
   */
  it("elle décrit le calcul réellement appliqué, pas celui du référentiel", () => {
    const explication = lire("src/domain/completeness/explication.ts");
    expect(explication).toContain("CE_QUI_NE_PESE_PAS");
    // Le calcul rendu au candidat neutralise ces deux composantes : la
    // fonction qui le produit ne reçoit ni condition ni ratio.
    const piece = lire("src/domain/dossiers/piece.ts");
    expect(piece).toMatch(/conditions: \[\]/u);
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

describe("N.A (tranché) — le rail se déduit, il ne se choisit pas", () => {
  /**
   * Tranché pour la V1 le 20/09/2026 : francs CFA par Mobile Money, euros
   * par carte. Aucun choix d'opérateur tant que le fournisseur n'en expose
   * pas un et que le besoin n'est pas constaté — une option d'interface
   * sans capacité derrière est un faux choix, et il coûte plus cher
   * qu'une absence de choix : il fait chercher un réglage inexistant au
   * moment où un paiement vient d'échouer.
   */
  it("la règle vit dans le domaine, à un seul endroit", () => {
    const rail = lire("src/domain/payments/rail.ts");
    expect(rail).toMatch(/XOF: "MOBILE_MONEY"/u);
    expect(rail).toMatch(/MOBILE_MONEY: "FEDAPAY"/u);

    // Et nulle part ailleurs : elle était écrite en ligne dans le `create`,
    // ce qui laissait chaque écran la redire à sa façon.
    const ailleurs = [...fichiers("src/server", /\.ts$/u), ...fichiers("src/app", /\.tsx?$/u)]
      .filter((f) => /devise === "XOF" \? "FEDAPAY"|currency === "XOF" \? "FEDAPAY"/u.test(lire(f)));
    expect(ailleurs).toEqual([]);
  });

  it("aucune route n'accepte un fournisseur venu du client", () => {
    const fautives = fichiers("src/app/api", /^route\.ts$/u).filter((f) => {
      const source = lire(f);
      const corps = /corps:\s*z\.object\(\{([\s\S]*?)\n\s*\}\)/u.exec(source)?.[1] ?? "";
      return /\b(provider|fournisseur|operateur)\b/u.test(corps);
    });
    expect(fautives).toEqual([]);
  });

  /**
   * Aucun écran du tunnel de paiement n'offre de choisir un opérateur. La
   * page des packs annonçait « MTN MoMo · Moov Money · Carte bancaire » en
   * pastilles, c'est-à-dire trois options, alors que deux d'entre elles
   * désignent des opérateurs que le produit ne sélectionne pas — c'est le
   * fournisseur qui route selon le numéro.
   *
   * Le test porte sur le tunnel, et pas au-delà : nommer les opérateurs
   * joignables sur une page publique est une annonce de couverture, pas un
   * choix, et ce n'est pas ce que N.A tranche. (Que cette couverture soit
   * vérifiée est une autre question, et elle relève d'I.C.)
   */
  it("aucun écran du tunnel ne nomme un opérateur", () => {
    const operateurs = /\b(MTN|MoMo|Moov|Orange Money|Wave)\b/u;
    const fautifs = fichiers("src/app/(app)/paiement", /\.tsx$/u).filter((f) =>
      operateurs.test(sansCommentaires(lire(f))),
    );
    expect(fautifs).toEqual([]);
  });

  /** Les phrases du rail viennent toutes du même module. */
  it("les écrans de paiement ne réécrivent pas la règle", () => {
    for (const ecran of [
      "src/app/(app)/paiement/pack/ChoixDuPack.tsx",
      "src/app/(app)/paiement/echec/Echec.tsx",
      "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
    ]) {
      expect(lire(ecran), ecran).toContain("@/domain/payments/rail");
    }
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
 * M.C — reçu ou facture, décidé sous réserve le 20/09
 * ------------------------------------------------------------------ */

describe("M.C (sous réserve) — le document reste un reçu", () => {
  /**
   * Décision produit du 20/09/2026, **soumise à une expertise comptable
   * avant tout encaissement commercial**. Le produit maintient « reçu » et
   * ne présente rien comme une facture ; savoir si une facture est requise,
   * ce qu'elle doit porter et selon quelle séquence dépend du régime, de
   * l'entité qui encaisse et des séries autorisées.
   *
   * Le garde-fou détaillé vit dans `tests/prealables.test.ts`, avec le
   * registre. Ici, ce qui doit rester vrai quoi qu'il arrive : la référence
   * ne devient pas un numéro de facture par renommage.
   */
  it("la référence de transaction n'est pas renommée en numéro de facture", () => {
    // Commentaires retirés, et le registre des préalables écarté : l'un
    // comme l'autre emploient le mot pour dire qu'il ne faut pas l'employer.
    const fautifs = SOURCES.filter(
      (f) =>
        f !== "src/domain/exploitation/prealables.ts" &&
        /num[ée]ro\s+de\s+facture|factureNumero|invoiceNumber/iu.test(
          sansCommentaires(lire(f)),
        ),
    );
    expect(fautifs).toEqual([]);
  });

  /**
   * Et elle reste non séquentielle : c'est la propriété qui rend les deux
   * pièces distinctes. Une facture se numérote en continu ; une suite
   * d'entiers dirait le nombre de paiements du mois à qui en voit deux.
   */
  it("elle reste tirée au hasard, jamais incrémentée", () => {
    const acces = lire("src/server/acces/paiements.ts");
    expect(acces).toMatch(/suiteDictable\(6\)/u);
    expect(acces).not.toMatch(/\+\s*1\b.*reference|reference.*\+\+/iu);
  });
});

/* ------------------------------------------------------------------ *
 * Q.A — qui écrit les six pages publiques manquantes.
 * ------------------------------------------------------------------ */

/**
 * Arbitrage d'attribution clos le 20/09/2026, **le contenu des quatre
 * pages obligatoires restant suspendu à une validation juridique avant
 * l'ouverture au public**.
 *
 * Ce qui est tranché : qui écrit quoi, et laquelle de ces pages commande
 * une porte de lancement. Ce qui ne l'est pas, et ne peut pas l'être ici :
 * leur texte. Des mentions légales demandent un siège et un numéro
 * d'immatriculation, des conditions demandent un contrat — les inventer
 * produirait un document juridique faux, ce qui est pire qu'une page
 * absente.
 *
 * Le registre ne prétend donc pas qu'une page est validée : aucun test ne
 * peut le vérifier, et un drapeau « validé » serait coché (M.C). Ce qu'il
 * tient est vérifiable — une page déclarée absente l'est, et rien ne
 * pointe vers elle.
 */
describe("Q.A (sous réserve) — les six pages publiques et leur responsable", () => {
  const ROUTES = fichiers("src/app", /^page\.tsx$/u).map((f) =>
    f
      .replace(/^src\/app/u, "")
      .replace(/\/page\.tsx$/u, "")
      .replace(/\/\([^/]*\)/gu, "")
      .replace(/^$/u, "/"),
  );

  it("les six pages du relevé sont au registre, avec leur porte", () => {
    expect(PAGES_PUBLIQUES).toHaveLength(6);
    expect(pagesBloquantes().map((p) => p.adresse)).toEqual([
      "/mentions-legales",
      "/donnees-personnelles",
      "/conditions",
      // Le relevé rangeait Contact avec le marketing. Une plateforme qui
      // encaisse doit offrir une voie de recours réelle : Q.A la reclasse.
      "/contact",
    ]);
  });

  /**
   * Le responsable est un métier, jamais un nom — même règle que le
   * registre des préalables, et pour la même raison : les personnes
   * changent, et un registre qui nomme quelqu'un vieillit au premier
   * départ.
   */
  it("chaque page dit qui l'écrit, et ce qui manque pour l'écrire", () => {
    for (const page of PAGES_PUBLIQUES) {
      expect(page.responsable, page.adresse).not.toMatch(/@|\b[A-Z][a-zéèêà]+\s+[A-Z]/u);
      expect(page.manque.length, page.adresse).toBeGreaterThan(60);
      expect(LIBELLE_PORTE[page.porte], page.adresse).toBeTruthy();
      expect(page.adresse, page.adresse).toMatch(/^\/[a-z-]+$/u);
    }
  });

  /**
   * **Le registre et l'arborescence disent la même chose.** C'est la
   * moitié vérifiable de « aucun lien ne doit être rétabli avant que sa
   * page soit complète et validée » : tant que la page est au registre,
   * elle n'existe pas, et le test des liens morts interdit alors d'y
   * mener. Le jour où quelqu'un crée la route — fût-ce une ébauche — ce
   * test tombe et l'oblige à revenir ici, là où le responsable et la
   * condition sont écrits. Une page à moitié faite ne devient pas liable
   * en silence.
   */
  it("aucune page du registre n'est servie : le registre dit ce qui manque", () => {
    const servies = PAGES_PUBLIQUES.filter((p) => ROUTES.includes(p.adresse));
    expect(servies.map((p) => p.adresse)).toEqual([]);
  });

  /** Et rien ne promet ces adresses, ni dans un écran ni dans une table. */
  it("aucun écran ne promet une page qui n'existe pas", () => {
    const ecrans = [
      ...fichiers("src/app", /\.tsx$/u),
      ...fichiers("src/components", /\.tsx$/u),
    ];
    const fautifs: string[] = [];
    for (const f of ecrans) {
      const source = readFileSync(f, "utf8");
      for (const adresse of ADRESSES_SANS_PAGE) {
        if (new RegExp(`["\`]${adresse}["\`/?#]`, "u").test(source)) {
          fautifs.push(`${f} → ${adresse}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  /**
   * Les quatre bloquantes tiennent la même porte que les autres préalables
   * d'ouverture, et s'y lisent avec eux : trois registres qui ne se
   * répondent pas valent une prose qui ne se lit pas.
   */
  it("la porte de lancement rejoint les préalables d'ouverture", () => {
    const prealable = PREALABLES.find((p) => p.arbitrage === "Q.A");
    expect(prealable?.jalon).toBe("OUVERTURE_PUBLIQUE");
    expect(prealablesDe("OUVERTURE_PUBLIQUE").map((p) => p.arbitrage)).toContain("Q.A");
  });

  /**
   * Et le produit n'écrit aucune de ces pages à leur place. Le registre
   * porte ce qui manque, pas un brouillon de mention légale : une phrase
   * plausible dans ce fichier deviendrait, par copie, le texte publié.
   */
  it("le registre décrit le manque, il ne le comble pas", () => {
    const source = readFileSync("src/domain/exploitation/pages-publiques.ts", "utf8");
    // Les marques d'un texte juridique rédigé, plutôt que décrit.
    expect(source).not.toMatch(/RCCM\s*[:n°]|SIRET|capital social de|Article [1-9]/u);
    expect(source).not.toMatch(/est édité par|le présent contrat|l'utilisateur s'engage/iu);
  });
});

/* ------------------------------------------------------------------ *
 * Le lien avec le document, dans les deux sens.
 * ------------------------------------------------------------------ */

describe("chaque garde-fou cite un arbitrage, et dit s'il est ouvert", () => {
  const ECARTS = lire("docs/prototype/ECARTS-A-ARBITRER.md");
  const CE_FICHIER = lire("tests/arbitrages-ouverts.test.ts");

  /** Encore ouverts : la lecture est provisoire, le test la tient. */
  const OUVERTS: string[] = [];
  /**
   * Décidés par le produit, mais suspendus à une condition qui ne lui
   * appartient pas — L.A attend une validation juridique avant lancement.
   *
   * Le relevé n'avait que deux états, ouvert et tranché, et aucun ne
   * convenait : « ouvert » aurait laissé croire que personne n'a décidé,
   * « tranché » aurait fait disparaître la réserve, qui est précisément ce
   * qu'il faut ne pas perdre de vue. Un troisième état la garde visible,
   * et le test exige qu'elle soit nommée dans le relevé.
   */
  const SOUS_RESERVE = ["L.A", "M.C", "Q.A"];
  /**
   * Tranchés, et dont la règle décidée survit au garde-fou. Le test ne
   * disparaît pas avec l'arbitrage : une décision qui pose une condition —
   * « pas de taux sans source datée » — a plus besoin d'être tenue qu'une
   * lecture provisoire.
   */
  const TRANCHES = ["I.B", "I.D", "K.A", "N.A"];

  const TOUS = [...OUVERTS, ...SOUS_RESERVE, ...TRANCHES];

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
        [
          ...CE_FICHIER.matchAll(
            /^describe\("([A-Z]\.[A-Z])(?: \((?:tranché|sous réserve)\))? —/gmu,
          ),
        ].map((m) => m[1]!),
      ),
    ].sort();
    expect(cites).toEqual([...TOUS].sort());

    for (const code of cites) {
      expect(ECARTS, code).toMatch(new RegExp(`\\*\\*${code.replace(".", "\\.")} —`, "u"));
    }
  });

  it("les ouverts ne portent pas la mention qui les fermerait", () => {
    for (const code of OUVERTS) {
      expect(bloc(code), code).not.toMatch(/\*\*Tranché/u);
    }
  });

  /**
   * Une réserve qui ne nomme pas sa condition n'en est pas une : elle
   * devient, six mois plus tard, un arbitrage que tout le monde croit
   * fermé.
   *
   * La première version de ce test épelait la condition de L.A —
   * « validation juridique », « avant lancement ». Elle ne valait donc que
   * pour elle, et M.C, dont la réserve est comptable, l'aurait fait
   * échouer sans rien apprendre à personne. Le registre des préalables est
   * la source : chaque réserve y est inscrite, et c'est lui qui dit quelle
   * compétence tranche et quel jalon est bloqué.
   */
  it("ceux sous réserve sont au registre, et leur condition y est nommée", () => {
    for (const code of SOUS_RESERVE) {
      const texte = bloc(code);
      /**
       * La marque dit « décidé, mais pas fini ». Deux formulations la
       * portent, et c'est voulu : L.A et M.C ont pris une décision
       * *provisoire* que l'avis extérieur peut renverser ; Q.A a tranché
       * son attribution pour de bon, et ce qui reste suspendu est le
       * contenu que d'autres doivent écrire. Exiger « décision produit
       * provisoire » de Q.A l'aurait obligée à se décrire faussement —
       * c'est le sur-ajustement que ce test s'était déjà reproché une
       * fois, revenu par le vocabulaire au lieu de la condition.
       */
      expect(texte, code).toMatch(
        /\*\*Décision produit provisoire|\*\*Arbitrage d'attribution clos/u,
      );
      expect(texte, code).not.toMatch(/\*\*Tranché/u);
      expect(CE_FICHIER, code).toContain(`describe("${code} (sous réserve) —`);

      // Le registre porte la condition : qui tranche, quel jalon est
      // bloqué. Le test s'arrête à son existence — rapprocher deux textes
      // de prose mot à mot serait le même sur-ajustement que celui qu'il
      // vient de corriger.
      const prealable = PREALABLES.find((p) => p.arbitrage === code);
      expect(prealable, `${code} doit figurer au registre des préalables`).toBeDefined();
      expect(LIBELLE_JALON[prealable!.jalon], code).toBeTruthy();
    }
  });

  /** Et l'inverse : aucun préalable ne flotte sans arbitrage qui le porte. */
  it("aucun préalable du registre ne manque à cette liste", () => {
    expect(PREALABLES.map((p) => p.arbitrage).sort()).toEqual([...SOUS_RESERVE].sort());
  });

  it("les tranchés la portent, et le test le dit dans son intitulé", () => {
    for (const code of TRANCHES) {
      expect(bloc(code), code).toMatch(/\*\*Tranché/u);
      expect(CE_FICHIER, code).toContain(`describe("${code} (tranché) —`);
    }
  });
});
