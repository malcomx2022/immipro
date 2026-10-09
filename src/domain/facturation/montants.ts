/**
 * Montants d'une facture : TVA, unités, et somme en toutes lettres — avis
 * comptable M.C du 04/10/2026.
 *
 * ── Les prix de la grille sont toutes taxes comprises ───────────────
 *
 * Décision de la direction du 04/10/2026 : le candidat paie le montant
 * affiché, quel que soit le régime. Si Rêveur Digital est assujettie, la
 * facture **extrait** la TVA du prix payé (hors taxes = TTC / (1 + taux)) ;
 * aucun prix affiché ne change. Le régime lui-même reste « à confirmer »
 * dans l'avis : il se déclare (`regimeDeTva`), il ne se devine pas.
 *
 * ── Les montants s'expriment en unités mineures ─────────────────────
 *
 * La grille est en unités entières — 5 000 F, 12 € — et cela suffit au
 * franc CFA, qui n'a pas de subdivision en usage. L'euro en a une, et la
 * TVA extraite de 12 € tombe sur des centimes (10,17 € + 1,83 €). La
 * facture compte donc en unités mineures : le franc pour le XOF, le
 * centime pour l'EUR. Un hors-taxes et une TVA arrondis séparément
 * pourraient ne plus faire le total ; ici la TVA est **la différence**, et
 * la somme tient par construction.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type Regime =
  | { declare: true; assujettie: false }
  | { declare: true; assujettie: true; tauxBp: number }
  /** Rien n'est déclaré, ou la valeur ne se lit pas : la série réelle reste fermée. */
  | { declare: false; illisible: boolean };

/**
 * Le régime de TVA déclaré par l'exploitant, depuis `FACTURATION_TVA`.
 *
 * - `non_assujettie` : aucune TVA n'est facturée ;
 * - un taux en pour cent (`18`, `18%`, `18,5`) : la TVA est extraite du prix ;
 * - vide ou absent : rien n'est déclaré.
 *
 * Toute autre valeur est **illisible**, et se lit comme non déclarée : une
 * coquille ne doit pas devenir un taux.
 */
export function regimeDeTva(brut: string | undefined | null): Regime {
  const valeur = (brut ?? "").trim().replace(/^["']|["']$/gu, "").trim().toLowerCase();
  if (valeur === "") return { declare: false, illisible: false };
  if (valeur === "non_assujettie") return { declare: true, assujettie: false };
  const taux = /^(\d{1,2})(?:[.,](\d{1,2}))?\s*%?$/u.exec(valeur);
  if (taux) {
    const entier = Number(taux[1]);
    const decimales = (taux[2] ?? "").padEnd(2, "0");
    const tauxBp = entier * 100 + Number(decimales);
    if (tauxBp > 0 && tauxBp < 10_000) return { declare: true, assujettie: true, tauxBp };
  }
  return { declare: false, illisible: true };
}

/**
 * Les devises sans sous-unité.
 *
 * La plateforme compte ses prix en unités entières — 12 € s'écrit `12`,
 * 5 000 F s'écrit `5000` (`Transaction.amountMajor`). Les pièces, les
 * remboursements et les fournisseurs comptent en plus petite unité pour
 * les devises qui en ont une : 12 € valent 1 200 centimes. Le franc CFA
 * n'en a pas, et le convertir le multiplierait par cent.
 *
 * Une seule table depuis la revue du 07/10/2026 (M18) : le tunnel de
 * paiement en tenait une seconde (`versSousUnite`), qui ne disait pas la
 * même chose qu'ici d'une devise ni l'une ni l'autre. Une erreur d'un
 * facteur cent sur un débit réel ne doit avoir qu'un endroit où vivre.
 */
export const SANS_SOUS_UNITE: ReadonlySet<string> = new Set(["XOF"]);

/** Combien d'unités mineures dans une unité de la devise. */
export const facteurMineur = (devise: string): number =>
  SANS_SOUS_UNITE.has(devise.toUpperCase()) ? 1 : 100;

/** Un montant en unités entières (la grille, le prix payé) en unités mineures. */
export const versMineur = (montant: number, devise: string): number =>
  Math.round(montant * facteurMineur(devise));

/** Un montant en unités mineures (un fournisseur, une pièce) en unités entières. */
export const depuisMineur = (mineur: number, devise: string): number =>
  mineur / facteurMineur(devise);

/**
 * Le prix payé d'une transaction, en unités mineures : ce que porte une
 * facture et ce à quoi un remboursement se compare. Il s'écrivait
 * `versMineur(transaction.amount, transaction.currency)` en treize endroits.
 */
export const prixPayeMineur = (transaction: { amountMajor: number; currency: string }): number =>
  versMineur(transaction.amountMajor, transaction.currency);

export interface Ventilation {
  ht: number;
  tva: number;
  ttc: number;
  /** Nul quand aucune TVA n'est facturée. */
  tauxBp: number | null;
}

/**
 * Hors taxes, TVA et total d'un prix payé, en unités mineures.
 *
 * Non assujettie, ou régime non déclaré : la TVA est nulle et le hors-taxes
 * est le total. Une pièce émise sans régime déclaré n'existe que dans la
 * série d'essai, qui le dit.
 */
export function ventiler(ttc: number, regime: Regime): Ventilation {
  if (!Number.isInteger(ttc) || ttc < 0) {
    throw new RangeError(`Montant invalide : ${ttc}. Une facture porte un montant entier positif.`);
  }
  if (!regime.declare || !regime.assujettie) return { ht: ttc, tva: 0, ttc, tauxBp: null };
  const ht = Math.round((ttc * 10_000) / (10_000 + regime.tauxBp));
  return { ht, tva: ttc - ht, ttc, tauxBp: regime.tauxBp };
}

/** « 18 % », « 18,5 % » : le taux tel qu'il s'imprime. */
export function libelleDuTaux(tauxBp: number): string {
  const entier = Math.trunc(tauxBp / 100);
  const reste = tauxBp % 100;
  return reste === 0 ? `${entier} %` : `${entier},${String(reste).padStart(2, "0").replace(/0$/u, "")} %`;
}

/** Ce que dit la pièce de la TVA, selon le régime déclaré. */
export function mentionDeTva(regime: Regime): string {
  if (!regime.declare) return "Régime de TVA non déclaré : pièce d'essai uniquement.";
  if (!regime.assujettie) return "TVA non facturée : l'émetteur n'est pas assujetti à la TVA.";
  return `TVA au taux de ${libelleDuTaux(regime.tauxBp)}, comprise dans le prix payé.`;
}

/** Un montant en unités mineures, pour l'affichage : « 5 000 F », « 10,17 € ». */
export function formatMineur(mineur: number, devise: string): string {
  const facteur = facteurMineur(devise);
  const nombre = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: facteur === 1 ? 0 : 2,
    maximumFractionDigits: facteur === 1 ? 0 : 2,
  }).format(mineur / facteur);
  if (devise === "XOF") return `${nombre} F CFA`;
  if (devise === "EUR") return `${nombre} €`;
  return `${nombre} ${devise}`;
}

