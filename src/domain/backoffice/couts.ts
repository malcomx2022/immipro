import { SEUIL_MARGE_IA } from "@/domain/payments/pricing";

/**
 * Supervision des coûts IA — B-07, WF-16.
 *
 * ── Ce que l'écran mesurait, et ce qu'il inventait ─────────────────────
 *
 * L'écran était livré en état vide, et c'était une décision : tant que dix
 * dossiers réels n'ont pas alimenté `AiUsage`, aucune valeur n'est affichée.
 * La décision tient toujours. Ce qui ne tenait pas, c'est **la condition de
 * sortie de cet état vide**.
 *
 * Elle portait sur le nombre de dossiers. Or le seul endroit qui écrit dans
 * `AiUsage` enregistrait `costMicros: 0` — un zéro littéral, parce qu'aucun
 * tarif de jeton n'existe dans le dépôt. Le premier dossier analysé faisait
 * donc quitter l'état vide et affichait « 0,00 F par dossier » et « 0,0 %
 * au plus haut », face à un plafond de 15 %.
 *
 * L'écran devenait faux au moment précis où il recevait des données, et le
 * mensonge était rassurant : un superviseur lisant 0 % conclut qu'il reste
 * de la marge. Un tiret ne dit rien ; un zéro affirme.
 *
 * ── Ce qui est mesuré, ce qui est tarifé ───────────────────────────────
 *
 * Les jetons sont comptés pour de vrai — le lecteur les rend, la table les
 * garde. **Le prix du jeton, lui, n'est nulle part.** Les deux sont donc
 * séparés : ce qui se compte s'affiche, ce qui se tarife attend son tarif
 * et reste absent d'ici là. Aucun service absent n'est simulé (I.C), et un
 * tarif manquant ne vaut pas zéro.
 *
 * Le coût est **recalculé à la lecture**, depuis les jetons conservés et le
 * tarif du jour. C'est ce que demande WF-16 étape 4 : réviser la grille à
 * partir des coûts réels suppose de pouvoir repasser une grille sur une
 * consommation déjà enregistrée.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

// ── Le tarif, ou son absence ───────────────────────────────────────────

export interface TarifIA {
  /** Prix d'un million de jetons d'entrée, en unités de `devise`. */
  entreeParMillion: number;
  /** Prix d'un million de jetons de sortie. */
  sortieParMillion: number;
  devise: string;
}

export const VARIABLES_TARIF = [
  "AI_TARIF_ENTREE_PAR_MILLION",
  "AI_TARIF_SORTIE_PAR_MILLION",
  "AI_TARIF_DEVISE",
] as const;

/**
 * Le tarif tel qu'il est configuré, ou `null`.
 *
 * Un tarif partiel est un tarif absent : facturer les jetons d'entrée et
 * pas ceux de sortie donnerait un coût inférieur au vrai, c'est-à-dire
 * exactement l'erreur qu'on cherche à éviter. Même forme qu'`etatDesDependances` —
 * l'environnement est passé, jamais lu ici.
 */
export function tarifDepuisEnvironnement(
  environnement: Readonly<Record<string, string | undefined>>,
  /**
   * Les trois noms à lire — ceux du tarif historique par défaut, qui est
   * celui d'Anthropic. Un autre fournisseur passe les siens (S.94, voir
   * `domain/ia/fournisseurs.ts`) : un jeton n'a pas le même prix partout.
   */
  noms: readonly [entree: string, sortie: string, devise: string] = VARIABLES_TARIF,
): TarifIA | null {
  const nombre = (cle: string): number | null => {
    const brut = (environnement[cle] ?? "").trim();
    if (brut.length === 0) return null;
    const valeur = Number(brut);
    return Number.isFinite(valeur) && valeur >= 0 ? valeur : null;
  };

  const entree = nombre(noms[0]);
  const sortie = nombre(noms[1]);
  const devise = (environnement[noms[2]] ?? "").trim();

  if (entree === null || sortie === null || devise.length === 0) return null;
  return { entreeParMillion: entree, sortieParMillion: sortie, devise };
}

