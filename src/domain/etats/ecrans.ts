import type { EchecCandidat } from "@/domain/echecs/catalogue";

/**
 * Pages d'état des routes — revue du 07/10/2026, E8 (D-15 du 08/10/2026).
 *
 * Aucune route n'avait de page introuvable, d'erreur ni de chargement :
 * les 41 appels à `notFound()` affichaient la 404 anglaise de Next, et une
 * base indisponible donnait l'écran d'erreur anglais du framework. Les
 * textes vivent ici, une fois, au format d'`EchecCandidat` : le titre nomme
 * le fait, ce qui est conservé vient avant l'action (DOC-12 §16, règles 1
 * et 2), et rien ne promet ce que l'écran ne sait pas.
 *
 * En particulier, la page d'échec du paiement ne dit **jamais** « rien n'a
 * été débité » : elle ne le sait pas, et `lib/api.ts` documente qu'une
 * telle phrase fait relancer un paiement déjà parti.
 *
 * Module pur : ni Next, ni Prisma, ni réseau.
 */

/** L'espace d'une route, qui décide de ce qui est conservé et d'où l'on repart. */
export type Espace = "general" | "public" | "comptes" | "dossier" | "paiement" | "backoffice";

/** Une sortie : un libellé et l'adresse où il mène. */
export interface Sortie {
  libelle: string;
  href: string;
}

/** Le texte d'une page d'état, et l'adresse de son action quand c'est un lien. */
export type EtatDEcranTexte = Omit<EchecCandidat, "champs"> & { destination?: string };

const ACCUEIL: Sortie = { libelle: "Revenir à l'accueil", href: "/" };
const MES_DOSSIERS: Sortie = { libelle: "Revenir à mes dossiers", href: "/tableau-de-bord" };
const VEILLE: Sortie = { libelle: "Revenir à la file de veille", href: "/veille" };

/** D'où l'on repart, espace par espace : la sortie discrète des pages d'échec. */
export const SORTIE_DE_L_ESPACE: Record<Espace, Sortie> = {
  general: ACCUEIL,
  public: ACCUEIL,
  comptes: ACCUEIL,
  dossier: MES_DOSSIERS,
  paiement: MES_DOSSIERS,
  backoffice: VEILLE,
};

/**
 * Introuvable — un `notFound()` levé par une page, ou une adresse qui ne
 * mène à rien (le `not-found` racine). Le groupe `(auth)` n'appelle jamais
 * `notFound()` : il n'a pas de texte à lui.
 */
export const PAGE_INTROUVABLE = {
  public: {
    titre: "Cette page n'existe pas ou plus",
    corps: "Le lien est peut-être ancien, ou la page a été retirée.",
    action: ACCUEIL.libelle,
    destination: ACCUEIL.href,
    ton: "limite",
  },
  dossier: {
    titre: "Cette page n'existe pas ou plus",
    corps:
      "Le lien est peut-être ancien, ou il mène à un élément qui n'est pas rattaché à ton compte.",
    conserve: "Tes dossiers et tes pièces ne sont pas modifiés.",
    action: MES_DOSSIERS.libelle,
    destination: MES_DOSSIERS.href,
    ton: "limite",
  },
  paiement: {
    titre: "Cette page de paiement n'existe pas ou plus",
    corps: "Le lien est peut-être incomplet ou ancien.",
    conserve: "Aucun paiement n'a été lancé depuis cette page.",
    action: MES_DOSSIERS.libelle,
    destination: MES_DOSSIERS.href,
    ton: "limite",
  },
  backoffice: {
    titre: "Page introuvable",
    corps: "Cette adresse ne correspond à aucun écran ni à aucune fiche du back-office.",
    action: VEILLE.libelle,
    destination: VEILLE.href,
    ton: "limite",
  },
} as const satisfies Record<string, EtatDEcranTexte>;

/**
 * Ce qui est conservé quand une page n'a pas pu s'afficher. Un rendu qui
 * échoue n'écrit rien : chaque phrase dit ce que la personne craint
 * d'avoir perdu dans cet espace, et seulement ce qu'on sait.
 *
 * Le back-office et le tunnel de comptes n'en ont pas : rien n'y est en
 * cours qu'un affichage manqué mettrait en doute.
 */
const CONSERVE_EN_ECHEC: Partial<Record<Espace, string>> = {
  general: "Ce qui était déjà enregistré est conservé.",
  public: "Si tu as commencé le simulateur, tes réponses restent sur cet appareil.",
  dossier: "Ton dossier et les pièces déjà déposées sont conservés.",
  paiement: "Un paiement déjà lancé suit son cours : son résultat ne dépend pas de cet écran.",
};

/** Échec du rendu — les `error.tsx`. L'action est « Réessayer », jamais un lien. */
export function pageEnEchec(espace: Espace): EtatDEcranTexte {
  const conserve = CONSERVE_EN_ECHEC[espace];
  return {
    titre: "Cette page n'a pas pu s'afficher",
    corps: "L'interruption vient de la plateforme, pas de ce que tu as fait.",
    ...(conserve ? { conserve } : {}),
    action: "Réessayer",
    ton: "echec",
  };
}

/** La connexion est tombée : rien n'a échoué côté plateforme, tout est différé. */
export const ECRAN_HORS_LIGNE = {
  titre: "Tu es hors ligne",
  corps: "La page n'a pas pu se charger : la connexion s'est interrompue.",
  conserve: "Ce qui était déjà enregistré est conservé.",
  action: "Réessayer",
  ton: "attente",
} as const satisfies EtatDEcranTexte;

/**
 * Le gabarit racine lui-même a échoué (`global-error.tsx`) : ni barre, ni
 * pied de page, seulement de quoi recharger.
 */
export const SERVICE_INTERROMPU = {
  titre: "ImmiPro ne s'est pas affiché",
  corps: "Le service a été interrompu. L'interruption vient de la plateforme, pas de ce que tu as fait.",
  conserve: "Ce qui était déjà enregistré est conservé.",
  action: "Recharger la page",
  destination: ACCUEIL.href,
  ton: "echec",
} as const satisfies EtatDEcranTexte;

/** Le titre d'onglet de `global-error.tsx`, qui n'hérite d'aucune métadonnée. */
export const TITRE_SERVICE_INTERROMPU = "Service interrompu — ImmiPro";

/** L'annonce des pages en chargement, lue par le lecteur d'écran sans déplacer le focus. */
export const CHARGEMENT_DE_LA_PAGE = "Chargement de la page…";
