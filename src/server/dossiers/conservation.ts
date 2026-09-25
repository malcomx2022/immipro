import type { Application } from "@prisma/client";
import { decalerDeMois } from "@/domain/format/mois";
import { CONSERVATION_SOUMIS_MOIS } from "@/domain/dossiers/conservation";

/**
 * La fin de conservation d'un dossier soumis — arbitrages S.78 et S.89.
 *
 * Un seul calcul pour les trois lecteurs : la déclaration de dépôt qui la
 * pose, le job qui annonce, l'écran qui la montre.
 *
 * Elle se lit sur `retentionUntil`, posée à la déclaration et prolongée
 * par chaque confirmation. À défaut, sur **la date réelle du dépôt**
 * (S.89) — et, pour une ligne antérieure à cette date, sur le moment de la
 * déclaration. `updatedAt` n'en tient jamais lieu : un dossier soumis sans
 * aucune de ces dates est une anomalie, et elle doit se voir plutôt que se
 * combler par la dernière écriture venue.
 */
export const echeanceDuDepot = (deposeLe: Date): Date =>
  decalerDeMois(deposeLe, CONSERVATION_SOUMIS_MOIS);

export const echeanceDuDossierSoumis = (
  dossier: Pick<Application, "id" | "retentionUntil" | "depositedOn" | "submittedAt">,
): Date => {
  if (dossier.retentionUntil) return dossier.retentionUntil;
  const depot = dossier.depositedOn ?? dossier.submittedAt;
  if (!depot) {
    throw new Error(
      `Dossier soumis ${dossier.id} sans date de dépôt ni échéance de conservation.`,
    );
  }
  return echeanceDuDepot(depot);
};
