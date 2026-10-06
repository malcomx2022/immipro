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
  /**
   * Les dépôts déclarés de ce compte — S.89. La date réelle ne se modifie
   * pas depuis le dossier ; sa correction passe par le back-office, avec
   * motif, et c'est ici qu'elle se lit.
   */
  depots?: readonly DepotDeclare[];
}

export interface DepotDeclare {
  dossierId: string;
  destination: string;
  /** Date réelle du dépôt, `AAAA-MM-JJ`. */
  deposeLe: string;
  /** Instant où le candidat l'a déclarée dans ImmiPro, ISO. */
  declareLe: string;
  /** La demande de correction du candidat, en attente (S.90). */
  demande?: { id: string; deposeLe: string; explication: string; demandeeLe: string } | null;
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

// ── Ce que l'écran peut faire, et ce qu'il ne peut pas ──────────────────

/**
 * Les actions d'un compte — et la liste était fausse dans les deux sens.
 *
 * Elle proposait trois boutons — renvoyer l'email de vérification,
 * recréditer des analyses, traiter une demande de suppression — dont
 * aucun n'était relié à quoi que ce soit, et dont aucun n'avait de route.
 * Et elle omettait **la seule action que le produit sait faire** : la
 * suspension, dont la route existe depuis le début, journalise son motif
 * et ferme les sessions ouvertes.
 *
 * Un écran qui offre ce qu'il ne peut pas et cache ce qu'il peut se trompe
 * deux fois. Ce qui reste ici est ce qui part vraiment au serveur ; le
 * reste est nommé plus bas, avec ce qui lui manque.
 */
export interface ActionCompte {
  cle: "suspendre" | "retablir" | "renvoyer-verification" | "relancer-suppression";
  libelle: string;
  /** Statuts pour lesquels l'action a un sens. */
  statuts: readonly StatutCompte[];
  /** Ce que l'opérateur doit savoir avant de cliquer. */
  consequence: string;
  /** Ce que l'écran dit une fois l'action faite — l'état « fait » n'est pas muet. */
  confirmation: string;
}

export const ACTIONS_COMPTE: readonly ActionCompte[] = [
  {
    cle: "suspendre",
    libelle: "Suspendre le compte",
    // Une suppression demandée suit son cours : la suspendre en plus ne
    // ferait que retarder une purge que le candidat a réclamée.
    statuts: ["ACTIF", "EMAIL_NON_VERIFIE"],
    consequence:
      "Les sessions ouvertes se ferment immédiatement. Sans cela, la suspension ne prendrait effet qu'à l'expiration du cookie, trente jours plus tard.",
    confirmation: "Compte suspendu. Les sessions ouvertes sont fermées.",
  },
  {
    cle: "retablir",
    libelle: "Rétablir le compte",
    statuts: ["SUSPENDU"],
    consequence:
      "Le compte redevient utilisable à la prochaine connexion. Les sessions fermées par la suspension ne se rouvrent pas.",
    confirmation: "Compte rétabli. La personne peut se reconnecter.",
  },
  {
    cle: "renvoyer-verification",
    libelle: "Renvoyer l'email de vérification",
    // Suspendu, un compte n'a pas à recevoir de code : le rétablir d'abord.
    statuts: ["EMAIL_NON_VERIFIE"],
    consequence:
      "Un nouveau code à six chiffres part à l'adresse du compte, valable dix minutes. Les codes précédents sont annulés. Le code n'est jamais montré ici.",
    confirmation: "Un nouveau code de vérification est parti à l'adresse du compte.",
  },
  {
    cle: "relancer-suppression",
    libelle: "Traiter la demande de suppression",
    statuts: ["SUPPRESSION_DEMANDEE"],
    consequence:
      "Reprend la purge des pièces puis l'anonymisation, comme la tâche de nuit. Si le stockage des pièces ne répond toujours pas, le compte reste en suppression demandée et rien n'est anonymisé. Sans danger à rejouer.",
    confirmation: "Suppression achevée : le compte est anonymisé.",
  },
];

/** Ce que le serveur rend à la relance d'une suppression (RG-10.4). */
export interface BilanRelanceSuppression {
  anonymise: boolean;
  dossiers: number;
  versions: number;
}

/**
 * Le message qui suit la relance. Une relance qui n'achève pas n'est pas
 * un échec de l'écran : le stockage résiste encore, et l'opérateur doit
 * savoir que rien n'a été anonymisé plutôt que lire un succès.
 */
export function messageDeRelance(bilan: BilanRelanceSuppression): {
  achevee: boolean;
  texte: string;
} {
  if (bilan.anonymise) {
    const pieces = `${bilan.dossiers} ${bilan.dossiers > 1 ? "dossiers purgés" : "dossier purgé"}`;
    return { achevee: true, texte: `Suppression achevée : le compte est anonymisé, ${pieces}.` };
  }
  return {
    achevee: false,
    texte:
      "Suppression non achevée : une pièce n'a pas pu être supprimée du stockage, donc le compte n'est pas anonymisé. Vérifie que le stockage des pièces répond, puis relance. La reprise de nuit réessaiera aussi.",
  };
}

export const actionsPour = (compte: Compte): ActionCompte[] =>
  ACTIONS_COMPTE.filter((a) => a.statuts.includes(compte.statut));

/** Le motif part au journal d'audit, et une suspension sans motif ne se relit pas. */
export const MOTIF_MINIMUM_COMPTE = 10;

/**
 * Ce qui manque pour agir, ou `null` si rien ne manque.
 *
 * Même forme qu'en R.1 et en B-05 : la raison plutôt qu'un booléen, parce
 * que c'est elle que porte le bouton désactivé (DOC-12 §16).
 */
export function obstacleALActionCompte(motif: string): string | null {
  if (motif.trim().length < MOTIF_MINIMUM_COMPTE) {
    return `Écris pourquoi, en ${MOTIF_MINIMUM_COMPTE} caractères au moins. Le motif part au journal d'audit, et c'est lui qu'on relit si la décision est contestée.`;
  }
  return null;
}

/**
 * Les actions que B-03 devrait porter et ne porte pas encore.
 *
 * Elles étaient à l'écran, en boutons inertes. Les retirer sans les
 * nommer ferait disparaître le besoin avec le bouton ; les garder
 * promettait ce qui n'existe pas. Le renvoi du code de vérification et la
 * relance d'une suppression sont sortis de cette liste en S.121 : leurs
 * routes existent, et elles sont dans `ACTIONS_COMPTE`. La liste dit ce qui manque à chacune,
 * comme `PREALABLES` pour les arbitrages et `DEPENDANCES` pour les
 * services.
 */
export interface ActionAttendue {
  cle: string;
  libelle: string;
  manque: string;
}

export const ACTIONS_ATTENDUES: readonly ActionAttendue[] = [
  {
    cle: "recrediter",
    libelle: "Recréditer des analyses",
    /**
     * Celle-ci n'est pas qu'une route manquante. `rendreUneAnalyse` rend
     * **une** analyse identifiée, et son idempotence tient à cet
     * identifiant : elle répare une lecture qui n'a rien rendu. Un
     * recrédit de guichet n'a pas d'analyse à nommer — c'est un geste
     * commercial, et combien, à quelles conditions et à la charge de qui
     * sont des décisions qui ne s'inventent pas depuis un écran.
     */
    manque: "une décision commerciale : combien, à quelles conditions, à la charge de qui",
  },
];
