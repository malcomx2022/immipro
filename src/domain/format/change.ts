/**
 * Conversion de devises — le strict nécessaire, et rien de plus.
 *
 * Le produit évite les conversions : la grille tarifaire est native dans
 * chaque devise, précisément pour ne dépendre d'aucun taux. Le simulateur
 * n'a pas ce luxe — il compare un budget déclaré en francs CFA à un coût
 * publié par une autorité étrangère dans sa propre monnaie.
 *
 * **Le franc CFA est le seul cas sûr.** Sa parité avec l'euro est fixe
 * (1 EUR = 655,957 XOF) et ne se périme pas : ce n'est pas un cours, c'est
 * un régime de change. La convertir n'introduit donc aucune information non
 * sourcée.
 *
 * **Les autres monnaies n'ont pas de taux ici, et c'est délibéré.** Un cours
 * du franc suisse ou du dirham est une donnée de marché : il change tous les
 * jours, et l'afficher demanderait sa source et sa date de relevé comme
 * toute autre information de la plateforme (INV-8). Écrire un nombre
 * plausible en dur serait exactement ce que ce produit reproche aux sites
 * qu'il remplace. Tant qu'aucune source n'est branchée, la conversion rend
 * `null` et l'appelant dit que le montant n'est pas comparable — plutôt que
 * de comparer faux.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Parité fixe du franc CFA, en vigueur depuis 1999. Ce n'est pas un cours relevé. */
export const PARITE_XOF_EUR = 655.957;

/**
 * D'où vient la parité — INV-8, seconde moitié.
 *
 * Elle était écrite ici et **affichée nulle part**. Le candidat lisait un
 * montant en francs sous une source qui ne le contient pas. Exécuté :
 *
 *     NL/etudes_mvv_vvr
 *       l'autorité publie : 1 130,77 EUR (mensuel)
 *       le candidat lit   : 8 900 838 F
 *       la source citée   : ind.nl — vérifiée le 2026-09-11
 *
 * Qui ouvre `ind.nl` y trouve « 1 130,77 € par mois ». Rien à l'écran ne
 * relie ce nombre à 8 900 838 F : ni la multiplication par douze, ni la
 * parité, ni cette constante. La source était citée pour un chiffre
 * qu'elle ne porte pas.
 *
 * Le commentaire en tête de ce module tient le raisonnement et s'arrête
 * une phrase trop tôt : convertir au taux fixe « n'introduit aucune
 * information non sourcée » — vrai du **taux**, faux du **montant**, qui
 * est une donnée réglementaire recomposée et n'existe sur aucune page
 * officielle.
 */
export const SOURCE_PARITE = "Parité fixe XOF/EUR, régime de change de la zone franc";

/** Devises que le référentiel peut porter. */
export type DeviseSource = "EUR" | "CHF" | "AED" | "XOF" | "USD" | "CAD";

/**
 * Convertit en francs CFA. Rend `null` quand aucune parité sûre n'existe —
 * l'absence de résultat est une information, pas une panne.
 */
export function versXOF(valeur: number, devise: DeviseSource): number | null {
  switch (devise) {
    case "XOF":
      return valeur;
    case "EUR":
      return Math.round(valeur * PARITE_XOF_EUR);
    default:
      return null;
  }
}

export const convertible = (devise: DeviseSource): boolean =>
  versXOF(1, devise) !== null;

/**
 * La même question posée sur une chaîne quelconque — celle que porte un
 * montant du référentiel, dont le type ne garantit rien.
 *
 * Une devise inconnue tombe sur le refus de `versXOF`, comme il se doit :
 * ce qui n'a pas de parité sûre n'est pas converti.
 */
export const paritSure = (devise: string): boolean =>
  versXOF(1, devise as DeviseSource) !== null;

/** Ce qu'un écran écrit quand la comparaison n'est pas possible. */
export const MENTION_NON_COMPARABLE =
  "Montant publié dans une autre monnaie : il n'est pas comparé à ton budget faute de taux de change vérifié.";

/**
 * La même limite, dite là où elle a une conséquence de plus — arbitrage
 * I.B, tranché le 20/09/2026.
 *
 * Sur une fiche ou dans le comparateur, un montant non converti n'est
 * simplement pas comparé. Dans le classement du simulateur, il en sort : la
 * destination est ordonnée sur ses autres critères. Les deux phrases
 * existent séparément parce que la seconde serait fausse partout ailleurs.
 */
