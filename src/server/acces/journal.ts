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
  /** Remboursement FedaPay fait au tableau de bord, déclaré en B-04 (S.91). */
  | "paiement.remboursement.manuel"
  | "paiement.reconciliation"
  | "regle.publication"
  /**
   * La remise en ligne d'une fiche que l'échéance avait dépubliée — B-01.
   *
   * Distincte de `regle.publication` : elle ne crée aucune version et ne
   * propage aucune divergence. Elle rend à l'affichage candidat une règle
   * qui en était sortie, et c'est à ce titre qu'elle se trace. La route
   * de relecture argumentait l'absence de ligne par RG-14.4 — « la preuve
   * de diligence est `verifiedAt`, `verifiedBy` » — ce qui est juste pour
   * la relecture et muet sur la remise en ligne : ces deux champs disent
   * qui a relu, pas qu'une règle est redevenue visible.
   */
  | "regle.republication"
  | "contenu.publication"
  /**
   * La naissance d'un guide ou d'un article — B-08.
   *
   * L'écran de la liste porte `MENTION_AUDIT`, « chaque action est
   * horodatée au journal d'audit avec ton identifiant », et la seule
   * action qu'il déclenche n'y était pas. Créer un consultant se
   * journalise (`consultant.creation`) ; créer la page qu'un public lira
   * ne se journalisait pas.
   */
  | "contenu.creation"
  | "revue.decision"
  // Les deux exports du back-office. Emporter un journal entier ou un
  // grand livre laisse une trace comme n'importe quel autre accès à
  // l'intégralité de quelque chose — c'est elle qui dira, après coup,
  // qui a emporté quoi.
  | "journal.export"
  | "paiements.export"
  // B-09 — l'habilitation d'un consultant et son retrait. RG-12.1 exige la
  // vérification ; ce sont ces lignes qui disent qui l'a faite, quand, et
  // sur quoi elle portait. Un retrait date l'accréditation sans l'effacer,
  // et le journal garde la suite des gestes que la table, elle, écrase.
  | "consultant.creation"
  | "consultant.habiliter"
  | "consultant.retirer"
  | "consultant.suspendre"
  | "consultant.retablir"
  /**
   * La correction de la date réelle d'un dépôt — S.89. Elle commande la
   * conservation et les relances : l'ancienne et la nouvelle valeur, et
   * les échéances recalculées, partent au journal avec le motif.
   */
  | "dossier.depot.correction"
  /** Une demande de correction du candidat non retenue — S.90. */
  | "dossier.depot.correction.refus";

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
