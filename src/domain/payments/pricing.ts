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
  /**
   * Analyses de pièces ouvertes par le pack — l'unité que compte le
   * candidat, et celle du grand livre `AnalysisCredit` (INV-6).
   *
   * Elle est distincte de `tokensIA`, qui est la contrepartie interne : un
   * pack se vend en analyses, il se consomme en jetons. Les deux chiffres
   * vivaient jusqu'ici dans la même phrase de commentaire, et la première
   * écriture de quota aurait dû en recopier un à la main. Un nombre
   * recopié diverge.
   */
  analyses: number;
  destinations: number;
  /**
   * Mise en avant de $-01. Un seul pack la porte, et le test le garantit :
   * la décision sort du domaine, jamais du composant, pour que l'écran ne
   * puisse pas rediverger du code comme le prototype l'a fait.
   *
   * Essentiel reste premier dans l'ordre de lecture sans être recommandé :
   * il répond à « combien ça coûte », la mise en avant répond à « lequel me
   * faut-il ». Les deux questions n'ont pas la même réponse.
   */
  misEnAvant: boolean;
  /**
   * Texte du badge. Factuel, jamais commercial : il dit ce que le pack
   * couvre, il ne dit pas qu'il est populaire. Même règle qu'INV-1 — on
   * justifie, on ne survend pas.
   */
  justification: string;
}

/** L'ordre est celui de lecture de $-01 : Essentiel d'abord, prix croissant. */
export const PACKS: Pack[] = [
  {
    code: "essentiel",
    libelle: "Essentiel",
    prix: { XOF: 5000, EUR: 12 },
    tokensIA: 120_000,
    analyses: 10,
    destinations: 1,
    misEnAvant: false,
    justification: "Une destination, dix analyses de pièces",
  },
  {
    code: "dossier",
    libelle: "Dossier",
    prix: { XOF: 15000, EUR: 29 },
    tokensIA: 400_000,
    analyses: 30,
    destinations: 1,
    misEnAvant: true,
    justification: "Couvre l'ensemble des pièces exigées pour cette destination",
  },
  {
    code: "pro",
    libelle: "Dossier Pro",
    prix: { XOF: 45000, EUR: 59 },
    tokensIA: 1_200_000,
    analyses: 90,
    destinations: 3,
    misEnAvant: false,
    justification: "Trois destinations comparées en parallèle",
  },
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
  /**
   * Volume acheté, dans l'unité du complément : des analyses pour une
   * recharge, des minutes pour une consultation. C'est la grandeur que
   * `MARGE_MINIMALE_RECHARGE` mettra en regard du prix le jour où le coût
   * réel d'une analyse sera mesuré ; l'écran C-07 la lit déjà, pour qu'un
   * volume révisé change le message sans qu'on ait à y penser.
   */
  volume: number;
}

/**
 * Ce que la règle ci-dessus attend encore.
 *
 * La recharge est libellée en analyses, les packs sont contingentés en
 * tokens : tant que les deux ne sont pas dans la même unité, n'importe quel
 * prix crée un arbitrage sans qu'on le voie. Le volume de la recharge — et
 * donc l'application de `MARGE_MINIMALE_RECHARGE` — attend la mesure du coût
 * réel d'une analyse sur les dix premiers dossiers.
 *
 * Relevé au 18/09/2026, à titre d'ordre de grandeur et non de vérité :
 * les packs annoncent 10, 30 et 90 analyses pour 120 k, 400 k et 1,2 M de
 * tokens, soit 12 000 à 13 333 tokens par analyse. À ce volume, une recharge
 * de dix analyses vaut un quota Essentiel entier, et aucun prix compatible
 * avec le plancher de 3 000 F ne satisfait la règle : c'est le volume qu'il
 * faut reprendre, pas le montant.
 */

export const RECHARGE_ANALYSES: Complement = {
  code: "recharge-10",
  type: "recharge_analyses",
  libelle: "10 analyses supplémentaires",
  prix: { XOF: 3000, EUR: 7 },
  volume: 10,
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
  volume: 45,
};

export const CONSULTATION_DUREE_MINUTES = CONSULTATION.volume;
/** Annulation ou report sans frais jusqu'à ce délai avant le créneau ; au-delà, la consultation est due. */
export const CONSULTATION_ANNULATION_HEURES = 24;

/** En dessous, frais de collecte et coût IA rendent la transaction non rentable (RG-05.5). */
export const MONTANT_MINIMUM_XOF = 3000;

/**
 * Commission perçue par ImmiPro sur un entretien de consultant partenaire
 * (WF-13, écran T-03).
 *
 * Elle vit ici et non dans l'écran : le taux annoncé au candidat et le taux
 * appliqué à la facturation doivent être le même nombre. Le prototype
 * l'écrivait uniquement dans T-03, sans support en code — la première
 * facturation aurait pu diverger de la mention sans que rien ne le signale.
 *
 * Le taux est annoncé dans l'écran de proposition lui-même, jamais renvoyé
 * aux conditions générales : une recommandation rémunérée non déclarée est
 * un conflit d'intérêts, quel que soit le sérieux du partenaire.
 */
export const COMMISSION_PARTENAIRE = 0.15;

/** Taux de commission mis en forme pour l'affichage : « 15 % ». */
export const tauxCommissionFormate = (): string =>
  new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(
    COMMISSION_PARTENAIRE,
  );



/** Seuil d'alerte de marge : coût IA d'un dossier au-delà de 15 % du prix du pack (RG-16.1). */
export const SEUIL_MARGE_IA = 0.15;

const PAYS_XOF = new Set(["BJ", "CI", "SN", "TG", "BF", "ML", "NE", "GW"]);

export const deviseParDefaut = (countryCode?: string | null): Devise =>
  countryCode && PAYS_XOF.has(countryCode) ? "XOF" : "EUR";

export const getPack = (code: string) => PACKS.find((p) => p.code === code);

export const packMisEnAvant = () => PACKS.find((p) => p.misEnAvant);

/**
 * Règle de tarification de la recharge, arrêtée le 18/09/2026.
 *
 * Une recharge doit rester strictement plus chère au token que le pack le
 * plus cher au token, avec une marge d'au moins 50 %. Sans cette règle, le
 * volume de la recharge crée un arbitrage invisible : il devient rationnel
 * de n'acheter que le pack d'entrée et de recharger, et personne ne voit
 * l'erreur avant de lire les comptes.
 *
 * Le test `tarification` la vérifie. Les quotas `tokensIA` étant eux-mêmes
 * des hypothèses, c'est la règle qui tient, pas les montants : la mesure sur
 * dix dossiers réels les refera, la règle restera.
 */
export const MARGE_MINIMALE_RECHARGE = 1.5;

/** Prix au millier de tokens le plus élevé de la grille, par devise. */
export const pireTauxParPack = (devise: Devise): number =>
  Math.max(...PACKS.map((p) => p.prix[devise] / p.tokensIA));

/** Vue client d'un pack : tout sauf tokensIA. À utiliser dans toute réponse d'API publique. */
export type PackPublic = Omit<Pack, "tokensIA">;
export const versClient = ({ tokensIA: _ignore, ...pack }: Pack): PackPublic => pack;