export const MENTION_HORS_CLASSEMENT =
  "Montant publié dans une autre monnaie : faute de taux de change vérifié, il n'est pas comparé à ton budget, et le budget n'entre pas dans le classement de cette destination.";

/* ------------------------------------------------------------------ *
 * Ce qu'un montant en francs doit pouvoir dire de lui-même.
 * ------------------------------------------------------------------ */

/**
 * Un montant tel que l'autorité le publie, avant toute transformation.
 */
export interface MontantPublie {
  valeur: number;
  devise: string;
  periodicite: string;
}

/**
 * La provenance des montants affichés en francs — INV-8.
 *
 * Deux transformations se cachaient derrière le chiffre, et aucune ne se
 * lisait : **l'annualisation** d'un montant mensuel, et **la conversion**
 * au taux fixe. La phrase les nomme toutes les deux, avec les montants
 * d'origine, pour que le candidat retrouve les siens sur la page de
 * l'autorité.
 *
 * Elle rend `null` quand rien n'a été transformé : un montant déjà publié
 * en francs et à l'année n'a pas de provenance à raconter, et l'annoncer
 * ferait du bruit là où la source suffit.
 *
 * Une seule phrase, et la parité nommée une seule fois. Une fiche
 * additionne des frais de scolarité et une preuve de fonds : composer une
 * phrase par montant répétait le régime de change autant de fois qu'il y
 * a de lignes, et ce qui compte — que le chiffre est recomposé — se
 * perdait dans la redite.
 */
export function provenanceDesMontants(
  montants: readonly (MontantPublie | null | undefined)[],
): string | null {
  /*
    Un montant **converti** est un montant dont la parité est sûre, et non
    un montant qui n'est pas déjà en francs.

    La différence se voyait sur deux destinations du référentiel. Le franc
    suisse et le dirham n'ont pas de taux ici — c'est la décision même de
    ce module —, et la phrase de provenance les annonçait pourtant
    convertis. Constaté en exécution :

        CH/etudes_permis_b
          montants : CHF → non convertible, CHF → non convertible
          affiché  : « L'autorité publie 1 000 CHF par an et 21 000 CHF
                       par an. Les montants sont convertis au taux fixe de
                       655,957 F pour 1 EUR — Parité fixe XOF/EUR… »

    Rien n'avait été converti, et le taux cité est celui d'une monnaie
    qui n'a rien à voir. C'est exactement ce que ce module refuse deux
    paragraphes plus haut : un nombre plausible qui ne vient de nulle
    part. La fiche suisse n'a donc plus de provenance à raconter — ses
    montants sont publiés tels quels, et le coût porte déjà
    `MENTION_NON_COMPARABLE`.

    Un montant mensuel dans une monnaie sans parité reste transformé, lui :
    il est ramené à l'année, et la phrase le dit sans parler de change.
  */
  const estConverti = (m: MontantPublie) => m.devise !== "XOF" && paritSure(m.devise);
  const transformes = montants
    .filter((m): m is MontantPublie => m != null)
    .filter((m) => m.periodicite === "mensuel" || estConverti(m));
  if (transformes.length === 0) return null;

  /*
    Le geste est accolé au montant qu'il touche, et non annoncé en bloc :
    une fiche mêle un montant annuel et un montant mensuel, et dire « les
    montants sont ramenés à l'année » serait faux du premier. La
    conversion, elle, les touche tous, et se dit une fois — répéter le
    régime de change à chaque ligne noierait ce qui compte.
  */
  const publies = transformes.map((m) => {
    const somme = `${new Intl.NumberFormat("fr-FR").format(m.valeur)} ${m.devise}`;
    return m.periodicite === "mensuel"
      ? `${somme} par mois, ramené à l'année`
      : `${somme} par an`;
  });

  const converti = transformes.some(estConverti);
  const conversion = converti
    ? ` ${transformes.length > 1 ? "Les montants sont convertis" : "Le montant est converti"} au taux fixe de ${new Intl.NumberFormat(
        "fr-FR",
      ).format(PARITE_XOF_EUR)} F pour 1 EUR — ${SOURCE_PARITE}.`
    : "";

  return `L'autorité publie ${liste(publies)}.${conversion}`;
}

/** « a, b et c » — l'énumération française, sans virgule avant le dernier. */
const liste = (elements: readonly string[]): string =>
  elements.length <= 1
    ? (elements[0] ?? "")
    : `${elements.slice(0, -1).join(", ")} et ${elements.at(-1)}`;
