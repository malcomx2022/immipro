/**
 * Qui a fait l'écriture — B-06, arbitrage du 21/09/2026.
 *
 * Le journal d'audit affichait l'identifiant technique dans la colonne
 * « Acteur » : `7f3c1a02-…` en face d'une suspension de compte. Un
 * identifiant n'est pas un nom, et une colonne qui s'appelle « Acteur »
 * promet une personne. Un contrôleur qui relit six mois de journal voit
 * trente-six identifiants et ne sait pas si c'est le même opérateur.
 *
 * **L'identifiant durable ne bouge pas de la table d'audit.** C'est lui
 * qui garantit que deux opérateurs portant le même nom, ou ayant porté la
 * même adresse à six mois d'écart, ne seront pas confondus. La décision
 * porte sur sa présentation, pas sur sa conservation : il reste dans la
 * donnée, et il reste affiché — en second, sous le libellé, là où on le
 * cherche quand on enquête.
 *
 * Trois replis, et ils ne disent pas la même chose :
 *
 * | Cas | Libellé | Ce que ça dit |
 * |---|---|---|
 * | Compte résolu | son nom, ou son adresse | c'est cette personne |
 * | Compte supprimé | « Compte supprimé » | la personne est partie, la trace reste |
 * | Résolution échouée | « Acteur non résolu » | on ne sait pas, et on le dit |
 *
 * Le troisième est celui qui manquait partout : un identifiant qui ne
 * résout pas s'affichait tel quel, c'est-à-dire comme un nom de personne.
 * Dire « je ne sais pas » vaut mieux que présenter une clé primaire comme
 * quelqu'un.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type GenreActeur = "PERSONNE" | "COMPTE_SUPPRIME" | "PROCESSUS" | "NON_RESOLU";

export interface ActeurLisible {
  genre: GenreActeur;
  /** Ce que la colonne « Acteur » montre en premier. */
  libelle: string;
  /** L'identifiant durable, tel qu'il est en base. Jamais remplacé. */
  identifiant: string;
}

/** Ce qu'on sait d'un compte au moment où on relit le journal. */
export interface IdentiteDUnCompte {
  prenom: string | null;
  nom: string | null;
  /** L'adresse professionnelle actuelle. Anonymisée si le compte est parti. */
  email: string;
  supprime: boolean;
}

export const COMPTE_SUPPRIME = "Compte supprimé";
export const ACTEUR_NON_RESOLU = "Acteur non résolu";

const PREFIXE_CANDIDAT = "candidat:";

/**
 * Les écritures que personne n'a faites : une tâche planifiée, une
 * notification de fournisseur. Leur identifiant **est** leur nom — il
 * décrit le traitement qui s'est exécuté — et le rendre autrement
 * inventerait un vocabulaire que rien n'a fixé.
 */
const PROCESSUS = ["systeme:", "webhook:"] as const;

const estUnProcessus = (identifiant: string) =>
  PROCESSUS.some((p) => identifiant.startsWith(p));

/**
 * Le compte qu'un identifiant d'audit désigne, s'il en désigne un.
 *
 * Deux formes mènent au même endroit : l'identifiant nu d'un opérateur, et
 * le `candidat:<id>` d'un candidat agissant dans son propre espace. La
 * seconde se lit rarement et c'est justement pourquoi elle s'oublie : le
 * journal affichait `candidat:7f3c1a02-…`, c'est-à-dire un préfixe collé à
 * une clé primaire, en guise de nom.
 */
export function compteDeLActeur(identifiant: string): string | null {
  if (estUnProcessus(identifiant)) return null;
  if (identifiant.startsWith(PREFIXE_CANDIDAT)) {
    return identifiant.slice(PREFIXE_CANDIDAT.length) || null;
  }
  return identifiant || null;
}

/**
 * Le nom qu'on affiche : celui de la personne, à défaut son adresse.
 *
 * Un compte sans prénom ni nom est courant — l'inscription ne les exige
 * pas — et son adresse professionnelle identifie tout aussi bien. Un
 * prénom seul suffit : « Awa » vaut mieux qu'une adresse, et mieux
 * qu'« Awa  » avec l'espace du nom absent.
 */
export function nomAffichable(identite: IdentiteDUnCompte): string {
  const nom = [identite.prenom, identite.nom].filter((p) => p && p.trim()).join(" ").trim();
  return nom || identite.email;
}

export function acteurLisible(
  identifiant: string,
  identite: IdentiteDUnCompte | null,
): ActeurLisible {
  if (estUnProcessus(identifiant)) {
    return { genre: "PROCESSUS", libelle: identifiant, identifiant };
  }
  if (!identite) {
    return { genre: "NON_RESOLU", libelle: ACTEUR_NON_RESOLU, identifiant };
  }
  if (identite.supprime) {
    // L'adresse a été remplacée par une adresse anonymisée et le nom
    // effacé (RG-10.4) : il n'y a plus rien à nommer, et l'identifiant
    // durable est tout ce qui rattache encore la trace à quelqu'un.
    return { genre: "COMPTE_SUPPRIME", libelle: COMPTE_SUPPRIME, identifiant };
  }
  return { genre: "PERSONNE", libelle: nomAffichable(identite), identifiant };
}

/**
 * D'où vient l'écriture.
 *
 * Déduit du préfixe, et c'est pour ça que la déduction vivait dans la
 * lecture Prisma : elle ne lit rien de la base. Elle est ici, pure, et
 * testée avec le reste.
 *
 * **`candidat:` ne venait pas du back-office.** Il retombait sur le cas
 * par défaut, et une suppression demandée par un candidat depuis son
 * espace s'affichait comme une action d'administrateur. C'est faux au
 * sens où un contrôle le lirait : la ligne dit qui a agi, elle doit dire
 * d'où.
 */
export function origineDe(identifiant: string): string {
  if (identifiant.startsWith("systeme:")) return "tâche planifiée";
  if (identifiant.startsWith("webhook:")) return "webhook";
  if (identifiant.startsWith(PREFIXE_CANDIDAT)) return "espace candidat";
  return "back-office";
}
