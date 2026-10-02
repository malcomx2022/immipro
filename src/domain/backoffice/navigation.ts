/**
 * Navigation du back-office — section B, WF-14 à WF-16.
 *
 * Sept entrées, dans l'ordre du travail : ce qui change dehors (la veille),
 * ce qui bloque un candidat (les pièces en échec), puis les registres. Le
 * journal d'audit est avant-dernier parce qu'on l'ouvre pour vérifier, pas
 * pour agir.
 *
 * Les contenus suivent la veille : un guide pays dit la même chose qu'une
 * règle, en prose, et c'est la même personne qui relit la source puis
 * réécrit le guide.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface EntreeAdmin {
  href: string;
  libelle: string;
}

export const NAVIGATION_ADMIN: readonly EntreeAdmin[] = [
  { href: "/veille", libelle: "Veille réglementaire" },
  { href: "/contenus", libelle: "Guides et articles" },
  /*
    `/textes-juridiques` et non `/juridique` ou `/conditions` : les pages
    publiques (`/conditions`, `/mentions-legales`…) partagent l'espace
    d'adresses du groupe `(admin)`.
  */
  { href: "/textes-juridiques", libelle: "Textes juridiques" },
  { href: "/revue", libelle: "Pièces en échec" },
  { href: "/utilisateurs", libelle: "Utilisateurs" },
  /*
    `/habilitations` et non `/consultants` : le groupe de routes `(admin)`
    partage l'espace d'adresses de l'application candidat, où
    `/consultants` est déjà l'annuaire (T-04). Deux pages parallèles sur
    la même adresse, que `next build` refuse et que les tests ne voyaient
    pas — le chemin, l'intitulé et le titre de l'écran disent donc la même
    chose : l'habilitation, ce que WF-15 nomme.
  */
  { href: "/habilitations", libelle: "Habilitations" },
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
