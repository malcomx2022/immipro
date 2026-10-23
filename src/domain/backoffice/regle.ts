import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
  type Faute,
} from "@/domain/copy/vocabulaire-interdit";
import {
  raisonsDIncompletabilite,
  textesCandidat,
  type VisaRulesPayload,
} from "@/domain/rules/schema";

/**
 * Édition d'une règle versionnée — B-02, WF-14, INV-3 et INV-8.
 *
 * Deux garanties portées par ce module.
 *
 * **INV-3.** Publier une version n'en migre aucun dossier. Chaque dossier
 * garde la version qu'il a figée et son candidat reçoit l'écran d'arbitrage
 * T-02. L'effet de publication est donc calculé et montré *avant* : combien
 * de dossiers sont alertés, combien passent en arbitrage, et zéro migré.
 *
 * **Le troisième point d'application du vocabulaire interdit.** Les champs
 * que l'administrateur écrit pour le candidat — libellé de checklist,
 * réserve affichée en contexte — passent la même liste que `check:copy` et
 * que le test de l'interface. Sans cela, le garde-fou ne protégeait que le
 * code.
 *
 * Le guide pays, que ce commentaire citait comme l'exemple du trou, n'était
 * alors éditable par personne : il vivait dans un fichier du dépôt. Il a
 * son propre point d'application depuis J.C — `domain/editorial/document.ts`,
 * pour B-08.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type NiveauSource = "OFFICIEL" | "INSTITUTIONNEL" | "SECONDAIRE";

export const LIBELLE_NIVEAU: Record<NiveauSource, string> = {
  OFFICIEL: "Officiel",
  INSTITUTIONNEL: "Institutionnel",
  SECONDAIRE: "Secondaire",
};

/**
 * INV-4 : une règle de source secondaire n'est jamais visible par le
 * candidat. Le filtrage se fait dans la requête, pas dans l'affichage — et
 * l'écran d'édition le dit, pour que l'administrateur sache ce qu'il produit.
 */
export const visiblePourLeCandidat = (niveau: NiveauSource): boolean =>
  niveau !== "SECONDAIRE";

export interface Regle {
  /** Version du référentiel. `Application.visaRuleId` fige celle d'un dossier. */
  version: number;
  pays: string;
  procedure: string;
  niveauSource: NiveauSource;
  source: string;
  /**
   * Montant exigé, ou `null` quand l'autorité n'en publie aucun.
   *
   * Même correctif que `VersionRegle` côté candidat, et pour la même
   * raison : `fonds?.valeur ?? 0` avec une devise vide écrivait « 0 € »
   * dans le champ de B-02, et la ligne de comparaison N/N+1 annonçait une
   * exigence passée à zéro là où l'autorité n'en publie simplement pas.
   */
  montant: MontantExige | null;
  intituleMontant: string;
  /** Entrée en vigueur, ISO. */
  applicableDepuis: string;
  delaiInstruction: string;
  prochaineRelecture: string;
  /** Texte repris tel quel dans la checklist du candidat. */
  libelleCandidat: string;
  /** Réserve affichée en contexte sous la règle. */
  reserveCandidat: string;
  /**
   * Les conditions de la version, dans l'ordre du référentiel — C-12.
   *
   * B-02 ne les montrait pas. Le panneau des différences comparait le
   * montant, la date, le délai et le libellé, et annonçait « 0 champ
   * modifié » sur un seuil bloquant passé de 4 357 € à 4 355 € : le second
   * opérateur que WF-14 §4 exige relisait une version dont il ne voyait pas
   * ce qui avait changé.
   */
  conditions: readonly ConditionAffichee[];
}

/* ── Les conditions, lues et saisies dans B-02 — C-12 ────────────────── */

type ConditionDuReferentiel = VisaRulesPayload["conditions"][number];