/** Coût de jetons déjà consommés, en micro-unités. `null` sans tarif. */
export function coutMicrosDesJetons(
  tarif: TarifIA | null,
  jetonsEntree: number,
  jetonsSortie: number,
): number | null {
  if (tarif === null) return null;
  const unites =
    (jetonsEntree * tarif.entreeParMillion + jetonsSortie * tarif.sortieParMillion) /
    1_000_000;
  return Math.round(unites * 1_000_000);
}

/* ── Le quota du pack, la grandeur qui tient sans tarif ──────────────── */

/**
 * Part du quota de jetons d'un pack déjà consommée — 22/09/2026.
 *
 * `tokensIA` portait, depuis le premier jour, ce commentaire : « donnée
 * d'exploitation, **lue par le back-office (B-07) pour l'alerte de
 * marge** ». Elle ne l'était pas. B-07 mesurait la marge en argent, et
 * seulement en argent : sans tarif configuré, `coutMicros` vaut `null`,
 * `partDuPrix` aussi, et un dossier à dix fois son quota n'apparaissait
 * nulle part.
 *
 * Ce module dit pourtant déjà la bonne règle à propos de
 * l'histogramme : « en jetons, pas en argent — c'est la seule grandeur
 * qui reste juste que le tarif soit configuré ou non ». Elle vaut ici
 * aussi. Le quota du pack est un plafond **en jetons** : il se compare
 * sans connaître le prix de rien.
 *
 * Elle ne remplace pas `partDuPrix`, qui reste la mesure de marge quand
 * un tarif existe. Elle la précède : une consommation hors normes se
 * voit avant qu'on sache ce qu'elle coûte.
 */
export function partDuQuotaIA(jetons: number, quotaDuPack: number | null): number | null {
  // Sans pack payé, il n'y a pas de quota à dépasser. Rendre zéro ferait
  // lire « consommation nulle » là où il n'y a pas de référence.
  if (quotaDuPack === null || quotaDuPack <= 0) return null;
  return jetons / quotaDuPack;
}

/**
 * Au-delà, la consommation de jetons d'un dossier appelle un regard.
 *
 * Cent pour cent, et pas davantage : le quota est ce que le pack a
 * vendu. Le dépasser n'est pas une erreur de la plateforme — rien
 * n'arrête un appel là-dessus, et l'arbitrage en vigueur est que le
 * candidat compte en analyses, pas en jetons (INV-6) — mais c'est
 * exactement ce que l'exploitation doit voir : un dossier qui coûte plus
 * qu'il n'a rapporté, avant même de savoir combien.
 */
export const SEUIL_QUOTA_IA = 1;

export const quotaDepasse = (part: number | null): boolean =>
  part !== null && part >= SEUIL_QUOTA_IA;

export const MENTION_QUOTA_SANS_TARIF =
  "Le quota de jetons du pack se compare sans tarif : c'est la seule alerte disponible tant que le prix du jeton n'est pas renseigné.";

export const MENTION_TARIF_ABSENT =
  "Aucun tarif de jeton n'est configuré : les jetons sont comptés, le coût ne l'est pas. Un tarif manquant ne vaut pas zéro, et un zéro affiché face à un plafond de 15 % se lirait comme de la marge.";

export const COMMENT_TARIFER =
  "Relever le prix du million de jetons d'entrée et de sortie sur le relevé de consommation du fournisseur d'inférence, puis renseigner les trois variables de tarif. Le coût des appels déjà enregistrés se calcule alors sans rien réécrire : seuls les jetons sont conservés.";

// ── Les métriques ──────────────────────────────────────────────────────

