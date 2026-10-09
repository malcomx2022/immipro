import type { VerdictAnalyse } from "@/domain/dossiers/analyse";

/**
 * L'historique des versions d'une pièce — C-08, WF-06, S.157 (R-03,
 * choix du responsable du 09/10/2026 : construire l'écran).
 *
 * Chaque version déposée reste, même remplacée (RG-06.8) : c'est ce qui
 * permet au candidat de comprendre pourquoi une pièce est revenue, et à
 * quoi a servi chaque analyse décomptée. L'écran est en lecture seule ; la
 * seule version qui commande la pièce est la courante.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface VersionDeLaPiece {
  rang: number;
  courante: boolean;
  /** ISO. */
  deposeeLe: string;
  /** Nom du fichier tel que rangé, ou « version rédigée ». */
  fichier: string;
  controle: "EN_QUARANTAINE" | "SAINE" | "INFECTEE";
  /** Le fichier a été supprimé selon la politique de conservation (INV-5). */
  purgee: boolean;
  /** Ce que la lecture automatique a rendu, s'il y en a eu une. */
  verdictLu: VerdictAnalyse | null;
  /** Ce qu'une personne a décidé en relecture, s'il y en a eu une. */
  decision: VerdictAnalyse | null;
}

const VERDICTS: Record<VerdictAnalyse, string> = {
  CONFORME: "conforme",
  A_CORRIGER: "à corriger",
  ILLISIBLE: "illisible",
};

/** Ce qu'il est advenu d'une version, en une phrase. */
export function sortDeLaVersion(v: VersionDeLaPiece): string {
  if (v.controle === "INFECTEE") return "Écartée au contrôle de sécurité, non conservée.";
  if (v.controle === "EN_QUARANTAINE") return "Contrôle de sécurité en cours.";
  const fichier = v.purgee ? " Le fichier a été supprimé selon la politique de conservation." : "";
  if (v.decision) return `Relue par une personne de l'équipe : ${VERDICTS[v.decision]}.${fichier}`;
  if (v.verdictLu) return `Lue automatiquement : ${VERDICTS[v.verdictLu]}.${fichier}`;
  return `Déposée, sans lecture automatique.${fichier}`;
}

/** L'état vide de l'écran : il dit quoi faire, pas seulement qu'il n'y a rien. */
export const HISTORIQUE_VIDE =
  "Aucune version n'a encore été déposée pour cette pièce. Dépose un premier fichier depuis la pièce : il apparaîtra ici.";
