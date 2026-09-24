import { momentRelatif } from "@/domain/format/moment";
import { FUSEAU_AFFICHAGE } from "@/domain/format/fuseau";

/**
 * Versions d'une pièce rédigée — R-03, WF-08.
 *
 * Le texte reste celui du candidat : il peut tout réécrire, et chaque
 * enregistrement laisse une version restaurable. Sans historique, la
 * suggestion acceptée puis regrettée n'a aucun retour en arrière, et la
 * personne cesse d'accepter les suggestions.
 *
 * Les versions suivent la rétention du dossier : supprimées à la clôture,
 * avec le reste (INV-5).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Paragraphe {
  /** Intertitre, repris de la section de la question qui l'a nourri. */
  section: string;
  texte: string;
}

export interface Version {
  /** Rang croissant : la version 3 est postérieure à la version 2. */
  rang: number;
  /** Horodatage de l'enregistrement, ISO. */
  enregistreeLe: string;
  paragraphes: readonly Paragraphe[];
  /** Ce qui a changé, en une phrase. Une liste de versions sans motif ne se lit pas. */
  motif: string;
}

export const compterMotsTexte = (texte: string): number => {
  const propre = texte.trim();
  return propre.length === 0 ? 0 : propre.split(/\s+/u).length;
};

export const motsDeLaVersion = (version: Version): number =>
  version.paragraphes.reduce((total, p) => total + compterMotsTexte(p.texte), 0);

/** La plus récente. C'est elle qu'on édite ; les autres se restaurent. */
export const versionCourante = (versions: readonly Version[]): Version | undefined =>
  [...versions].sort((a, b) => b.rang - a.rang)[0];

/** De la plus récente à la plus ancienne : on cherche d'abord ce qu'on vient de faire. */
export const parOrdreDeLecture = (versions: readonly Version[]): Version[] =>
  [...versions].sort((a, b) => b.rang - a.rang);

export const estCourante = (version: Version, versions: readonly Version[]): boolean =>
  version.rang === versionCourante(versions)?.rang;

/**
 * « il y a 4 minutes », « hier à 21 h 04 », « 9 septembre 2026 ».
 *
 * Une date absolue sur un enregistrement d'il y a quatre minutes oblige à
 * calculer ; un « il y a 3 mois » sur une version ancienne cache la date
 * qu'on cherche. Le seuil est le jour civil (`domain/format/moment`).
 */
const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: FUSEAU_AFFICHAGE,
});

export const libelleAnciennete = (iso: string, maintenant: Date): string =>
  momentRelatif(iso, maintenant, { formatAbsolu: FORMAT_JOUR });

/** Ligne d'identité de la version affichée en tête d'éditeur. */
export const libelleVersion = (version: Version, maintenant: Date): string =>
  `Version ${version.rang} · modifiée ${libelleAnciennete(version.enregistreeLe, maintenant)} · ${motsDeLaVersion(version)} mots`;

export const MENTION_RETENTION_VERSIONS =
  "Les versions sont conservées jusqu'à la clôture du dossier, puis supprimées avec le reste.";

/**
 * Suggestion posée sur un paragraphe. Elle se répond ou s'ignore : jamais
 * appliquée d'office, puisque le texte appartient au candidat.
 */
export interface Suggestion {
  /** Section visée, pour ancrer la suggestion au bon paragraphe. */
  section: string;
  texte: string;
}

// ── Les trois états d'une pièce, que R-03 réduisait à un seul ──────────

/**
 * L'écran s'ouvrait sur « Éditeur » et « Versions », deux onglets qui
 * n'avaient rien à montrer : aucune route ne créait de version, si bien que
 * `versionCourante` rendait toujours `undefined`. L'onglet s'appelait
 * « Éditeur » et rendait des paragraphes en lecture seule — il n'y avait
 * pas de champ de saisie.
 *
 * Trois situations s'y confondaient, et elles n'appellent pas le même geste :
 *
 *  - l'entretien n'est pas assez avancé pour qu'il y ait de la matière ;
 *  - il l'est, et la mise en forme reste à demander ;
 *  - elle a été demandée et le service qui l'écrit n'est pas branché.
 *
 * La troisième est celle que le registre des dépendances décrit déjà :
 * « aucun texte n'est produit, et aucun n'est inventé : l'écran dit ce qui
 * manque plutôt que d'afficher une version vide ». Il ne le disait pas.
 */
export type EtatDeLaPiece =
  | "ENTRETIEN_INSUFFISANT"
  | "A_METTRE_EN_FORME"
  | "MISE_EN_FORME_INDISPONIBLE"
  | "REDIGEE";

/**
 * Réponses minimales avant de demander une mise en forme.
 *
 * Une seule réponse ne fait pas une lettre : le texte produit serait
 * surtout du remplissage, et c'est exactement ce que `LIMITES_REDACTION`
 * promet de ne pas faire. Le seuil est bas — il s'agit d'éviter le vide,
 * pas de juger la matière.
 */