export interface Metrique {
  cle: string;
  libelle: string;
  /** D'où viendra la valeur. Affiché sous la métrique, à la place du chiffre. */
  source: string;
  /** Vrai quand la valeur suppose un tarif de jeton. */
  tarifee: boolean;
  /** Valeur mesurée. `null` tant qu'aucune mesure n'existe. */
  valeur: string | null;
}

export const METRIQUES: readonly Metrique[] = [
  {
    cle: "depense-mois",
    libelle: "Dépensé ce mois",
    source: "jetons de AiUsage sur la période, au tarif configuré",
    tarifee: true,
    valeur: null,
  },
  {
    cle: "cout-par-dossier",
    libelle: "Coût IA par dossier payant",
    source: "indicateur qui conditionne la grille tarifaire",
    tarifee: true,
    valeur: null,
  },
  {
    cle: "jetons",
    libelle: "Jetons consommés",
    source: "AiUsage.inputTokens + outputTokens, comptés sans tarif",
    tarifee: false,
    valeur: null,
  },
  {
    cle: "analyses",
    libelle: "Analyses exécutées",
    source: "dont reprises non décomptées au candidat",
    tarifee: false,
    valeur: null,
  },
  {
    cle: "part-du-pack",
    libelle: "Part du prix du pack",
    source: "seuil d'alerte fixé par RG-16.1",
    tarifee: true,
    valeur: null,
  },
];

export const aucuneMesure = (metriques: readonly Metrique[]): boolean =>
  metriques.every((m) => m.valeur === null);

// ── Les garde-fous ─────────────────────────────────────────────────────

export interface GardeFou {
  libelle: string;
  /** Le seuil, exprimé en ratio ou en règle — jamais en montant. */
  seuil: string;
  /** Ce qui se passe au-delà. Un seuil sans conséquence n'est pas un garde-fou. */
  consequence: string;
  /**
   * Vrai quand du code applique réellement la conséquence — 24/09/2026.
   *
   * ── Deux des trois garde-fous ne gardaient rien ─────────────────────
   *
   * L'écran les listait tous les trois avec leur conséquence : « au-delà,
   * la file passe en revue humaine », « email à l'équipe produit ». Aucune
   * des deux n'existe. `plafondQuotidien` et `medianeQuotidienne` sont
   * écrits, testés, et **lus par personne** ; la seule bascule en revue
   * humaine du produit se déclenche sur trois tentatives d'analyse en
   * échec, pas sur un coût ; et le mot « budget » n'apparaît nulle part
   * côté serveur, sinon dans le profil du candidat.
   *
   * Un superviseur lisait donc, sur l'écran fait pour le protéger d'une
   * dérive de coût, qu'un frein automatique existait. Ce fichier condamne
   * lui-même la chose deux lignes plus haut : « un seuil sans conséquence
   * n'est pas un garde-fou ».
   *
   * Le champ dit lequel garde et lequel attend. Même registre que
   * `COMMANDES_ATTENDUES`, vingt lignes plus bas : les retirer sans les
   * nommer ferait disparaître le besoin avec la ligne.
   */
  tenu: boolean;
  /**
   * Ce qui manque pour que la conséquence arrive. Toujours renseigné quand
   * `tenu` est faux, et jamais quand il est vrai — un test le vérifie.
   */
  manque?: string;
}

/** Plafond quotidien : au-delà, la file bascule en revue humaine (WF-16). */
export const FACTEUR_PLAFOND_QUOTIDIEN = 3;
export const JOURS_MEDIANE = 7;
/** Alerte à l'équipe produit avant d'atteindre le budget. */
export const SEUIL_ALERTE_BUDGET = 0.8;

const enPourcent = (ratio: number) =>
  new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(
    ratio,
  );