export interface ConditionAffichee {
  code: string;
  operateur: ConditionDuReferentiel["operateur"];
  valeur: ConditionDuReferentiel["valeur"];
  unite?: string;
  bloquant: boolean;
  /** La pièce qui établit la condition, par son code. */
  piece?: string;
  /** Le groupe d'alternatives, quand le seuil dépend d'un fait hors du dossier. */
  alternative?: string;
  /** Le texte que le candidat lit quand la condition échoue. */
  message: string;
  /**
   * Seul un seuil chiffré se modifie ici.
   *
   * Les autres valeurs du référentiel sont des **références** : « présence »
   * d'une pièce désignée par son code (`erkend_referent`, `permis_mohre`).
   * Les réécrire depuis un champ libre romprait le rattachement que le
   * schéma vérifie, sans qu'aucun seuil réglementaire ait changé.
   */
  modifiable: boolean;
}

export function conditionsAffichees(payload: VisaRulesPayload): ConditionAffichee[] {
  return payload.conditions.map((c) => ({
    code: c.code,
    operateur: c.operateur,
    valeur: c.valeur,
    ...(c.unite !== undefined ? { unite: c.unite } : {}),
    bloquant: c.bloquant,
    ...(c.piece !== undefined ? { piece: c.piece } : {}),
    ...(c.alternative !== undefined ? { alternative: c.alternative } : {}),
    message: c.message_echec,
    modifiable: typeof c.valeur === "number" && c.operateur !== "exists",
  }));
}

export const SYMBOLE_OPERATEUR: Record<ConditionDuReferentiel["operateur"], string> = {
  gte: "au moins",
  lte: "au plus",
  eq: "égal à",
  in: "parmi",
  exists: "présence de",
};

/** La valeur d'une condition, telle qu'une ligne de B-02 la montre. */
export function valeurLisible(
  condition: Pick<ConditionAffichee, "operateur" | "valeur" | "unite">,
): string {
  const valeur = Array.isArray(condition.valeur)
    ? condition.valeur.join(", ")
    : typeof condition.valeur === "number"
      ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(condition.valeur)
      : condition.valeur;
  const unite = condition.unite ? ` ${condition.unite}` : "";
  return `${SYMBOLE_OPERATEUR[condition.operateur]} ${valeur}${unite}`;
}

/**
 * Un seuil saisi, lu comme un opérateur l'écrit en français.
 *
 * « 4 357 », « 4357 », « 13 569,24 » : les espaces de milliers — y compris
 * insécables, que la copie d'un montant formaté apporte — et la virgule
 * décimale sont admis. Le refus dit ce qui est attendu, pas seulement que
 * la saisie est fausse.
 */
export function lireSeuil(
  saisie: string,
): { ok: true; valeur: number } | { ok: false; message: string } {
  const nettoyee = saisie.replace(/[\s  ]/gu, "").replace(",", ".");
  if (nettoyee === "") {
    return { ok: false, message: "Indique le seuil en chiffres, par exemple 4 357." };
  }
  if (!/^\d+(\.\d{1,2})?$/u.test(nettoyee)) {
    return {
      ok: false,
      message: `« ${saisie.trim()} » n'est pas un seuil lisible : écris un nombre positif, avec au plus deux décimales, par exemple 4 357 ou 13 569,24.`,
    };
  }
  return { ok: true, valeur: Number(nettoyee) };
}

/**
 * Les seuils saisis, réécrits dans le payload de la version qu'on écrit.
 *
 * Même principe que `avecLesTextesCandidat` : seules les valeurs soumises
 * changent, tout le reste vient de la ligne en base. Un seuil soumis pour
 * une condition que la version ne porte plus, ou pour une valeur qui n'est
 * pas un seuil, est refusé — l'écrire en silence déplacerait une exigence
 * que l'opérateur n'a pas vue.
 */
