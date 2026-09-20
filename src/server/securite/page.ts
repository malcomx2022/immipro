import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { COOKIE_SESSION, lireSession, type Acteur } from "./session";

/**
 * Accès à l'acteur depuis une page serveur.
 *
 * Les routes d'API passent par le composeur, qui refuse avec un contrat
 * d'échec. Une page n'a pas de corps JSON à rendre : elle redirige. Les deux
 * lisent la même session, mais ne répondent pas dans la même langue, et
 * mélanger les deux donnerait soit une page qui renvoie du JSON, soit une
 * API qui renvoie une redirection à un client qui attend un objet.
 *
 * La redirection porte `suite` : quelqu'un qui ouvre un lien vers son dossier
 * après expiration de sa session doit y revenir après s'être reconnecté, pas
 * atterrir sur un tableau de bord et chercher.
 */

export const acteurCourant = async (): Promise<Acteur | null> =>
  lireSession((await cookies()).get(COOKIE_SESSION)?.value);

export async function exigerCandidat(suite?: string): Promise<Acteur> {
  const acteur = await acteurCourant();
  if (!acteur) redirect(versConnexion(suite));
  return acteur;
}

/**
 * RG-15.3 — moindre privilège. Un candidat qui ouvre une adresse du
 * back-office est renvoyé chez lui, pas informé qu'elle existe : une page
 * d'erreur qui dit « réservé aux administrateurs » cartographie
 * l'application pour qui la sonde.
 */
export async function exigerRole(roles: readonly Role[], suite?: string): Promise<Acteur> {
  const acteur = await acteurCourant();
  if (!acteur) redirect(versConnexion(suite));
  if (!roles.includes(acteur.role)) redirect("/tableau-de-bord");
  return acteur;
}

export const exigerVeilleur = (suite?: string) => exigerRole(["VEILLEUR", "ADMIN"], suite);
export const exigerAdmin = (suite?: string) => exigerRole(["ADMIN"], suite);

const versConnexion = (suite?: string) =>
  suite ? `/connexion?suite=${encodeURIComponent(suite)}` : "/connexion";

/** Initiales affichées dans l'en-tête mobile. Deux lettres, jamais l'adresse. */
export function initiales(acteur: Acteur, prenom?: string | null, nom?: string | null): string {
  const lettres = [prenom, nom]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim()[0]!.toUpperCase());
  if (lettres.length > 0) return lettres.join("").slice(0, 2);
  return acteur.email.slice(0, 2).toUpperCase();
}
