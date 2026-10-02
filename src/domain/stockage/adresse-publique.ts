/**
 * L'adresse publique du stockage — celle que le navigateur joint (S.98).
 *
 * ── Le défaut qu'elle corrige ───────────────────────────────────────
 *
 * Les URL présignées étaient signées avec `MINIO_ENDPOINT`, c'est-à-dire
 * l'adresse par laquelle **le serveur** joint le stockage. En production,
 * c'est `minio:9000`, un nom qui n'existe que sur le réseau Docker : le
 * candidat recevait `http://minio:9000/…`, que son navigateur ne pouvait
 * pas joindre, et aucune pièce ne pouvait être déposée. En local, le défaut
 * ne se voyait pas — `localhost:9000` est joignable des deux côtés.
 *
 * Une signature SigV4 porte l'hôte : on ne peut pas signer pour `minio` et
 * réécrire l'adresse ensuite. Il faut donc **deux adresses** :
 *
 * - `MINIO_ENDPOINT`, pour ce que fait le serveur (lecture, taille,
 *   promotion, suppression) ;
 * - `MINIO_PUBLIC_URL`, pour ce que signe le serveur et qu'ouvre le
 *   navigateur (dépôt et lecture présignés).
 *
 * ── Ce qui est refusé ───────────────────────────────────────────────
 *
 * Une adresse publique sert des pièces d'identité : elle est en `https`.
 * `http` n'est admis que pour la boucle locale, où le développement n'a pas
 * de certificat. Ni chemin, ni paramètre, ni identifiant : le client S3
 * construit lui-même `/<seau>/<clé>?X-Amz-…`, et un chemin en tête ne
 * serait pas signé.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface AdressePublique {
  hote: string;
  port: number;
  chiffre: boolean;
}

export type DefautDAdresse =
  | "illisible"
  | "schema"
  | "http_hors_boucle_locale"
  | "chemin_ou_parametres"
  | "identifiants";

export const MOTIF_ADRESSE: Record<DefautDAdresse, string> = {
  illisible:
    "MINIO_PUBLIC_URL n'est pas une adresse lisible. Attendu par exemple : https://stockage.immipro.app.",
  schema: "MINIO_PUBLIC_URL doit commencer par https://.",
  http_hors_boucle_locale:
    "MINIO_PUBLIC_URL est en http hors de la boucle locale : les pièces d'identité ne transitent qu'en https.",
  chemin_ou_parametres:
    "MINIO_PUBLIC_URL ne doit porter ni chemin ni paramètre : seulement le schéma, l'hôte et, au besoin, le port.",
  identifiants:
    "MINIO_PUBLIC_URL ne doit porter aucun identifiant : les clés d'accès vont dans MINIO_ROOT_USER et MINIO_ROOT_PASSWORD.",
};

const BOUCLE_LOCALE = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `null` : aucune adresse publique déclarée — le serveur signe alors avec
 * son adresse interne, ce qui ne convient qu'au poste de développement.
 */
export function lireAdressePublique(
  brute: string | undefined,
): { valide: true; adresse: AdressePublique } | { valide: false; defaut: DefautDAdresse } | null {
  const texte = (brute ?? "").trim();
  if (texte === "") return null;

  let lue: URL;
  try {
    lue = new URL(texte);
  } catch {
    return { valide: false, defaut: "illisible" };
  }
  if (lue.protocol !== "https:" && lue.protocol !== "http:") {
    return { valide: false, defaut: "schema" };
  }
  if (lue.protocol === "http:" && !BOUCLE_LOCALE.has(lue.hostname)) {
    return { valide: false, defaut: "http_hors_boucle_locale" };
  }
  if (lue.username !== "" || lue.password !== "") {
    return { valide: false, defaut: "identifiants" };
  }
  if ((lue.pathname !== "/" && lue.pathname !== "") || lue.search !== "" || lue.hash !== "") {
    return { valide: false, defaut: "chemin_ou_parametres" };
  }

  const chiffre = lue.protocol === "https:";
  return {
    valide: true,
    adresse: {
      hote: lue.hostname,
      port: lue.port !== "" ? Number(lue.port) : chiffre ? 443 : 80,
      chiffre,
    },
  };
}

/**
 * La région de signature. Garage la vérifie (`s3_region` de
 * `garage.toml`), et le client `minio` la demanderait sinon au serveur
 * avant chaque signature : un appel réseau par URL, vers l'adresse
 * publique, depuis le serveur lui-même.
 */
export const REGION_DE_SIGNATURE = "us-east-1";