export const GARDE_FOUS: readonly GardeFou[] = [
  {
    libelle: "Coût IA par dossier",
    seuil: `${enPourcent(SEUIL_MARGE_IA)} du prix du pack`,
    consequence: "au-delà, le dossier entre dans la liste des dépassements (RG-16.1)",
    // Celui-là garde : `depassements` alimente la liste que l'écran affiche,
    // et la mesure de quota la remplit même sans tarif configuré.
    tenu: true,
  },
  {
    libelle: "Plafond quotidien",
    seuil: `${FACTEUR_PLAFOND_QUOTIDIEN} × la médiane des ${JOURS_MEDIANE} derniers jours`,
    consequence: "au-delà, la file devrait passer en revue humaine",
    tenu: false,
    manque:
      "un ouvrier qui compare la dépense du jour au plafond, et une bascule de file : la seule qui existe se déclenche sur trois tentatives d'analyse en échec, pas sur un coût",
  },
  {
    libelle: "Alerte de dépassement",
    seuil: `${enPourcent(SEUIL_ALERTE_BUDGET)} du budget`,
    consequence: "un email devrait partir à l'équipe produit",
    tenu: false,
    manque:
      "un budget : aucun montant de référence n'existe dans le produit, et en poser un ici serait écrire une spécification depuis un écran",
  },
];

/**
 * Ce que l'écran écrit à côté d'un garde-fou qui n'en est pas encore un.
 *
 * Il ne dit pas « bientôt » : le registre nomme ce qui manque, pas une date.
 */
export const MENTION_GARDE_FOU_NON_TENU =
  "Ce seuil est écrit, il n'est pas appliqué : rien dans le produit ne déclenche encore sa conséquence.";

/** Les garde-fous qui gardent réellement. */
export const gardeFousTenus = (
  gardeFous: readonly GardeFou[] = GARDE_FOUS,
): readonly GardeFou[] => gardeFous.filter((g) => g.tenu);

/**
 * « un garde-fou sur trois est appliqué ». Dit en tête de section, pour
 * qu'un superviseur le sache avant de lire la liste et non après.
 */
export function libelleDesGardeFous(gardeFous: readonly GardeFou[] = GARDE_FOUS): string {
  const tenus = gardeFousTenus(gardeFous).length;
  const total = gardeFous.length;
  if (tenus === total) return `${total} seuils, tous appliqués`;
  return `${tenus} seuil${tenus > 1 ? "s" : ""} appliqué${tenus > 1 ? "s" : ""} sur ${total}`;
}

/**
 * Médiane des sept derniers jours, base du plafond quotidien. Elle résiste à
 * une journée exceptionnelle là où une moyenne la laisserait relever le
 * plafond — c'est tout l'intérêt de prendre la médiane.
 */
export function medianeQuotidienne(depenses: readonly number[]): number | null {
  if (depenses.length === 0) return null;
  const triees = [...depenses].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? triees[milieu]!
    : (triees[milieu - 1]! + triees[milieu]!) / 2;
}

export function plafondQuotidien(depenses: readonly number[]): number | null {
  const mediane = medianeQuotidienne(depenses.slice(-JOURS_MEDIANE));
  return mediane === null ? null : mediane * FACTEUR_PLAFOND_QUOTIDIEN;
}

// ── L'histogramme quotidien ────────────────────────────────────────────

/** Une journée de consommation. Les jetons se comptent sans tarif. */
export interface Journee {
  /** ISO court, `AAAA-MM-JJ`. */
  jour: string;
  jetons: number;
  appels: number;
}

/**
 * La série affichée, un point par jour, du plus ancien au plus récent.
 *
 * Les jours sans appel valent zéro et restent visibles : c'est ce que la
 * mention d'état vide promet depuis le début, et les masquer ferait paraître
 * régulière une consommation qui ne l'est pas — le jour où la file s'arrête
 * est précisément celui qu'un superviseur doit voir.
 */