export function avecLesSeuils(
  payload: VisaRulesPayload,
  seuils: Readonly<Record<string, number>>,
): { ok: true; payload: VisaRulesPayload } | { ok: false; code: string; message: string } {
  const parCode = new Map(payload.conditions.map((c) => [c.code, c]));
  for (const [code, valeur] of Object.entries(seuils)) {
    const condition = parCode.get(code);
    if (!condition) {
      return {
        ok: false,
        code,
        message: `La condition « ${code} » ne figure plus dans cette version : recharge la page avant de modifier son seuil.`,
      };
    }
    if (typeof condition.valeur !== "number" || condition.operateur === "exists") {
      return {
        ok: false,
        code,
        message: `La condition « ${code} » ne porte pas de seuil chiffré : sa valeur est une référence du référentiel et ne se modifie pas depuis B-02.`,
      };
    }
    if (!Number.isFinite(valeur) || valeur < 0) {
      return {
        ok: false,
        code,
        message: `Le seuil de « ${code} » doit être un nombre positif.`,
      };
    }
  }
  return {
    ok: true,
    payload: {
      ...payload,
      conditions: payload.conditions.map((c) =>
        Object.hasOwn(seuils, c.code) ? { ...c, valeur: seuils[c.code]! } : c,
      ),
    },
  };
}

/**
 * Les seuils que l'écran a changés par rapport à la version affichée.
 *
 * L'écran n'envoie que ceux-là : renvoyer chaque seuil chargé à l'ouverture
 * écraserait celui qu'un autre veilleur aurait corrigé entre-temps.
 */
export function seuilsModifies(
  conditions: readonly ConditionAffichee[],
  saisies: Readonly<Record<string, string>>,
): Record<string, number> {
  const modifies: Record<string, number> = {};
  for (const c of conditions) {
    if (!c.modifiable || !Object.hasOwn(saisies, c.code)) continue;
    const lu = lireSeuil(saisies[c.code]!);
    if (lu.ok && lu.valeur !== c.valeur) modifies[c.code] = lu.valeur;
  }
  return modifies;
}

/** Champs d'une règle dont le texte s'affiche au candidat. */
export const CHAMPS_CANDIDAT = [
  { cle: "libelleCandidat", libelle: "Libellé affiché au candidat" },
  { cle: "reserveCandidat", libelle: "Réserve affichée en contexte" },
] as const;

export type ChampCandidat = (typeof CHAMPS_CANDIDAT)[number]["cle"];

export interface FauteDeSaisie extends Faute {
  champ: ChampCandidat;
  /** Intitulé du champ, pour pointer l'erreur là où elle se corrige. */
  libelleChamp: string;
}

/**
 * Les deux textes du formulaire, passés à la liste.
 *
 * Elle lit la même liste que `check:copy` et que le test de l'interface
 * candidat : une seule liste, quatre points d'application.
 *
 * **Ce n'est pas un contrôle « à l'enregistrement ».** L'en-tête de cette
 * fonction le disait, et la route de B-02 l'appliquait ainsi : elle levait
 * avant toute écriture, y compris sur un brouillon. `CLAUDE.md` tranche
 * l'inverse — « l'enregistrement d'un brouillon n'est pas bloqué, la
 * publication l'est », parce que refuser le brouillon pousse à rédiger
 * ailleurs et à coller à la fin, c'est-à-dire hors du garde-fou. Le moment
 * du refus vit désormais dans `server/regles/edition.ts`, avec sa raison :
 * la question n'est pas « enregistrer ou publier », elle est « le candidat
 * le verra-t-il ».
 *
 * La négation reste reconnue ici comme ailleurs — « ImmiPro ne garantit pas
 * l'obtention du visa » doit pouvoir être saisi par un administrateur, c'est
 * exactement la phrase qui protège.
 */
export function verifierTextesCandidat(
  regle: Pick<Regle, ChampCandidat>,
): FauteDeSaisie[] {
  const fautes: FauteDeSaisie[] = [];
  for (const { cle, libelle } of CHAMPS_CANDIDAT) {
    for (const faute of verifierTexte(regle[cle], INTERDITS_ECRAN_CANDIDAT)) {
      fautes.push({ ...faute, champ: cle, libelleChamp: libelle });
    }
  }
  return fautes;
}

