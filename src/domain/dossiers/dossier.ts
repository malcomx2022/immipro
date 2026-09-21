import type { CompletenessPublic } from "@/domain/completeness/score";
import type { FicheDestination } from "@/domain/destinations/fiche";
import type { MotifProposition } from "@/domain/consultants/proposition";

/**
 * Dossier vu du candidat — WF-09, écran C-01.
 *
 * La vue ne porte que `CompletenessPublic` : le barème interne n'est pas dans
 * son type, il ne peut donc pas remonter au tableau de bord. C'est ce qui
 * remplace la note sur cent que le prototype affichait sur chaque carte
 * (arbitrage C-09, qui porte sur l'API et donc sur tous les écrans).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type StatutDossier = "BROUILLON" | "ACTIF" | "PRET" | "SOUMIS" | "CLOTURE";

export const LIBELLE_STATUT: Record<StatutDossier, string> = {
  BROUILLON: "Brouillon",
  ACTIF: "Actif",
  PRET: "Prêt à déposer",
  SOUMIS: "Déposé",
  CLOTURE: "Clôturé",
};

export interface Dossier {
  id: string;
  destination: FicheDestination;
  statut: StatutDossier;
  /**
   * Date cible — rentrée ou prise de poste, ISO. Absente tant qu'elle n'est
   * pas fixée.
   *
   * Elle s'appelait `depotVise`, et le nom mentait : DOC-11 WF-09 étape 1
   * construit l'échéancier « à rebours depuis la date cible (rentrée,
   * prise de poste) », et le dépôt s'en déduit en retirant le délai
   * d'instruction. Trois écrans l'affichaient comme une date de dépôt, et
   * deux calculs s'en servaient comme telle — d'où `depot`, juste en
   * dessous, qui est la vraie.
   */
  departVise?: string;
  /**
   * Date de dépôt, déduite de la cible en retirant le délai d'instruction
   * de la règle **figée** (RG-09.1, INV-3). Absente sans date cible.
   *
   * Sans délai annoncé par la procédure, elle retombe sur la date cible :
   * c'est l'approximation prudente que l'échéancier fait déjà, et elle ne
   * prétend pas à une précision qu'on n'a pas.
   *
   * C'est **elle** qu'il faut pour toute question de la forme « cette
   * pièce sera-t-elle encore valable ? » ou « quelle version de la règle
   * s'appliquera ? » : ce qui compte est le jour du dépôt, pas celui du
   * départ.
   */
  depot?: string;
  completude: CompletenessPublic;
  /**
   * Une seule action, celle qui débloque le plus. Un tableau de bord qui
   * liste tout ce qu'il reste ne dit pas par où commencer.
   */
  prochaineAction: string;
  /**
   * Situation déclarée par le candidat qui dépasse ce que la plateforme sait
   * faire (WF-13, écran T-03). Elle vit sur le dossier et non sur le profil :
   * un refus antérieur ne pèse que sur la destination concernée.
   */
  limiteDeclaree?: MotifProposition;
}

/** Trois dossiers en parallèle au maximum (C-01). */
export const DOSSIERS_MAX = 3;

export const peutOuvrirUnDossier = (dossiers: readonly Dossier[]): boolean =>
  dossiers.length < DOSSIERS_MAX;

/**
 * Les dossiers actifs d'abord, puis les brouillons, puis le reste : ce qui
 * demande une action passe avant ce qui attend.
 */
const RANG: Record<StatutDossier, number> = {
  ACTIF: 0,
  PRET: 1,
  BROUILLON: 2,
  SOUMIS: 3,
  CLOTURE: 4,
};

export const trierDossiers = (dossiers: readonly Dossier[]): Dossier[] =>
  [...dossiers].sort((a, b) => RANG[a.statut] - RANG[b.statut]);

/**
 * « Deux dossiers ouverts, neuf pièces obligatoires à réunir. »
 *
 * Le prototype écrivait « à reprendre ». Le compteur du domaine dénombre ce
 * qui manque, pas ce qui a été déposé puis refusé : un brouillon où rien n'a
 * encore été déposé n'a rien « à reprendre ». Le mot suit la donnée, sans
 * quoi le résumé décourage en annonçant un travail de correction qui n'existe
 * pas.
 */
export function resumeDuJour(dossiers: readonly Dossier[]): string {
  if (dossiers.length === 0) return "";
  const ouverts =
    dossiers.length > 1 ? `${dossiers.length} dossiers ouverts` : "1 dossier ouvert";
  const aReunir = dossiers.reduce(
    (total, d) => total + d.completude.compteurs.obligatoiresManquantes,
    0,
  );
  if (aReunir === 0) return `${ouverts}, rien ne bloque un dépôt.`;
  const pieces = aReunir > 1 ? `${aReunir} pièces obligatoires` : "1 pièce obligatoire";
  return `${ouverts}, ${pieces} à réunir.`;
}
