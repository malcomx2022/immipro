import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ETATS_FIGES } from "@/domain/dossiers/etat";

/**
 * La version courante commande la pièce — RF-2, FON-02, 09/10/2026.
 *
 * Trois chemins écrivent l'état d'une pièce depuis le résultat d'**une
 * version** : l'analyse, le balayage et la revue humaine. Aucun ne
 * vérifiait que cette version était encore la dernière. Une v1 lente
 * finissait après le dépôt d'une v2, et son verdict s'affichait avec le
 * fichier v2 : exécuté avant correction, une pièce remplacée passait
 * « à corriger » sur la foi de l'ancien fichier, avec son avis, et la
 * complétude suivait.
 *
 * La règle : une version écrit sur la pièce si aucune version plus récente
 * n'existe, et si le dossier est encore modifiable (un dossier déposé ou
 * clôturé garde l'état qu'il avait ce jour-là). Le résultat ancien reste
 * à l'historique de sa version ; il ne touche ni la pièce, ni la
 * complétude, ni les avis.
 *
 * Elle est tenue **dans l'écriture** et non lue en tête : le candidat peut
 * remplacer son fichier pendant l'appel au modèle, qui dure des secondes.
 * Le dépôt crée la nouvelle version avant de remettre la pièce en
 * analyse ; une écriture qui la voit s'abstient, et une écriture qui la
 * précède est aussitôt recouverte par la remise en analyse. Dans les deux
 * ordres, la pièce finit décrite par le fichier courant.
 */
export const surLaPieceCourante = (documentId: string, rang: number) =>
  ({
    id: documentId,
    versions: { none: { rank: { gt: rang } } },
    application: { status: { notIn: [...ETATS_FIGES] } },
  }) satisfies Prisma.DocumentWhereInput;

/** Écrit sur la pièce si la version est la courante ; dit si c'est fait. */
export async function ecrireSurLaPieceCourante(
  client: Prisma.TransactionClient | typeof db,
  documentId: string,
  rang: number,
  data: Prisma.DocumentUpdateManyMutationInput,
): Promise<boolean> {
  const { count } = await client.document.updateMany({
    where: surLaPieceCourante(documentId, rang),
    data,
  });
  return count === 1;
}

/** La version commande-t-elle encore la pièce ? Une lecture, pour éviter un appel inutile. */
export async function commandeLaPiece(
  documentId: string,
  rang: number,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<boolean> {
  return (await client.document.count({ where: surLaPieceCourante(documentId, rang) })) === 1;
}