/**
 * Message de refus. Il cite la formulation exacte plutôt que de renvoyer à
 * une règle : un administrateur qui ne voit pas quel mot bloque réécrit la
 * phrase entière, au hasard, jusqu'à ce que ça passe.
 */
export const messageDeRefus = (faute: FauteDeSaisie): string =>
  `« ${faute.extrait} » ne peut pas s'afficher chez le candidat — ${faute.raison}. Reformule ce passage de « ${faute.libelleChamp} ».`;

/** Rien ne se publie tant qu'un texte destiné au candidat est refusé. */
export const publiable = (regle: Pick<Regle, ChampCandidat>): boolean =>
  verifierTextesCandidat(regle).length === 0;

/**
 * Ce que le refus ajoute quand l'enregistrement porte sur la version en
 * vigueur — la suite, jamais le seul constat.
 *
 * L'écran appelle « brouillon » la version qu'il ouvre, et elle ne l'est
 * pas toujours : une version publiée se réécrit par la même commande, et le
 * candidat lit le texte à la seconde. Cet enregistrement-là est une
 * publication, et c'est le seul que le vocabulaire refuse. Le brouillon
 * passe : la publication le refusera, et d'ici là le texte en cours
 * d'écriture reste enregistrable.
 *
 * C'est la distinction que J.C a posée pour B-08, mot pour mot : pas
 * « enregistrer ou publier », mais « le public le verra-t-il ».
 */
/* ── Où va l'enregistrement de B-02 ──────────────────────────────────── */

export type StatutDeVersion = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface VersionDeRegle {
  id: string;
  version: number;
  statut: StatutDeVersion;
  /**
   * Date de mise en vigueur, nulle tant que la version n'a jamais été
   * publiée. C'est elle, et non `statut`, qui dit si des dossiers ont pu
   * figer cette version (INV-3) : RG-14.1 repasse en `DRAFT` une version
   * en vigueur dont la relecture est dépassée, sans la retirer à ceux qui
   * l'ont figée.
   */
  publieeLe: Date | null;
}

/**
 * Un brouillon, au sens où l'on peut écrire dedans : une version qui n'a
 * jamais été mise en vigueur.
 *
 * ── Le statut seul confondait deux lignes ───────────────────────────
 *
 * Le job de veille (RG-14.1) repasse en `DRAFT` une version publiée dont
 * la relecture est dépassée. Elle disparaît de l'affichage, mais elle
 * reste celle que des dossiers ont figée. Choisie comme « brouillon » par
 * son seul statut, elle était réécrite en place par B-02 : les dossiers
 * ouverts dessus lisaient d'un coup une autre checklist — ce qu'INV-3
 * interdit (revue du 07/10/2026, C1).
 */
export const estUnBrouillon = (v: VersionDeRegle): boolean =>
  v.statut === "DRAFT" && v.publieeLe === null;

/**
 * Une version en vigueur pour les dossiers qui l'ont figée : mise en
 * vigueur un jour, et pas encore remplacée. Elle peut être `DRAFT` —
 * retirée de l'affichage par l'échéance de relecture — sans cesser de
 * l'être.
 */
export const estEnVigueur = (v: VersionDeRegle): boolean =>
  v.publieeLe !== null && v.statut !== "ARCHIVED";

