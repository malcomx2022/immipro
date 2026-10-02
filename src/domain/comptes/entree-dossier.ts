/**
 * Où mène « Ouvrir un dossier » depuis les pages publiques.
 *
 * Le lien menait toujours à `/inscription`, y compris pour un candidat déjà
 * connecté : il revenait sur la création d'un compte qu'il avait déjà, et
 * perdait la destination qu'il venait de choisir. La page publique sait
 * maintenant si une session est ouverte, et le lien en tient compte :
 *
 * - **connecté** : l'ouverture de dossier (C-05), sur la destination choisie
 *   quand il y en a une ;
 * - **visiteur** : l'inscription, comme avant. Les réponses du simulateur
 *   restent sur l'appareil et alimentent le profil à la création (RG-01.1).
 */
export const OUVERTURE_DE_DOSSIER = "/dossiers/nouveau";
export const INSCRIPTION = "/inscription";

export function lienOuvrirUnDossier(connecte: boolean, destination?: string | null): string {
  if (!connecte) return INSCRIPTION;
  return destination
    ? `${OUVERTURE_DE_DOSSIER}?destination=${encodeURIComponent(destination)}`
    : OUVERTURE_DE_DOSSIER;
}
