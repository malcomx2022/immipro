import type { DocumentState } from "@/domain/completeness/score";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * Revue manuelle des pièces en échec — B-05, WF-15.
 *
 * Trois règles.
 *
 * **Le message au candidat est obligatoire et actionnable.** C'est la même
 * exigence que RG-06.3, appliquée à un humain plutôt qu'à la machine : « non
 * conforme » seul est refusé à l'enregistrement, comme il l'est dans le code.
 * L'opérateur écrit pour le candidat, il passe donc le vocabulaire interdit.
 *
 * **Une analyse rendue recrédite le quota.** Une pièce que la machine n'a pas
 * su lire n'a rien rendu ; la faire payer au candidat serait une pénalité
 * pour un défaut qui n'est pas le sien (même règle qu'en C-08).
 *
 * **Aucune pièce n'est préchargée.** L'ouverture d'une pièce est un acte
 * tracé : la file montre le motif d'échec, pas le document.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type MotifEchec =
  | "SIGNALE_PAR_LE_CANDIDAT"
  | "ECHEC_TECHNIQUE"
  | "DOCUMENT_NON_RECONNU"
  | "NETTETE_INSUFFISANTE";

export const LIBELLE_MOTIF: Record<MotifEchec, string> = {
  SIGNALE_PAR_LE_CANDIDAT: "Signalé par le candidat",
  ECHEC_TECHNIQUE: "Échec technique",
  DOCUMENT_NON_RECONNU: "Document non reconnu",
  NETTETE_INSUFFISANTE: "Netteté insuffisante",
};

export interface PieceEnEchec {
  id: string;
  piece: string;
  dossier: string;
  /** Téléversement, ISO — l'âge se calcule, il ne se saisit pas. */
  deposeeLe: string;
  motif: MotifEchec;
  /** Trace technique de la lecture automatique, pour l'opérateur seul. */
  journal: string;
  /**
   * Ce que le candidat désigne comme faux, quand c'est lui qui a ouvert la
   * revue (S.157) ; `null` sinon.
   */
  signalement: string | null;
}

/** Délai cible de traitement d'une pièce en revue, en heures (WF-15). */
export const DELAI_CIBLE_HEURES = 4;

export const ageEnMinutes = (piece: PieceEnEchec, maintenant: Date): number =>
  Math.max(0, Math.floor((maintenant.getTime() - new Date(piece.deposeeLe).getTime()) / 60_000));

/** « 2 h 12 », « 42 min ». */
export function libelleAge(piece: PieceEnEchec, maintenant: Date): string {
  const minutes = ageEnMinutes(piece, maintenant);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
}

export const horsDelai = (piece: PieceEnEchec, maintenant: Date): boolean =>
  ageEnMinutes(piece, maintenant) > DELAI_CIBLE_HEURES * 60;

/** La plus ancienne d'abord : la file se traite par ordre d'attente. */
export const trierParAnciennete = (pieces: readonly PieceEnEchec[]): PieceEnEchec[] =>
  [...pieces].sort((a, b) => a.deposeeLe.localeCompare(b.deposeeLe));

export function resumeRevue(
  pieces: readonly PieceEnEchec[],
  maintenant: Date,
): string {
  if (pieces.length === 0) return "Aucune pièce en attente de revue";
  const plusAncienne = trierParAnciennete(pieces)[0]!;
  return `${pieces.length} en attente de relecture humaine · délai cible ${DELAI_CIBLE_HEURES} heures · plus ancienne : ${libelleAge(plusAncienne, maintenant)}`;
}

/** Décisions ouvertes à l'opérateur. Elles reprennent les états du domaine. */
export type Decision = Extract<
  DocumentState,
  "CONFORME" | "A_CORRIGER" | "ILLISIBLE" | "HORS_SUJET"
>;

export const DECISIONS: readonly Decision[] = [
  "CONFORME",
  "A_CORRIGER",
  "ILLISIBLE",
  "HORS_SUJET",
];

/**
 * Formulations trop courtes ou purement constatives. Elles disent qu'il y a
 * un problème sans dire lequel ni quoi faire — le défaut que RG-06.3 nomme.
 */
const CONSTATS_NUS =
  /^(document\s+)?(non\s+conforme|invalide|illisible|refus[ée]e?|rejet[ée]e?|ko)\.?$/iu;

export interface RefusDeDecision {
  raison: string;
  /** Ce qu'il manque, formulé comme une consigne de réécriture. */
  consigne: string;
}

/**
 * Validation du message envoyé au candidat. Elle applique au texte saisi par
 * un humain exactement ce que le code s'applique à lui-même.
 *
 * `null` quand le message passe.
 */
export function refusDuMessage(message: string, decision: Decision): RefusDeDecision | null {
  const propre = message.trim();

  if (propre.length === 0) {
    return {
      raison: "Aucun message n'a été écrit.",
      consigne:
        "Dis ce que tu as constaté sur la pièce, puis ce que le candidat doit faire.",
    };
  }

  if (CONSTATS_NUS.test(propre)) {
    return {
      raison: `« ${propre} » est un constat sans suite.`,
      consigne:
        "Ajoute la mesure constatée et le geste attendu — jamais « non conforme » seul (RG-06.3).",
    };
  }

  if (decision !== "CONFORME" && propre.length < 40) {
    return {
      raison: "Le message est trop court pour dire à la fois le constat et l'action.",
      consigne:
        "Une phrase de constat, une phrase d'action : « Ton relevé s'arrête en juin, il en faut trois consécutifs. Demande un relevé couvrant juin à août. »",
    };
  }

  const fautes = verifierTexte(propre, INTERDITS_ECRAN_CANDIDAT);
  const faute = fautes[0];
  if (faute) {
    return {
      raison: `« ${faute.extrait} » ne peut pas s'afficher chez le candidat — ${faute.raison}.`,
      consigne: "Reformule sans ce terme.",
    };
  }

  return null;
}