/**
 * La ligne qu'un enregistrement écrit — ou celle qu'il faut ouvrir.
 *
 * ── L'écran appelait « brouillon » la version en vigueur ────────────
 *
 * `editionDeLaRegle` rendait `versions.find(DRAFT) ?? cible`, et **rien
 * dans `src/` ne créait de version**. Sur les trois procédures publiées du
 * référentiel livré, aucune n'a de brouillon : l'écran ouvrait donc la
 * ligne en vigueur, l'intitulait « Brouillon version 1 · version 1 en
 * vigueur », et « Enregistrer le brouillon » la réécrivait — sans nouvelle
 * version, sans passage en publication, et sans ligne au journal.
 *
 * Or `Application.visaRuleId` fige cette ligne-là. INV-3 dit : « Un
 * dossier fige la version de règle utilisée. Une évolution réglementaire
 * ne casse jamais une checklist en cours. » La réécrire change la
 * checklist de tous les dossiers ouverts dessus, d'un coup, par la
 * commande d'un écran qui annonce le contraire.
 *
 * ── Ce que la décision tranche ──────────────────────────────────────
 *
 * **Le veilleur ouvre la version suivante en enregistrant.** C'est la
 * seule lecture compatible avec ce que le dépôt porte déjà :
 *
 * - RG-14.2 sépare qui rédige de qui publie, et le `PUT` est ouvert au
 *   veilleur quand le `POST` est réservé à l'administrateur : l'écriture
 *   est le geste du veilleur, la mise en vigueur celui de l'autre ;
 * - `publierLaRegle` archive le prédécesseur et met la nouvelle en
 *   vigueur — il est écrit pour un monde à deux lignes ;
 * - l'écran dit déjà « Brouillon version N · version M en vigueur » et
 *   « Publier la version N ».
 *
 * Il ne manquait que la création. Rien ici n'est inventé : la décision
 * remet à leur place des pièces qui s'attendaient.
 *
 * `null` quand il n'y a aucune version — un identifiant qui ne désigne
 * rien, que l'appelant refuse plus tôt.
 */
export type Destination =
  /** Un brouillon existe : c'est lui qu'on écrit. */
  | { quoi: "brouillon"; id: string; version: number }
  /** Aucun : la suivante s'ouvre à partir de celle-ci. */
  | { quoi: "a_ouvrir"; depuis: string; version: number };

export function destinationDeLEnregistrement(
  versions: readonly VersionDeRegle[],
): Destination | null {
  const brouillon = versions.find(estUnBrouillon);
  if (brouillon) return { quoi: "brouillon", id: brouillon.id, version: brouillon.version };

  /*
    On part de la version **en vigueur** et non de la plus haute : une
    version archivée peut porter un numéro supérieur — elle a été mise en
    vigueur puis remplacée —, et repartir d'elle ressusciterait un texte
    que la publication a retiré.

    En vigueur ne veut pas dire affichée : une version que l'échéance de
    relecture a retirée de l'affichage reste celle des dossiers, et c'est
    d'elle que la suivante doit partir.
  */
  const source = versions.find(estEnVigueur) ?? versions[0];
  if (!source) return null;

  // Le rang, lui, suit le plus haut numéro : deux versions ne peuvent pas
  // porter le même, et la base le refuse.
  const rang = Math.max(...versions.map((v) => v.version));
  return { quoi: "a_ouvrir", depuis: source.id, version: rang + 1 };
}

export const SUITE_DU_REFUS_EN_VIGUEUR =
  "Cette version est en vigueur : l'enregistrer la republie, et le candidat la lit aussitôt. Reformule ce passage, puis enregistre.";

export interface Difference {
  champ: string;
  avant: string;
  apres: string;
}

/**
 * Ce qu'une ligne de B-02 affiche à la place du montant quand l'autorité
 * n'en publie aucun. Formulée pour un opérateur : elle nomme la source du
 * silence, parce que c'est ce qu'il doit vérifier avant de publier.
 */
export const MENTION_SANS_MONTANT = "Aucun montant publié par l'autorité";

/** Un montant du référentiel, dans la monnaie de l'autorité qui l'exige. */
export interface MontantExige {
  valeur: number;
  devise: string;
}

/**
 * Le montant tel qu'une ligne l'affiche. L'absence se dit, elle ne se
 * chiffre pas : « 0 € » affirme une exigence nulle, une phrase n'affirme
 * rien de plus que le silence de l'autorité.
 */
