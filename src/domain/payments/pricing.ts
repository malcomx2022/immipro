/**
 * Grille tarifaire. Deux grilles natives, pas une conversion de taux de change.
 * Référence : note de réconciliation, §2.2 ; arbitrages du 13/09/2026.
 */
export type Devise = "XOF" | "EUR";

export interface Pack {
  code: string;
  libelle: string;
  prix: Record<Devise, number>;
  /**
   * Quota IA du pack. Donnée d'exploitation : lue par le back-office (B-07)
   * pour l'alerte de marge, JAMAIS sérialisée vers le client, qui ne voit
   * qu'un compteur d'analyses. Valeurs = ordres de grandeur à régler après
   * l'export du fournisseur sur les dix premiers dossiers réels.
   */
  tokensIA: number;
  destinations: number;
  /** Un seul pack peut être mis en avant sur $-01 : ni remise, ni prix barré, ni prorata. */
  misEnAvant?: true;
}

export const PACKS: Pack[] = [
  { code: "essentiel", libelle: "Essentiel", prix: { XOF: 5000, EUR: 12 }, tokensIA: 120_000, destinations: 1 },
  { code: "dossier", libelle: "Dossier", prix: { XOF: 15000, EUR: 29 }, tokensIA: 400_000, destinations: 1, misEnAvant: true },
  { code: "pro", libelle: "Dossier Pro", prix: { XOF: 45000, EUR: 59 }, tokensIA: 1_200_000, destinations: 3 },
];

/**
 * Achats hors grille de packs. Ils n'ouvrent pas de destination et ne figurent
 * pas dans le choix de $-01 : ils s'achètent depuis un dossier ouvert.
 */
export type TypeAchat = "pack" | "recharge_analyses" | "consultation";

export interface Complement {
  code: string;
  type: Exclude<TypeAchat, "pack">;
  libelle: string;
  prix: Record<Devise, number>;
}

/** Recharge de 10 analyses, achetée là où le quota s'épuise (C-07, RG-06.5). */
export const RECHARGE_ANALYSES: Complement = {
  code: "recharge-10",
  type: "recharge_analyses",
  libelle: "10 analyses supplémentaires",
  prix: { XOF: 3000, EUR: 7 },
};

/**
 * Consultation avec un consultant habilité (WF-12, pack Accompagné, lot 4).
 * Tarif unique ImmiPro, encaissé par ImmiPro ; le consultant ne fixe pas de prix.
 * Montant XOF posé par défaut le 13/09/2026, à confirmer.
 */
export const CONSULTATION: Complement = {
  code: "consultation-45",
  type: "consultation",
  libelle: "Consultation de 45 minutes",
  prix: { XOF: 20000, EUR: 35 },
};

export const CONSULTATION_DUREE_MINUTES = 45;
/** Annulation ou report sans frais jusqu'à ce délai avant le créneau ; au-delà, la consultation est due. */
export const CONSULTATION_ANNULATION_HEURES = 24;

/** En dessous, frais de collecte et coût IA rendent la transaction non rentable (RG-05.5). */
export const MONTANT_MINIMUM_XOF = 3000;

/** Seuil d'alerte de marge : coût IA d'un dossier au-delà de 15 % du prix du pack (RG-16.1). */
export const SEUIL_MARGE_IA = 0.15;

const PAYS_XOF = new Set(["BJ", "CI", "SN", "TG", "BF", "ML", "NE", "GW"]);

export const deviseParDefaut = (countryCode?: string | null): Devise =>
  countryCode && PAYS_XOF.has(countryCode) ? "XOF" : "EUR";

export const getPack = (code: string) => PACKS.find((p) => p.code === code);

export const packMisEnAvant = () => PACKS.find((p) => p.misEnAvant);

/** Vue client d'un pack : tout sauf tokensIA. À utiliser dans toute réponse d'API publique. */
export type PackPublic = Omit<Pack, "tokensIA">;
export const versClient = ({ tokensIA: _ignore, ...pack }: Pack): PackPublic => pack;
