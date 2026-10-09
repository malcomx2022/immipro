/**
 * Ce que le candidat lit quand sa demande de remboursement est tranchée à
 * zéro — B-04, RF-4, S.154 (décision du 09/10/2026 : message fixe).
 *
 * Une revue manuelle tranchée à zéro referme l'obligation : rien n'est
 * rendu, le candidat garde ses analyses (D-11). Jusqu'ici, rien ne le lui
 * disait — seuls l'écart et le journal en gardaient la trace, et la
 * demande restait pour lui sans réponse.
 *
 * Le texte est fixe : il dit l'issue, ce qui reste au candidat, et où
 * poser une question. Le motif de l'opérateur reste interne (journal,
 * écart) : il a été écrit pour la direction, pas pour être lu tel quel par
 * le candidat. Aucune promesse, aucun délai qui ne dépende pas de nous.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface AvisDeTrancheNulle {
  titre: string;
  corps: string;
}

/** Ce qui reste au candidat, dit selon le nombre — un Pro sert plusieurs dossiers. */
function ceQuiReste(analysesRestantes: number, dossiers: number): string {
  const ou = dossiers > 1 ? "sur tes dossiers" : "sur ton dossier";
  if (analysesRestantes > 1) return `tes ${analysesRestantes} analyses restantes restent disponibles ${ou}`;
  if (analysesRestantes === 1) return `ton analyse restante reste disponible ${ou}`;
  return dossiers > 1
    ? "tes dossiers et leur historique restent tels qu'ils sont"
    : "ton dossier et son historique restent tels qu'ils sont";
}

export function avisDeTrancheNulle(demande: {
  /** L'intitulé de l'achat (`libelleDeLAchat`). */
  achat: string;
  reference: string;
  analysesRestantes: number;
  /** Les dossiers que l'achat a servis : un, ou jusqu'à trois pour un Pro. */
  dossiers: number;
}): AvisDeTrancheNulle {
  return {
    titre: "Ta demande de remboursement a été examinée",
    corps:
      `Ta demande de remboursement pour « ${demande.achat} » (référence ${demande.reference}) a été examinée. ` +
      `Aucun montant n'est remboursé : ${ceQuiReste(demande.analysesRestantes, demande.dossiers)}. ` +
      "Pour une question sur cette décision, écris-nous depuis la page Contact.",
  };
}

/**
 * La clé de l'avis : une par obligation refermée. Une même transaction
 * peut voir une obligation s'ouvrir de nouveau plus tard ; la date
 * d'ouverture distingue les deux avis.
 */
export const cleDeLAvisDeTrancheNulle = (reference: string, ouverteLe: Date): string =>
  `revue-refermee:${reference}:${ouverteLe.toISOString()}`;

/** La référence d'une clé d'avis, ou `null` si la clé n'en est pas une. */
export function referenceDeLAvis(cle: string): string | null {
  const morceaux = /^revue-refermee:([^:]+):/u.exec(cle);
  return morceaux ? morceaux[1]! : null;
}