export const montantLisible = (
  montant: MontantExige | null,
  formater: (valeur: number, devise: string) => string,
  sansMontant: string,
): string => (montant === null ? sansMontant : formater(montant.valeur, montant.devise));

/**
 * Comparaison N / N+1. Les champs inchangés sont conservés dans la liste,
 * marqués comme tels : une comparaison qui masque ce qui n'a pas bougé
 * laisse croire qu'on ne l'a pas regardé.
 */
export function comparer(
  enVigueur: Regle,
  brouillon: Regle,
  formaterMontant: (montant: number, devise: string) => string,
  /** Ce qu'affiche la ligne quand l'autorité ne publie pas de montant. */
  sansMontant: string,
  formaterJour: (iso: string) => string,
): Difference[] {
  return [
    {
      champ: brouillon.intituleMontant,
      avant: montantLisible(enVigueur.montant, formaterMontant, sansMontant),
      apres: montantLisible(brouillon.montant, formaterMontant, sansMontant),
    },
    {
      champ: "Applicable aux dépôts à partir du",
      avant: formaterJour(enVigueur.applicableDepuis),
      apres: formaterJour(brouillon.applicableDepuis),
    },
    {
      champ: "Délai d'instruction",
      avant: enVigueur.delaiInstruction,
      apres: brouillon.delaiInstruction,
    },
    {
      champ: "Libellé affiché au candidat",
      avant: enVigueur.libelleCandidat,
      apres: brouillon.libelleCandidat,
    },
    ...comparerLesConditions(enVigueur.conditions, brouillon.conditions),
  ];
}

/** Ce qu'une ligne affiche pour une condition qu'une des deux versions ne porte pas. */
export const MENTION_CONDITION_ABSENTE = "Absente de cette version";

/**
 * Une ligne par condition, présente dans l'une ou l'autre version — C-12.
 *
 * Les inchangées restent listées, comme les autres champs : c'est sur
 * cette liste que le second lecteur constate qu'il a tout vu.
 */
function comparerLesConditions(
  enVigueur: readonly ConditionAffichee[],
  brouillon: readonly ConditionAffichee[],
): Difference[] {
  const avant = new Map(enVigueur.map((c) => [c.code, c]));
  const apres = new Map(brouillon.map((c) => [c.code, c]));
  const codes = [...new Set([...apres.keys(), ...avant.keys()])];
  return codes.map((code) => {
    const a = avant.get(code);
    const b = apres.get(code);
    const bloquante = (b ?? a)!.bloquant ? ", bloquante" : "";
    return {
      champ: `Condition « ${code} »${bloquante}`,
      avant: a ? valeurLisible(a) : MENTION_CONDITION_ABSENTE,
      apres: b ? valeurLisible(b) : MENTION_CONDITION_ABSENTE,
    };
  });
}

/**
 * WF-14 §4 dit avant le clic ce que la publication opposera après : une
 * condition bloquante modifiée se relit par un second opérateur.
 */
export const AIDE_CONDITIONS =
  "Modifier une condition bloquante demande la relecture d'un second opérateur : la personne qui publie ne peut pas être celle qui a enregistré la version (WF-14).";

export const aChange = (difference: Difference): boolean =>
  difference.avant !== difference.apres;

export const compterChangements = (differences: readonly Difference[]): number =>
  differences.filter(aChange).length;

export interface EffetPublication {
  /** Dossiers figés sur la version en vigueur. */
  dossiersConcernes: number;
  /** Dossiers dont le dépôt tombe sous la nouvelle règle. */
  arbitragesRequis: number;
  /** Alertes envoyées : tous les dossiers concernés, arbitrage ou non. */
  alertes: number;
  /** INV-3. Toujours zéro, et le type le dit. */
  migrationsAutomatiques: 0;
}

