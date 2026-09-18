/**
 * Navigation du back-office — section B, WF-14 à WF-16.
 *
 * Six entrées, dans l'ordre du travail : ce qui change dehors (la veille),
 * ce qui bloque un candidat (les pièces en échec), puis les registres. Le
 * journal d'audit est avant-dernier parce qu'on l'ouvre pour vérifier, pas
 * pour agir.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface EntreeAdmin {
  href: string;
  libelle: string;
}

export const NAVIGATION_ADMIN: readonly EntreeAdmin[] = [
  { href: "/veille", libelle: "Veille réglementaire" },
  { href: "/revue", libelle: "Pièces en échec" },
  { href: "/utilisateurs", libelle: "Utilisateurs" },
  { href: "/paiements", libelle: "Paiements" },
  { href: "/journal", libelle: "Journal d'audit" },
  { href: "/couts-ia", libelle: "Coûts IA" },
];

/**
 * Mention portée par tout écran qui agit sur un compte, une règle ou une
 * pièce. L'opérateur doit savoir qu'il est tracé avant d'agir, pas après :
 * c'est ce qui rend le journal dissuasif plutôt que punitif.
 */
export const MENTION_AUDIT =
  "Chaque action est horodatée au journal d'audit avec ton identifiant.";
