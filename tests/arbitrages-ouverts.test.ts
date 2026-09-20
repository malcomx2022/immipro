import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { versXOF, convertible, MENTION_NON_COMPARABLE } from "@/domain/format/change";

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
 * K.A — RG-13.1 et RG-13.2 se contredisent
 * ------------------------------------------------------------------ */

describe("K.A — une seule surface commerciale, tant que la règle n'est pas réécrite", () => {
  /**
   * RG-13.1 demande une proposition « contextuelle à l'étape » ; RG-13.2
   * interdit « toute proposition commerciale dans l'espace dossier
   * lui-même ». L'étape de checklist *est* l'espace dossier. La lecture
   * retenue est la plus restrictive compatible avec les deux : une seule
   * proposition, sur le seul écran qui l'affichait déjà.
   *
   * Sans ce test, une seconde surface s'ajoute un jour sur un autre écran
   * du dossier, et la lecture restrictive est abandonnée sans que personne
   * ne l'ait décidé.
   */
  it("la proposition de partenaire n'est rendue qu'à un seul endroit", () => {
    const rendus = fichiers("src/app", /\.tsx$/u).filter((f) =>
      /<PropositionPartenaire\b/u.test(lire(f)),
    );
    expect(rendus).toEqual(["src/app/(app)/(dossier)/dossiers/[id]/Checklist.tsx"]);
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
 * I.D — l'antivirus de WF-06 n'a pas de service
 * ------------------------------------------------------------------ */

describe("I.D — rien ne déclare l'analyse antivirus faite", () => {
  /**
   * WF-06 étape 2 demande une analyse antivirus synchrone avant stockage.
   * Les contrôles de nom, de taille et de type MIME sont faits ; le
   * balayage ne l'est pas, faute de service.
   *
   * La seule chose qui serait pire que l'absence, c'est de la masquer. Ni
   * le schéma, ni un écran, ni un courrier ne doit affirmer qu'un fichier a
   * été analysé — un candidat qui le lit en tire une assurance que rien ne
   * fonde, et un consultant à qui la pièce est transmise aussi.
   */
  it("aucun texte n'affirme qu'un fichier a été analysé", () => {
    const affirmations =
      /\b(analys\w+ antivirus|sans virus|exempt de virus|fichier s[ûu]r|v[ée]rifi[ée] contre les virus)\b/iu;
    const fautifs = SOURCES.filter((f) => affirmations.test(lire(f)));
    expect(fautifs).toEqual([]);
  });

  it("le schéma ne porte aucun état de balayage qui serait toujours faux", () => {
    const schema = lire("prisma/schema.prisma");
    expect(schema).not.toMatch(/\b(scanState|scannedAt|virusScan|malwareScan)\b/u);
  });

  /**
   * Les contrôles qui existent sont nommés, et ils s'arrêtent là. Un
   * quatrième contrôle ajouté ici sans service derrière échouerait à ce
   * test plutôt que de passer pour un balayage.
   */
  it("les contrôles synchrones sont ceux que le code sait faire", () => {
    const pieces = lire("src/server/acces/pieces.ts");
    expect(pieces).toContain("MIMES_ACCEPTES");
    expect(pieces).toContain("refusDuFichier");
    expect(pieces).not.toMatch(/antivirus|malware/iu);
  });
});

/* ------------------------------------------------------------------ *
 * Le lien avec le document, dans les deux sens.
 * ------------------------------------------------------------------ */

describe("chaque garde-fou cite un arbitrage, et dit s'il est ouvert", () => {
  const ECARTS = lire("docs/prototype/ECARTS-A-ARBITRER.md");
  const CE_FICHIER = lire("tests/arbitrages-ouverts.test.ts");

  /** Encore ouverts : la lecture est provisoire, le test la tient. */
  const OUVERTS = ["I.D", "K.A", "L.A", "N.A"];
  /**
   * Tranchés, et dont la règle décidée survit au garde-fou. Le test ne
   * disparaît pas avec l'arbitrage : une décision qui pose une condition —
   * « pas de taux sans source datée » — a plus besoin d'être tenue qu'une
   * lecture provisoire.
   */
  const TRANCHES = ["I.B"];

  const bloc = (code: string) =>
    new RegExp(`\\*\\*${code.replace(".", "\\.")} —[\\s\\S]{0,900}`, "u").exec(ECARTS)![0];

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
      expect(bloc(code).slice(0, 400), code).not.toMatch(/\*\*Tranché/u);
    }
  });

  it("les tranchés la portent, et le test le dit dans son intitulé", () => {
    for (const code of TRANCHES) {
      expect(bloc(code), code).toMatch(/\*\*Tranché/u);
      expect(CE_FICHIER, code).toContain(`describe("${code} (tranché) —`);
    }
  });
});
