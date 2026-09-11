/**
 * Grille tarifaire. Deux grilles natives, pas une conversion de taux de change.
 * Référence : note de réconciliation, §2.2.
 */
export type Devise = "XOF" | "EUR";

export interface Pack {
  code: string;
  libelle: string;
  prix: Record<Devise, number>;
  tokensIA: number;
  destinations: number;
}

export const PACKS: Pack[] = [
  { code: "essentiel", libelle: "Essentiel", prix: { XOF: 5000, EUR: 12 }, tokensIA: 120_000, destinations: 1 },
  { code: "dossier", libelle: "Dossier", prix: { XOF: 15000, EUR: 29 }, tokensIA: 400_000, destinations: 1 },
  { code: "pro", libelle: "Dossier Pro", prix: { XOF: 45000, EUR: 59 }, tokensIA: 1_200_000, destinations: 3 },
];

/** En dessous, frais de collecte et coût IA rendent la transaction non rentable (RG-05.5). */
export const MONTANT_MINIMUM_XOF = 3000;

const PAYS_XOF = new Set(["BJ", "CI", "SN", "TG", "BF", "ML", "NE", "GW"]);

export const deviseParDefaut = (countryCode?: string | null): Devise =>
  countryCode && PAYS_XOF.has(countryCode) ? "XOF" : "EUR";

export const getPack = (code: string) => PACKS.find((p) => p.code === code);
