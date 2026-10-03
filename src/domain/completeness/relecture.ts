/**
 * La relecture humaine de la complétude — avis juridique L.A, 03/10/2026.
 *
 * L'avis tranche que la pondération n'a pas à être exposée, **à trois
 * conditions**. La troisième est celle-ci : le candidat doit pouvoir
 * demander qu'une personne relise son évaluation de complétude. Le calcul
 * est automatique ; la contestation, elle, ne l'est pas — c'est le
 * responsable de la revue manuelle qui la porte.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Ce que l'écran dit, au-dessus du formulaire. */
export const INVITATION_RELECTURE =
  "La complétude est calculée automatiquement à partir de tes pièces et des règles de la destination. Si elle te semble inexacte, tu peux demander qu'un membre de l'équipe la relise.";

export const EXPLICATION_MIN = 20;
export const EXPLICATION_MAX = 1000;

/** Le message d'un champ trop court : il dit quoi écrire, pas seulement que c'est trop court. */
export const AIDE_EXPLICATION =
  "Dis ce qui te semble inexact : une pièce comptée comme manquante alors qu'elle est déposée, une exigence qui ne te concerne pas, un document mal reconnu.";

/** Une demande est en cours : rien d'autre à faire qu'attendre la réponse. */
export const MENTION_EN_ATTENTE =
  "Ta demande de relecture est enregistrée. Un membre de l'équipe la relit et te répond dans tes alertes.";

/** Ce que reçoit le candidat quand la relecture est faite. */
export function avisDeRelecture(reponse: string): { titre: string; corps: string } {
  return {
    titre: "Relecture de ta complétude",
    corps: reponse.trim(),
  };
}

/** Champ par champ, ce qui empêche l'envoi. Vide : la demande peut partir. */
export function refusDeLaDemande(explication: string): string | null {
  const nette = explication.trim();
  if (nette.length < EXPLICATION_MIN) return AIDE_EXPLICATION;
  if (nette.length > EXPLICATION_MAX) {
    return `Ton explication dépasse ${EXPLICATION_MAX} caractères : garde l'essentiel, un membre de l'équipe te recontactera si besoin.`;
  }
  return null;
}
