import { NextResponse, type NextRequest } from "next/server";
import { EN_TETE_CHEMIN } from "@/domain/comptes/suite";
import { origineDuStockage, politiqueDeContenu } from "@/domain/securite/politique-de-contenu";
import { lireAdressePublique } from "@/domain/stockage/adresse-publique";

/**
 * Relève l'adresse demandée pour la garde des pages — 02/10/2026.
 *
 * Un gabarit Next ne connaît pas l'adresse de la page qu'il entoure. La
 * garde du groupe `(dossier)` redirigeait donc vers `/connexion` sans
 * `?suite=`, et le candidat perdait la page qu'il venait d'ouvrir. Le
 * proxy pose l'adresse dans un en-tête **de requête**, que la garde
 * lit côté serveur. Il écrase toute valeur venue du client : l'en-tête ne
 * peut pas être fourni de l'extérieur.
 *
 * Next 16 renomme le « middleware » en « proxy » (revue M19, étape 3) : le
 * fichier et la fonction suivent, rien d'autre ne change. Il tourne
 * désormais sur le runtime Node, ce que ce code permet déjà — il ne lit
 * que l'environnement et des fonctions du domaine.
 *
 * Il pose aussi la politique de contenu (revue du 07/10/2026, F1). Elle
 * vit ici et non dans `next.config.mjs` parce que l'origine du stockage
 * n'est connue qu'à l'exécution : l'image est construite une fois, et
 * servie avec le `.env` du serveur.
 *
 * Il ne fait rien d'autre : ni session, ni limitation, ni redirection.
 * La session se lit en base, ce que le proxy ne fait pas, et chaque
 * garde reste là où elle était.
 */
const DEVELOPPEMENT = process.env.NODE_ENV !== "production";

/**
 * L'origine du stockage, calculée une fois. En production, l'adresse
 * publique (`MINIO_PUBLIC_URL`) ; une adresse invalide n'ouvre rien. En
 * développement sans adresse publique, le serveur signe avec son adresse
 * interne, que le navigateur atteint aussi.
 */
function stockage(env: NodeJS.ProcessEnv): string | null {
  const lue = lireAdressePublique(env.MINIO_PUBLIC_URL);
  if (lue) return lue.valide ? origineDuStockage(lue.adresse) : null;
  if (!DEVELOPPEMENT || !env.MINIO_ENDPOINT) return null;
  const chiffre = env.MINIO_USE_SSL === "true";
  return origineDuStockage({
    hote: env.MINIO_ENDPOINT,
    port: Number(env.MINIO_PORT ?? (chiffre ? 443 : 80)),
    chiffre,
  });
}

const POLITIQUE = politiqueDeContenu({ stockage: stockage(process.env), developpement: DEVELOPPEMENT });

export function proxy(requete: NextRequest) {
  const entetes = new Headers(requete.headers);
  entetes.set(EN_TETE_CHEMIN, `${requete.nextUrl.pathname}${requete.nextUrl.search}`);
  const reponse = NextResponse.next({ request: { headers: entetes } });
  reponse.headers.set("Content-Security-Policy", POLITIQUE);
  return reponse;
}

/** Les pages seulement : ni l'API, ni les fichiers du build, ni les images. */
export const config = {
  matcher: ["/((?!api/|_next/|brand/|favicon|robots\\.txt|sitemap\\.xml).*)"],
};
