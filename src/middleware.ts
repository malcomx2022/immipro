import { NextResponse, type NextRequest } from "next/server";
import { EN_TETE_CHEMIN } from "@/domain/comptes/suite";

/**
 * Relève l'adresse demandée pour la garde des pages — 02/10/2026.
 *
 * Un gabarit Next ne connaît pas l'adresse de la page qu'il entoure. La
 * garde du groupe `(dossier)` redirigeait donc vers `/connexion` sans
 * `?suite=`, et le candidat perdait la page qu'il venait d'ouvrir. Le
 * middleware pose l'adresse dans un en-tête **de requête**, que la garde
 * lit côté serveur. Il écrase toute valeur venue du client : l'en-tête ne
 * peut pas être fourni de l'extérieur.
 *
 * Il ne fait rien d'autre : ni session, ni limitation, ni redirection.
 * La session se lit en base, ce que le middleware ne fait pas, et chaque
 * garde reste là où elle était.
 */
export function middleware(requete: NextRequest) {
  const entetes = new Headers(requete.headers);
  entetes.set(EN_TETE_CHEMIN, `${requete.nextUrl.pathname}${requete.nextUrl.search}`);
  return NextResponse.next({ request: { headers: entetes } });
}

/** Les pages seulement : ni l'API, ni les fichiers du build, ni les images. */
export const config = {
  matcher: ["/((?!api/|_next/|brand/|favicon|robots\\.txt|sitemap\\.xml).*)"],
};
