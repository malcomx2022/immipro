/**
 * La « suite » d'une connexion : l'adresse où revenir une fois connecté.
 *
 * ── Pourquoi un module ────────────────────────────────────────────────
 *
 * Relevé au contrôle du 02/10/2026 : un visiteur qui ouvrait
 * `/dossiers/nouveau?destination=suisse` sans session arrivait sur
 * `/connexion`, **sans** `?suite=`. La page posait bien sa suite, mais la
 * mise en page du groupe `(dossier)` exige une session elle aussi, sans
 * connaître l'adresse demandée — Next ne la donne pas à un gabarit —, et
 * c'est sa redirection qui partait la première. Après connexion, le
 * candidat tombait sur le tableau de bord et cherchait.
 *
 * L'adresse demandée est maintenant relevée par le proxy (`src/proxy.ts`) dans un
 * en-tête de requête, et la garde la lit quand on ne lui en donne pas.
 * Cette fonction décide de ce qui est acceptable comme suite, une fois,
 * pour les trois endroits qui en suivent une : la garde, l'écran de
 * connexion et l'écran de vérification.
 *
 * ── Ce qui est refusé ─────────────────────────────────────────────────
 *
 * Tout ce qui ferait de la connexion une redirection ouverte :
 * une adresse absolue, `//hôte` (relative au protocole) et `/\hôte`, que
 * les navigateurs lisent comme `//hôte`. Et les écrans du compte
 * eux-mêmes, où revenir n'aurait pas de sens : se reconnecter pour
 * retomber sur la connexion.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
export const EN_TETE_CHEMIN = "x-immipro-chemin";

const ECRANS_DU_COMPTE = ["/connexion", "/inscription", "/verification", "/mot-de-passe"];

export function suiteInterne(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  if (!valeur.startsWith("/") || valeur.startsWith("//") || valeur.includes("\\")) return null;
  if (/[\u0000-\u001f]/u.test(valeur)) return null;
  const chemin = valeur.split(/[?#]/u)[0]!;
  if (ECRANS_DU_COMPTE.some((e) => chemin === e || chemin.startsWith(`${e}/`))) return null;
  return valeur;
}
