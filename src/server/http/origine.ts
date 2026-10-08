/**
 * L'origine d'une requête qui modifie — revue du 07/10/2026, F2.
 *
 * Le composeur ne lisait jamais `Origin`. La protection reposait sur
 * `SameSite=Lax`, qui ne couvre pas une origine **de même site** : le
 * sous-domaine du stockage, s'il servait un jour un contenu actif, aurait
 * pu poster avec le cookie du candidat. Et la connexion comme
 * l'inscription étaient exposées à la connexion forcée sur le compte d'un
 * tiers.
 *
 * La règle :
 * - `GET` et `HEAD` ne modifient rien : toujours admis ;
 * - une méthode qui modifie est admise si son `Origin` a l'hôte de la
 *   requête (`Host`, transmis par nginx), ou l'origine d'`APP_URL` (un
 *   `Host` interne derrière le mandataire) ;
 * - `Origin: null` (cadre isolé, redirection opaque) est refusé ;
 * - sans `Origin`, la requête n'est admise que si `Sec-Fetch-Site` est
 *   absent (client hors navigateur, comme un `curl` d'exploitation), ou
 *   vaut `same-origin` ou `none`.
 *
 * Module pur : il reçoit des chaînes, il ne lit rien.
 */
export interface DemandeDOrigine {
  methode: string;
  origine: string | null;
  secFetchSite: string | null;
  hote: string | null;
  appUrl: string | undefined;
}

const SURES = new Set(["GET", "HEAD"]);

const origineDe = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export function origineAdmise({ methode, origine, secFetchSite, hote, appUrl }: DemandeDOrigine): boolean {
  if (SURES.has(methode.toUpperCase())) return true;

  if (origine === null) {
    return secFetchSite === null || secFetchSite === "same-origin" || secFetchSite === "none";
  }
  if (origine === "null") return false;

  let lue: URL;
  try {
    lue = new URL(origine);
  } catch {
    return false;
  }
  if (hote !== null && lue.host === hote.toLowerCase()) return true;
  return lue.origin === origineDe(appUrl);
}