export const REPONSES_MINIMUM = 3;

export function etatDeLaPiece(options: {
  versions: readonly Version[];
  reponses: number;
  /** Le service de mise en forme est branché. */
  redactionDisponible: boolean;
}): EtatDeLaPiece {
  if (options.versions.length > 0) return "REDIGEE";
  if (options.reponses < REPONSES_MINIMUM) return "ENTRETIEN_INSUFFISANT";
  return options.redactionDisponible ? "A_METTRE_EN_FORME" : "MISE_EN_FORME_INDISPONIBLE";
}

export interface MessageDEtat {
  titre: string;
  corps: string;
  /** Le libellé de l'action, ou `null` quand il n'y a rien à proposer. */
  action: string | null;
}

/**
 * Ce que l'écran dit dans chaque état. Trois titres, trois corps, et une
 * action qui peut manquer : un bouton proposé alors que le service est
 * absent est un bouton qui ne rendra rien (règle de Q.A).
 */
export function messageDEtat(
  etat: EtatDeLaPiece,
  reponses: number,
): MessageDEtat | null {
  if (etat === "REDIGEE") return null;

  if (etat === "ENTRETIEN_INSUFFISANT") {
    const reste = REPONSES_MINIMUM - reponses;
    return {
      titre: "Réponds encore à quelques questions",
      corps: `La mise en forme part de tes réponses, et de rien d'autre. Il en faut ${REPONSES_MINIMUM} au moins pour qu'il y ait de la matière : tu en as ${reponses}, il en reste ${reste}.`,
      action: "Reprendre l'entretien",
    };
  }

  if (etat === "A_METTRE_EN_FORME") {
    return {
      titre: "Tes réponses sont prêtes à être mises en forme",
      corps: `${reponses} réponses enregistrées. Le texte proposé reprendra ce que tu as écrit, paragraphe par paragraphe. Tu le reliras et tu pourras tout réécrire : il reste le tien.`,
      action: "Proposer un premier texte",
    };
  }

  return {
    titre: "La mise en forme n'est pas disponible",
    corps: `Tes ${reponses} réponses sont enregistrées et rien n'est perdu. Le service qui écrit le texte n'est pas encore branché, et nous ne proposons pas un texte que personne n'a écrit. Tu peux rédiger ta pièce de ton côté et la joindre au dossier.`,
    action: null,
  };
}

/**
 * Mention portée par chaque version produite — RG-08.1.
 *
 * Elle n'est pas décorative : c'est elle qui distingue une aide à la
 * rédaction d'un document que la plateforme signerait. Elle voyage avec le
 * texte, pas seulement à l'écran, parce que le texte sortira de l'écran.
 */
export const MENTION_AIDE_A_LA_REDACTION =
  "Ce texte est une aide à la rédaction. Il part de tes réponses, tu le relis et tu le modifies : la pièce que tu déposes est la tienne, et elle relève de ta responsabilité.";

/** Ce que le motif d'une version dit, selon ce qui l'a créée. */
export const MOTIF_PREMIERE_VERSION = "Première mise en forme de tes réponses";
export const MOTIF_REECRITURE = "Texte réécrit par toi";
export const motifDeRestauration = (rang: number): string =>
  `Retour au texte de la version ${rang}`;

/**
 * Ce qui manque pour enregistrer une réécriture, ou `null`.
 *
 * Même forme qu'en B-05 et B-03 : la raison plutôt qu'un booléen, parce
 * que c'est elle que porte le bouton désactivé (DOC-12 §16).
 */
export function obstacleALEnregistrement(
  texte: string,
  courante: Version | undefined,
): string | null {
  if (compterMotsTexte(texte) === 0) {
    return "Le texte est vide. Enregistrer effacerait ce que la version précédente contient — réécris d'abord, ou reviens en arrière depuis les versions.";
  }
  if (courante && texte.trim() === texteDeLaVersion(courante).trim()) {
    return "Rien n'a changé depuis la dernière version. Modifie le texte, ou reviens à l'éditeur.";
  }
  return null;
}

/**
 * Le texte entier d'une version, tel qu'il est stocké et tel que l'éditeur
 * le montre. La lecture le redécoupe en paragraphes pour l'affichage ; la
 * réécriture porte sur le texte, parce qu'on réécrit une lettre et pas un
 * tableau de morceaux.
 */
export const texteDeLaVersion = (version: Version): string =>
  version.paragraphes
    .map((p) => (p.section ? `${p.section}\n${p.texte}` : p.texte))
    .join("\n\n");

/** Réponses effectivement remplies, pour décider si la matière suffit. */
export const nombreDeReponsesTexte = (
  reponses: Readonly<Record<number, string>>,
): number => Object.values(reponses).filter((r) => r.trim().length > 0).length;
