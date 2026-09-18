/**
 * Comptes utilisateurs — B-03, WF-15.
 *
 * L'écran dit aussi ce qu'il ne montre pas : les pièces d'un candidat ne
 * sont accessibles que depuis la file de revue, sur une pièce en échec, et
 * l'accès est consigné. Une console d'administration qui laisse tout voir
 * « au cas où » finit par être utilisée comme telle.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type StatutCompte =
  | "ACTIF"
  | "EMAIL_NON_VERIFIE"
  | "SUPPRESSION_DEMANDEE"
  | "SUSPENDU";

export const LIBELLE_STATUT_COMPTE: Record<StatutCompte, string> = {
  ACTIF: "Actif",
  EMAIL_NON_VERIFIE: "Email non vérifié",
  SUPPRESSION_DEMANDEE: "Suppression demandée",
  SUSPENDU: "Suspendu",
};

export interface Compte {
  id: string;
  nom: string;
  email: string;
  /** Inscription, ISO. */
  inscritLe: string;
  dossiers: number;
  pack: string;
  /** Consentements accordés, par code (A-05). */
  consentements: readonly string[];
  analysesUtilisees: number;
  analysesTotal: number;
  statut: StatutCompte;
}

export type FiltreCompte = "TOUS" | "EMAIL_NON_VERIFIE" | "SUPPRESSION_DEMANDEE";

export const LIBELLE_FILTRE_COMPTE: Record<FiltreCompte, string> = {
  TOUS: "Tous",
  EMAIL_NON_VERIFIE: "Email non vérifié",
  SUPPRESSION_DEMANDEE: "Suppression demandée",
};

export const FILTRES_COMPTE: readonly FiltreCompte[] = [
  "TOUS",
  "EMAIL_NON_VERIFIE",
  "SUPPRESSION_DEMANDEE",
];

const correspond = (compte: Compte, recherche: string) => {
  const q = recherche.trim().toLowerCase();
  return q.length === 0 || `${compte.nom} ${compte.email}`.toLowerCase().includes(q);
};

const passeLeFiltre = (compte: Compte, filtre: FiltreCompte) => {
  if (filtre === "EMAIL_NON_VERIFIE") return compte.statut === "EMAIL_NON_VERIFIE";
  if (filtre === "SUPPRESSION_DEMANDEE") return compte.statut === "SUPPRESSION_DEMANDEE";
  return true;
};

export const filtrerComptes = (
  comptes: readonly Compte[],
  filtre: FiltreCompte,
  recherche: string,
): Compte[] => comptes.filter((c) => passeLeFiltre(c, filtre) && correspond(c, recherche));

export interface RechercheSansResultat {
  message: string;
  /** Ce qui exclut le reste, quand un seul critère est en cause. */
  critere?: { libelle: string; explication: string };
}

/**
 * Une recherche sans résultat dit toujours lequel des critères exclut le
 * reste. « Aucun résultat » laisse l'opérateur retirer les critères un à un
 * jusqu'à retrouver le compte qu'il sait exister.
 */
export function diagnostiquerRecherche(
  comptes: readonly Compte[],
  filtre: FiltreCompte,
  recherche: string,
): RechercheSansResultat | null {
  if (filtrerComptes(comptes, filtre, recherche).length > 0) return null;

  const requete = recherche.trim();
  const sansFiltre = comptes.filter((c) => correspond(c, requete));

  if (filtre !== "TOUS" && sansFiltre.length > 0) {
    return {
      message: requete
        ? `Aucun compte ne correspond à « ${requete} » avec ce filtre`
        : "Aucun compte ne correspond à ce filtre",
      critere: {
        libelle: LIBELLE_FILTRE_COMPTE[filtre],
        explication:
          sansFiltre.length > 1
            ? `${sansFiltre.length} comptes portent cette recherche, mais aucun n'a ce statut. Retire le filtre pour les voir.`
            : "Un compte porte cette recherche, mais il n'a pas ce statut. Retire le filtre pour le voir.",
      },
    };
  }

  return {
    message: requete
      ? `Aucun compte ne correspond à « ${requete} »`
      : "Aucun compte enregistré",
  };
}

/** « 2 847 comptes · 412 dossiers actifs · 38 suppressions en cours ». */
export function resumeComptes(comptes: readonly Compte[]): string {
  const dossiers = comptes.reduce((total, c) => total + c.dossiers, 0);
  const suppressions = comptes.filter(
    (c) => c.statut === "SUPPRESSION_DEMANDEE",
  ).length;
  return [
    `${comptes.length} ${comptes.length > 1 ? "comptes" : "compte"}`,
    `${dossiers} ${dossiers > 1 ? "dossiers actifs" : "dossier actif"}`,
    `${suppressions} ${suppressions > 1 ? "demandes de suppression en cours" : "demande de suppression en cours"}`,
  ].join(" · ");
}

export const CE_QUE_TU_NE_PEUX_PAS_VOIR =
  "Les pièces du candidat ne sont accessibles que depuis la file de revue, sur une pièce en échec, et l'accès est consigné avec son motif.";

/** Actions ouvertes sur un compte, avec le statut qui les rend pertinentes. */
export interface ActionCompte {
  cle: string;
  libelle: string;
  /** Statuts pour lesquels l'action a un sens. Vide = toujours. */
  statuts?: readonly StatutCompte[];
}

export const ACTIONS_COMPTE: readonly ActionCompte[] = [
  {
    cle: "renvoyer-verification",
    libelle: "Renvoyer l'email de vérification",
    statuts: ["EMAIL_NON_VERIFIE"],
  },
  { cle: "recrediter", libelle: "Recréditer des analyses" },
  {
    cle: "suppression",
    libelle: "Traiter la demande de suppression",
    statuts: ["SUPPRESSION_DEMANDEE"],
  },
];

export const actionsPour = (compte: Compte): ActionCompte[] =>
  ACTIONS_COMPTE.filter((a) => !a.statuts || a.statuts.includes(compte.statut));