export function serieQuotidienne(
  relevees: readonly Journee[],
  finIso: string,
  jours: number,
): readonly Journee[] {
  const connues = new Map(relevees.map((j) => [j.jour, j]));
  const fin = Date.parse(`${finIso}T00:00:00Z`);
  if (Number.isNaN(fin) || jours <= 0) return [];

  return Array.from({ length: jours }, (_, rang) => {
    const date = new Date(fin - (jours - 1 - rang) * 86_400_000);
    const jour = date.toISOString().slice(0, 10);
    return connues.get(jour) ?? { jour, jetons: 0, appels: 0 };
  });
}

/** Hauteur d'une barre, en part du maximum de la série. Zéro quand tout est nul. */
export function hauteurRelative(journee: Journee, serie: readonly Journee[]): number {
  const maximum = serie.reduce((haut, j) => Math.max(haut, j.jetons), 0);
  return maximum === 0 ? 0 : journee.jetons / maximum;
}

export const serieVide = (serie: readonly Journee[]): boolean =>
  serie.every((j) => j.appels === 0);

export const MENTION_ETAT_VIDE =
  "L'histogramme se remplit dès la première écriture dans AiUsage. Un jour sans appel reste affiché à zéro, pas masqué.";

export const MENTION_HISTOGRAMME_EN_JETONS =
  "L'histogramme compte des jetons, pas de l'argent : il reste juste que le tarif soit configuré ou non.";

// ── Les dépassements individuels — RG-16.2 ─────────────────────────────

/**
 * Un dossier dont le coût IA dépasse la part admise du prix du pack.
 *
 * L'écran n'en montrait aucun : il réduisait la série à « X % au plus
 * haut », sans jamais nommer le dossier concerné. RG-16.2 demande une
 * analyse à chaque dépassement individuel — elle ne peut pas commencer sur
 * un pourcentage anonyme.
 */
/**
 * Un dossier qui appelle un regard, et **ce qui le lui vaut**.
 *
 * La nature n'est pas décorative : les deux mesures ne se lisent pas de
 * la même façon et ne se réparent pas pareil. Une marge dépassée
 * interroge la grille tarifaire ; un quota de jetons dépassé interroge
 * le dossier lui-même, et se voit **sans tarif configuré**.
 */
export type NatureDuDepassement = "marge" | "quota";

export interface Depassement {
  dossierId: string;
  pack: string;
  /** Part du prix du pack, ou part du quota de jetons, selon `nature`. */
  part: number;
  nature: NatureDuDepassement;
  appels: number;
}

/**
 * Les dossiers au-delà de leur seuil, le plus alarmant d'abord.
 *
 * Deux seuils, parce qu'il y a deux mesures et qu'elles ne partagent
 * pas leur condition d'existence. Un dossier peut figurer pour les deux
 * raisons : ce sont deux constats, et les confondre en un seul ferait
 * disparaître celui qui tient sans tarif.
 */
export const depassements = (
  candidats: readonly Depassement[],
  seuil: number = SEUIL_MARGE_IA,
  seuilDeQuota: number = SEUIL_QUOTA_IA,
): readonly Depassement[] =>
  [...candidats]
    .filter((d) => d.part > (d.nature === "quota" ? seuilDeQuota : seuil))
    .sort((a, b) => b.part - a.part);

export function libelleDepassement(depassement: Depassement): string {
  const part = new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(depassement.part);
  const appels = `${depassement.appels} appel${depassement.appels > 1 ? "s" : ""}`;
  return depassement.nature === "quota"
    ? `${part} du quota de jetons du pack ${depassement.pack}, sur ${appels}`
    : `${part} du prix du pack ${depassement.pack}, sur ${appels}`;
}

export const MENTION_AUCUN_DEPASSEMENT =
  "Aucun dossier ne dépasse la part admise du prix de son pack.";

export const MENTION_DEPASSEMENTS_NON_CALCULABLES =
  "Les dépassements individuels ne peuvent pas être relevés sans tarif : c'est un rapport entre un coût et un prix, et le coût manque (RG-16.2).";

export const ANALYSE_ATTENDUE =
  "Chaque dépassement appelle une analyse : c'est souvent le signe d'un usage détourné ou d'une boucle de correction mal bornée (RG-16.2).";

