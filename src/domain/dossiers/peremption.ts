/**
 * La péremption d'une pièce — RG-07.4, WF-09 étape 2.
 *
 * ── La règle était écrite, et elle n'a jamais pu se produire ───────────
 *
 * RG-07.4 dit qu'« une pièce passant en `EXPIREE` fait régresser le score
 * et repasse le dossier de `PRET` à `ACTIF` ». La seconde moitié est
 * implémentée depuis longtemps : `recalculerCompletude` efface `readyAt` et
 * redescend le statut dès que la complétude retombe. La première ne l'était
 * pas. `DocumentStatus.EXPIREE` n'est écrit **nulle part** — il n'est que
 * lu, par la pastille d'état et par le barème.
 *
 * Un passeport ou un relevé bancaire pouvait donc expirer sans que rien ne
 * bouge : la pièce restait « Conforme », le dossier restait « Prêt à
 * déposer », et le tableau de bord annonçait que rien ne bloquait le dépôt.
 * C'est l'affirmation la plus coûteuse de toute la plateforme, sur l'écran
 * qu'on ouvre en premier.
 *
 * ── Deux questions, et il ne faut pas les confondre ────────────────────
 *
 * `alertePeremption`, dans `piece.ts`, répond à : *cette pièce sera-t-elle
 * encore valable **le jour du dépôt** ?* Elle prévient, elle ne déclasse
 * rien — la pièce est valable aujourd'hui, elle est simplement à refaire
 * avant de déposer.
 *
 * Ce module-ci répond à : *cette pièce est-elle encore valable
 * **aujourd'hui** ?* Une pièce échue n'est plus une pièce : elle ne compte
 * plus dans la complétude, et le dossier n'est plus prêt.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau. Dates en UTC.
 */

import { joursEntre } from "./echeancier";
import { jourEnFrancais } from "../format/moment";

/**
 * Une pièce est échue quand sa validité s'arrête **avant** aujourd'hui.
 *
 * Strictement avant : une pièce valable « jusqu'au 3 mars » l'est encore le
 * 3 mars. Déclasser un document le jour même de sa limite ferait refaire une
 * pièce que l'autorité accepte, et c'est la faute que le reste du produit
 * passe son temps à corriger.
 */
export const estEchue = (perimeLe: string, aujourdhui: string): boolean =>
  joursEntre(aujourdhui, perimeLe) < 0;

/** Ce qu'il faut savoir d'une pièce pour décider de sa péremption. */
export interface PieceDatee {
  /** Identifiant du document. */
  id: string;
  libelle: string;
  /** Fin de validité, ISO. Absente : la pièce ne périme pas. */
  perimeLe?: string | null;
  /** État courant, tel qu'il est stocké. */
  etat: string;
}

/**
 * Les pièces à déclasser.
 *
 * Seule une pièce **conforme** régresse. Une pièce déjà attendue ou à
 * corriger n'a rien à perdre, et la marquer « expirée » remplacerait un
 * message actionnable — « ton passeport expire 4 mois après la date de
 * retour, il en faut 6 » — par une étiquette plus vague.
 */
export const piecesEchues = <T extends PieceDatee>(
  pieces: readonly T[],
  aujourdhui: string,
): readonly T[] =>
  pieces.filter(
    (p) => p.etat === "CONFORME" && p.perimeLe != null && estEchue(p.perimeLe, aujourdhui),
  );

/**
 * Ce que le candidat lit quand une pièce vient d'expirer.
 *
 * Constat, conséquence, action (RG-06.3). La conséquence est dite parce
 * qu'elle est visible ailleurs : le dossier vient de quitter « Prêt à
 * déposer », et découvrir ce retour en arrière sans explication ferait
 * chercher une panne.
 */
export const TITRE_ECHUE = (libelle: string) => `${libelle} : la validité est dépassée`;

export function corpsEchue(libelle: string, perimeLe: string, etaitPret: boolean): string {
  const fin = `${libelle} était valable jusqu'au ${jourEnFrancais(perimeLe)}.`;
  const consequence = etaitPret
    ? "Une pièce expirée ne compte plus comme conforme : ton dossier repasse en préparation."
    : "Une pièce expirée ne compte plus comme conforme.";
  return `${fin} ${consequence} Téléverse une version à jour pour la remplacer.`;
}

/** Mention portée par la ligne de checklist d'une pièce échue. */
export const mentionEchue = (perimeLe: string): string =>
  `Validité dépassée depuis le ${jourEnFrancais(perimeLe)}`;