export function effetDeLaPublication(
  dossiersConcernes: number,
  dossiersSousLaNouvelleRegle: number,
): EffetPublication {
  return {
    dossiersConcernes,
    arbitragesRequis: dossiersSousLaNouvelleRegle,
    alertes: dossiersConcernes,
    migrationsAutomatiques: 0,
  };
}

export const MENTION_SANS_MIGRATION =
  "Aucun dossier n'est migré automatiquement. Chaque candidat reçoit l'écran d'arbitrage T-02.";

export const MENTION_VERSIONNEMENT =
  "Toute publication crée une version horodatée et déclenche l'alerte aux candidats concernés. L'ancienne version reste consultable.";

/** Aide du champ de libellé : elle dit ce que le texte devient, pas ce qu'il est. */
export const AIDE_LIBELLE_CANDIDAT =
  "Ce texte apparaît tel quel dans la checklist. Tutoiement, pas de jargon administratif.";

export const AIDE_MOTIF = "Consigné au journal d'audit avec ton identifiant.";

/**
 * La publication est faite, la mise en file de la divergence non (revue du
 * 07/10/2026, M8). La dette est en base, et la reprise horaire la propage :
 * l'écran le dit au lieu de répondre en échec à un geste qui a eu lieu.
 */
export const MENTION_DIVERGENCE_DIFFEREE =
  "La publication est faite. Les alertes aux dossiers concernés partent dans l'heure.";

/**
 * Vérification du payload complet d'une règle — quatrième point
 * d'application de la liste unique.
 *
 * `verifierTextesCandidat` couvre les deux champs du formulaire B-02. Le
 * payload du référentiel en porte davantage : le libellé de la procédure,
 * les messages d'échec de chaque condition, les libellés de pièce, les
 * réserves. Tous s'affichent tels quels chez le candidat, et le message
 * d'échec est le plus exposé de tous — il se lit au moment précis où une
 * condition ne passe pas.
 *
 * La faute porte son chemin pour que le refus désigne le champ, et non « la
 * règle » : un veilleur qui ne voit pas quel texte bloque reformule tout,
 * au hasard.
 */
export function verifierPayloadCandidat(
  textes: readonly { chemin: string; texte: string }[],
): FauteDePayload[] {
  const fautes: FauteDePayload[] = [];
  for (const { chemin, texte } of textes) {
    for (const faute of verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)) {
      fautes.push({ chemin, extrait: faute.extrait, raison: faute.raison });
    }
  }
  return fautes;
}

export interface FauteDePayload {
  chemin: string;
  extrait: string;
  raison: string;
}

/** Même forme de message que B-02 : la formulation exacte, puis où la corriger. */
export const messageDeRefusPayload = (faute: FauteDePayload): string =>
  `« ${faute.extrait} » ne peut pas s'afficher chez le candidat — ${faute.raison}. Reformule le champ « ${faute.chemin} ».`;

/**
 * Ce qui interdit à une règle d'entrer en base — les trois refus réunis.
 *
 * Une règle entre en base par **deux** chemins : la publication de B-02, et
 * la graine qui charge le référentiel livré. Ils appliquaient des contrôles
 * différents — la graine ignorait le vocabulaire —, et le référentiel a
 * donc embarqué « moins de 50 % de ses crédits annuels » dans un
 * `message_echec`, c'est-à-dire une phrase que le candidat lit sur sa pièce
 * et que la publication refuse.
 *
 * Les deux chemins appellent cette fonction. Elle rend le premier motif de
 * refus, déjà rédigé pour l'opérateur, ou `null`.
 *
 * Le contrôle de forme (Zod) n'y figure pas : il rend un payload typé, et
 * c'est lui qui donne l'argument de cette fonction.
 */
export function refusDuReferentiel(payload: VisaRulesPayload): string | null {
  const impossibles = raisonsDIncompletabilite(payload);
  if (impossibles.length > 0) return impossibles[0]!;

  const fautes = verifierPayloadCandidat(textesCandidat(payload));
  if (fautes.length > 0) return messageDeRefusPayload(fautes[0]!);

  return null;
}