export const messageValide = (message: string, decision: Decision): boolean =>
  refusDuMessage(message, decision) === null;

/**
 * Le titre de l'avis qui porte la décision au candidat.
 *
 * ── « envoyé », et il ne l'était pas ────────────────────────────────
 *
 * `CLAUDE.md` compte quatre points d'application du vocabulaire interdit,
 * dont « B-05 pour le message **envoyé** après une revue manuelle », et
 * l'en-tête de `refusDuMessage` dit « validation du message envoyé au
 * candidat ». Le message était écrit, refusé s'il le fallait, rangé dans
 * `ManualReview.message` et recopié dans `Document.feedback` — et aucun
 * avis n'en partait. Les trois verdicts automatiques en produisent un
 * chacun ; celui qu'une personne rédige, non. Le candidat pouvait le
 * découvrir en rouvrant sa checklist, ou pas.
 *
 * ── Pourquoi un titre par décision ──────────────────────────────────
 *
 * Le corps de l'avis est le message de l'opérateur, tel quel : c'est lui
 * que le candidat doit lire, et le résumer le trahirait. Le titre, lui,
 * dit ce qui vient de se passer, et une relecture humaine n'est pas un
 * verdict de machine — il dit donc qu'une personne a regardé. C'est aussi
 * pourquoi il ne reprend pas les titres de WF-06 : le même mot pour deux
 * faits différents ferait croire à une seconde passe automatique.
 */
export const TITRE_DE_LA_DECISION: Record<Decision, string> = {
  CONFORME: "Ta pièce a été acceptée après relecture",
  A_CORRIGER: "Ta pièce demande une correction",
  ILLISIBLE: "Ta pièce n'a pas pu être lue, même en relecture",
  HORS_SUJET: "Ce fichier n'est pas la pièce attendue",
};

/**
 * Une analyse rendue recrédite le quota du candidat. La règle est ici, et
 * non dans l'écran, pour que le compteur et le message soient toujours
 * d'accord.
 */
export const recrediteLeQuota = (decision: Decision): boolean =>
  decision === "ILLISIBLE" || decision === "HORS_SUJET";

export const MENTION_DECISION =
  "Toute décision est consignée au journal d'audit avec ton identifiant. Une analyse rendue recrédite le quota du candidat.";

export const MENTION_ACCES_TRACE =
  "Aucune pièce de candidat n'est préchargée ici : l'ouverture d'une pièce est un acte tracé, avec son motif.";

// ── Le motif d'accès, et ce qui bloque une décision ──────────────────────

/**
 * RG-15.1 : « Tout accès administrateur à une pièce d'identité est
 * journalisé avec motif obligatoire. »
 *
 * L'écran l'annonçait déjà — « l'ouverture d'une pièce est un acte tracé,
 * avec son motif » — et ne le faisait pas : « Ouvrir la pièce » posait un
 * drapeau local, affichait un aperçu inventé, et n'écrivait aucune ligne.
 * L'action `piece.consultation` existait dans la table des actions
 * auditées sans qu'aucun code ne l'emploie jamais.
 *
 * Le motif est demandé avant l'ouverture, pas après : demandé après, il
 * justifierait un accès déjà eu, ce qui n'est pas une justification.
 */
export const MOTIF_MINIMUM = 10;

export interface Revue {
  motif: string;
  decision: Decision;
  message: string;
}

/**
 * Ce qui manque pour ouvrir la pièce, ou `null` si rien ne manque.
 *
 * Un seul motif couvre l'ouverture et la décision : dans cette file,
 * l'opérateur ouvre la pièce **pour** la trancher, et lui faire écrire
 * deux justifications du même geste produirait deux textes dont l'un
 * serait recopié de l'autre. Les deux lignes d'audit le portent chacune.
 */
export function obstacleALOuverture(motif: string): string | null {
  if (motif.trim().length < MOTIF_MINIMUM) {
    return `Écris pourquoi tu ouvres cette pièce, en ${MOTIF_MINIMUM} caractères au moins. Le motif part au journal d'audit.`;
  }
  return null;
}

/**
 * Ce qui manque pour trancher, ou `null` si rien ne manque.
 *
 * L'ordre suit celui de l'écran, comme en R.1 : le motif, puis le message.
 * Rendre la raison plutôt qu'un booléen rapporte le texte du bouton
 * désactivé, qui doit dire quoi faire (DOC-12 §16).
 */
export function obstacleALaDecision(revue: Partial<Revue>): string | null {
  const manqueMotif = obstacleALOuverture(revue.motif ?? "");
  if (manqueMotif) return manqueMotif;
  const refus = refusDuMessage(revue.message ?? "", revue.decision ?? "A_CORRIGER");
  if (refus) return `${refus.raison} ${refus.consigne}`;
  return null;
}

/**
 * Ce que l'écran affiche à la place de l'aperçu, quand il n'y en a pas.
 *
 * Une pièce purgée et une pièce en quarantaine sont deux absences
 * différentes, et `raisonSansApercu` les distingue déjà côté candidat. Ce
 * repli-ci couvre la troisième : le stockage objet lui-même est
 * injoignable. Aucun aperçu n'est inventé — c'était le défaut, avec un
 * « page 1 sur 3 » qui ne correspondait à aucun fichier.
 */
export const APERCU_INDISPONIBLE =
  "La pièce n'a pas pu être ouverte : le stockage n'a pas répondu. Ton accès est consigné, et rien n'a été affiché.";
