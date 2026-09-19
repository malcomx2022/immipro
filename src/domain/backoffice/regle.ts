import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
  type Faute,
} from "@/domain/copy/vocabulaire-interdit";

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
 * code : un administrateur qui saisissait une promesse dans un guide pays
 * contournait tout le dispositif. C'était le vrai trou.
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
  /** Montant exigé, dans la devise de la règle. */
  montant: number;
  devise: string;
  intituleMontant: string;
  /** Entrée en vigueur, ISO. */
  applicableDepuis: string;
  delaiInstruction: string;
  prochaineRelecture: string;
  /** Texte repris tel quel dans la checklist du candidat. */
  libelleCandidat: string;
  /** Réserve affichée en contexte sous la règle. */
  reserveCandidat: string;
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
 * Validation à l'enregistrement. Elle lit la même liste que `check:copy` et
 * que le test de l'interface candidat : une seule liste, trois points
 * d'application.
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

export interface Difference {
  champ: string;
  avant: string;
  apres: string;
}

/**
 * Comparaison N / N+1. Les champs inchangés sont conservés dans la liste,
 * marqués comme tels : une comparaison qui masque ce qui n'a pas bougé
 * laisse croire qu'on ne l'a pas regardé.
 */
export function comparer(
  enVigueur: Regle,
  brouillon: Regle,
  formaterMontant: (montant: number, devise: string) => string,
  formaterJour: (iso: string) => string,
): Difference[] {
  return [
    {
      champ: brouillon.intituleMontant,
      avant: formaterMontant(enVigueur.montant, enVigueur.devise),
      apres: formaterMontant(brouillon.montant, brouillon.devise),
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
  ];
}

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