// ── Les mesures ────────────────────────────────────────────────────────

export interface Mesure {
  dossiers: number;
  jetons: number;
  appels: number;
  /**
   * Somme des coûts, en micro-unités de la devise de facturation. `null`
   * quand aucun tarif n'est configuré — jamais zéro, qui se lirait comme
   * une dépense nulle.
   */
  coutMicros: number | null;
  /** Plus forte part du prix d'un pack consommée en IA, sur un dossier. */
  pirePart: number | null;
  /** La devise du tarif, pour libeller les montants. */
  devise: string | null;
}

export function metriquesMesurees(mesure: Mesure): readonly Metrique[] {
  if (mesure.dossiers === 0) return METRIQUES;

  const nombre = (n: number, decimales = 0) =>
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(n);

  const valeurs: Record<string, string> = {
    jetons: `${nombre(mesure.jetons)} jetons`,
    analyses: `${nombre(mesure.appels)} appels`,
  };

  if (mesure.coutMicros !== null) {
    const cout = mesure.coutMicros / 1_000_000;
    const unite = mesure.devise ?? "";
    valeurs["depense-mois"] = `${nombre(cout, 2)} ${unite}`.trim();
    valeurs["cout-par-dossier"] =
      `${nombre(cout / mesure.dossiers, 2)} ${unite}`.trim() +
      ` sur ${mesure.dossiers} dossier${mesure.dossiers > 1 ? "s" : ""}`;
    valeurs["part-du-pack"] =
      mesure.pirePart === null
        ? "aucun pack payé"
        : `${nombre(mesure.pirePart * 100, 1)} % au plus haut`;
  }

  return METRIQUES.map((m) => ({ ...m, valeur: valeurs[m.cle] ?? null }));
}

/**
 * La forme minimale d'une ligne de coût, telle que la mesure la lit.
 *
 * Elle est structurelle exprès : la lecture renvoie davantage — le prix du
 * pack, la devise d'encaissement —, et rien de tout cela n'entre dans un
 * agrégat. Le domaine n'a pas à connaître la table.
 */
export interface LigneMesurable {
  dossierId: string;
  appels: number;
  jetonsEntree: number;
  jetonsSortie: number;
  coutMicros: number | null;
  pack: string | null;
  partDuPrix: number | null;
  /** Part du quota de jetons du pack. Ne demande aucun tarif. */
  partDuQuota: number | null;
}

/**
 * L'agrégat affiché par B-07.
 *
 * Il vivait dans la page, en quatre `reduce` empilés, et aucun test ne
 * l'atteignait : remplacer la somme prudente par un `?? 0` ne faisait rien
 * échouer. C'est la même leçon que dans les lots précédents — un calcul
 * qu'aucun test ne peut appeler est un calcul que rien ne tient.
 *
 * **Une seule ligne non tarifée rend la somme fausse.** Elle vaut alors
 * `null` : additionner ce qu'on sait facturer avec ce qu'on ne sait pas
 * donnerait un total inférieur au vrai, présenté comme un total.
 */
export function mesureDepuisLesLignes(
  lignes: readonly LigneMesurable[],
  devise: string | null,
): Mesure {
  const tarifees = lignes.every((l) => l.coutMicros !== null);
  return {
    dossiers: lignes.length,
    jetons: lignes.reduce((n, l) => n + l.jetonsEntree + l.jetonsSortie, 0),
    appels: lignes.reduce((n, l) => n + l.appels, 0),
    coutMicros: tarifees
      ? lignes.reduce((somme, l) => somme + (l.coutMicros ?? 0), 0)
      : null,
    pirePart: lignes.reduce<number | null>(
      (pire, l) => (l.partDuPrix === null ? pire : Math.max(pire ?? 0, l.partDuPrix)),
      null,
    ),
    devise,
  };
}

