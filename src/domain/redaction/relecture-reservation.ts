/** WF-08/RG-08.10 : un avis daté prime ; une échéance atteinte est expirée. */
export function etatDeLaReservation(
  relueLe: Date | null,
  echeance: Date | null,
  maintenant: Date,
): "RELUE" | "EN_COURS" | "EXPIREE" | "LIBRE" {
  if (relueLe) return "RELUE";
  if (!echeance) return "LIBRE";
  return echeance.getTime() > maintenant.getTime() ? "EN_COURS" : "EXPIREE";
}

export const RELECTURE_EN_COURS =
  "Une analyse de cette version est déjà en cours. Aucune seconde analyse n'a été décomptée. Consulte le résultat dans quelques instants.";
export const RELECTURE_REMPLACEE =
  "Cette version a été remplacée pendant l'analyse. Aucun avis n'a été publié et l'analyse réservée a été rendue. Consulte la version actuelle avant de lancer sa relecture.";
export const RELECTURE_INTERROMPUE =
  "Cette analyse a été interrompue. Aucun avis n'a été publié. Consulte l'état actuel avant de réessayer.";
