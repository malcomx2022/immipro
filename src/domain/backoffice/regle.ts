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
export const SUITE_DU_REFUS_EN_VIGUEUR =
  "Cette version est en vigueur : l'enregistrer la republie, et le candidat la lit aussitôt. Reformule ce passage, puis enregistre.";

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
