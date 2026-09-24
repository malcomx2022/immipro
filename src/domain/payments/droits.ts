import { PACKS } from "./pricing";

/**
 * Les droits qu'une couverture ouvre sur un dossier — arbitrage S.80.
 *
 * ── La frontière ────────────────────────────────────────────────────
 *
 * Elle porte sur l'intervention du service d'IA, pas sur le droit du
 * candidat à écrire son propre document. Avec Essentiel, il garde
 * l'entretien guidé et ses réponses, l'écriture et la réécriture
 * manuelles, les versions et leur restauration, les exports, et les
 * recoupements déterministes qui n'appellent aucun service. Dossier et
 * Dossier Pro ajoutent ce que le service fait pour lui : proposer un texte
 * à partir des réponses, reformuler, analyser le texte, recouper avec les
 * pièces lues automatiquement.
 *
 * ── Ce qui décide ───────────────────────────────────────────────────
 *
 * La couverture **attribuée au dossier**, lue dans le grand livre des
 * analyses : les octrois `ACHAT_PACK` qu'il a reçus, et le pack de la
 * transaction qui les porte. Jamais le dernier pack acheté par le compte :
 * un Pro dont les trois destinations sont déjà servies n'ouvre rien sur un
 * quatrième dossier, et un Essentiel acheté ensuite pour un autre dossier
 * ne retire rien à celui qu'un Dossier couvre.
 *
 * Une recharge d'analyses n'est pas une couverture : elle rallonge un
 * quota, elle n'ouvre aucun droit. Une couverture dont le paiement est en
 * cours de remboursement ne compte plus — ses analyses restantes sont
 * retirées au même moment, et le droit suit.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface CouvertureDuDossier {
  /** Code du pack de la transaction qui a crédité le dossier. */
  packCode: string;
  /** Le paiement est remboursé, ou son remboursement est engagé. */
  retiree: boolean;
}

/** Les packs qui ouvrent la rédaction assistée, lus dans la grille. */
export const PACKS_REDACTION_ASSISTEE: readonly string[] = PACKS.filter(
  (p) => p.redactionAssistee,
).map((p) => p.code);

export const redactionAssisteeOuverte = (couvertures: readonly CouvertureDuDossier[]): boolean =>
  couvertures.some((c) => !c.retiree && PACKS_REDACTION_ASSISTEE.includes(c.packCode));

/** Les noms, dans l'ordre de la grille : « Dossier et Dossier Pro ». */
export const packsDeLaRedactionAssistee = (): string => {
  const noms = PACKS.filter((p) => p.redactionAssistee).map((p) => p.libelle);
  return noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`;
};

/**
 * Ce que le candidat lit quand le geste lui est refusé. La phrase dit
 * d'abord ce qui reste — c'est la première question de quelqu'un qui vient
 * de passer vingt minutes sur son entretien —, puis ce qui ouvre le geste.
 */
export const MENTION_REDACTION_RESERVEE = `Tes réponses, ton texte et tes versions restent ici, et tu peux écrire ta pièce toi-même. La proposition de texte et l'analyse critique s'ouvrent avec les packs ${packsDeLaRedactionAssistee()}.`;
