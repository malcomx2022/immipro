import { db } from "@/lib/db";

/**
 * Journal d'audit — RG-15.1, RG-15.3.
 *
 * « Tout accès administrateur à une pièce d'identité est journalisé avec
 * motif obligatoire. » Le motif est obligatoire dans la signature, et la
 * base refuse une ligne dont le motif est vide : il n'y a donc pas de
 * chemin où l'on journalise sans dire pourquoi.
 *
 * Ce qui se journalise et ce qui ne se journalise pas est une décision, pas
 * un réflexe. Journaliser chaque lecture d'écran remplirait la table de
 * bruit et rendrait introuvable l'accès qui compte. Sont journalisés : les
 * accès aux pièces d'un candidat par un opérateur, les décisions qui
 * changent l'état d'un compte ou d'un paiement, et les publications de
 * règle.
 */

export type ActionAuditee =
  | "piece.consultation"
  | "piece.purge"
  | "dossier.consultation"
  | "compte.suspension"
  | "compte.retablissement"
  | "compte.suppression"
  | "compte.export"
  | "partage.retrait"
  | "paiement.remboursement"
  | "paiement.reconciliation"
  | "regle.publication"
  | "contenu.publication"
  | "revue.decision"
  // Les deux exports du back-office. Emporter un journal entier ou un
  // grand livre laisse une trace comme n'importe quel autre accès à
  // l'intégralité de quelque chose — c'est elle qui dira, après coup,
  // qui a emporté quoi.
  | "journal.export"
  | "paiements.export";

export interface EcritureAudit {
  acteurId: string;
  action: ActionAuditee;
  /** Ce sur quoi porte l'accès : `application:<id>`, `document:<id>`… */
  cible: string;
  /** Pourquoi. Jamais vide — c'est ce qui rend le journal relisible. */
  motif: string;
  details?: Record<string, unknown>;
}

export async function journaliser(ecriture: EcritureAudit): Promise<void> {
  const motif = ecriture.motif.trim();
  if (motif.length === 0) {
    throw new Error("RG-15.1 : un accès journalisé porte un motif non vide");
  }
  await db.auditLog.create({
    data: {
      actorId: ecriture.acteurId,
      action: ecriture.action,
      target: ecriture.cible,
      reason: motif,
      metadata: (ecriture.details ?? null) as never,
    },
  });
}

/**
 * Accès à une pièce par un opérateur : la lecture et l'écriture du journal
 * ne se séparent pas. Le motif est un paramètre de la fonction qui ouvre la
 * pièce, et non un appel voisin qu'on peut omettre.
 */
export async function ouvrirSousJournal<T>(
  ecriture: EcritureAudit,
  lecture: () => Promise<T>,
): Promise<T> {
  await journaliser(ecriture);
  return lecture();
}
