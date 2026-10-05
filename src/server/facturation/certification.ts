/**
 * Le système de facture normalisée — avis comptable M.C du 04/10/2026.
 *
 * L'avis rappelle que le Bénin a instauré la facture normalisée : une
 * facture électronique, portant un code de certification rendu par le
 * dispositif de l'administration fiscale, que tout assujetti doit
 * employer.
 *
 * **Aucun adaptateur n'est écrit, et c'est délibéré.** Il demande
 * l'immatriculation de Rêveur Digital au dispositif, ses identifiants
 * d'accès et la spécification du service : le dépôt n'a rien de tout cela,
 * et écrire un client d'après ce qu'on suppose du service produirait des
 * codes que personne n'a certifiés. Le point de branchement existe, il
 * rend la fonction non branchée, et tout ce qui en dépend le lit :
 *
 * - la série réelle des factures reste fermée (`obstaclesALaFacturation`) ;
 * - l'ouverture d'un paiement réel est refusée avant toute écriture ;
 * - `/api/health` le dit dès que l'espace de paiement est réel.
 *
 * Le jour où l'adaptateur existe, il se rend d'ici, et ces trois lectures
 * changent d'avis en même temps — la même mécanique que les autres points
 * de branchement (`server/exploitation/capacites`).
 */

/** Ce que rend la certification d'une pièce : son code, et l'instant où il a été rendu. */
export interface Certification {
  code: string;
  le: Date;
}

/** Ce qu'un adaptateur reçoit : la pièce telle qu'elle est figée. */
export interface PieceACertifier {
  numero: string;
  genre: "FACTURE" | "AVOIR";
  emiseLe: Date;
  devise: string;
  ttc: number;
  ht: number;
  tva: number;
  tauxBp: number | null;
  client: { nom: string; adresse: string; qualite: string };
  /** Le numéro de la facture d'origine, pour un avoir. */
  origine: string | null;
}

export type Certificateur = (piece: PieceACertifier) => Promise<Certification>;

/** La fonction non branchée : elle ne certifie rien, et le dit. */
export const NON_BRANCHE: Certificateur = async () => {
  throw new Error(
    "Facture normalisée non branchée : aucune pièce réelle ne peut être certifiée tant qu'un adaptateur n'existe pas.",
  );
};

/**
 * Le certificateur que l'émission exécutera. Il reçoit l'environnement
 * observé, comme les autres résolveurs, pour que le diagnostic de
 * `/api/health` porte sur la même chose que l'émission.
 */
export function leCertificateur(
  _environnement: Readonly<Record<string, string | undefined>> = process.env,
): Certificateur {
  return NON_BRANCHE;
}

export const certificationBranchee = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => leCertificateur(environnement) !== NON_BRANCHE;
