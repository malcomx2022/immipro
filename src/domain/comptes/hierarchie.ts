/**
 * Hiérarchie des rôles — S.210, 31/10/2026.
 *
 *     SUPER_ADMIN ⊃ ADMIN ⊃ VEILLEUR ;   CANDIDAT à part.
 *
 * Un rôle couvre ceux qu'il domine : un super-administrateur ouvre tout ce
 * qu'ouvre un administrateur, qui ouvre tout ce qu'ouvre un veilleur. Le
 * candidat n'est pas « en dessous » du veilleur au sens du back-office :
 * il n'y entre pas. Mais tout compte, interne compris, a un espace
 * candidat — c'est pourquoi `couvre(r, "CANDIDAT")` est vrai pour tous.
 *
 * Avant ce module, la liste des rôles admis était écrite à la main à trois
 * endroits (composeur des routes, garde des pages, lecteur d'exploitation).
 * Un quatrième rôle ajouté à l'énumération Prisma serait passé partout
 * pour un inconnu, refusé du back-office qu'il était censé administrer.
 * La hiérarchie vit donc ici, une fois ; les gardes la lisent.
 *
 * Ce que seul le sommet peut faire est nommé ici aussi : changer un rôle,
 * créer un compte interne, suspendre un compte interne. Un administrateur
 * qui pourrait nommer un autre administrateur est exactement le geste
 * qu'une session volée ferait en premier (S.115).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const ROLES = ["CANDIDAT", "VEILLEUR", "ADMIN", "SUPER_ADMIN"] as const;
export type RoleDeCompte = (typeof ROLES)[number];

/** Rang dans le back-office. Le candidat n'y a pas de place : rang 0. */
const RANG: Record<RoleDeCompte, number> = {
  CANDIDAT: 0,
  VEILLEUR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export const rang = (role: RoleDeCompte): number => RANG[role];

export const estRole = (valeur: string): valeur is RoleDeCompte =>
  (ROLES as readonly string[]).includes(valeur);

/** Le rôle `detenu` ouvre-t-il ce qu'ouvre le rôle `requis` ? */
export const couvre = (detenu: RoleDeCompte, requis: RoleDeCompte): boolean =>
  RANG[detenu] >= RANG[requis];

/**
 * Les rôles admis là où `requis` est exigé — du plus bas au plus haut.
 * C'est la liste que lisent le composeur des routes et la garde des pages.
 */
export const rolesAuMoins = (requis: RoleDeCompte): RoleDeCompte[] =>
  ROLES.filter((r) => couvre(r, requis));

/** Un compte interne est un compte du back-office : veilleur et au-dessus. */
export const estInterne = (role: RoleDeCompte): boolean => couvre(role, "VEILLEUR");

/** Changer un rôle depuis le back-office : le sommet seul (un ADMIN ne peut plus rien changer). */
export const peutChangerLesRoles = (role: RoleDeCompte): boolean => role === "SUPER_ADMIN";

/** Créer un compte interne : le sommet seul. */
export const peutCreerUnCompteInterne = (role: RoleDeCompte): boolean => role === "SUPER_ADMIN";

/** Les intitulés affichés au back-office. Jamais le code brut à l'écran. */
export const LIBELLE_ROLE: Record<RoleDeCompte, string> = {
  CANDIDAT: "Candidat",
  VEILLEUR: "Analyste réglementaire",
  ADMIN: "Administration",
  SUPER_ADMIN: "Super-administration",
};

/**
 * Seuil des super-administrateurs actifs (ni suspendus, ni supprimés).
 *
 * Retirer le rôle à un super-administrateur actif n'est permis que s'ils
 * sont au moins deux : sinon, plus personne ne pourrait changer un rôle ni
 * créer un compte interne depuis le back-office, et la seule issue serait
 * la console du serveur. La même borne vaut pour la suspension.
 */
export const SUPER_ADMINS_MINIMUM = 2;
