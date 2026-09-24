import type { Application } from "@prisma/client";
import { decalerDeMois } from "@/domain/format/mois";
import { CONSERVATION_SOUMIS_MOIS } from "@/domain/dossiers/conservation";

/**
 * La fin de conservation d'un dossier soumis — arbitrage S.78.
 *
 * Un seul calcul pour les trois lecteurs : la déclaration de dépôt qui la
 * pose, le job qui annonce, l'écran qui la montre. Un dossier soumis avant
 * l'arbitrage n'en porte pas toujours une : elle se déduit alors du dépôt
 * déclaré, et à défaut de la dernière écriture. Le repli était écrit trois
 * fois, et trois replis finissent par ne plus dire la même date.
 */
export const echeanceDuDepot = (deposeLe: Date): Date =>
  decalerDeMois(deposeLe, CONSERVATION_SOUMIS_MOIS);

export const echeanceDuDossierSoumis = (
  dossier: Pick<Application, "retentionUntil" | "submittedAt" | "updatedAt">,
): Date =>
  dossier.retentionUntil ?? echeanceDuDepot(dossier.submittedAt ?? dossier.updatedAt);