/** Les dossiers dont la part du pack est connue : eux seuls peuvent dépasser. */
/**
 * Ce qui alimente la liste d'alerte — correctif du 22/09/2026.
 *
 * Elle écartait toute ligne dont `partDuPrix` valait `null`, c'est-à-dire
 * **toutes** tant qu'aucun tarif de jeton n'est configuré. La liste ne
 * pouvait donc pas être non vide, et un dossier à dix fois son quota
 * n'apparaissait nulle part — alors que `tokensIA` existait pour cela, et
 * que son commentaire annonçait déjà « lue par le back-office (B-07) pour
 * l'alerte de marge ».
 *
 * Les deux mesures alimentent maintenant la liste, chacune quand elle
 * existe. Sans tarif, il reste celle des jetons ; avec, les deux se
 * lisent côte à côte.
 */
export const candidatsAuDepassement = (
  lignes: readonly LigneMesurable[],
): readonly Depassement[] =>
  lignes.flatMap((l) => {
    if (l.pack === null) return [];
    const commun = { dossierId: l.dossierId, pack: l.pack, appels: l.appels };
    return [
      ...(l.partDuPrix === null
        ? []
        : [{ ...commun, part: l.partDuPrix, nature: "marge" as const }]),
      ...(l.partDuQuota === null
        ? []
        : [{ ...commun, part: l.partDuQuota, nature: "quota" as const }]),
    ];
  });

export const COMMENT_SE_REMPLIT =
  "Dix dossiers complets réels passés dans le pipeline, AiUsage enregistré à chaque appel. Une semaine suffit pour obtenir le coût moyen par type de pièce.";

export const POURQUOI_AUCUNE_VALEUR =
  "Tant que cette mesure n'existe pas, l'écran n'affiche aucune valeur : un chiffre posé ici serait repris comme une spécification.";

export const MENTION_SANS_DONNEE_CANDIDAT =
  "Aucune donnée de candidat n'apparaît sur cet écran : seuls les volumes et les coûts sont remontés.";

/**
 * Nombre de dossiers réels attendus avant de tenir la grille pour mesurée.
 *
 * Il vient de la note de tarification : les quotas de tokens des packs sont
 * des hypothèses jusqu'à cette mesure. Le dire ici permet à l'écran
 * d'annoncer où il en est plutôt que de rester muet.
 */
export const DOSSIERS_POUR_MESURER = 10;

// ── Ce que l'écran ne peut pas faire ───────────────────────────────────

/**
 * Ce que B-07 ne peut pas faire.
 *
 * Elles étaient deux, à l'écran sans être reliées à rien. « Exporter le
 * détail des appels » est rétablie (S.122, `appels-ia.ts`) ; reste
 * « Modifier les plafonds ».
 *
 * Même registre qu'`ACTIONS_ATTENDUES` en B-03 : la retirer sans la
 * nommer ferait disparaître le besoin avec le bouton. Elle ne manque pas
 * d'une route, elle demande qu'on décide si elle doit exister — et cette
 * décision attend l'arbitrage.
 */
export interface CommandeAttendue {
  cle: string;
  libelle: string;
  manque: string;
}

export const COMMANDES_ATTENDUES: readonly CommandeAttendue[] = [
  {
    cle: "modifier-plafonds",
    libelle: "Modifier les plafonds",
    /**
     * Les trois seuils affichés sont des constantes, et deux d'entre eux
     * sont des règles de gestion : les 15 % viennent de RG-16.1. Aucune
     * colonne ne les porte, et c'est cohérent — un plafond réglable depuis
     * un écran est un plafond que l'exploitation relève le jour où il gêne,
     * c'est-à-dire le jour où il sert. Ce qui manque n'est donc pas une
     * route, c'est l'arbitrage : lesquels de ces seuils sont des réglages
     * et lesquels sont des règles.
     */
    manque:
      "un arbitrage : lesquels de ces seuils sont des réglages, et lesquels restent des règles de gestion",
  },
];
