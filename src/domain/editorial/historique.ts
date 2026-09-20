/**
 * Ce que l'historique des publications garde, dit en clair — P.B, tranché
 * le 20/09/2026.
 *
 * Un guide n'est figé par aucun dossier : INV-3 ne s'y applique pas, et
 * c'est ce qui avait fait conclure qu'il n'avait pas besoin d'histoire. Le
 * journal d'audit gardait pourtant qui avait publié et pourquoi, sur un
 * texte que la republication effaçait — la trace désignait un contenu qui
 * n'existait plus.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * La phrase du back-office, sous le titre de la section.
 *
 * Elle dit les trois choses qu'un administrateur doit savoir avant de
 * cliquer : ce qui crée une version, ce qui n'en crée pas, et ce que
 * restaurer veut dire. La troisième est celle qui surprend — on croit
 * revenir à la version 2, on crée la version 5.
 */
export const MENTION_HISTORIQUE =
  "Chaque publication conserve une copie du texte rendu public, y compris l'enregistrement d'un document déjà en ligne. Un brouillon n'en crée aucune. Restaurer recopie le texte choisi et crée une nouvelle version : rien n'est réécrit.";
