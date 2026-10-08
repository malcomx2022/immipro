import type { AdressePublique } from "@/domain/stockage/adresse-publique";

/**
 * La politique de contenu — revue du 07/10/2026, F1.
 *
 * Aucune n'était posée : un script injecté par n'importe quel chemin
 * aurait pu lire la page, écrire vers n'importe quelle origine et charger
 * ce qu'il voulait. Le navigateur ne charge pourtant rien de tiers : ni
 * script, ni police, ni image. Les paiements sont des navigations, pas des
 * cadres.
 *
 * Deux exceptions, nommées :
 * - le stockage : le dépôt d'une pièce l'écrit directement (`PUT`
 *   présigné, `connect-src`), et l'aperçu de B-05 l'affiche dans un cadre
 *   (`frame-src`) ;
 * - `'unsafe-inline'` pour les scripts et les styles, et non un nonce : un
 *   nonce rendrait chaque page dynamique, alors que les pages publiques
 *   sont servies statiques (`tests/plan-du-site.test.ts`). Next en pose,
 *   pour son hydratation.
 *
 * En développement, Next évalue du code (`'unsafe-eval'`) et recharge par
 * WebSocket (`ws:`) ; et la page n'est pas en https.
 *
 * Module pur.
 */
export interface OptionsDePolitique {
  /** L'origine du stockage (`https://stockage.immipro.app`), ou `null` sans stockage public. */
  stockage: string | null;
  developpement: boolean;
}

export function origineDuStockage(adresse: AdressePublique): string {
  const schema = adresse.chiffre ? "https" : "http";
  const portParDefaut = adresse.chiffre ? 443 : 80;
  return `${schema}://${adresse.hote}${adresse.port === portParDefaut ? "" : `:${adresse.port}`}`;
}

export function politiqueDeContenu({ stockage, developpement }: OptionsDePolitique): string {
  const tiers = stockage ? ` ${stockage}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${developpement ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${tiers}${developpement ? " ws:" : ""}`,
    `frame-src ${stockage ?? "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(developpement ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/** Les capacités du navigateur dont aucun écran ne se sert. */
export const POLITIQUE_DES_PERMISSIONS = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