/* ------------------------------------------------------------------ *
 * La somme en toutes lettres — exigée par l'avis.
 * ------------------------------------------------------------------ */

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
];
const DIZAINES: Record<number, string> = {
  2: "vingt",
  3: "trente",
  4: "quarante",
  5: "cinquante",
  6: "soixante",
};

function moinsDeCent(n: number): string {
  if (n < 17) return UNITES[n]!;
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.trunc(n / 10);
  const u = n % 10;
  if (d <= 6) {
    const base = DIZAINES[d]!;
    if (u === 0) return base;
    if (u === 1) return `${base} et un`;
    return `${base}-${UNITES[u]}`;
  }
  if (d === 7) return u === 1 ? "soixante et onze" : `soixante-${moinsDeCent(10 + u)}`;
  if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${UNITES[u]}`;
  return `quatre-vingt-${moinsDeCent(10 + u)}`;
}

function moinsDeMille(n: number): string {
  const c = Math.trunc(n / 100);
  const r = n % 100;
  if (c === 0) return moinsDeCent(r);
  const centaines = c === 1 ? "cent" : `${UNITES[c]} cent`;
  if (r === 0) return c === 1 ? centaines : `${centaines}s`;
  return `${centaines} ${moinsDeCent(r)}`;
}

/** « Mille » est invariable, et « vingt » et « cent » perdent leur s devant lui. */
const devantMille = (mots: string): string => mots.replace(/(vingt|cent)s$/u, "$1");

/** Un entier en toutes lettres, orthographe traditionnelle. */
export function enLettres(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) {
    throw new RangeError(`Hors de portée : ${n}.`);
  }
  if (n === 0) return "zéro";
  const milliards = Math.trunc(n / 1e9);
  const millions = Math.trunc((n % 1e9) / 1e6);
  const milliers = Math.trunc((n % 1e6) / 1e3);
  const reste = n % 1e3;
  const morceaux: string[] = [];
  if (milliards) morceaux.push(`${moinsDeMille(milliards)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) morceaux.push(`${moinsDeMille(millions)} million${millions > 1 ? "s" : ""}`);
  if (milliers) morceaux.push(milliers === 1 ? "mille" : `${devantMille(moinsDeMille(milliers))} mille`);
  if (reste) morceaux.push(moinsDeMille(reste));
  return morceaux.join(" ");
}

/** « Un million de francs », mais « un million deux cents francs ». */
const avecDe = (mots: string): string => (/(million|milliard)s?$/u.test(mots) ? `${mots} de` : mots);

/**
 * La somme d'une pièce en toutes lettres, depuis les unités mineures.
 *
 *     500000 XOF → « cinq cent mille francs CFA »
 *     1017 EUR   → « dix euros et dix-sept centimes »
 */
export function montantEnLettres(mineur: number, devise: string): string {
  if (devise === "EUR") {
    const euros = Math.trunc(mineur / 100);
    const centimes = mineur % 100;
    const partieEuros = `${avecDe(enLettres(euros))} euro${euros > 1 ? "s" : ""}`;
    if (centimes === 0) return partieEuros;
    return `${partieEuros} et ${enLettres(centimes)} centime${centimes > 1 ? "s" : ""}`;
  }
  if (devise === "XOF") return `${avecDe(enLettres(mineur))} franc${mineur > 1 ? "s" : ""} CFA`;
  return `${enLettres(mineur)} ${devise}`;
}
